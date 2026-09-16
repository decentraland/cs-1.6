import { engine, Entity, Transform } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'
import {
  Bot,
  Dead,
  GrenadeFlash,
  GrenadeProjectile,
  PlayerAddress,
  PlayerEquipment,
  PlayerHealth,
  PlayerInventory,
  PlayerTeam,
  Weapon
} from './components'
import { room } from './index'
import { avatarForward, playerLookDirection, playerEntities, applyPlayerDamage } from './server'
import { Attacker, canPlayRound, creditKill, displayName, getPractice, hurtBot, playerPosition } from './practice'
import { botAddress } from './team-rules'
import { GRENADES, GrenadeId, grenadeProfile } from './grenade-profiles'
import {
  advanceGrenadeAction,
  bounceGrenade,
  flashEffect,
  grenadeCount,
  grenadeLaunch,
  GrenadeAction,
  GrenadeMotion,
  heDamage,
  smokeLength,
  SMOKE_CANISTER_SECONDS,
  SMOKE_SIGHT_SECONDS,
  SMOKE_VISUAL_SECONDS
} from './grenade-rules'
import { bestGun, weaponWeight } from './inventory-rules'
import { equipActiveWeapon } from './inventory'
import { getBomb, isBombBusy } from './bomb'
import { PurchaseSequences } from './economy-rules'
import { bulletWorldTrace } from './penetration'
import type { Point } from './ballistics'
import type { SolidTrace } from './solid-trace'

GrenadeProjectile.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
GrenadeFlash.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
interface Action extends GrenadeAction {
  revision: number
  direction: Point
}
interface Flight {
  id: GrenadeId
  attacker: Attacker
  motion: GrenadeMotion
  lastTick: number
  nextThink: number
  fuse: number
  detonateAt?: number
}
interface Actor {
  entity: Entity
  address: string
  team: number
  feet: Point
  forward: Point
}
const actions = new Map<string, Action>()
const flights = new Map<Entity, Flight>()
const flashes = new Map<string, Entity>()
const positions = new Map<string, { feet: Point; velocity: Point; at: number }>()
const sequences = new PurchaseSequences()

