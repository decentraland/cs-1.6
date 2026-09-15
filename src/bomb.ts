import { engine, Entity, Transform, MeshRenderer, Material, AudioSource } from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'
import { Bot, BombObjective, Dead, PlayerEquipment, PlayerHealth, PlayerTeam } from './components'
import { room } from './index'
import { armorDamage } from './economy-rules'
import { canPlayRound, displayName, getPractice, hurtBot, playerPosition } from './practice'
import { playerEntities, recordPracticeStats } from './server'
import { botAddress, isBotAddress } from './team-rules'
import {
  BombPlayer,
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
import { equipActiveWeapon } from './inventory'

let entity: Entity
let beepEntity: Entity
let soundEntity: Entity
let nextBeep = 0
const inputs = new Map<string, { held: boolean; sequence: number; at: number; direction: Vector3 }>()
let droppedBy = ''
let pickupAfter = 0

export function getBomb() {
  for (const [, state] of engine.getEntitiesWith(BombObjective)) return state
  return undefined
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
  droppedBy = ''
  pickupAfter = 0
  BombObjective.createOrReplace(entity, freshBomb(round, carrier, position ?? playerPosition(carrier)))
  MeshRenderer.deleteFrom(entity)
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
  MeshRenderer.validateBeforeChange(entity, (value) => value.senderAddress === AUTH_SERVER_PEER_ID)
  Material.validateBeforeChange(entity, (value) => value.senderAddress === AUTH_SERVER_PEER_ID)
  BombObjective.create(entity, freshBomb(0))
  syncEntity(entity, [BombObjective.componentId, Transform.componentId, MeshRenderer.componentId, Material.componentId])
  room.onMessage('bombSelect', (data, context) => {
    if (!context) return
    const address = context.from.toLowerCase(),
      player = validActor(address, data.round)
    if (player === undefined) return
    const state = BombObjective.get(entity)
    if (data.selected && (state.carrier !== address || !['carried', 'planting'].includes(state.phase))) return
    PlayerEquipment.getMutable(player).bombSelected = data.selected
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
    if (player === undefined || !feet || getPractice()?.phase !== 'live') return
    const state = BombObjective.get(entity)
    if (state.carrier !== address || (state.phase !== 'carried' && state.phase !== 'planting')) return
    if (dropBomb(BombObjective.getMutable(entity), address, floorPosition(feet))) {
      PlayerEquipment.getMutable(player).bombSelected = false
      droppedBy = address
      pickupAfter = Date.now() / 1000 + 1
    }
  })
}

function floorPosition(position: Vector3): Vector3 {
  const origin = { ...position, y: position.y + 0.1 }
  const distance = mapDistance(origin, { x: 0, y: -1, z: 0 }, 30)
  return { ...position, y: distance < 30 ? origin.y - distance + 0.08 : position.y }
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
      canPickup: !(address === droppedBy && now < pickupAfter),
      grounded: mapDistance({ ...position, y: position.y + 0.1 }, { x: 0, y: -1, z: 0 }, 0.35) < 0.3,
      holding: !!input?.held && now - input.at < BOMB_USE_TIMEOUT,
      selected: equipment?.bombSelected ?? false,
      hasKit: equipment?.defuseKit ?? false,
      canDefuse
    })
  }
  players.push(...actors)
  const previousPhase = state.phase
  const previousDefuser = state.defuser
  const event = stepBomb(state, players, now, live, bombSiteAt)
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
  if (state.phase === 'dropped' || event === 'planted') state.position = floorPosition(state.position)
  if (previousPhase === 'planting' && state.phase === 'planted') {
    const player = playerEntities.get(state.planter)
    if (player !== undefined) {
      storeActiveGun(player)
      equipActiveWeapon(player)
    }
  }
  if (state.phase === 'dropped' || state.phase === 'planted' || state.phase === 'defused') {
    Transform.createOrReplace(entity, { position: state.position, scale: { x: 0.3, y: 0.14, z: 0.23 } })
    MeshRenderer.setBox(entity)
    Material.setPbrMaterial(entity, {
      albedoColor: state.phase === 'planted' ? Color4.create(0.6, 0.12, 0.05, 1) : Color4.create(0.22, 0.26, 0.12, 1),
      roughness: 1
    })
  } else if (event === 'exploded') {
    MeshRenderer.setSphere(entity)
    Transform.createOrReplace(entity, { position: state.position, scale: { x: 3, y: 3, z: 3 } })
    Material.setPbrMaterial(entity, {
      albedoColor: Color4.create(1, 0.3, 0, 0.5),
      emissiveColor: { r: 1, g: 0.15, b: 0 },
      emissiveIntensity: 2
    })
    const killer = { name: displayName(state.planter), weapon: 'C4' }
    for (const player of players) {
      if (!player.alive) continue
      const center = { ...player.position, y: player.position.y + 0.9 }
      const damage = bombBlastDamage(Vector3.distance(center, state.position))
      if (isBotAddress(player.address)) {
        const bot = botEntity(player.address)
        if (bot !== undefined) hurtBot(bot, damage, killer)
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
        Dead.createOrReplace(target, { deathTime: now, respawnTime: 0 })
        recordPracticeStats(player.address, 0, 1)
        room.send('playerKill', { killer: killer.name, victim: displayName(player.address), weapon: killer.weapon })
      }
    }
  } else MeshRenderer.deleteFrom(entity)
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
