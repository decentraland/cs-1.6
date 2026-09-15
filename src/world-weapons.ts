// Third-person weapons: every other player and bot holds a model in the right hand so you can see what they carry.
import {
  AvatarAnchorPointType,
  AvatarAttach,
  AvatarShape,
  engine,
  Entity,
  GltfContainer,
  Material,
  MeshRenderer,
  PlayerIdentityData,
  Transform,
  VisibilityComponent
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { myProfile } from '@dcl/sdk/network'
import { Bot, Dead, PlayerAddress, PlayerEquipment, PlayerHealth, PlayerTeam, Team, Weapon } from './components'
import { profileByName } from './weapon-profiles'

type Held = 'rifle' | 'pistol' | 'knife' | 'c4' | 'none'
type Model = Exclude<Held, 'none'>
interface HeldWeapon {
  root: Entity
  avatarId: string
  models: Record<Model, Entity[]>
  shown: Held
  nextAttach: number
}
interface Part {
  position: Vector3
  scale: Vector3
  color: { r: number; g: number; b: number; a: number }
  metallic?: number
}

// Poses are relative to the avatar's right-hand bone; the model's +Z is the barrel.
const POSES: Record<Model, { position: Vector3; rotation: Quaternion }> = {
  rifle: { position: Vector3.create(0, 0.03, 0.12), rotation: Quaternion.fromEulerDegrees(0, 0, 0) },
  pistol: { position: Vector3.create(0, 0.02, 0.04), rotation: Quaternion.fromEulerDegrees(0, 0, 0) },
  knife: { position: Vector3.create(0, 0.02, 0.06), rotation: Quaternion.fromEulerDegrees(0, 0, 0) },
  c4: { position: Vector3.create(0, 0.04, 0.06), rotation: Quaternion.fromEulerDegrees(0, 0, 0) }
}
const GUN_METAL = { r: 0.09, g: 0.1, b: 0.11, a: 1 }
const PISTOL_PARTS: readonly Part[] = [
  { position: Vector3.create(0, 0, 0.04), scale: Vector3.create(0.05, 0.055, 0.23), color: GUN_METAL },
  { position: Vector3.create(0, -0.065, -0.035), scale: Vector3.create(0.045, 0.12, 0.07), color: GUN_METAL }
]
const KNIFE_PARTS: readonly Part[] = [
  {
    position: Vector3.create(0, 0, 0.12),
    scale: Vector3.create(0.025, 0.018, 0.22),
    color: { r: 0.55, g: 0.58, b: 0.57, a: 1 },
    metallic: 0.7
  },
  {
    position: Vector3.create(0, -0.015, -0.1),
    scale: Vector3.create(0.04, 0.04, 0.12),
    color: { r: 0.08, g: 0.07, b: 0.055, a: 1 }
  },
  {
    position: Vector3.create(0, 0, 0.015),
    scale: Vector3.create(0.08, 0.025, 0.025),
    color: { r: 0.16, g: 0.14, b: 0.1, a: 1 }
  }
]
const C4_PARTS: readonly Part[] = [
  { position: Vector3.Zero(), scale: Vector3.create(0.22, 0.12, 0.25), color: { r: 0.2, g: 0.24, b: 0.12, a: 1 } }
]

const held = new Map<string, HeldWeapon>()
// Bevy resolves AvatarAttach only when the component changes and drops it if the avatar is not loaded yet
// (https://github.com/decentraland/bevy-explorer/issues/1255), so the attach is delayed and re-applied.
const FIRST_ATTACH_SECONDS = 0.5
const REATTACH_SECONDS = 2

function boxes(parent: Entity, parts: readonly Part[]): Entity[] {
  return parts.map((part) => {
    const entity = engine.addEntity()
    Transform.create(entity, { parent, position: part.position, scale: part.scale })
    MeshRenderer.setBox(entity)
    Material.setPbrMaterial(entity, { albedoColor: part.color, metallic: part.metallic ?? 0, roughness: 0.7 })
    VisibilityComponent.create(entity, { visible: false })
    return entity
  })
}

function attach(weapon: HeldWeapon, now: number) {
  AvatarAttach.createOrReplace(weapon.root, {
    avatarId: weapon.avatarId,
    anchorPointId: AvatarAnchorPointType.AAPT_RIGHT_HAND
  })
  weapon.nextAttach = now + REATTACH_SECONDS
}

function createHeld(avatarId: string, now: number): HeldWeapon {
  const root = engine.addEntity()
  Transform.create(root)
  const holders = {} as Record<Model, Entity>
  for (const model of ['rifle', 'pistol', 'knife', 'c4'] as const) {
    holders[model] = engine.addEntity()
    Transform.create(holders[model], { parent: root, ...POSES[model] })
  }
  const rifle = engine.addEntity()
  Transform.create(rifle, { parent: holders.rifle })
  GltfContainer.create(rifle, {
    src: 'assets/scene/weapons/ak47.glb',
    visibleMeshesCollisionMask: 0,
    invisibleMeshesCollisionMask: 0
  })
  VisibilityComponent.create(rifle, { visible: false })
  return {
    root,
    avatarId,
    shown: 'none',
    nextAttach: now + FIRST_ATTACH_SECONDS,
    models: {
      rifle: [rifle],
      pistol: boxes(holders.pistol, PISTOL_PARTS),
      knife: boxes(holders.knife, KNIFE_PARTS),
      c4: boxes(holders.c4, C4_PARTS)
    }
  }
}

function show(weapon: HeldWeapon, kind: Held) {
  if (weapon.shown === kind) return
  weapon.shown = kind
  for (const [model, entities] of Object.entries(weapon.models))
    for (const entity of entities) VisibilityComponent.getMutable(entity).visible = model === kind
}

function removeHeld(weapon: HeldWeapon) {
  for (const entities of Object.values(weapon.models)) for (const entity of entities) engine.removeEntity(entity)
  for (const [entity, transform] of engine.getEntitiesWith(Transform))
    if (transform.parent === weapon.root) engine.removeEntity(entity)
  engine.removeEntity(weapon.root)
}

function humanHeld(entity: Entity): Held {
  if (Dead.has(entity) || (PlayerHealth.getOrNull(entity)?.current ?? 0) <= 0) return 'none'
  if ((PlayerTeam.getOrNull(entity)?.team ?? Team.NONE) === Team.NONE) return 'none'
  if (PlayerEquipment.getOrNull(entity)?.bombSelected) return 'c4'
  const weapon = Weapon.getOrNull(entity)
  if (!weapon) return 'none'
  const profile = profileByName(weapon.name)
  if (profile.kind === 'knife') return 'knife'
  return profile.slot === 'secondary' ? 'pistol' : 'rifle'
}

function update(avatarId: string, kind: Held, now: number) {
  let weapon = held.get(avatarId)
  if (!weapon) {
    if (kind === 'none') return
    weapon = createHeld(avatarId, now)
    held.set(avatarId, weapon)
  }
  show(weapon, kind)
  if (kind !== 'none' && now >= weapon.nextAttach) attach(weapon, now)
}

export function worldWeaponSystem() {
  const now = Date.now() / 1000
  const me = myProfile.userId?.toLowerCase()
  const present = new Set<string>()
  for (const [, identity] of engine.getEntitiesWith(PlayerIdentityData)) present.add(identity.address.toLowerCase())
  const live = new Set<string>()
  for (const [, bot, avatar] of engine.getEntitiesWith(Bot, AvatarShape)) {
    if (!avatar.id) continue
    live.add(avatar.id)
    update(avatar.id, bot.alive ? 'rifle' : 'none', now)
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
