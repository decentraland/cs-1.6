import { MAP_TRIANGLES } from './map-collision'
interface Point {
  x: number
  y: number
  z: number
}

export function mapDistance(origin: Point, direction: Point, limit: number): number {
  let nearest = limit
  for (const t of MAP_TRIANGLES) {
    const ax = t[3] - t[0],
      ay = t[4] - t[1],
      az = t[5] - t[2]
    const bx = t[6] - t[0],
      by = t[7] - t[1],
      bz = t[8] - t[2]
    const px = direction.y * bz - direction.z * by
    const py = direction.z * bx - direction.x * bz
    const pz = direction.x * by - direction.y * bx
    const det = ax * px + ay * py + az * pz
    if (Math.abs(det) < 1e-8) continue
    const dx = origin.x - t[0],
      dy = origin.y - t[1],
      dz = origin.z - t[2]
    const u = (dx * px + dy * py + dz * pz) / det
    if (u < 0 || u > 1) continue
    const qx = dy * az - dz * ay,
      qy = dz * ax - dx * az,
      qz = dx * ay - dy * ax
    const v = (direction.x * qx + direction.y * qy + direction.z * qz) / det
    if (v < 0 || u + v > 1) continue
    const distance = (bx * qx + by * qy + bz * qz) / det
    if (distance > 0.001 && distance < nearest) nearest = distance
  }
  return nearest
}

export function boxDistance(origin: Point, direction: Point, center: Point, extent: Point): number | undefined {
  let near = 0,
    far = Infinity
  for (const axis of ['x', 'y', 'z'] as const) {
    const offset = origin[axis] - center[axis]
    if (Math.abs(direction[axis]) < 1e-8) {
      if (Math.abs(offset) > extent[axis]) return undefined
      continue
    }
    const a = (-extent[axis] - offset) / direction[axis]
    const b = (extent[axis] - offset) / direction[axis]
    near = Math.max(near, Math.min(a, b))
    far = Math.min(far, Math.max(a, b))
    if (near > far) return undefined
  }
  return near
}
