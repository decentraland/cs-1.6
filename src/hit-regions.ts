import { boxDistance } from './world-query'
import type { HitGroup, HitRegion, Point, ShotTarget } from './ballistics'

export function hitMultiplier(group: HitGroup) {
  return group === 'head' ? 4 : group === 'stomach' ? 1.25 : group === 'legs' ? 0.75 : 1
}
export function armorCovers(group: HitGroup, armor: number, helmet: boolean) {
  return armor > 0 && group !== 'legs' && (group !== 'head' || helmet)
}
export function hitboxYaw(rotation: { x: number; y: number; z: number; w: number }) {
  return Math.atan2(
    2 * (rotation.x * rotation.z + rotation.w * rotation.y),
    1 - 2 * (rotation.x ** 2 + rotation.y ** 2)
  )
}
export function regionDistance<T>(
  origin: Point,
  direction: Point,
  target: ShotTarget<T>,
  region: HitRegion,
  expansion = { x: 0, y: 0, z: 0 }
) {
  const c = Math.cos(target.yaw ?? 0),
    s = Math.sin(target.yaw ?? 0)
  const rotate = (v: Point) => ({ x: v.x * c - v.z * s, y: v.y, z: v.x * s + v.z * c })
  const offset = rotate({ x: origin.x - target.center.x, y: origin.y - target.center.y, z: origin.z - target.center.z })
  let point = { x: offset.x - (region.x ?? 0), y: offset.y - region.y, z: offset.z - (region.z ?? 0) }
  let ray = rotate(direction)
  let growth = expansion
  if (region.axes) {
    const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y + a.z * b.z
    const [x, y, z] = region.axes
    point = { x: dot(point, x), y: dot(point, y), z: dot(point, z) }
    ray = { x: dot(ray, x), y: dot(ray, y), z: dot(ray, z) }
    const projected = (axis: Point) =>
      Math.abs(axis.x) * expansion.x + Math.abs(axis.y) * expansion.y + Math.abs(axis.z) * expansion.z
    growth = { x: projected(x), y: projected(y), z: projected(z) }
  }
  return boxDistance(
    point,
    ray,
    { x: 0, y: 0, z: 0 },
    {
      x: region.half.x + growth.x,
      y: region.half.y + growth.y,
      z: region.half.z + growth.z
    }
  )
}

// GoldSrc flushes MultiDamage when another entity is hit; misses retain the pending total.
export function damageBatches<T>(impacts: readonly { hit?: { target: T; group: HitGroup }; damage: number }[]) {
  const batches: { target: T; group: HitGroup; damage: number; traces: { group: HitGroup; damage: number }[] }[] = []
  for (const impact of impacts) {
    if (!impact.hit || impact.damage <= 0) continue
    const last = batches[batches.length - 1]
    if (last?.target === impact.hit.target) {
      last.damage += impact.damage
      last.group = impact.hit.group
      last.traces.push({ group: impact.hit.group, damage: impact.damage })
    } else
      batches.push({
        ...impact.hit,
        damage: impact.damage,
        traces: [{ group: impact.hit.group, damage: impact.damage }]
      })
  }
  return batches
}
