export interface WeaponState {
  ammoClip: number
  maxAmmoClip: number
  ammoReserve: number
  fireRate: number
  lastShotTime: number
  lastShotId: number
  isReloading: boolean
  reloadTime: number
  reloadStartTime: number
}

export type ShotRejection = 'sequence' | 'dead' | 'reloading' | 'empty' | 'cooldown'

export function finishReload(weapon: WeaponState, now: number): boolean {
  if (!weapon.isReloading || now - weapon.reloadStartTime + 1e-6 < weapon.reloadTime) return false
  const rounds = Math.min(weapon.maxAmmoClip - weapon.ammoClip, weapon.ammoReserve)
  weapon.ammoClip += rounds
  weapon.ammoReserve -= rounds
  weapon.isReloading = false
  return true
}

export function canReload(weapon: Readonly<WeaponState>, alive: boolean): boolean {
  return alive && !weapon.isReloading && weapon.ammoClip < weapon.maxAmmoClip && weapon.ammoReserve > 0
}

export function startReload(weapon: WeaponState, now: number, alive: boolean): boolean {
  if (!canReload(weapon, alive)) return false
  weapon.isReloading = true
  weapon.reloadStartTime = now
  return true
}

export function claimShot(weapon: WeaponState, shotId: number): ShotRejection | undefined {
  if (!Number.isSafeInteger(shotId) || shotId <= weapon.lastShotId || shotId > 2147483647) return 'sequence'
  weapon.lastShotId = shotId
  return undefined
}

export function fireShot(
  weapon: WeaponState,
  now: number,
  alive: boolean,
  scheduledTime = now
): ShotRejection | undefined {
  if (!alive) return 'dead'
  finishReload(weapon, now)
  if (weapon.isReloading) return 'reloading'
  if (weapon.ammoClip <= 0) return 'empty'
  if (now + 1e-6 < scheduledTime || scheduledTime - weapon.lastShotTime + 1e-6 < weapon.fireRate) return 'cooldown'
  weapon.ammoClip--
  weapon.lastShotTime = scheduledTime
  return undefined
}

export function authorizeShot(
  weapon: WeaponState,
  shotId: number,
  now: number,
  alive: boolean
): ShotRejection | undefined {
  return claimShot(weapon, shotId) ?? fireShot(weapon, now, alive)
}

// One 30 Hz server tick plus one 60 Hz client frame; early requests wait, never fire early.
export const SHOT_SCHEDULING_WINDOW = 0.05

export function shotDeadline(lastShotTime: number, fireRate: number, receivedAt: number): number | undefined {
  const next = lastShotTime + fireRate
  if (receivedAt + SHOT_SCHEDULING_WINDOW + 1e-6 < next) return undefined
  return receivedAt > next + SHOT_SCHEDULING_WINDOW ? receivedAt : next
}

export function nextClientShotTime(previous: number, fireRate: number, now: number): number {
  const next = previous + fireRate
  return now - next > fireRate ? now : next
}
