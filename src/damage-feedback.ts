import type { HitGroup, Point } from './ballistics'

export interface PainDirections {
  front: number
  right: number
  rear: number
  left: number
}

export interface VictimPunch {
  pitch: number
  roll: number
}

export const PAIN_FADE_PER_SECOND = 2
export const PAIN_NEAR_DISTANCE = 50 * 0.025
export const EMPTY_PAIN_DIRECTIONS: PainDirections = { front: 0, right: 0, rear: 0, left: 0 }

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

export function painDirections(origin: Point, player: Point, view: Point): PainDirections {
  const from = { x: origin.x - player.x, y: origin.y - player.y, z: origin.z - player.z }
  const distance = Math.hypot(from.x, from.y, from.z)
  if (distance <= PAIN_NEAR_DISTANCE) return { front: 1, right: 1, rear: 1, left: 1 }
  const viewLength = Math.hypot(view.x, view.z)
  if (!Number.isFinite(distance) || !Number.isFinite(viewLength) || viewLength === 0) return { ...EMPTY_PAIN_DIRECTIONS }
  const x = from.x / distance, z = from.z / distance
  const forwardX = view.x / viewLength, forwardZ = view.z / viewLength
  const side = x * forwardX + z * forwardZ
  const right = x * forwardZ - z * forwardX
  return {
    front: side > 0.3 ? side : 0,
    right: right > 0.3 ? right : 0,
    rear: side < -0.3 ? -side : 0,
    left: right < -0.3 ? -right : 0
  }
}

export function mergePainDirections(current: PainDirections, incoming: PainDirections): PainDirections {
  return {
    front: Math.max(current.front, incoming.front),
    right: Math.max(current.right, incoming.right),
    rear: Math.max(current.rear, incoming.rear),
    left: Math.max(current.left, incoming.left)
  }
}

export function fadePainDirections(directions: PainDirections, dt: number): PainDirections {
  const fade = (value: number) => value > 0.4 ? Math.max(0, value - PAIN_FADE_PER_SECOND * Math.max(0, dt)) : 0
  return {
    front: fade(directions.front),
    right: fade(directions.right),
    rear: fade(directions.rear),
    left: fade(directions.left)
  }
}

export function victimPunch(group: HitGroup, damage: number, armorProtected: boolean, random = Math.random): VictimPunch {
  if (armorProtected || group === 'legs' || !Number.isFinite(damage) || damage <= 0) return { pitch: 0, roll: 0 }
  if (group === 'head') {
    return {
      pitch: Math.min(12, damage * 0.5),
      roll: clamp(damage * (random() * 2 - 1), -9, 9)
    }
  }
  return { pitch: Math.min(4, damage * 0.1), roll: 0 }
}

export function decayVictimPunch(punch: VictimPunch, elapsed: number): VictimPunch {
  let remaining = Math.max(0, elapsed)
  let length = Math.hypot(punch.pitch, punch.roll)
  const original = length
  while (remaining > 0 && length > 0) {
    const step = Math.min(0.01, remaining)
    length = Math.max(0, length - (10 + length * 0.5) * step)
    remaining -= step
  }
  return original === 0 ? { pitch: 0, roll: 0 } : { pitch: punch.pitch * length / original, roll: punch.roll * length / original }
}
