import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { GltfNode, GltfNodeState } from './bevy-gltf-node'
import { PLAYER_MODELS, playerBody } from './player-model-rules'
import {
  AvatarAnchorPointType,
  AvatarAttach,
  engine,
  Entity,
  GltfContainer,
  GltfContainerLoadingState,
  LoadingState,
  PlayerIdentityData,
  Transform,
  VisibilityComponent
} from '@dcl/sdk/ecs'
import { myProfile } from '@dcl/sdk/network'
import { Bot, Dead, PlayerAddress, PlayerEquipment, PlayerHealth, PlayerTeam, Team, Weapon } from './components'
import { profileByName, weaponProfile, WeaponId } from './weapon-profiles'
import { getBomb } from './bomb'
import { botAddress } from './team-rules'
import { WEAPON_MODELS } from './weapon-models'

type Held = WeaponId | 'c4' | 'none'
type Model = Exclude<Held, 'none'>
interface HeldWeapon {
  root: Entity
  bot?: Entity
  leftRoot?: Entity
  avatarId: string
  models: Partial<Record<Model, Entity[]>>
  shown: Held
  nextAttach: number
  pinned: boolean
  loadedAt?: number
}
const held = new Map<string, HeldWeapon>()
// Bevy resolves AvatarAttach only when the component changes and drops it if the avatar is not loaded yet
// (https://github.com/decentraland/bevy-explorer/issues/1255), so the attach is delayed and re-applied.
const FIRST_ATTACH_SECONDS = 0.5
const REATTACH_SECONDS = 2
// GltfNode is a Bevy extension; Unity and Godot never answer with GltfNodeState, so once the body has loaded the
// weapon is pinned at a fixed right-hand offset of the aiming pose instead of following the bone.
const NODE_TIMEOUT = 1
const HAND_PIN = { position: Vector3.create(0.2, 1.1, 0.35), rotation: Quaternion.create(0.5, -0.5, 0.5, 0.5) }

function pinToHand(weapon: HeldWeapon) {
  weapon.pinned = true
  for (const root of [weapon.root, weapon.leftRoot]) {
    if (root === undefined) continue
    const transform = Transform.getMutable(root)
    transform.position = HAND_PIN.position
    transform.rotation = HAND_PIN.rotation
  }
}

function attach(weapon: HeldWeapon, now: number) {
  if (weapon.bot !== undefined) return
  AvatarAttach.createOrReplace(weapon.root, {
    avatarId: weapon.avatarId,
    anchorPointId: AvatarAnchorPointType.AAPT_RIGHT_HAND
  })
  if (weapon.leftRoot !== undefined)
    AvatarAttach.createOrReplace(weapon.leftRoot, {
      avatarId: weapon.avatarId,
      anchorPointId: AvatarAnchorPointType.AAPT_LEFT_HAND
    })
  weapon.nextAttach = now + REATTACH_SECONDS
}

function createHeld(avatarId: string, now: number, bot?: Entity): HeldWeapon {
  const root = engine.addEntity()
  Transform.create(root, { parent: bot })
  if (bot !== undefined) GltfNode.create(root, { path: PLAYER_MODELS[playerBody(Bot.get(bot).team)].hands.R })
  const weapon: HeldWeapon = {
    root,
    bot,
    avatarId,
    shown: 'none',
    nextAttach: now + FIRST_ATTACH_SECONDS,
    pinned: false,
    models: {}
  }
  gunModel(weapon, 'c4')
  return weapon
}
function gunModel(weapon: HeldWeapon, id: Model) {
  if (weapon.models[id]) return
  const parts = [
    {
      root: weapon.root,
      src: id === 'c4' ? 'assets/scene/weapons/c4-world.glb' : WEAPON_MODELS[id].src.replace('-view.glb', '-world.glb')
    }
  ]
  if (id === 'elite') {
    if (weapon.leftRoot === undefined) {
      weapon.leftRoot = engine.addEntity()
      Transform.create(weapon.leftRoot, { parent: weapon.bot })
      if (weapon.bot !== undefined)
        GltfNode.create(weapon.leftRoot, { path: PLAYER_MODELS[playerBody(Bot.get(weapon.bot).team)].hands.L })
      weapon.nextAttach = 0
    }
    parts.push({ root: weapon.leftRoot, src: 'assets/scene/weapons/elite-left-world.glb' })
  }
  weapon.models[id] = parts.map(({ root, src }) => {
    const entity = engine.addEntity()
    Transform.create(entity, {
      parent: root,
      // GLTF bones retain Blender's local basis; p_weapon exports also include their own root rotation.
      rotation: weapon.bot === undefined ? Quaternion.Identity() : Quaternion.create(-0.5, 0.5, -0.5, 0.5)
    })
    GltfContainer.create(entity, { src, visibleMeshesCollisionMask: 0, invisibleMeshesCollisionMask: 0 })
    VisibilityComponent.create(entity, { visible: false })
    return entity
  })
}

