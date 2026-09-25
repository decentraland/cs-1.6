import { primaryDeadline, startReload, WeaponState } from './combat-rules'
import { unscopeBolt, WeaponModeState } from './weapon-modes'
import { GunProfile } from './weapon-profiles'

export function emptyFireInterval(gun: GunProfile) {
  return gun.shellReload ? 1 : 0.2
}

export function emptyFireSound(gun: GunProfile): 'dryfire_pistol' | 'dryfire' {
  return gun.slot === 'secondary' ? 'dryfire_pistol' : 'dryfire'
}

export function emptyFire(weapon: WeaponState & WeaponModeState, gun: GunProfile, now: number): boolean {
  if (weapon.ammoClip > 0 || weapon.isReloading || now < weapon.readyAt || now + 1e-6 < primaryDeadline(weapon))
    return false
  if (gun.shellReload) startReload(weapon, now, true)
  weapon.nextPrimaryAt = now + emptyFireInterval(gun)
  unscopeBolt(weapon, gun)
  return true
}
