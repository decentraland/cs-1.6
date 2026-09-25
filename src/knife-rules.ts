import type { HitGroup, Point, ShotTarget } from './ballistics'
import { hitMultiplier, regionDistance } from './hit-regions'
import { boxDistance } from './world-query'
import { knifeHullDistance, knifeWorldDistance } from './knife-world'

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
export const KNIFE_STAB_DAMAGE = 65
export const KNIFE_BACKSTAB_MULTIPLIER = 3
export const KNIFE_ARMOR_RATIO = 0.85
const PLAYER_HALF = { x: 16 * 0.025, y: 36 * 0.025, z: 16 * 0.025 }
const CONTACT_HALF = { x: PLAYER_HALF.x + 16 * 0.025, y: PLAYER_HALF.y + 18 * 0.025, z: PLAYER_HALF.z + 16 * 0.025 }

export function knifeDelays(attack: KnifeAttack, contact: boolean) {
  return attack === 'swing'
    ? { primary: contact ? 0.4 : 0.35, secondary: 0.5 }
    : { primary: contact ? 1.1 : 1, secondary: contact ? 1.1 : 1 }
}

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
  // Swing assigns its new primary deadline before choosing damage in the original game.
  const base = attack === 'stab' ? KNIFE_STAB_DAMAGE : KNIFE_SWING_DAMAGE
  const hitgroup = hitMultiplier(group)
  const damage = targetHit ? base * hitgroup * (attack === 'stab' && backstab ? KNIFE_BACKSTAB_MULTIPLIER : 1) : 0
  const delays = knifeDelays(attack, contact)
  state.nextPrimary = now + delays.primary
  state.nextSecondary = now + delays.secondary
  return { damage, nextPrimary: state.nextPrimary, nextSecondary: state.nextSecondary }
}

function targetDistance<T>(origin: Point, direction: Point, targets: readonly ShotTarget<T>[]) {
  let nearest: { target: T; group: HitGroup; distance: number } | undefined
  for (const target of targets)
    for (const region of target.regions) {
      const distance = regionDistance(origin, direction, target, region)
      if (distance !== undefined && (!nearest || distance < nearest.distance))
        nearest = { target: target.id, group: region.group, distance }
    }
  return nearest
}

// GoldSrc falls back to an axis-aligned player box with a generic hit group.
function hullDistance<T>(origin: Point, direction: Point, targets: readonly ShotTarget<T>[]) {
  let nearest: { target: T; group: HitGroup; distance: number } | undefined
  for (const target of targets) {
    const center = { ...target.center, y: target.center.y + PLAYER_HALF.y }
    const distance = boxDistance(origin, direction, center, CONTACT_HALF)
    if (distance !== undefined && (!nearest || distance < nearest.distance))
      nearest = { target: target.id, group: 'body', distance }
  }
  return nearest
}

type DistanceQuery = (origin: Point, direction: Point, limit: number) => number

function contactTrace<T>(
  origin: Point,
  direction: Point,
  target: { target: T; group: HitGroup; distance: number } | undefined,
  world: number,
  limit: number
): KnifeTrace<T> {
  const hit = target && target.distance < limit && target.distance < world ? target : undefined
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

function lineTrace<T>(
  origin: Point,
  direction: Point,
  targets: readonly ShotTarget<T>[],
  limit: number,
  world: DistanceQuery
) {
  return contactTrace(
    origin,
    direction,
    targetDistance(origin, direction, targets),
    world(origin, direction, limit),
    limit
  )
}

function hullIntersection<T>(
  origin: Point,
  targets: readonly ShotTarget<T>[],
  hull: KnifeTrace<T>,
  world: DistanceQuery
) {
  const end = {
    x: origin.x + 2 * (hull.position.x - origin.x),
    y: origin.y + 2 * (hull.position.y - origin.y),
    z: origin.z + 2 * (hull.position.z - origin.z)
  }
  const traceTo = (point: Point) => {
    const delta = { x: point.x - origin.x, y: point.y - origin.y, z: point.z - origin.z }
    const length = Math.hypot(delta.x, delta.y, delta.z)
    if (length < 1e-8) return undefined
    const direction = { x: delta.x / length, y: delta.y / length, z: delta.z / length }
    const trace = lineTrace(origin, direction, targets, length, world)
    return trace.contact ? trace : undefined
  }
  const center = traceTo(end)
  if (center) return center
  let nearest: KnifeTrace<T> | undefined
  for (const x of [-16, 16])
    for (const y of [-18, 18])
      for (const z of [-16, 16]) {
        const trace = traceTo({ x: end.x + x * 0.025, y: end.y + y * 0.025, z: end.z + z * 0.025 })
        if (trace && (!nearest || trace.distance < nearest.distance)) nearest = trace
      }
  return nearest ?? hull
}

export function traceKnife<T>(
  origin: Point,
  direction: Point,
  targets: readonly ShotTarget<T>[],
  attack: KnifeAttack,
  obstacleDistance: DistanceQuery = knifeWorldDistance,
  hullObstacleDistance?: DistanceQuery
): KnifeTrace<T> | undefined {
  const length = Math.hypot(direction.x, direction.y, direction.z)
  if (![origin.x, origin.y, origin.z, length].every(Number.isFinite) || Math.abs(length - 1) > 0.01) return undefined
  const limit = attack === 'swing' ? KNIFE_SWING_DISTANCE : KNIFE_STAB_DISTANCE
  const line = lineTrace(origin, direction, targets, limit, obstacleDistance)
  if (line.contact) return line
  const world = hullObstacleDistance ?? (obstacleDistance === knifeWorldDistance ? knifeHullDistance : obstacleDistance)
  const hull = contactTrace(
    origin,
    direction,
    hullDistance(origin, direction, targets),
    world(origin, direction, limit),
    limit
  )
  return hull.hit || !hull.contact ? hull : hullIntersection(origin, targets, hull, obstacleDistance)
}
