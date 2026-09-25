import { profileByName } from './weapon-profiles'
export interface WeaponState {
  mode?: number
  name?: string
  readyAt?: number
  reloadStage?: number
  reloadStepAt?: number
  reloadStep?: number
  ammoClip: number
  maxAmmoClip: number
  ammoReserve: number
  fireRate: number
  nextPrimaryAt?: number
  alternateAt?: number
  lastShotTime: number
  lastShotId: number
  isReloading: boolean
  reloadTime: number
  reloadStartTime: number
}

export function primaryDeadline(weapon: Pick<WeaponState, 'nextPrimaryAt' | 'lastShotTime' | 'fireRate'>): number {
  return weapon.nextPrimaryAt ?? weapon.lastShotTime + weapon.fireRate
}

export type ShotRejection = 'sequence' | 'dead' | 'reloading' | 'empty' | 'cooldown'

export function finishReload(weapon: WeaponState, now: number, onInsert?: () => void): boolean {
  if (!weapon.isReloading) return false
  const gun = profileByName(weapon.name ?? '')
  if (gun.kind === 'gun' && gun.shellReload) {
    let changed = false,
      inserted = false
    while (weapon.isReloading && now + 1e-6 >= (weapon.reloadStepAt ?? Infinity)) {
      const at = weapon.reloadStepAt ?? now
      if (weapon.reloadStage === 2) {
        weapon.ammoClip++
        weapon.ammoReserve--
        changed = true
      }
      if (weapon.ammoClip >= weapon.maxAmmoClip || weapon.ammoReserve <= 0) {
        weapon.isReloading = false
        weapon.reloadStage = 0
      } else {
        inserted = true
        weapon.reloadStage = 2
        weapon.reloadStep = (weapon.reloadStep ?? 0) + 1
        weapon.reloadStepAt = at + (gun.id === 'm3' ? 0.45 : 0.3)
      }
    }
    if (inserted && weapon.isReloading) onInsert?.()
    return changed
  }
  if (now - weapon.reloadStartTime + 1e-6 < weapon.reloadTime) return false
  const rounds = Math.min(weapon.maxAmmoClip - weapon.ammoClip, weapon.ammoReserve)
  weapon.ammoClip += rounds
  weapon.ammoReserve -= rounds
  weapon.isReloading = false
  return true
}

export function canReload(weapon: Readonly<WeaponState>, alive: boolean): boolean {
  return alive && !weapon.isReloading && weapon.ammoClip < weapon.maxAmmoClip && weapon.ammoReserve > 0
}

export function canAutoReload(weapon: Readonly<WeaponState>, alive: boolean, triggerHeld: boolean): boolean {
  const gun = profileByName(weapon.name ?? '')
  return (
    weapon.ammoClip === 0 && canReload(weapon, alive) && (!triggerHeld || (gun.kind === 'gun' && !!gun.shellReload))
  )
}

export function startReload(weapon: WeaponState, now: number, alive: boolean): boolean {
  if (!canReload(weapon, alive) || now < (weapon.readyAt ?? 0) || now < primaryDeadline(weapon)) return false
  const gun = profileByName(weapon.name ?? '')
  if (gun.kind === 'gun' && gun.shellReload) {
    weapon.reloadStage = 1
    weapon.reloadStep = (weapon.reloadStep ?? 0) + 1
    weapon.reloadStepAt = now + 0.55
    weapon.readyAt = now + 0.55
    weapon.nextPrimaryAt = now + 0.55
    weapon.alternateAt = now + 0.55
  }
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
  scheduledTime = now,
  continuation = false,
  onInsert?: () => void
): ShotRejection | undefined {
  if (!alive) return 'dead'
  finishReload(weapon, now, onInsert)
  if (weapon.isReloading) {
    if (!canInterruptReload(weapon, now)) return 'reloading'
    weapon.isReloading = false
    weapon.reloadStage = 0
  }
  if (weapon.ammoClip <= 0) return 'empty'
  if (now + 1e-6 < scheduledTime || (!continuation && scheduledTime + 1e-6 < primaryDeadline(weapon))) return 'cooldown'
  weapon.ammoClip--
  weapon.lastShotTime = scheduledTime
  if (!continuation) weapon.nextPrimaryAt = scheduledTime + weapon.fireRate
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

export function canInterruptReload(weapon: Readonly<WeaponState>, now: number): boolean {
  const gun = profileByName(weapon.name ?? '')
  return gun.kind === 'gun' && !!gun.shellReload && weapon.ammoClip > 0 && now >= (weapon.readyAt ?? 0)
}
