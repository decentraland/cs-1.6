import { GunProfile, modeStats } from './weapon-profiles'

export interface WeaponModeState {
  mode: number
  zoom: number
  resumeZoom: number
  alternateAt: number
  readyAt: number
  lastShotTime: number
  fireRate: number
  damage: number
  isReloading: boolean
}

export function alternateWeapon(weapon: WeaponModeState, gun: GunProfile, now: number): boolean {
  if (
    !gun.alternate ||
    weapon.isReloading ||
    now < weapon.readyAt ||
    now < weapon.alternateAt ||
    now < weapon.lastShotTime + weapon.fireRate
  )
    return false
  if (gun.alternate === 'scope') {
    const levels = [90, ...(gun.zoomLevels ?? [])]
    weapon.zoom = levels[(levels.indexOf(weapon.zoom) + 1) % levels.length]
    weapon.resumeZoom = 90
    weapon.alternateAt = now + 0.3
  } else {
    weapon.mode = weapon.mode ? 0 : 1
    const delay = gun.alternate === 'silencer' ? (gun.id === 'm4a1' ? 2 : 3) : 0.3
    weapon.alternateAt = now + delay
    if (gun.alternate === 'silencer') weapon.readyAt = now + delay
  }
  const stats = modeStats(gun, weapon.mode, weapon.zoom)
  weapon.damage = stats.damage
  weapon.fireRate = stats.fireRate
  return true
}

export function leaveScope(weapon: WeaponModeState, gun: GunProfile) {
  weapon.zoom = 90
  weapon.resumeZoom = 90
  weapon.fireRate = modeStats(gun, weapon.mode).fireRate
}

export function firedScope(weapon: WeaponModeState, gun: GunProfile) {
  if ((gun.id === 'awp' || gun.id === 'scout') && weapon.zoom !== 90) {
    weapon.resumeZoom = weapon.zoom
    weapon.zoom = 90
  }
}

export function resumeScope(weapon: WeaponModeState, now: number) {
  if (weapon.resumeZoom !== 90 && !weapon.isReloading && now >= weapon.lastShotTime + weapon.fireRate) {
    weapon.zoom = weapon.resumeZoom
    weapon.resumeZoom = 90
  }
}

export interface BurstState {
  remaining: number
  index: number
  nextAt: number
  interval: number
  readyAt: number
}
export function beginBurst(gun: GunProfile, mode: number, clip: number, now: number): BurstState | undefined {
  if (gun.alternate !== 'burst' || !mode || clip <= 0) return undefined
  return {
    remaining: Math.min(2, clip - 1),
    index: 1,
    // Glock ItemPostFrame advances the burst without checking its timestamp.
    nextAt: now + (gun.id === 'famas' ? 0.05 : 0),
    interval: gun.id === 'famas' ? 0.1 : 0,
    readyAt: now + (gun.id === 'famas' ? 0.55 : 0.5)
  }
}
export function advanceBurst(burst: BurstState, now: number): boolean {
  if (burst.remaining <= 0 || now + 1e-6 < burst.nextAt) return false
  burst.remaining--
  burst.index++
  burst.nextAt = now + burst.interval
  return true
}
