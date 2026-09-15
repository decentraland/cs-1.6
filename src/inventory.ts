import { Entity } from '@dcl/sdk/ecs'
import { PlayerInventory, PlayerEquipment, PlayerAddress, PlayerHealth, Dead, Weapon } from './components'
import { startingInventory, selectWeapon } from './inventory-rules'
import { equipGun, equipKnife, storeActiveGun } from './systems'
import { gunProfile, GunId } from './weapon-profiles'
import { getPractice, canPlayRound } from './practice'
import { playerEntities } from './server'
import { room } from './index'
import { isBombBusy } from './bomb'

// Testing aid: give every spawn this rifle on top of the team pistol. Set to undefined for CS 1.6 pistol starts.
export const SPAWN_PRIMARY: GunId | undefined = 'ak47'

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
  if (item && gun) {
    PlayerEquipment.getMutable(player).bombSelected = false
    equipGun(player, gun.id, item.clip, item.reserve)
  }
}
export function initializeInventory() {
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
      isBombBusy(address)
    )
      return
    const weapon = Weapon.get(player)
    if (data.revision !== weapon.revision) return
    storeActiveGun(player)
    const inventory = PlayerInventory.getMutable(player),
      before = inventory.active
    const id = selectWeapon(inventory, data.slot)
    if (id && id !== before) equipActiveWeapon(player)
  })
}
