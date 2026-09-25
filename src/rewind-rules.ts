import type { BodyLayer } from './player-model-rules'

export interface Point {
  x: number
  y: number
  z: number
}
export interface RewindPose {
  model: string
  upper: BodyLayer
  lower?: BodyLayer
}
export interface RewindSample {
  at: number
  position: Point
  yaw: number
  pose?: RewindPose
}

export const REWIND_SECONDS = 1
// Explorers may draw a synced bot a little behind the newest server clock they applied.
export const BOT_CLAIM_EARLY = 0.3
export const BOT_CLAIM_LATE = 0.1
export const BOT_CLAIM_DISTANCE = 0.35

export function recordRewind(history: RewindSample[], sample: RewindSample, window = REWIND_SECONDS) {
  history.push(sample)
  while (history.length > 1 && history[0].at < sample.at - window) history.shift()
}

// The shooter's view time, bounded to the kept history so a stale or forged value cannot rewind further.
export function clampSeenAt(seenAt: number | undefined, now: number, window = REWIND_SECONDS): number | undefined {
  if (seenAt === undefined || !Number.isFinite(seenAt)) return undefined
  return Math.min(now, Math.max(now - window, seenAt))
}

function lerpAngle(a: number, b: number, t: number) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a))
  return a + delta * t
}

// Position and yaw interpolate between the bracketing samples; the pose is the one that was playing at `at`.
export function rewindTo(history: readonly RewindSample[], at: number): RewindSample | undefined {
  if (history.length === 0) return undefined
  const first = history[0],
    last = history[history.length - 1]
  if (at <= first.at) return first
  if (at >= last.at) return last
  for (let index = history.length - 2; index >= 0; index--) {
    const a = history[index],
      b = history[index + 1]
    if (a.at > at) continue
    const t = b.at === a.at ? 0 : (at - a.at) / (b.at - a.at)
    return {
      at,
      position: {
        x: a.position.x + (b.position.x - a.position.x) * t,
        y: a.position.y + (b.position.y - a.position.y) * t,
        z: a.position.z + (b.position.z - a.position.z) * t
      },
      yaw: lerpAngle(a.yaw, b.yaw, t),
      pose: a.pose
    }
  }
  return first
}

// The point of the path between `from` and `to` nearest to `position`, when it lies within `maxDistance`.
export function nearestOnPath(
  history: readonly RewindSample[],
  from: number,
  to: number,
  position: Point,
  maxDistance: number
): RewindSample | undefined {
  if (history.length === 0 || from > to) return undefined
  const first = rewindTo(history, from)!,
    last = rewindTo(history, to)!
  const samples = [first, ...history.filter((sample) => sample.at > from && sample.at < to), last]
  let nearest: RewindSample | undefined
  let distance = Infinity
  for (let index = 1; index < samples.length; index++) {
    const a = samples[index - 1],
      b = samples[index]
    const dx = b.position.x - a.position.x,
      dy = b.position.y - a.position.y,
      dz = b.position.z - a.position.z
    const lengthSquared = dx * dx + dy * dy + dz * dz
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((position.x - a.position.x) * dx + (position.y - a.position.y) * dy + (position.z - a.position.z) * dz) /
                lengthSquared
            )
          )
    const separation = Math.hypot(
      position.x - a.position.x - t * dx,
      position.y - a.position.y - t * dy,
      position.z - a.position.z - t * dz
    )
    if (separation < distance) {
      distance = separation
      nearest = rewindTo(history, a.at + (b.at - a.at) * t)
    }
  }
  return nearest && distance <= maxDistance ? nearest : undefined
}
