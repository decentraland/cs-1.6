import { DUST2_KNIFE_HULL } from './dust2-knife-hull'
import { bulletWorldTrace } from './penetration'
import { SolidTracer } from './solid-trace'
import type { Point } from './ballistics'

const hull = new SolidTracer(DUST2_KNIFE_HULL)

export function knifeWorldDistance(origin: Point, direction: Point, limit: number): number {
  const trace = bulletWorldTrace(origin, direction, limit)
  return trace.allSolid ? 0 : trace.distance
}

export function knifeHullDistance(origin: Point, direction: Point, limit: number): number {
  const trace = hull.trace(origin, direction, limit)
  return trace.allSolid ? 0 : trace.distance
}
