import { engine, Entity } from '@dcl/sdk/ecs'
import { Weapon, Dead, PlayerAddress, PlayerInventory } from './components'
import { isServer } from '@dcl/sdk/network'
import { finishReload, startReload } from './combat-rules'
import { resetPlayerAccuracy } from './server'

import { GunId, GUNS } from './weapon-profiles'

export function equipGun(player: Entity, id: GunId, clip: number, reserve: number) {
  const previous = Weapon.getOrNull(player),
    gun = GUNS[id]
  Weapon.createOrReplace(player, {
    name: gun.name,
    revision: (previous?.revision ?? 0) + 1,
    readyAt: Date.now() / 1000 + 0.75,
    damage: gun.damage,
    ammoClip: clip,
    maxAmmoClip: gun.clip,
    ammoReserve: reserve,
    maxAmmoReserve: gun.reserve,
    fireRate: gun.fireRate,
    lastShotTime: 0,
    lastShotId: previous?.lastShotId ?? 0,
    lastFiredShotId: previous?.lastFiredShotId ?? 0,
    isReloading: false,
    reloadTime: gun.reloadTime,
    reloadStartTime: 0
  })
  resetPlayerAccuracy(PlayerAddress.getOrNull(player)?.address ?? '')
}
export function equipKnife(player: Entity) {
  const previous = Weapon.getOrNull(player)
  Weapon.createOrReplace(player, {
    name: 'Knife',
    revision: (previous?.revision ?? 0) + 1,
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
    reloadStartTime: 0
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
    item.reserve = weapon.ammoReserve
  }
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
    if (
      weapon.maxAmmoClip > 0 &&
      weapon.ammoClip === 0 &&
      !weapon.isReloading &&
      now - weapon.lastShotTime >= weapon.fireRate
    ) {
      if (startReload(Weapon.getMutable(entity), now, true))
        resetPlayerAccuracy(PlayerAddress.getOrNull(entity)?.address ?? '')
    }
    if (!weapon.isReloading) continue
    if (now - weapon.reloadStartTime + 1e-6 < weapon.reloadTime) continue
    finishReload(Weapon.getMutable(entity), now)
  }
}