function show(weapon: HeldWeapon, kind: Held) {
  if (weapon.shown === kind) return
  if (kind !== 'none') gunModel(weapon, kind)
  weapon.shown = kind
  for (const [model, entities] of Object.entries(weapon.models))
    for (const entity of entities) VisibilityComponent.getMutable(entity).visible = model === kind
}

function removeHeld(weapon: HeldWeapon) {
  for (const entities of Object.values(weapon.models)) for (const entity of entities) engine.removeEntity(entity)
  for (const [entity, transform] of engine.getEntitiesWith(Transform))
    if (transform.parent === weapon.root || (weapon.leftRoot !== undefined && transform.parent === weapon.leftRoot))
      engine.removeEntity(entity)
  engine.removeEntity(weapon.root)
  if (weapon.leftRoot !== undefined) engine.removeEntity(weapon.leftRoot)
}

function humanHeld(entity: Entity): Held {
  if (Dead.has(entity) || (PlayerHealth.getOrNull(entity)?.current ?? 0) <= 0) return 'none'
  if ((PlayerTeam.getOrNull(entity)?.team ?? Team.NONE) === Team.NONE) return 'none'
  if (PlayerEquipment.getOrNull(entity)?.bombSelected) return 'c4'
  const weapon = Weapon.getOrNull(entity)
  if (!weapon) return 'none'
  const profile = profileByName(weapon.name)
  return profile.id
}

function update(avatarId: string, kind: Held, now: number, bot?: Entity) {
  let weapon = held.get(avatarId)
  if (weapon && weapon.bot !== bot) {
    removeHeld(weapon)
    held.delete(avatarId)
    weapon = undefined
  }
  if (!weapon) {
    if (kind === 'none') return
    weapon = createHeld(avatarId, now, bot)
    held.set(avatarId, weapon)
  }
  if (kind === 'elite') gunModel(weapon, kind)
  if (weapon.bot !== undefined && !weapon.pinned && !GltfNodeState.has(weapon.root)) {
    const loaded = GltfContainerLoadingState.getOrNull(weapon.bot)?.currentState === LoadingState.FINISHED
    if (loaded && weapon.loadedAt === undefined) weapon.loadedAt = now
    if (weapon.loadedAt !== undefined && now >= weapon.loadedAt + NODE_TIMEOUT) pinToHand(weapon)
  }
  const ready =
    weapon.bot === undefined ||
    weapon.pinned ||
    (GltfNodeState.getOrNull(weapon.root)?.state === 2 &&
      (kind !== 'elite' || (weapon.leftRoot !== undefined && GltfNodeState.getOrNull(weapon.leftRoot)?.state === 2)))
  show(weapon, ready ? kind : 'none')
  if (kind !== 'none' && now >= weapon.nextAttach) attach(weapon, now)
}

export function worldWeaponSystem() {
  const now = Date.now() / 1000
  const me = myProfile.userId?.toLowerCase()
  const present = new Set<string>()
  for (const [, identity] of engine.getEntitiesWith(PlayerIdentityData)) present.add(identity.address.toLowerCase())
  const live = new Set<string>()
  for (const [entity, bot] of engine.getEntitiesWith(Bot)) {
    const id = botAddress(bot.index)
    live.add(id)
    const bomb = getBomb()
    const planting = bomb?.phase === 'planting' && bomb.carrier === botAddress(bot.index)
    update(id, bot.alive ? (planting ? 'c4' : (weaponProfile(bot.weapon)?.id ?? 'none')) : 'none', now, entity)
  }
  for (const [entity, player] of engine.getEntitiesWith(PlayerAddress)) {
    const address = player.address.toLowerCase()
    if (address === me || !present.has(address)) continue
    live.add(address)
    update(address, humanHeld(entity), now)
  }
  for (const [id, weapon] of held) {
    if (live.has(id)) continue
    removeHeld(weapon)
    held.delete(id)
  }
}
