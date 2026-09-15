import type { HitGroup, Point, ShotTarget } from './ballistics'
import { boxDistance, mapDistance } from './world-query'

export type KnifeAttack = 'swing' | 'stab'
export interface KnifeCooldown {
  nextPrimary: number
  nextSecondary: number
}
export interface KnifeTrace<T> {
  hit?: { target: T; group: HitGroup }
  contact: boolean
  distance: number
  position: Point
}

export const KNIFE_SWING_DISTANCE = 48 * 0.025
export const KNIFE_STAB_DISTANCE = 32 * 0.025
export const KNIFE_SWING_DAMAGE = 15
export const KNIFE_SWING_DAMAGE_FAST = 20
export const KNIFE_STAB_DAMAGE = 65
export const KNIFE_BACKSTAB_MULTIPLIER = 3
export const KNIFE_ARMOR_RATIO = 0.85
const HULL_HALF = { x: 16 * 0.025, y: 18 * 0.025, z: 16 * 0.025 }

export function freshKnifeCooldown(): KnifeCooldown {
  return { nextPrimary: 0, nextSecondary: 0 }
}

export function isKnifeBackstab(attack: Point, victimForward: Point): boolean {
  const attackLength = Math.hypot(attack.x, attack.z),
    victimLength = Math.hypot(victimForward.x, victimForward.z)
  return (
    attackLength > 0 &&
    victimLength > 0 &&
    (attack.x * victimForward.x + attack.z * victimForward.z) / (attackLength * victimLength) > 0.8
  )
}

export function resolveKnifeAttack(
  state: KnifeCooldown,
  attack: KnifeAttack,
  now: number,
  contact: boolean,
  group: HitGroup = 'body',
  backstab = false,
  targetHit = contact
) {
  if (now + 1e-6 < (attack === 'swing' ? state.nextPrimary : state.nextSecondary)) return undefined
  const fast = state.nextPrimary + 0.4 < now
  const base = attack === 'stab' ? KNIFE_STAB_DAMAGE : fast ? KNIFE_SWING_DAMAGE_FAST : KNIFE_SWING_DAMAGE
  const hitgroup = group === 'head' ? 4 : group === 'legs' ? 0.75 : 1
  const damage = targetHit ? base * hitgroup * (attack === 'stab' && backstab ? KNIFE_BACKSTAB_MULTIPLIER : 1) : 0
  if (attack === 'swing') {
    state.nextPrimary = now + (contact ? 0.4 : 0.35)
    state.nextSecondary = now + 0.5
  } else {
    state.nextPrimary = now + (contact ? 1.1 : 1)
    state.nextSecondary = state.nextPrimary
  }
  return { damage, nextPrimary: state.nextPrimary, nextSecondary: state.nextSecondary }
}

function targetDistance<T>(origin: Point, direction: Point, targets: readonly ShotTarget<T>[], expansion: Point) {
  let nearest: { target: T; group: HitGroup; distance: number } | undefined
  for (const target of targets)
    for (const region of target.regions) {
      const center = { x: target.center.x, y: target.center.y + region.y, z: target.center.z }
      const half = { x: region.half.x + expansion.x, y: region.half.y + expansion.y, z: region.half.z + expansion.z }
      const distance = boxDistance(origin, direction, center, half)
      if (distance !== undefined && (!nearest || distance < nearest.distance))
        nearest = { target: target.id, group: region.group, distance }
    }
  return nearest
}

export function traceKnife<T>(
  origin: Point,
  direction: Point,
  targets: readonly ShotTarget<T>[],
  attack: KnifeAttack,
  obstacleDistance: (origin: Point, direction: Point, limit: number) => number = mapDistance
): KnifeTrace<T> | undefined {
  const length = Math.hypot(direction.x, direction.y, direction.z)
  if (!Number.isFinite(length) || Math.abs(length - 1) > 0.01) return undefined
  const limit = attack === 'swing' ? KNIFE_SWING_DISTANCE : KNIFE_STAB_DISTANCE
  const world = obstacleDistance(origin, direction, limit)
  let target = targetDistance(origin, direction, targets, { x: 0, y: 0, z: 0 })
  if ((!target || target.distance > limit) && world >= limit)
    target = targetDistance(origin, direction, targets, HULL_HALF)
  const hit = target && target.distance <= limit && target.distance < world ? target : undefined
  const distance = hit?.distance ?? world
  return {
    hit: hit && { target: hit.target, group: hit.group },
    contact: !!hit || world < limit,
    distance,
    position: {
      x: origin.x + direction.x * distance,
      y: origin.y + direction.y * distance,
      z: origin.z + direction.z * distance
    }
  }
}
