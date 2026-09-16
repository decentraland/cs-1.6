import { Entity } from '@dcl/sdk/ecs'
import { PlayerInventory, PlayerEquipment, PlayerAddress, PlayerHealth, Dead, Weapon } from './components'
import { startingInventory, selectWeapon } from './inventory-rules'
import { equipGun, equipKnife, equipGrenade, storeActiveGun } from './systems'
import { grenadeProfile } from './grenade-profiles'
import { gunProfile, GunId } from './weapon-profiles'
import { getPractice, canPlayRound } from './practice'
import { playerEntities } from './server'
import { room } from './index'
import { holsterBomb, isBombBusy } from './bomb'
import { alternateWeapon } from './weapon-modes'

export const SPAWN_PRIMARY: GunId | undefined = undefined

export function spawnInventory(player: Entity, team: number) {
  PlayerInventory.createOrReplace(player, startingInventory(team, SPAWN_PRIMARY))
  equipActiveWeapon(player)
}
export function equipActiveWeapon(player: Entity) {
  const inventory = PlayerInventory.get(player)
  if (inventory.active === 'knife') {
    PlayerEquipment.getMutable(player).bombSelected = false
    equipKnife(player)
    return
  }
  const item = inventory.items.find((candidate) => candidate.id === inventory.active),
    gun = item && gunProfile(item.id)
  const grenade = item && grenadeProfile(item.id)
  if (item && grenade && item.reserve > 0) {
    PlayerEquipment.getMutable(player).bombSelected = false
    equipGrenade(player, grenade.id, item.reserve)
    return
  }
  if (item && gun) {
    PlayerEquipment.getMutable(player).bombSelected = false
    equipGun(player, gun.id, item.clip, item.reserve, item.mode ?? 0)
  }
}
export function initializeInventory() {
  room.onMessage('weaponAlternate', (data, context) => {
    if (!context) return
    const address = context.from.toLowerCase(),
      player = playerEntities.get(address),
      match = getPractice()
    if (
      player === undefined ||
      !match ||
      data.round !== match.round ||
      !['freeze', 'live'].includes(match.phase) ||
      !canPlayRound(address) ||
      Dead.has(player) ||
      PlayerHealth.get(player).current <= 0 ||
      isBombBusy(address) ||
      PlayerEquipment.get(player).bombSelected
    )
      return
    const weapon = Weapon.getMutable(player)
    if (data.revision !== weapon.revision) return
    const gun = gunProfile(PlayerInventory.get(player).active)
    if (gun && alternateWeapon(weapon, gun, Date.now() / 1000)) storeActiveGun(player)
  })
  room.onMessage('weaponSelect', (data, context) => {
    if (!context) return
    const address = context.from.toLowerCase(),
      player = playerEntities.get(address),
      match = getPractice()
    if (
      player === undefined ||
      !match ||
      data.round !== match.round ||
      !['freeze', 'live'].includes(match.phase) ||
      !canPlayRound(address) ||
      Dead.has(player) ||
      PlayerHealth.get(player).current <= 0 ||
      (isBombBusy(address) && !PlayerEquipment.get(player).bombSelected)
    )
      return
    const weapon = Weapon.get(player)
    if (data.revision !== weapon.revision) return
    const wasBomb = PlayerEquipment.get(player).bombSelected
    storeActiveGun(player)
    const inventory = PlayerInventory.getMutable(player),
      before = inventory.active
    const id = selectWeapon(inventory, data.slot)
    if (id && (id !== before || wasBomb)) {
      if (wasBomb) holsterBomb(address)
      equipActiveWeapon(player)
    }
  })
}
