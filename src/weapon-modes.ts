import { GunId, GunProfile, modeStats } from './weapon-profiles'
import { primaryDeadline, WeaponState } from './combat-rules'

export interface AttackTimers {
  primary: number
  secondary: number
}

export function rememberAttackTimers(weapon: Readonly<WeaponState>): AttackTimers {
  return { primary: primaryDeadline(weapon), secondary: weapon.alternateAt ?? 0 }
}

export function deployAttackTimers(gun: GunProfile, now: number, stored?: Readonly<AttackTimers>): AttackTimers {
  return gun.id === 'awp' || gun.id === 'scout'
    ? { primary: now + gun.drawTime, secondary: now + 1 }
    : { primary: stored?.primary ?? 0, secondary: stored?.secondary ?? 0 }
}

export interface WeaponModeState {
  mode: number
  zoom: number
  resumeZoom: number
  alternateAt: number
  readyAt: number
  nextPrimaryAt?: number
  lastShotTime: number
  fireRate: number
  damage: number
  isReloading: boolean
}

export function alternateWeapon(weapon: WeaponModeState, gun: GunProfile, now: number): boolean {
  if (!gun.alternate || weapon.isReloading || now < weapon.readyAt || now < weapon.alternateAt) return false
  if (gun.alternate === 'scope') {
    const levels = [90, ...(gun.zoomLevels ?? [])]
    weapon.zoom = levels[(levels.indexOf(weapon.zoom) + 1) % levels.length]
    weapon.resumeZoom = 90
    weapon.alternateAt = now + 0.3
  } else {
    weapon.mode = weapon.mode ? 0 : 1
    const delay = gun.alternate === 'silencer' ? (gun.id === 'm4a1' ? 2 : 3) : 0.3
    weapon.alternateAt = now + delay
    if (gun.alternate === 'silencer') {
      weapon.readyAt = now + delay
      weapon.nextPrimaryAt = now + delay
    }
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

export function firedWeapon(weapon: WeaponModeState, gun: GunProfile) {
  weapon.alternateAt = primaryDeadline(weapon)
  unscopeBolt(weapon, gun)
  weapon.mode = pendingGunMode(gun.id, weapon.mode, 1)
}

export function unscopeBolt(weapon: WeaponModeState, gun: GunProfile) {
  if ((gun.id === 'awp' || gun.id === 'scout') && weapon.zoom !== 90) {
    weapon.resumeZoom = weapon.zoom
    weapon.zoom = 90
  }
}

export function resumeScope(weapon: WeaponModeState, now: number) {
  if (weapon.resumeZoom !== 90 && !weapon.isReloading && now >= primaryDeadline(weapon)) {
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

// Elite mode stores WPNSTATE_ELITE_LEFT: reload preserves it; an even-clip deploy sets it.
export function deployedGunMode(gun: GunId, clip: number, mode = 0) {
  return gun === 'elite' && clip % 2 === 0 ? 1 : mode
}

export function pendingGunMode(gun: GunId, mode: number, shots: number) {
  return gun === 'elite' ? (mode + shots) % 2 : mode
}

export class EliteHandPrediction {
  private context = ''
  private confirmed = 0
  private mode = 0
  private pending = new Set<number>()

  reset() {
    this.context = ''
    this.pending.clear()
  }

  fire(weapon: { revision: number; lastFiredShotId: number; mode: number }, round: number, id: number) {
    const context = `${round}:${weapon.revision}`
    if (context !== this.context) {
      this.context = context
      this.confirmed = weapon.lastFiredShotId
      this.mode = weapon.mode
      this.pending.clear()
    } else if (weapon.lastFiredShotId > this.confirmed) {
      this.confirmed = weapon.lastFiredShotId
      this.mode = weapon.mode
      this.prune()
    }
    const mode = pendingGunMode('elite', this.mode, this.pending.size)
    this.pending.add(id)
    return mode
  }

  confirm(id: number, firedMode: number) {
    if (!this.pending.has(id) || id <= this.confirmed) return
    this.confirmed = id
    this.mode = pendingGunMode('elite', firedMode, 1)
    this.prune()
  }

  reject(id: number) {
    this.pending.delete(id)
  }

  private prune() {
    for (const id of this.pending) if (id <= this.confirmed) this.pending.delete(id)
  }
}
