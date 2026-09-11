import { AccuracyState, setTrigger } from './accuracy'
import { GunId, GUNS } from './weapon-profiles'
import { gunSpread, gunKick } from './gun-accuracy'
import { aimDirection } from './aim'
import { boxDistance, mapDistance } from './world-query'

export interface Point { x: number; y: number; z: number }
export type HitGroup = 'head' | 'body' | 'legs'
export interface HitRegion { group: HitGroup; y: number; half: Point }
export interface ShotTarget<T> { id: T; center: Point; regions: readonly HitRegion[] }

export const BOT_HIT_REGIONS: readonly HitRegion[] = [
  { group: 'head', y: 0.55, half: { x: 0.15, y: 0.16, z: 0.15 } },
  { group: 'body', y: 0, half: { x: 0.4, y: 0.35, z: 0.3 } },
  { group: 'legs', y: -0.6, half: { x: 0.27, y: 0.3, z: 0.15 } }
]

// Standing avatar bounds are proxies until CS character models supply hitboxes.
export const PLAYER_HIT_REGIONS: readonly HitRegion[] = [
  { group: 'head', y: 1.6, half: { x: 0.16, y: 0.16, z: 0.16 } },
  { group: 'body', y: 1.05, half: { x: 0.4, y: 0.4, z: 0.3 } },
  { group: 'legs', y: 0.325, half: { x: 0.27, y: 0.325, z: 0.15 } }
]

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
    hit, distance,
    position: { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance, z: origin.z + direction.z * distance }
  }
}

export function fireGunShot<T>(options: {
  gun?: GunId
  feet: Point
  eyeHeight?: number
  aim: Point
  accuracy: AccuracyState
  triggerHeld: boolean
  speed: number
  now: number
  damage: number
  targets: readonly ShotTarget<T>[]
  random?: () => number
}) {
  const { feet, aim, accuracy, speed, now, targets, damage } = options
  const length = Math.hypot(aim.x, aim.y, aim.z)
  if (![feet.x, feet.y, feet.z, length].every(Number.isFinite) || Math.abs(length - 1) > 0.01) return undefined
  const gun = options.gun ?? 'ak47'
  const random = options.random ?? Math.random
  const origin = { x: feet.x, y: feet.y + (options.eyeHeight ?? 1.6), z: feet.z }
  const grounded = mapDistance({ x: feet.x, y: feet.y + 0.1, z: feet.z }, { x: 0, y: -1, z: 0 }, 0.35) < 0.3
  const spread = gunSpread(accuracy,gun,now,speed,grounded)
  const direction = aimDirection({ yaw: Math.atan2(aim.x, aim.z), pitch: Math.asin(Math.max(-1, Math.min(1, aim.y / length))) }, accuracy)
  gunKick(accuracy,gun,speed,grounded,random)
  // A buffered shot can execute after the trigger-release message.
  if (!options.triggerHeld) setTrigger(accuracy, false, now)
  const horizontal = Math.hypot(direction.x, direction.z)
  const right = { x: direction.z / horizontal, y: 0, z: -direction.x / horizontal }
  const up = { x: -direction.y * direction.x / horizontal, y: horizontal, z: -direction.y * direction.z / horizontal }
  const x = (random() + random() - 1) * spread
  const y = (random() + random() - 1) * spread
  const scattered = { x: direction.x + right.x * x + up.x * y, y: direction.y + up.y * y, z: direction.z + right.z * x + up.z * y }
  const magnitude = Math.hypot(scattered.x, scattered.y, scattered.z)
  const ray = { x: scattered.x / magnitude, y: scattered.y / magnitude, z: scattered.z / magnitude }
  const result = traceShot(origin,ray,targets,gun==='usp'?4096*.025:8192*.025)
  return {
    ...result, origin, direction: ray, pitch: accuracy.pitch, yaw: accuracy.yaw,
    damage: result.hit ? Math.floor(damage*(result.hit.group==='head'?4:result.hit.group==='legs'?.75:1)*GUNS[gun].rangeModifier**(result.distance/12.5)) : 0
  }
}

export const fireAkShot = fireGunShot
