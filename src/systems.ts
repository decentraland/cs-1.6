import { engine, Entity } from '@dcl/sdk/ecs'
import { Weapon, Dead, PlayerAddress, PlayerInventory } from './components'
import { isServer } from '@dcl/sdk/network'
import { canAutoReload, finishReload, startReload } from './combat-rules'
import { isPlayerTriggerHeld, resetPlayerAccuracy } from './server'

import { syncAmmoPool } from './inventory-rules'
import { leaveScope, resumeScope } from './weapon-modes'
import { GunId, GUNS, modeStats } from './weapon-profiles'
import { GrenadeId, GRENADES } from './grenade-profiles'

export function equipGun(player: Entity, id: GunId, clip: number, reserve: number, mode = 0) {
  const previous = Weapon.getOrNull(player),
    gun = GUNS[id]
  Weapon.createOrReplace(player, {
    name: gun.name,
    revision: (previous?.revision ?? 0) + 1,
    mode,
    zoom: 90,
    resumeZoom: 90,
    alternateAt: 0,
    readyAt: Date.now() / 1000 + gun.drawTime,
    damage: modeStats(gun, mode).damage,
    ammoClip: clip,
    maxAmmoClip: gun.clip,
    ammoReserve: reserve,
    maxAmmoReserve: gun.reserve,
    fireRate: modeStats(gun, mode).fireRate,
    lastShotTime: 0,
    lastShotId: previous?.lastShotId ?? 0,
    lastFiredShotId: previous?.lastFiredShotId ?? 0,
    isReloading: false,
    reloadTime: gun.reloadTime,
    reloadStartTime: 0,
    reloadStage: 0,
    reloadStepAt: 0,
    reloadStep: 0
  })
  resetPlayerAccuracy(PlayerAddress.getOrNull(player)?.address ?? '')
}
export function equipKnife(player: Entity) {
  const previous = Weapon.getOrNull(player)
  Weapon.createOrReplace(player, {
    name: 'Knife',
    revision: (previous?.revision ?? 0) + 1,
    mode: 0,
    zoom: 90,
    resumeZoom: 90,
    alternateAt: 0,
    readyAt: Date.now() / 1000 + 0.75,
    damage: 0,
    ammoClip: 0,
    maxAmmoClip: 0,
    ammoReserve: 0,
    maxAmmoReserve: 0,
    fireRate: 0.35,
    lastShotTime: 0,
    lastShotId: previous?.lastShotId ?? 0,
    lastFiredShotId: previous?.lastFiredShotId ?? 0,
    isReloading: false,
    reloadTime: 0,
    reloadStartTime: 0,
    reloadStage: 0,
    reloadStepAt: 0,
    reloadStep: 0
  })
  resetPlayerAccuracy(PlayerAddress.getOrNull(player)?.address ?? '')
}
export function storeActiveGun(player: Entity) {
  const weapon = Weapon.getOrNull(player),
    inventory = PlayerInventory.getMutableOrNull(player)
  if (!weapon || !inventory) return
  const gun = Object.values(GUNS).find((profile) => profile.name === weapon.name)
  const item = gun && inventory.items.find((candidate) => candidate.id === gun.id)
  if (item) {
    item.clip = weapon.ammoClip
    syncAmmoPool(inventory, item.id, weapon.ammoReserve)
    item.mode = weapon.mode
  }
}
export function equipGrenade(player: Entity, id: GrenadeId, count: number) {
  equipKnife(player)
  Object.assign(Weapon.getMutable(player), {
    name: GRENADES[id].name,
    ammoClip: -1,
    maxAmmoClip: -1,
    ammoReserve: count,
    maxAmmoReserve: GRENADES[id].capacity
  })
}
export function giveWeapon(player: Entity, _weaponType: 'AK47') {
  if (!isServer()) return
  PlayerInventory.createOrReplace(player, { active: 'ak47', items: [{ id: 'ak47', clip: 30, reserve: 90 }] })
  equipGun(player, 'ak47', 30, 90)
}

export function weaponSystem() {
  if (!isServer()) return
  const now = Date.now() / 1000
  for (const [entity, weapon] of engine.getEntitiesWith(Weapon)) {
    if (Dead.has(entity)) continue
    const mutable = Weapon.getMutable(entity)
    resumeScope(mutable, now)
    const address = PlayerAddress.getOrNull(entity)?.address ?? ''
    if (
      canAutoReload(weapon, true, isPlayerTriggerHeld(address)) &&
      now >= weapon.readyAt &&
      now - weapon.lastShotTime >= weapon.fireRate
    ) {
      if (startReload(mutable, now, true)) {
        const gun = Object.values(GUNS).find((profile) => profile.name === weapon.name)
        if (gun) leaveScope(mutable, gun)
        resetPlayerAccuracy(address, false, true)
      }
    }
    if (finishReload(mutable, now)) storeActiveGun(entity)
  }
}
