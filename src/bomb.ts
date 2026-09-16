import { dropDeadPlayer } from './dropped-weapons'
import { engine, Entity, Transform, GltfContainer, AudioSource } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'
import {
  Bot,
  BombObjective,
  Dead,
  PlayerEquipment,
  PlayerHealth,
  PlayerInventory,
  PlayerTeam,
  Weapon
} from './components'
import { room } from './index'
import { armorDamage } from './economy-rules'
import { canPlayRound, displayName, getPractice, hurtBot, playerPosition } from './practice'
import { avatarForward, playerLookDirection, playerEntities, recordPracticeStats } from './server'
import { botAddress, isBotAddress } from './team-rules'
import {
  BombPlayer,
  C4_DEPLOY_SECONDS,
  cancelBombPlant,
  BOMB_USE_TIMEOUT,
  bombBlastDamage,
  bombBeepWave,
  canDefuseBomb,
  dropBomb,
  freshBomb,
  stepBomb
} from './bomb-rules'
import { bombSiteAt } from './bomb-sites'
import { mapDistance } from './world-query'
import { storeActiveGun } from './systems'
import { bestGun } from './inventory-rules'
import { equipActiveWeapon } from './inventory'
import { dropDirection, throwWeaponBox, tossWeaponBox, TossState } from './weapon-box-rules'
import { bulletWorldTrace } from './penetration'

let entity: Entity
let beepEntity: Entity
let soundEntity: Entity
let nextBeep = 0
const inputs = new Map<string, { held: boolean; sequence: number; at: number; direction: Vector3 }>()
let dropMotion: TossState | undefined

export function getBomb() {
  for (const [, state] of engine.getEntitiesWith(BombObjective)) return state
  return undefined
}

export function holsterBomb(address: string) {
  const state = BombObjective.getMutable(entity)
  if (state.carrier === address) cancelBombPlant(state, Date.now() / 1000)
}

// Re-sends the bomb state to every client (getMutable bumps the CRDT timestamp).
export function touchBomb() {
  BombObjective.getMutable(entity)
}

export function isBombBusy(address: string) {
  const state = getBomb()
  return (
    (state?.phase === 'planting' && state.carrier === address) ||
    (state?.phase === 'planted' && state.defuser === address)
  )
}

export function resetBomb(round: number, carrier = '', position?: Vector3) {
  inputs.clear()
  dropMotion = undefined
  BombObjective.createOrReplace(entity, freshBomb(round, carrier, position ?? playerPosition(carrier)))
  GltfContainer.deleteFrom(entity)
  AudioSource.stopSound(beepEntity)
  for (const [player] of engine.getEntitiesWith(PlayerEquipment))
    PlayerEquipment.getMutable(player).bombSelected = false
}

function validActor(address: string, round: number) {
  const match = getPractice(),
    player = playerEntities.get(address)
  return match?.round === round &&
    (match.phase === 'live' || match.phase === 'freeze') &&
    canPlayRound(address) &&
    player !== undefined &&
    !Dead.has(player) &&
    PlayerHealth.get(player).current > 0
    ? player
    : undefined
}

