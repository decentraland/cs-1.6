import { engine, Entity } from '@dcl/sdk/ecs'
import { Weapon } from './components'

// Weapon presets
export const WEAPON_PRESETS = {
  AK47: {
    name: 'AK-47',
    damage: 36,
    maxAmmoClip: 30,
    maxAmmoReserve: 90,
    fireRate: 0.1,
    reloadTime: 2.5,
    cost: 2700
  },
  M4A4: {
    name: 'M4A4',
    damage: 33,
    maxAmmoClip: 30,
    maxAmmoReserve: 90,
    fireRate: 0.09,
    reloadTime: 3.1,
    cost: 3100
  },
  AWP: {
    name: 'AWP',
    damage: 115,
    maxAmmoClip: 10,
    maxAmmoReserve: 30,
    fireRate: 1.5,
    reloadTime: 3.7,
    cost: 4750
  },
  DEAGLE: {
    name: 'Desert Eagle',
    damage: 53,
    maxAmmoClip: 7,
    maxAmmoReserve: 35,
    fireRate: 0.4,
    reloadTime: 2.2,
    cost: 700
  },
  GLOCK: {
    name: 'Glock-18',
    damage: 28,
    maxAmmoClip: 20,
    maxAmmoReserve: 120,
    fireRate: 0.15,
    reloadTime: 2.2,
    cost: 200
  }
}

export function giveWeapon(player: Entity, weaponType: keyof typeof WEAPON_PRESETS) {
  const preset = WEAPON_PRESETS[weaponType]
  Weapon.createOrReplace(player, {
    name: preset.name,
    damage: preset.damage,
    ammoClip: preset.maxAmmoClip,
    maxAmmoClip: preset.maxAmmoClip,
    ammoReserve: preset.maxAmmoReserve,
    maxAmmoReserve: preset.maxAmmoReserve,
    fireRate: preset.fireRate,
    lastShotTime: 0,
    isReloading: false,
    reloadTime: preset.reloadTime,
    reloadStartTime: 0
  })
}

// Weapon system - handles reloading
export function weaponSystem(dt: number) {
  const currentTime = Date.now() / 1000

  for (const [entity, weapon] of engine.getEntitiesWith(Weapon)) {
    // Handle reloading
    if (weapon.isReloading) {
      const reloadProgress = currentTime - weapon.reloadStartTime
      if (reloadProgress >= weapon.reloadTime) {
        // Reload complete - now we need to mutate
        const mutableWeapon = Weapon.getMutable(entity)
        const ammoNeeded = weapon.maxAmmoClip - weapon.ammoClip
        const ammoToReload = Math.min(ammoNeeded, weapon.ammoReserve)

        mutableWeapon.ammoClip += ammoToReload
        mutableWeapon.ammoReserve -= ammoToReload
        mutableWeapon.isReloading = false
      }
    }
  }
}

export function reload(player: Entity) {
  const weapon = Weapon.getOrNull(player)
  if (!weapon) return

  // Already reloading or mag is full
  if (weapon.isReloading || weapon.ammoClip === weapon.maxAmmoClip) return

  // No ammo to reload
  if (weapon.ammoReserve <= 0) return

  // Now we need to mutate
  const mutableWeapon = Weapon.getMutable(player)
  mutableWeapon.isReloading = true
  mutableWeapon.reloadStartTime = Date.now() / 1000
}
