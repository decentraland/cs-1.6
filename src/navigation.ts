import data from './navigation.json'

export interface NavPoint {
  x: number
  y: number
  z: number
}
export interface NavGraph {
  positions: readonly (readonly number[])[]
  links: readonly (readonly number[])[]
}
export const dust2Navigation: NavGraph = data
export const navDistance = (a: NavPoint, b: NavPoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
export const navDistanceXZ = (a: NavPoint, b: NavPoint) => Math.hypot(a.x - b.x, a.z - b.z)
export function navPoint(graph: NavGraph, node: number): NavPoint {
  const [x, y, z] = graph.positions[node]
  return { x, y, z }
}

// One-metre XZ cells so lookups touch a handful of nodes instead of the whole graph.
const CELL = 1
const cellIndexes = new WeakMap<NavGraph, Map<number, number[]>>()
const cellKey = (x: number, z: number) => (Math.floor(x / CELL) + 32768) * 65536 + Math.floor(z / CELL) + 32768
function cells(graph: NavGraph): Map<number, number[]> {
  let index = cellIndexes.get(graph)
  if (index) return index
  index = new Map()
  for (let node = 0; node < graph.positions.length; node++) {
    const [x, , z] = graph.positions[node]
    const key = cellKey(x, z)
    const bucket = index.get(key)
    if (bucket) bucket.push(node)
    else index.set(key, [node])
  }
  cellIndexes.set(graph, index)
  return index
}
function nodesNear(graph: NavGraph, x: number, z: number, radius: number): number[] {
  const index = cells(graph)
  const result: number[] = []
  const span = Math.ceil(radius / CELL)
  const cx = Math.floor(x / CELL),
    cz = Math.floor(z / CELL)
  for (let ix = cx - span; ix <= cx + span; ix++)
    for (let iz = cz - span; iz <= cz + span; iz++) {
      const bucket = index.get((ix + 32768) * 65536 + iz + 32768)
      if (bucket) for (const node of bucket) result.push(node)
    }
  return result
}

export function nearestNavNode(graph: NavGraph, position: NavPoint, radius = 2): number | undefined {
  let best = radius,
    result: number | undefined
  for (const node of nodesNear(graph, position.x, position.z, radius)) {
    const point = graph.positions[node]
    const distance = Math.hypot(point[0] - position.x, (point[1] - position.y) * 2, point[2] - position.z)
    if (distance < best) {
      best = distance
      result = node
    }
  }
  return result
}

// Nearest node by ground distance regardless of height, for landmarks whose floor height is only approximate.
export function nearestNavNodeXZ(graph: NavGraph, position: NavPoint, radius = 2): number | undefined {
  let best = radius,
    result: number | undefined
  for (const node of nodesNear(graph, position.x, position.z, radius)) {
    const point = graph.positions[node]
    const distance = Math.hypot(point[0] - position.x, point[2] - position.z)
    if (distance < best) {
      best = distance
      result = node
    }
  }
  return result
}

// A planted bomb may rest on a crate: pick the walkable node under its XZ, allowing `drop` metres of height.
export function nearestNavNodeBelow(graph: NavGraph, position: NavPoint, radius = 1.2, drop = 1.6): number | undefined {
  let best = radius,
    result: number | undefined
  for (const node of nodesNear(graph, position.x, position.z, radius)) {
    const point = graph.positions[node]
    const height = position.y - point[1]
    if (height < -0.5 || height > drop) continue
    const distance = Math.hypot(point[0] - position.x, point[2] - position.z)
    if (distance < best) {
      best = distance
      result = node
    }
  }
  return result
}

// A point is walkable when a graph node lies within the grid spacing of it at about the same height.
export function walkableNode(graph: NavGraph, point: NavPoint, radius = 0.36, height = 0.4): number | undefined {
  let best = radius,
    result: number | undefined
  for (const node of nodesNear(graph, point.x, point.z, radius)) {
    const candidate = graph.positions[node]
    if (Math.abs(candidate[1] - point.y) > height) continue
    const distance = Math.hypot(candidate[0] - point.x, candidate[2] - point.z)
    if (distance < best) {
      best = distance
      result = node
    }
  }
  return result
}

// Every sample along the segment must sit on the graph, so bots can cut corners without cutting walls.
export function straightWalkable(graph: NavGraph, from: NavPoint, to: NavPoint, step = 0.25): boolean {
  const length = navDistance(from, to)
  const samples = Math.max(1, Math.ceil(length / step))
  for (let i = 1; i <= samples; i++) {
    const t = i / samples
    const point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t }
    if (walkableNode(graph, point) === undefined) return false
  }
  return true
}

// A random graph node roughly `min`–`max` metres away on the ground plane; any height level counts.
export function randomNavNode(
  graph: NavGraph,
  center: NavPoint,
  min: number,
  max: number,
  random: () => number,
  tries = 12
): number | undefined {
  for (let attempt = 0; attempt < tries; attempt++) {
    const angle = random() * Math.PI * 2
    const distance = min + random() * (max - min)
    const x = center.x + Math.cos(angle) * distance,
      z = center.z + Math.sin(angle) * distance
    const candidates = nodesNear(graph, x, z, 0.75)
    if (candidates.length) return candidates[Math.floor(random() * candidates.length) % candidates.length]
  }
  return undefined
}

class OpenNodes {
  private values: { node: number; score: number; cost: number }[] = []
  push(value: { node: number; score: number; cost: number }) {
    let index = this.values.length
    this.values.push(value)
    while (index > 0) {
      const parent = (index - 1) >>> 1
      if (this.values[parent].score <= value.score) break
      this.values[index] = this.values[parent]
      index = parent
    }
    this.values[index] = value
  }
  pop() {
    const first = this.values[0],
      last = this.values.pop()
    if (!last || this.values.length === 0) return first
    let index = 0
    while (index * 2 + 1 < this.values.length) {
      let child = index * 2 + 1
      if (child + 1 < this.values.length && this.values[child + 1].score < this.values[child].score) child++
      if (this.values[child].score >= last.score) break
      this.values[index] = this.values[child]
      index = child
    }
    this.values[index] = last
    return first
  }
}

export function findNavPath(graph: NavGraph, start: number, goal: number): number[] {
  if (!graph.positions[start] || !graph.positions[goal]) return []
  const open = new OpenNodes(),
    costs = new Map<number, number>([[start, 0]]),
    previous = new Map<number, number>()
  const target = navPoint(graph, goal)
  open.push({ node: start, cost: 0, score: navDistance(navPoint(graph, start), target) })
  for (let entry = open.pop(); entry; entry = open.pop()) {
    if (entry.cost !== costs.get(entry.node)) continue
    if (entry.node === goal) {
      const path = [goal]
      while (path[0] !== start) path.unshift(previous.get(path[0])!)
      return path
    }
    const point = navPoint(graph, entry.node)
    for (const neighbor of graph.links[entry.node]) {
      const next = navPoint(graph, neighbor),
        cost = entry.cost + navDistance(point, next)
      if (cost >= (costs.get(neighbor) ?? Infinity)) continue
      costs.set(neighbor, cost)
      previous.set(neighbor, entry.node)
      open.push({ node: neighbor, cost, score: cost + navDistance(next, target) })
    }
  }
  return []
}