export function initializeBomb() {
  entity = engine.addEntity()
  beepEntity = engine.addEntity()
  soundEntity = engine.addEntity()
  for (const sound of [beepEntity, soundEntity]) {
    Transform.create(sound)
    Transform.validateBeforeChange(sound, (value) => value.senderAddress === AUTH_SERVER_PEER_ID)
    AudioSource.validateBeforeChange(sound, (value) => value.senderAddress === AUTH_SERVER_PEER_ID)
    syncEntity(sound, [Transform.componentId, AudioSource.componentId])
  }
  BombObjective.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
  Transform.validateBeforeChange(entity, (value) => value.senderAddress === AUTH_SERVER_PEER_ID)
  GltfContainer.validateBeforeChange(entity, (value) => value.senderAddress === AUTH_SERVER_PEER_ID)
  BombObjective.create(entity, freshBomb(0))
  syncEntity(entity, [BombObjective.componentId, Transform.componentId, GltfContainer.componentId])
  engine.addSystem((dt) => {
    if (BombObjective.get(entity).phase !== 'dropped') {
      dropMotion = undefined
      return
    }
    if (!dropMotion || dropMotion.settled) return
    tossWeaponBox(dropMotion, dt, bulletWorldTrace)
    const state = BombObjective.getMutable(entity)
    state.position = { ...dropMotion.position }
    state.settled = dropMotion.settled
    showBombModel()
  })
  room.onMessage('bombSelect', (data, context) => {
    if (!context) return
    const address = context.from.toLowerCase(),
      player = validActor(address, data.round)
    if (player === undefined) return
    const state = BombObjective.get(entity)
    if (data.selected && (state.carrier !== address || !['carried', 'planting'].includes(state.phase))) return
    const equipment = PlayerEquipment.getMutable(player)
    if (equipment.bombSelected === data.selected) return
    if (data.selected) {
      BombObjective.getMutable(entity).readyAt = Date.now() / 1000 + C4_DEPLOY_SECONDS
      Weapon.getMutable(player).zoom = 90
      equipment.bombSelected = true
    } else {
      holsterBomb(address)
      equipActiveWeapon(player)
    }
  })
  room.onMessage('bombUse', (data, context) => {
    if (!context) return
    const address = context.from.toLowerCase()
    if (validActor(address, data.round) === undefined || getPractice()?.phase !== 'live') return
    const length = Vector3.length(data.direction)
    if (
      !Number.isFinite(length) ||
      Math.abs(length - 1) > 0.01 ||
      !Number.isSafeInteger(data.sequence) ||
      data.sequence <= (inputs.get(address)?.sequence ?? 0)
    )
      return
    inputs.set(address, { held: data.held, sequence: data.sequence, at: Date.now() / 1000, direction: data.direction })
  })
  room.onMessage('bombDrop', (data, context) => {
    if (!context) return
    const address = context.from.toLowerCase(),
      player = validActor(address, data.round)
    const feet = playerPosition(address)
    if (player === undefined || !feet) return
    const direction = dropDirection(data.direction, avatarForward(address))
    if (!direction) return
    const state = BombObjective.get(entity)
    if (state.carrier !== address || (state.phase !== 'carried' && state.phase !== 'planting')) return
    if (dropBomb(BombObjective.getMutable(entity), address, feet)) {
      launchBombDrop(feet, direction)
      const selected = PlayerEquipment.get(player).bombSelected
      PlayerEquipment.getMutable(player).bombSelected = false
      if (selected) equipActiveWeapon(player)
    }
  })
}

function launchBombDrop(feet: Vector3, forward: Vector3) {
  dropMotion = throwWeaponBox(feet, forward, bulletWorldTrace)
  const state = BombObjective.getMutable(entity)
  state.position = { ...dropMotion.position }
  state.settled = false
  state.yaw = Math.atan2(forward.x, forward.z)
  showBombModel()
}

function showBombModel() {
  const state = BombObjective.get(entity)
  if (state.phase !== 'dropped' && state.phase !== 'planted') {
    GltfContainer.deleteFrom(entity)
    return
  }
  Transform.createOrReplace(entity, {
    position: state.position,
    rotation: Quaternion.fromEulerDegrees(0, (state.yaw * 180) / Math.PI, 0)
  })
  const src = `assets/scene/weapons/c4-${state.phase === 'dropped' ? 'drop' : 'planted'}.glb`
  if (GltfContainer.getOrNull(entity)?.src !== src)
    GltfContainer.createOrReplace(entity, { src, visibleMeshesCollisionMask: 0, invisibleMeshesCollisionMask: 0 })
}

function floorPosition(position: Vector3): Vector3 {
  const origin = { ...position, y: position.y + 0.1 }
  const distance = mapDistance(origin, { x: 0, y: -1, z: 0 }, 30)
  return { ...position, y: distance < 30 ? origin.y - distance + 0.003 : position.y }
}