export function clearGrenades() {
  for (const [entity] of engine.getEntitiesWith(GrenadeProjectile)) engine.removeEntity(entity)
  for (const [entity] of engine.getEntitiesWith(GrenadeFlash)) engine.removeEntity(entity)
  actions.clear()
  flights.clear()
  flashes.clear()
  positions.clear()
  sequences.clear()
  for (const [player, inventory] of engine.getEntitiesWith(PlayerInventory)) {
    if (grenadeProfile(inventory.active) && !Dead.has(player)) {
      const mutable = PlayerInventory.getMutable(player)
      mutable.items = inventory.items.filter((item) => !grenadeProfile(item.id) || item.reserve > 0)
      if (grenadeCount(mutable, mutable.active) <= 0) mutable.active = bestGun(mutable)
      equipActiveWeapon(player)
    }
  }
}
function actors(): Actor[] {
  const result: Actor[] = []
  for (const [address, entity] of playerEntities) {
    if (!canPlayRound(address) || Dead.has(entity) || PlayerHealth.get(entity).current <= 0) continue
    const feet = playerPosition(address)
    if (feet)
      result.push({
        entity,
        address,
        team: PlayerTeam.get(entity).team,
        feet,
        forward: playerLookDirection(address) ?? avatarForward(address) ?? { x: 0, y: 0, z: 1 }
      })
  }
  for (const [entity, bot, transform] of engine.getEntitiesWith(Bot, Transform)) {
    if (!bot.alive) continue
    const q = transform.rotation
    result.push({
      entity,
      address: botAddress(bot.index),
      team: bot.team,
      feet: transform.position,
      forward: { x: 2 * (q.x * q.z + q.w * q.y), y: 0, z: 1 - 2 * (q.x * q.x + q.y * q.y) }
    })
  }
  return result
}
function actorHit(
  origin: Point,
  direction: Point,
  limit: number,
  feet: Point
): { distance: number; normal: Point } | undefined {
  let near = 0,
    far = limit
  let normal = { x: 0, y: 0, z: 0 }
  for (const axis of ['x', 'y', 'z'] as const) {
    const low = feet[axis] - (axis === 'y' ? 0 : 0.4),
      high = feet[axis] + (axis === 'y' ? 1.8 : 0.4)
    if (Math.abs(direction[axis]) < 1e-8) {
      if (origin[axis] < low || origin[axis] > high) return undefined
      continue
    }
    const first = (low - origin[axis]) / direction[axis],
      second = (high - origin[axis]) / direction[axis]
    const enter = Math.min(first, second),
      leave = Math.max(first, second)
    if (enter > near) {
      near = enter
      normal = { x: 0, y: 0, z: 0 }
      normal[axis] = direction[axis] > 0 ? -1 : 1
    }
    far = Math.min(far, leave)
    if (far < near) return undefined
  }
  return near > 0 && near <= limit ? { distance: near, normal } : undefined
}
function traceActors(
  origin: Point,
  direction: Point,
  limit: number,
  bodies: readonly Actor[],
  ignore: string
): SolidTrace {
  let hit = bulletWorldTrace(origin, direction, limit)
  for (const actor of bodies) {
    if (actor.address === ignore) continue
    const contact = actorHit(origin, direction, hit.distance, actor.feet)
    if (!contact) continue
    hit = {
      distance: contact.distance,
      position: {
        x: origin.x + direction.x * contact.distance,
        y: origin.y + direction.y * contact.distance,
        z: origin.z + direction.z * contact.distance
      },
      normal: contact.normal,
      solid: true,
      allSolid: false,
      startSolid: false,
      material: 'F',
      texture: actor.address
    }
  }
  return hit
}
function spawn(id: GrenadeId, attacker: Attacker, position: Point, velocity: Point) {
  const now = Date.now() / 1000,
    entity = engine.addEntity()
  GrenadeProjectile.create(entity, {
    kind: id,
    owner: attacker.address,
    team: attacker.team,
    position,
    velocity,
    center: position,
    grounded: false,
    bounces: 0,
    animation: 3 + Math.floor(Math.random() * 4),
    phase: 'flight',
    created: now,
    activated: 0,
    expires: now + 300,
    round: getPractice()?.round ?? 0
  })
  syncEntity(entity, [GrenadeProjectile.componentId])
  flights.set(entity, {
    id,
    attacker,
    motion: { position, velocity, grounded: false, bounces: 0, accumulator: 0 },
    lastTick: now,
    nextThink: now + 0.1,
    fuse: now + 1.5
  })
}
function attackerFor(player: Entity, id: GrenadeId): Attacker {
  const address = PlayerAddress.get(player).address
  return { address, name: displayName(address), team: PlayerTeam.get(player).team, weapon: GRENADES[id].name }
}
export function dropPrimedGrenade(player: Entity) {
  const address = PlayerAddress.get(player).address,
    action = actions.get(address),
    inventory = PlayerInventory.getOrNull(player)
  actions.delete(address)
  const profile = inventory && grenadeProfile(inventory.active),
    feet = playerPosition(address) ?? positions.get(address)?.feet
  if (
    !action?.held ||
    !inventory ||
    !profile ||
    !feet ||
    grenadeCount(inventory, profile.id) <= 0 ||
    PlayerEquipment.get(player).bombSelected
  )
    return
  spawn(profile.id, attackerFor(player, profile.id), { x: feet.x, y: feet.y + 1.6, z: feet.z }, { x: 0, y: 0, z: 0 })
}
function retire(player: Entity) {
  const inventory = PlayerInventory.getMutable(player)
  inventory.items = inventory.items.filter((item) => !grenadeProfile(item.id) || item.reserve > 0)
  inventory.active = bestGun({ ...inventory, items: inventory.items.filter((item) => item.id !== inventory.active) })
  const c4 = getBomb()?.carrier === PlayerAddress.get(player).address && weaponWeight(inventory.active) < 3
  if (c4) inventory.active = 'knife'
  equipActiveWeapon(player)
  if (c4) PlayerEquipment.getMutable(player).bombSelected = true
}
function activate(entity: Entity, flight: Flight, now: number, bodies: readonly Actor[]) {
  const data = GrenadeProjectile.getMutable(entity),
    center = flight.motion.position
  data.activated = now
  data.phase = flight.id === 'smokegrenade' ? 'smoke' : 'exploded'
  data.expires = now + (flight.id === 'smokegrenade' ? SMOKE_VISUAL_SECONDS : 4)
  if (flight.id === 'smokegrenade') {
    data.center = { ...center }
    flight.motion.grounded = false
    flight.motion.velocity = {
      x: (Math.random() * 350 - 175) * 0.025,
      y: (250 + Math.random() * 100) * 0.025,
      z: (Math.random() * 350 - 175) * 0.025
    }
    return
  }
  const trace = bulletWorldTrace({ x: center.x, y: center.y + 0.2, z: center.z }, { x: 0, y: -1, z: 0 }, 1)
  const normal = trace.normal ?? { x: 0, y: 1, z: 0 },
    offset = (flight.id === 'hegrenade' ? 100 - 24 : 35 - 24) * 0.6 * 0.025
  const source = trace.solid
    ? {
        x: trace.position.x + normal.x * offset,
        y: trace.position.y + normal.y * offset,
        z: trace.position.z + normal.z * offset
      }
    : { ...center }
  data.center = source
  const blast = { ...source, y: source.y + 0.025 }
  for (const actor of bodies) {
    if (Dead.has(actor.entity) || (Bot.has(actor.entity) && !Bot.get(actor.entity).alive)) continue
    const torso = { x: actor.feet.x, y: actor.feet.y + 0.9, z: actor.feet.z }
    if (flight.id === 'hegrenade') {
      const damage = heDamage(Math.hypot(torso.x - blast.x, torso.y - blast.y, torso.z - blast.z))
      if (damage < 1 || (actor.team === flight.attacker.team && actor.address !== flight.attacker.address)) continue
      if (Bot.has(actor.entity)) {
        if (hurtBot(actor.entity, damage, flight.attacker, 'body', 0.5, true) === 'kill') creditKill(flight.attacker)
      } else applyPlayerDamage(flight.attacker, actor.entity, damage, 'body', source, 0.5, true)
      continue
    }
    const spot = { ...torso, y: torso.y + 0.7 * (0.5 + Math.random() * 0.6) },
      delta = { x: spot.x - blast.x, y: spot.y - blast.y, z: spot.z - blast.z }
    const length = Math.hypot(delta.x, delta.y, delta.z)
    if (length < 0.001 || length >= 37.5) continue
    const direction = { x: delta.x / length, y: delta.y / length, z: delta.z / length }
    const hit = traceActors(blast, direction, length, bodies, '')
    if (hit.solid && hit.texture !== actor.address) continue
    const reverse = traceActors(
      spot,
      { x: -direction.x, y: -direction.y, z: -direction.z },
      length,
      bodies,
      actor.address
    )
    if (reverse.solid) continue
    const dot =
      (blast.x - actor.feet.x) * actor.forward.x +
      (blast.y - actor.feet.y - 1.6) * actor.forward.y +
      (blast.z - actor.feet.z) * actor.forward.z
    let flash = flashes.get(actor.address)
    const previous = flash === undefined ? undefined : GrenadeFlash.getOrNull(flash)
    const effect = flashEffect(hit.startSolid ? 0 : hit.distance, dot >= 0, now, previous ?? undefined)
    if (flash === undefined) {
      flash = engine.addEntity()
      flashes.set(actor.address, flash)
    }
    GrenadeFlash.createOrReplace(flash, { target: actor.address, ...effect })
    syncEntity(flash, [GrenadeFlash.componentId])
  }
}
export function blindedByGrenade(address: string, now: number) {
  const entity = flashes.get(address),
    flash = entity === undefined ? undefined : GrenadeFlash.getOrNull(entity)
  return !!flash && now < flash.start + flash.fade * 0.33
}
export function smokeBlocksSight(from: Point, to: Point) {
  let length = 0
  for (const [entity] of flights) {
    const grenade = GrenadeProjectile.get(entity)
    if (grenade.phase === 'smoke' && Date.now() / 1000 - grenade.activated < SMOKE_SIGHT_SECONDS)
      length += smokeLength(from, to, grenade.center)
  }
  return length > 0.7 * 2.875
}
export function initializeGrenades() {
  clearGrenades()
  room.onMessage('grenadeUse', (data, context) => {
    if (!context) return
    const address = context.from.toLowerCase(),
      player = playerEntities.get(address),
      match = getPractice()
    if (
      player === undefined ||
      !match ||
      data.round !== match.round ||
      !['live', 'end'].includes(match.phase) ||
      !canPlayRound(address) ||
      Dead.has(player) ||
      PlayerHealth.get(player).current <= 0 ||
      PlayerEquipment.get(player).bombSelected ||
      isBombBusy(address)
    )
      return
    const weapon = Weapon.get(player),
      inventory = PlayerInventory.get(player)
    if (
      data.revision !== weapon.revision ||
      !grenadeProfile(inventory.active) ||
      !sequences.accept(address, data.sequence)
    )
      return
    const length = Math.hypot(data.direction.x, data.direction.y, data.direction.z)
    if (!Number.isFinite(length) || length < 0.001) return
    let action = actions.get(address)
    if (!action || action.revision !== weapon.revision) {
      action = {
        revision: weapon.revision,
        mode: weapon.mode,
        readyAt: weapon.readyAt,
        held: false,
        direction: data.direction
      }
      actions.set(address, action)
    }
    action.held = data.held
    action.direction = { x: data.direction.x / length, y: data.direction.y / length, z: data.direction.z / length }
  })
  engine.addSystem(() => {
    const now = Date.now() / 1000,
      match = getPractice()
    if (!match) return
    const bodies = actors()
    for (const actor of bodies) {
      const previous = positions.get(actor.address),
        span = previous ? now - previous.at : 0
      if (previous && span < 0.1) continue
      const velocity =
        previous && span > 0
          ? {
              x: (actor.feet.x - previous.feet.x) / span,
              y: (actor.feet.y - previous.feet.y) / span,
              z: (actor.feet.z - previous.feet.z) / span
            }
          : { x: 0, y: 0, z: 0 }
      positions.set(actor.address, {
        feet: { ...actor.feet },
        at: now,
        velocity: Math.hypot(velocity.x, velocity.y, velocity.z) < 30 ? velocity : { x: 0, y: 0, z: 0 }
      })
    }
    for (const [address, action] of actions) {
      const player = playerEntities.get(address),
        weapon = player === undefined ? undefined : Weapon.getOrNull(player)
      if (
        player === undefined ||
        !weapon ||
        weapon.revision !== action.revision ||
        Dead.has(player) ||
        PlayerEquipment.get(player).bombSelected
      ) {
        actions.delete(address)
        continue
      }
      const inventory = PlayerInventory.getMutable(player),
        grenade = grenadeProfile(inventory.active)
      if (!grenade) {
        actions.delete(address)
        continue
      }
      const event = advanceGrenadeAction(action, grenadeCount(inventory, grenade.id), now, grenade.id)
      if (event === 'throw') {
        const feet = playerPosition(address),
          item = inventory.items.find((item) => item.id === grenade.id)
        const launch =
          feet &&
          grenadeLaunch(
            { ...feet, y: feet.y + 1.6 },
            action.direction,
            positions.get(address)?.velocity ?? { x: 0, y: 0, z: 0 }
          )
        if (launch && item && item.reserve > 0) {
          item.reserve--
          Weapon.getMutable(player).ammoReserve = item.reserve
          spawn(grenade.id, attackerFor(player, grenade.id), launch.position, launch.velocity)
        }
      }
      if (event === 'retire') {
        actions.delete(address)
        retire(player)
        continue
      }
      const mutable = Weapon.getMutable(player)
      mutable.mode = action.mode
      mutable.readyAt = action.readyAt
    }
    for (const [entity, flight] of flights) {
      const data = GrenadeProjectile.getMutable(entity)
      if (data.round !== match.round || now >= data.expires) {
        engine.removeEntity(entity)
        flights.delete(entity)
        continue
      }
      if (data.phase === 'flight' || (data.phase === 'smoke' && now - data.activated < SMOKE_CANISTER_SECONDS)) {
        bounceGrenade(flight.motion, flight.id, now - flight.lastTick, (origin, direction, limit) =>
          traceActors(origin, direction, limit, bodies, flight.attacker.address)
        )
        data.position = flight.motion.position
        data.velocity = flight.motion.velocity
        data.grounded = flight.motion.grounded
        data.bounces = flight.motion.bounces
      }
      flight.lastTick = now
      if (flight.detonateAt !== undefined && now >= flight.detonateAt && data.phase === 'flight')
        activate(entity, flight, now, bodies)
      if (now >= flight.nextThink) {
        flight.nextThink = now + 0.1
        if (flight.id === 'smokegrenade' && flight.motion.grounded) {
          flight.motion.velocity.x *= 0.95
          flight.motion.velocity.z *= 0.95
        }
        if (
          data.phase === 'flight' &&
          flight.detonateAt === undefined &&
          now >= flight.fuse &&
          (flight.id !== 'smokegrenade' || flight.motion.grounded)
        )
          flight.detonateAt = now + 0.1
      }
    }
  })
}
