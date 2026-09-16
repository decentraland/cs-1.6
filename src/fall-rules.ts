export interface FallPoint {
  x: number
  y: number
  z: number
}
export interface Landing {
  position: FallPoint
  speed: number
  at: number
}
export interface LandingClaim extends Landing {
  sequence: number
}
export const FALL_SAFE_SPEED = 500 * 0.025
export const LANDING_CLAIM_WAIT = 0.25

export function fallDamage(speed: number): number {
  return Number.isFinite(speed) ? Math.max(0, (speed / 0.025 - 500) * (100 / 600) * 1.25) : 0
}

export function resolveFall(health: number, speed: number) {
  const raw = fallDamage(speed),
    damage = Math.floor(raw)
  return { damage, health: Math.max(0, health - damage), splat: raw > health }
}

export function acceptedLandingSpeed(landing: Landing, claim: LandingClaim | undefined): number {
  if (!claim || !Number.isFinite(claim.speed) || claim.speed < 0 || claim.speed > 40) return landing.speed
  const distance = Math.hypot(
    landing.position.x - claim.position.x,
    landing.position.y - claim.position.y,
    landing.position.z - claim.position.z
  )
  return Math.abs(claim.at - landing.at) <= 0.6 && distance <= 1 && Math.abs(claim.speed - landing.speed) <= 2
    ? claim.speed
    : landing.speed
}

export class FallTracker {
  private previous: FallPoint | undefined
  private at = 0
  private speed = 0
  private descending = 0
  private drop = 0
  private samples: { y: number; at: number }[] = []

  sample(position: FallPoint, now: number, grounded: boolean): Landing | undefined {
    if (!this.previous) {
      this.reset(position, now)
      return
    }
    const dt = now - this.at,
      dx = position.x - this.previous.x,
      dy = position.y - this.previous.y,
      dz = position.z - this.previous.z
    if (
      ![position.x, position.y, position.z, now].every(Number.isFinite) ||
      dt < 0 ||
      dt > 0.75 ||
      Math.hypot(dx, dy, dz) > 8
    ) {
      this.reset(position, now)
      return
    }
    if (dt < 0.04) return
    if (Math.hypot(dx, dy, dz) < 0.002) return
    if (Math.hypot(dx, dz) / dt > 12 || Math.abs(dy) / dt > 50) {
      this.reset(position, now)
      return
    }
    if (dy < -0.02) {
      const first = this.samples[0]
      if (first && this.samples.length >= 2)
        this.speed = Math.max(this.speed, (first.y - position.y) / (now - first.at))
      this.drop -= dy
      this.descending++
    } else if (dy > 0.08) {
      this.speed = this.descending = this.drop = 0
      this.samples = []
    }
    this.samples.push({ y: position.y, at: now })
    while (this.samples.length > 2) this.samples.shift()
    const landing =
      grounded && this.descending >= 2 && this.drop > 0.5
        ? { position: { ...position }, speed: this.speed, at: now }
        : undefined
    if (grounded) this.reset(position, now)
    else {
      this.previous = { ...position }
      this.at = now
    }
    return landing
  }

  private reset(position: FallPoint, now: number) {
    this.previous = { ...position }
    this.at = now
    this.speed = this.descending = this.drop = 0
    this.samples = [{ y: position.y, at: now }]
  }
}
