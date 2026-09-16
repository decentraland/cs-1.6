import { dropPlayerDefuseKit } from './defuse-kits'
import { dropPrimedGrenade } from './grenades'
import { weaponWeight } from './inventory-rules'
import { engine, Entity } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'
import {
  Dead,
  DroppedWeapon,
  PlayerAddress,
  PlayerEquipment,
  PlayerHealth,
  PlayerInventory,
  Weapon
} from './components'
import { room } from './index'
import { playerEntities, avatarForward, playerLookDirection } from './server'
import { canPlayRound, getPractice, playerPosition } from './practice'
import { equipActiveWeapon } from './inventory'
import { StoredGun } from './inventory-rules'
import { storeActiveGun } from './systems'
import { deathGun, dropDirection, dropGun, pickupGun, tossGun, touchesGun, TossState } from './pickup-rules'
import { bulletWorldTrace } from './penetration'
import { getBomb, isBombBusy } from './bomb'
import type { Point } from './ballistics'
import { throwWeaponBox } from './weapon-box-rules'

DroppedWeapon.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
const drops = new Map<Entity, { motion: TossState; expires: number }>()
const positions = new Map<string, { position: Point; velocity: Point; at: number }>()

export function clearDroppedWeapons() {
  for (const [entity] of engine.getEntitiesWith(DroppedWeapon)) engine.removeEntity(entity)
  drops.clear()
  positions.clear()
}
export function spawnDroppedGun(
  item: StoredGun,
  feet: Point,
  forward: Point,
  thrown: boolean,
  velocity = { x: 0, y: 0, z: 0 }
) {
  const match = getPractice()
  if (!match) return
  const motion = thrown
    ? throwWeaponBox(feet, forward, bulletWorldTrace)
    : {
        position: { x: feet.x, y: feet.y + 0.9, z: feet.z },
        velocity: { x: velocity.x * 0.75, y: velocity.y * 0.75, z: velocity.z * 0.75 },
        settled: false
      }
  const position = motion.position
  const entity = engine.addEntity()
  DroppedWeapon.create(entity, {
    gun: item.id,
    clip: item.clip,
    reserve: item.reserve,
    mode: item.mode ?? 0,
    position,
    yaw: Math.atan2(forward.x, forward.z),
    round: match.round,
    settled: false
  })
  syncEntity(entity, [DroppedWeapon.componentId])
  drops.set(entity, {
    expires: Date.now() / 1000 + 300,
    motion
  })
}
export function dropDeadPlayer(player: Entity) {
  dropPrimedGrenade(player)
  const address = PlayerAddress.get(player).address,
    position = playerPosition(address) ?? positions.get(address)?.position
  dropPlayerDefuseKit(player, position)
  if (!position || !PlayerInventory.has(player)) return
  storeActiveGun(player)
  const item = deathGun(PlayerInventory.getMutable(player))
  if (item)
    spawnDroppedGun(
      item,
      position,
      avatarForward(address) ?? { x: 0, y: 0, z: 1 },
      false,
      positions.get(address)?.velocity
    )
}
export function throwPlayerGun(player: Entity, item: StoredGun, forward?: Point) {
  const address = PlayerAddress.get(player).address,
    position = playerPosition(address)
  const facing = avatarForward(address) ?? { x: 0, y: 0, z: 1 }
  if (position)
    spawnDroppedGun(
      item,
      position,
      forward ?? dropDirection(playerLookDirection(address) ?? facing, facing) ?? facing,
      true
    )
}
function livePlayer(address: string, player: Entity) {
  return canPlayRound(address) && !Dead.has(player) && (PlayerHealth.getOrNull(player)?.current ?? 0) > 0
}
export function initializeDroppedWeapons() {
  clearDroppedWeapons()
  room.onMessage('weaponDrop', (data, context) => {
    if (!context) return
    const address = context.from.toLowerCase(),
      player = playerEntities.get(address),
      match = getPractice()
    if (
      player === undefined ||
      !match ||
      !['freeze', 'live', 'end'].includes(match.phase) ||
      data.round !== match.round ||
      !livePlayer(address, player) ||
      isBombBusy(address) ||
      PlayerEquipment.get(player).bombSelected ||
      data.revision !== Weapon.get(player).revision ||
      !playerPosition(address)
    )
      return
    const direction = dropDirection(data.direction, avatarForward(address))
    if (!direction) return
    storeActiveGun(player)
    const item = dropGun(PlayerInventory.getMutable(player))
    if (!item) return
    throwPlayerGun(player, item, direction)
    equipActiveWeapon(player)
    if (weaponWeight(PlayerInventory.get(player).active) < 3 && getBomb()?.carrier === address) {
      PlayerInventory.getMutable(player).active = 'knife'
      equipActiveWeapon(player)
      PlayerEquipment.getMutable(player).bombSelected = true
    }
  })
  let elapsed = 0
  engine.addSystem((dt: number) => {
    elapsed += dt
    if (elapsed < 0.05) return
    const step = elapsed
    elapsed = 0
    const now = Date.now() / 1000,
      match = getPractice()
    if (!match) return
    const live: { address: string; player: Entity; position: Point }[] = []
    for (const [address, player] of playerEntities) {
      if (!livePlayer(address, player)) continue
      const position = playerPosition(address)
      if (!position) continue
      const previous = positions.get(address),
        span = previous ? now - previous.at : 0
      const velocity =
        previous && span > 0 && span < 0.5
          ? {
              x: (position.x - previous.position.x) / span,
              y: (position.y - previous.position.y) / span,
              z: (position.z - previous.position.z) / span
            }
          : { x: 0, y: 0, z: 0 }
      positions.set(address, {
        position: { ...position },
        at: now,
        velocity: Math.hypot(velocity.x, velocity.y, velocity.z) < 30 ? velocity : { x: 0, y: 0, z: 0 }
      })
      live.push({ address, player, position })
    }
    for (const [entity, drop] of drops) {
      if (drop.expires <= now || DroppedWeapon.get(entity).round !== match.round) {
        engine.removeEntity(entity)
        drops.delete(entity)
        continue
      }
      if (!drop.motion.settled) {
        tossGun(drop.motion, step, bulletWorldTrace)
        const data = DroppedWeapon.getMutable(entity)
        data.position = drop.motion.position
        data.settled = drop.motion.settled
      }
      if (!drop.motion.settled || !['freeze', 'live', 'end'].includes(match.phase)) continue
      for (const { address, player, position } of live) {
        if (!touchesGun(position, drop.motion.position)) continue
        storeActiveGun(player)
        const data = DroppedWeapon.get(entity),
          inventory = PlayerInventory.getMutable(player),
          previous = inventory.active
        if (
          !pickupGun(
            inventory,
            { id: data.gun, clip: data.clip, reserve: data.reserve, mode: data.mode },
            true,
            PlayerEquipment.get(player).bombSelected ? 'c4' : inventory.active
          )
        )
          continue
        if (inventory.active !== previous) equipActiveWeapon(player)
        else {
          const active = inventory.items.find((item) => item.id === inventory.active)
          if (active) Weapon.getMutable(player).ammoReserve = active.reserve
        }
        room.send('weaponPickup', { address, position: drop.motion.position, round: match.round })
        engine.removeEntity(entity)
        drops.delete(entity)
        break
      }
    }
  })
}
