export interface SolidPoint {
  x: number
  y: number
  z: number
}
export interface SolidMap {
  sourceSha256?: string
  materialsSha256?: string
  planes: readonly (readonly number[])[]
  nodes: readonly (readonly number[])[]
  roots: readonly number[]
  vertices: readonly (readonly number[])[]
  surfaces: readonly (readonly [number, string, string, readonly number[]])[]
}
export interface SolidTrace {
  distance: number
  position: SolidPoint
  solid: boolean
  startSolid: boolean
  allSolid: boolean
  material: string
  texture: string
  normal?: SolidPoint
}
export class SolidTracer {
  private readonly faces = new Map<number, number[]>()
  constructor(private readonly map: SolidMap) {
    map.surfaces.forEach((surface, index) => this.faces.set(surface[0], [...(this.faces.get(surface[0]) ?? []), index]))
  }
  private surface(plane: number, point: SolidPoint) {
    const normal = this.map.planes[plane]
    if (!normal) return undefined
    const omit =
      Math.abs(normal[0]) > Math.abs(normal[1])
        ? Math.abs(normal[0]) > Math.abs(normal[2])
          ? 0
          : 2
        : Math.abs(normal[1]) > Math.abs(normal[2])
          ? 1
          : 2
    const axes = [0, 1, 2].filter((axis) => axis !== omit),
      position = [point.x, point.y, point.z]
    for (const index of this.faces.get(plane) ?? []) {
      const face = this.map.surfaces[index],
        vertices = face[3]
      let sign = 0,
        inside = true
      for (let i = 0; i < vertices.length; i++) {
        const a = this.map.vertices[vertices[i]],
          b = this.map.vertices[vertices[(i + 1) % vertices.length]]
        const cross =
          (b[axes[0]] - a[axes[0]]) * (position[axes[1]] - a[axes[1]]) -
          (b[axes[1]] - a[axes[1]]) * (position[axes[0]] - a[axes[0]])
        if (Math.abs(cross) < 1e-6) continue
        if (sign && sign * Math.sign(cross) < 0) {
          inside = false
          break
        }
        sign = Math.sign(cross)
      }
      if (inside && sign) return face
    }
    return undefined
  }
  contains(point: SolidPoint): boolean {
    return this.map.roots.some((root) => {
      let node = root
      while (node >= 0) {
        const definition = this.map.nodes[node],
          p = this.map.planes[definition[0]]
        node = definition[p[0] * point.x + p[1] * point.y + p[2] * point.z >= p[3] ? 1 : 2]
      }
      return node === -2
    })
  }
  trace(origin: SolidPoint, direction: SolidPoint, limit: number): SolidTrace {
    let distance = limit,
      entryPlane = -1,
      solid = false,
      open = false,
      allSolid = false
    const visit = (
      node: number,
      from: number,
      to: number,
      plane: number
    ): { distance: number; plane: number } | undefined => {
      if (node < 0) {
        if (node !== -2) {
          open = true
          return undefined
        }
        return open ? { distance: from, plane } : undefined
      }
      const definition = this.map.nodes[node],
        p = this.map.planes[definition[0]]
      const start = p[0] * origin.x + p[1] * origin.y + p[2] * origin.z - p[3],
        speed = p[0] * direction.x + p[1] * direction.y + p[2] * direction.z
      const a = start + speed * from,
        b = start + speed * to
      if (a >= 0 && b >= 0) return visit(definition[1], from, to, plane)
      if (a < 0 && b < 0) return visit(definition[2], from, to, plane)
      const split = Math.max(from, Math.min(to, -start / speed)),
        near = a >= 0 ? 1 : 2
      return visit(definition[near], from, split, plane) ?? visit(definition[3 - near], split, to, definition[0])
    }
    for (const root of this.map.roots) {
      open = false
      const result = visit(root, 0, distance, -1)
      if (!open) allSolid = true
      if (result && (!solid || result.distance < distance)) {
        distance = result.distance
        entryPlane = result.plane
        solid = true
      }
    }
    const position = {
      x: origin.x + direction.x * distance,
      y: origin.y + direction.y * distance,
      z: origin.z + direction.z * distance
    }
    const face = solid ? this.surface(entryPlane, position) : undefined
    const plane = solid ? this.map.planes[entryPlane] : undefined
    const sign = plane && plane[0] * direction.x + plane[1] * direction.y + plane[2] * direction.z > 0 ? -1 : 1
    return {
      normal: plane ? { x: plane[0] * sign, y: plane[1] * sign, z: plane[2] * sign } : undefined,
      distance,
      position,
      solid,
      startSolid: this.contains(origin),
      allSolid,
      material: face?.[1] ?? 'C',
      texture: face?.[2] ?? ''
    }
  }
}