export function tickBomb(live: boolean, actors: readonly BombPlayer[] = []) {
  const state = BombObjective.getMutable(entity),
    now = Date.now() / 1000
  const players: BombPlayer[] = []
  for (const [address, player] of playerEntities) {
    const position = playerPosition(address)
    if (!position) continue
    const input = inputs.get(address),
      equipment = PlayerEquipment.getOrNull(player)
    const canDefuse = state.phase === 'planted' && !!input && canDefuseBomb(position, state.position, input.direction)
    players.push({
      address,
      position,
      team: PlayerTeam.get(player).team,
      alive: canPlayRound(address) && !Dead.has(player) && PlayerHealth.get(player).current > 0,
      direction: playerLookDirection(address) ?? avatarForward(address),
      grounded: mapDistance({ ...position, y: position.y + 0.1 }, { x: 0, y: -1, z: 0 }, 0.35) < 0.3,
      holding: !!input?.held && now - input.at < BOMB_USE_TIMEOUT,
      selected: equipment?.bombSelected ?? false,
      hasKit: equipment?.defuseKit ?? false,
      canDefuse
    })
  }
  players.push(...actors)
  const previousPhase = state.phase
  const previousCarrier = state.carrier
  const previousDefuser = state.defuser
  const event = stepBomb(state, players, now, live, bombSiteAt)
  if (state.phase === 'dropped' && previousPhase !== 'dropped') {
    const carrier = players.find((player) => player.address === previousCarrier)
    const facing = avatarForward(previousCarrier) ?? { x: 0, y: 0, z: 1 }
    launchBombDrop(state.position, dropDirection(carrier?.direction ?? facing, facing) ?? facing)
  }
  if (event === 'planted') {
    playBombSound('plant')
    nextBeep = now + 0.5
  }
  if (state.defuser && state.defuser !== previousDefuser && state.phase === 'planted') playBombSound('disarm')
  if (event === 'defused' || event === 'exploded') {
    AudioSource.stopSound(beepEntity)
    playBombSound(event === 'defused' ? 'disarmed' : 'explode1')
  }
  if (state.phase === 'planted' && now >= nextBeep) {
    nextBeep = now + 1.4
    Transform.createOrReplace(beepEntity, { position: state.position })
    AudioSource.playSound(beepEntity, `assets/sounds/c4/c4_beep${bombBeepWave(45 - (state.explodeAt - now))}.wav`, true)
  }
  if (event === 'planted') state.position = floorPosition(state.position)
  if (previousPhase === 'planting' && state.phase === 'planted') {
    const player = playerEntities.get(state.planter)
    if (player !== undefined) {
      storeActiveGun(player)
      const inventory = PlayerInventory.getMutable(player)
      inventory.active = bestGun(inventory)
      equipActiveWeapon(player)
    }
  }
  showBombModel()
  if (event === 'exploded') {
    const killer = { name: displayName(state.planter), weapon: 'C4', team: 1, address: state.planter }
    for (const player of players) {
      if (!player.alive) continue
      const center = { ...player.position, y: player.position.y + 0.9 }
      const damage = bombBlastDamage(
        Vector3.distance(center, { ...state.position, y: state.position.y + 1.14 + 0.025 })
      )
      if (isBotAddress(player.address)) {
        const bot = botEntity(player.address)
        if (bot !== undefined) hurtBot(bot, damage, killer, 'body', 0.5, true)
        continue
      }
      const target = playerEntities.get(player.address)
      if (target === undefined) continue
      const health = PlayerHealth.getMutable(target)
      const equipment = PlayerEquipment.getMutable(target)
      const hit = armorDamage(damage, health.armor, equipment.helmet, 'body', true)
      health.armor = hit.armor
      if (health.armor === 0) equipment.helmet = false
      health.current = Math.max(0, health.current - Math.floor(hit.damage))
      if (health.current === 0) {
        dropDeadPlayer(target)
        Dead.createOrReplace(target, { deathTime: now, respawnTime: 0 })
        recordPracticeStats(player.address, 0, 1)
        room.send('playerKill', {
          killer: killer.name,
          victim: displayName(player.address),
          weapon: killer.weapon,
          killerTeam: killer.team,
          victimTeam: player.team,
          headshot: false,
          suicide: killer.address === player.address
        })
      }
    }
  }
  return event
}

function botEntity(address: string): Entity | undefined {
  for (const [entity, bot] of engine.getEntitiesWith(Bot)) if (botAddress(bot.index) === address) return entity
  return undefined
}

function playBombSound(name: string) {
  Transform.createOrReplace(soundEntity, { position: BombObjective.get(entity).position })
  AudioSource.playSound(soundEntity, `assets/sounds/c4/c4_${name}.wav`, true)
}
