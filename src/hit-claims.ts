// Client-reported shot context validated against what the server has seen recently.
// Avatar positions and shot messages travel on different channels with different latency, so the
// server cannot rewind to "the client's fire time". Instead the client says where it was, how fast it
// moved, and where it saw its target; the server accepts each value only if it is close to a sample
// from the last second, then re-runs the deterministic trace itself.
export interface Point {
  x: number
  y: number
  z: number
}
export interface PositionSample {
  at: number
  position: Point
}
export interface ShotClaim {
  origin: Point
  speed: number
  grounded: boolean
  target?: string
  targetPosition?: Point
}
export interface ClaimContext {
  eyeHeight: number
  shooterHistory: readonly PositionSample[]
  serverFeet: Point
  serverSpeed: number
  serverAirborne: boolean
  targetHistory?: readonly PositionSample[]
}
export interface AcceptedShot {
  feet: Point
  speed: number
  grounded: boolean
  targetPosition?: Point
  rejected: string[]
}

export const HISTORY_SECONDS = 1
export const ORIGIN_TOLERANCE = 1
export const TARGET_TOLERANCE = 1
export const SPEED_TOLERANCE = 2

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const finite = (point: Point) => [point.x, point.y, point.z].every(Number.isFinite)

export function recordSample(history: PositionSample[], position: Point, now: number, window = HISTORY_SECONDS) {
  history.push({ at: now, position: { ...position } })
  while (history.length && history[0].at < now - window) history.shift()
}

export function nearRecent(history: readonly PositionSample[], point: Point, tolerance: number): boolean {
  return history.some((sample) => distance(sample.position, point) <= tolerance)
}

export function acceptShotClaim(claim: ShotClaim, context: ClaimContext): AcceptedShot {
  const rejected: string[] = []
  const claimedFeet = finite(claim.origin)
    ? { x: claim.origin.x, y: claim.origin.y - context.eyeHeight, z: claim.origin.z }
    : undefined
  const originOk =
    claimedFeet !== undefined &&
    (distance(claimedFeet, context.serverFeet) <= ORIGIN_TOLERANCE ||
      nearRecent(context.shooterHistory, claimedFeet, ORIGIN_TOLERANCE))
  if (!originOk) rejected.push('origin')
  const feet = originOk && claimedFeet ? claimedFeet : context.serverFeet

  const speedOk =
    Number.isFinite(claim.speed) && claim.speed >= 0 && Math.abs(claim.speed - context.serverSpeed) <= SPEED_TOLERANCE
  if (!speedOk) rejected.push('speed')
  const speed = speedOk ? claim.speed : context.serverSpeed

  // Claiming airborne only hurts the shooter, so it is always accepted; claiming grounded needs the
  // server to not clearly see the shooter in the air.
  const grounded = claim.grounded && !context.serverAirborne
  if (claim.grounded && context.serverAirborne) rejected.push('grounded')

  let targetPosition: Point | undefined
  if (claim.target !== undefined && claim.targetPosition !== undefined) {
    const targetOk =
      finite(claim.targetPosition) &&
      context.targetHistory !== undefined &&
      nearRecent(context.targetHistory, claim.targetPosition, TARGET_TOLERANCE)
    if (targetOk) targetPosition = { ...claim.targetPosition }
    else rejected.push('target')
  }
  return { feet, speed, grounded, targetPosition, rejected }
}
