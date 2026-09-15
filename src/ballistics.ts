import { AccuracyState, setTrigger } from './accuracy'
import { GunId, GUNS } from './weapon-profiles'
import { gunSpread, gunKick } from './gun-accuracy'
import { aimDirection } from './aim'
import { boxDistance, mapDistance } from './world-query'

export interface Point {
  x: number
  y: number
  z: number
}
export type HitGroup = 'head' | 'body' | 'legs'
export interface HitRegion {
  group: HitGroup
  y: number
  half: Point
}
export interface ShotTarget<T> {
  id: T
  center: Point
  regions: readonly HitRegion[]
}

// Standing avatar bounds (centre = feet) are proxies until CS character models supply hitboxes.
export const PLAYER_HIT_REGIONS: readonly HitRegion[] = [
  { group: 'head', y: 1.6, half: { x: 0.16, y: 0.16, z: 0.16 } },
  { group: 'body', y: 1.05, half: { x: 0.4, y: 0.4, z: 0.3 } },
  { group: 'legs', y: 0.325, half: { x: 0.27, y: 0.325, z: 0.15 } }
]
// Bots are AvatarShape avatars of the same height, so they share the player boxes.
export const BOT_HIT_REGIONS = PLAYER_HIT_REGIONS

export function groundedAt(feet: Point, tolerance = 0.3): boolean {
  return mapDistance({ x: feet.x, y: feet.y + 0.1, z: feet.z }, { x: 0, y: -1, z: 0 }, tolerance + 0.05) < tolerance
}

export function traceShot<T>(origin: Point, direction: Point, targets: readonly ShotTarget<T>[], limit = 100) {
  let distance = mapDistance(origin, direction, limit)
  let hit: { target: T; group: HitGroup } | undefined
  for (const target of targets) {
    for (const region of target.regions) {
      const center = { x: target.center.x, y: target.center.y + region.y, z: target.center.z }
      const candidate = boxDistance(origin, direction, center, region.half)
      if (candidate !== undefined && candidate < distance) {
        distance = candidate
        hit = { target: target.id, group: region.group }
      }
    }
  }
  return {
    hit,
    distance,
    position: {
      x: origin.x + direction.x * distance,
      y: origin.y + direction.y * distance,
      z: origin.z + direction.z * distance
    }
  }
}

export interface ShotAim {
  gun?: GunId
  feet: Point
  eyeHeight?: number
  aim: Point
  accuracy: AccuracyState
  triggerHeld: boolean
  speed: number
  now: number
  random?: () => number
  grounded?: boolean
}

export interface ShotPlan {
  origin: Point
  direction: Point
  spread: number
}

// Resolves where a bullet goes: spread from the pre-shot accuracy, aim plus punch, the kick (one random),
// then four spread samples. Server and client run this with the same shared random stream.
export function aimShot(options: ShotAim): ShotPlan | undefined {
  const { feet, aim, accuracy, speed, now } = options
  const length = Math.hypot(aim.x, aim.y, aim.z)
  if (![feet.x, feet.y, feet.z, length].every(Number.isFinite) || Math.abs(length - 1) > 0.01) return undefined
  const gun = options.gun ?? 'ak47'
  const random = options.random ?? Math.random
  const origin = { x: feet.x, y: feet.y + (options.eyeHeight ?? 1.6), z: feet.z }
  const grounded = options.grounded ?? groundedAt(feet)
  const spread = gunSpread(accuracy, gun, now, speed, grounded)
  const direction = aimDirection(
    { yaw: Math.atan2(aim.x, aim.z), pitch: Math.asin(Math.max(-1, Math.min(1, aim.y / length))) },
    accuracy
  )
  gunKick(accuracy, gun, speed, grounded, random)
  // A buffered shot can execute after the trigger-release message.
  if (!options.triggerHeld) setTrigger(accuracy, false, now)
  const horizontal = Math.hypot(direction.x, direction.z)
  const right = { x: direction.z / horizontal, y: 0, z: -direction.x / horizontal }
  const up = {
    x: (-direction.y * direction.x) / horizontal,
    y: horizontal,
    z: (-direction.y * direction.z) / horizontal
  }
  const x = (random() + random() - 1) * spread
  const y = (random() + random() - 1) * spread
  const scattered = {
    x: direction.x + right.x * x + up.x * y,
    y: direction.y + up.y * y,
    z: direction.z + right.z * x + up.z * y
  }
  const magnitude = Math.hypot(scattered.x, scattered.y, scattered.z)
  return {
    origin,
    direction: { x: scattered.x / magnitude, y: scattered.y / magnitude, z: scattered.z / magnitude },
    spread
  }
}

export function fireGunShot<T>(options: ShotAim & { damage: number; targets: readonly ShotTarget<T>[] }) {
  const plan = aimShot(options)
  if (!plan) return undefined
  const gun = options.gun ?? 'ak47'
  const result = traceShot(plan.origin, plan.direction, options.targets, gun === 'usp' ? 4096 * 0.025 : 8192 * 0.025)
  return {
    ...result,
    origin: plan.origin,
    direction: plan.direction,
    pitch: options.accuracy.pitch,
    yaw: options.accuracy.yaw,
    damage: result.hit
      ? Math.floor(
          options.damage *
            (result.hit.group === 'head' ? 4 : result.hit.group === 'legs' ? 0.75 : 1) *
            GUNS[gun].rangeModifier ** (result.distance / 12.5)
        )
      : 0
  }
}

export const fireAkShot = fireGunShot
