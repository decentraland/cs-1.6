import { AccuracyState, setTrigger, recoverAccuracy } from './accuracy'
import { GunId, GUNS, modeStats } from './weapon-profiles'
import { gunSpread, gunKick } from './gun-accuracy'
import { aimDirection } from './aim'
import { hitMultiplier, regionDistance } from './hit-regions'
import { mapDistance } from './world-query'
import { bulletWorldTrace, traceBullet } from './penetration'

export interface Point {
  x: number
  y: number
  z: number
}
export type HitGroup = 'head' | 'body' | 'stomach' | 'arms' | 'legs'
export interface HitRegion {
  group: HitGroup
  y: number
  x?: number
  z?: number
  axes?: readonly Point[]
  half: Point
}
export interface ShotTarget<T> {
  id: T
  center: Point
  yaw?: number
  regions: readonly HitRegion[]
}

// Standing avatar bounds (centre = feet) are proxies until CS character models supply hitboxes.
export const PLAYER_HIT_REGIONS: readonly HitRegion[] = [
  { group: 'head', y: 1.6, half: { x: 0.16, y: 0.16, z: 0.16 } },
  { group: 'body', y: 1.225, half: { x: 0.25, y: 0.225, z: 0.3 } },
  { group: 'stomach', y: 0.825, half: { x: 0.25, y: 0.175, z: 0.3 } },
  { group: 'arms', x: -0.325, y: 1.1, half: { x: 0.075, y: 0.35, z: 0.2 } },
  { group: 'arms', x: 0.325, y: 1.1, half: { x: 0.075, y: 0.35, z: 0.2 } },
  { group: 'legs', y: 0.325, half: { x: 0.27, y: 0.325, z: 0.15 } }
]
// Legacy avatar proxy for standalone combat fixtures. Runtime bots use animated model hitboxes.
export const BOT_HIT_REGIONS = PLAYER_HIT_REGIONS

export function groundedAt(feet: Point, tolerance = 0.3): boolean {
  return mapDistance({ x: feet.x, y: feet.y + 0.1, z: feet.z }, { x: 0, y: -1, z: 0 }, tolerance + 0.05) < tolerance
}

export function traceShot<T>(origin: Point, direction: Point, targets: readonly ShotTarget<T>[], limit = 100) {
  const wall = bulletWorldTrace(origin, direction, limit)
  let distance = wall.allSolid ? 0 : wall.distance
  let hit: { target: T; group: HitGroup } | undefined
  for (const target of targets) {
    for (const region of target.regions) {
      const candidate = regionDistance(origin, direction, target, region)
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
  mode?: number
  zoom?: number
  continuationSpread?: number
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
  directions?: Point[]
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
  if (options.continuationSpread !== undefined) recoverAccuracy(accuracy, now)
  const spread =
    options.continuationSpread ?? gunSpread(accuracy, gun, now, speed, grounded, options.mode, options.zoom)
  const direction = aimDirection(
    { yaw: Math.atan2(aim.x, aim.z), pitch: Math.asin(Math.max(-1, Math.min(1, aim.y / length))) },
    accuracy
  )
  if (options.continuationSpread === undefined) gunKick(accuracy, gun, speed, grounded, random)
  // A buffered shot can execute after the trigger-release message.
  if (!options.triggerHeld) setTrigger(accuracy, false, now)
  const horizontal = Math.hypot(direction.x, direction.z)
  const right = { x: direction.z / horizontal, y: 0, z: -direction.x / horizontal }
  const up = {
    x: (-direction.y * direction.x) / horizontal,
    y: horizontal,
    z: (-direction.y * direction.z) / horizontal
  }
  const directions: Point[] = []
  for (let pellet = 0; pellet < GUNS[gun].pellets; pellet++) {
    let x: number, y: number
    do {
      x = random() + random() - 1
      y = random() + random() - 1
    } while (GUNS[gun].pellets > 1 && x * x + y * y > 1)
    const scattered = {
      x: direction.x + right.x * x * spread + up.x * y * spread,
      y: direction.y + up.y * y * spread,
      z: direction.z + right.z * x * spread + up.z * y * spread
    }
    const magnitude = Math.hypot(scattered.x, scattered.y, scattered.z)
    directions.push({ x: scattered.x / magnitude, y: scattered.y / magnitude, z: scattered.z / magnitude })
  }
  return { origin, direction: directions[0], spread, directions }
}

export function fireGunShot<T>(options: ShotAim & { damage: number; targets: readonly ShotTarget<T>[] }) {
  const plan = aimShot(options)
  if (!plan) return undefined
  const gun = options.gun ?? 'ak47'
  const rangeModifier =
    options.continuationSpread !== undefined
      ? gun === 'glock18'
        ? 0.9
        : 0.96
      : modeStats(GUNS[gun], options.mode, options.zoom).rangeModifier
  const pelletHits = (GUNS[gun].pellets > 1 ? (plan.directions ?? [plan.direction]) : []).map((direction) => {
    const hit = traceShot(plan.origin, direction, options.targets, GUNS[gun].range)
    const base = Math.floor(options.damage * Math.max(0, 1 - hit.distance / GUNS[gun].range))
    return {
      ...hit,
      direction,
      damage: hit.hit ? base * hitMultiplier(hit.hit.group) : 0
    }
  })
  const impacts =
    GUNS[gun].pellets > 1
      ? pelletHits
      : traceBullet({
          gun,
          origin: plan.origin,
          direction: plan.direction,
          damage: options.damage,
          rangeModifier,
          targets: options.targets
        })
  const pellets =
    GUNS[gun].pellets > 1
      ? pelletHits
      : [
          {
            ...(impacts[0] ?? { distance: 0, position: plan.origin, damage: 0, hit: undefined }),
            direction: plan.direction
          }
        ]

  return {
    ...pellets[0],
    pellets,
    impacts,
    spread: plan.spread,
    origin: plan.origin,
    pitch: options.accuracy.pitch,
    yaw: options.accuracy.yaw
  }
}

export const fireAkShot = fireGunShot
