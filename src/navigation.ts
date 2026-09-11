import data from './navigation.json'

export interface NavPoint { x: number; y: number; z: number }
export interface NavGraph { positions: readonly (readonly number[])[]; links: readonly (readonly number[])[] }
export const dust2Navigation: NavGraph = data
export const navDistance = (a: NavPoint, b: NavPoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
export function navPoint(graph: NavGraph, node: number): NavPoint {
  const [x, y, z] = graph.positions[node]
  return { x, y, z }
}
export function nearestNavNode(graph: NavGraph, position: NavPoint, radius = 2): number | undefined {
  let best = radius, result: number | undefined
  for (let node = 0; node < graph.positions.length; node++) {
    const point = graph.positions[node]
    const distance = Math.hypot(point[0] - position.x, (point[1] - position.y) * 2, point[2] - position.z)
    if (distance < best) { best = distance; result = node }
  }
  return result
}

class OpenNodes {
  private values: { node: number; score: number; cost: number }[] = []
  push(value: { node: number; score: number; cost: number }) {
    let index = this.values.length
    this.values.push(value)
    while (index > 0) {
      const parent = (index - 1) >>> 1
      if (this.values[parent].score <= value.score) break
      this.values[index] = this.values[parent]; index = parent
    }
    this.values[index] = value
  }
  pop() {
    const first = this.values[0], last = this.values.pop()
    if (!last || this.values.length === 0) return first
    let index = 0
    while (index * 2 + 1 < this.values.length) {
      let child = index * 2 + 1
      if (child + 1 < this.values.length && this.values[child + 1].score < this.values[child].score) child++
      if (this.values[child].score >= last.score) break
      this.values[index] = this.values[child]; index = child
    }
    this.values[index] = last
    return first
  }
}

export function findNavPath(graph: NavGraph, start: number, goal: number): number[] {
  if (!graph.positions[start] || !graph.positions[goal]) return []
  const open = new OpenNodes(), costs = new Map<number, number>([[start, 0]]), previous = new Map<number, number>()
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
      const next = navPoint(graph, neighbor), cost = entry.cost + navDistance(point, next)
      if (cost >= (costs.get(neighbor) ?? Infinity)) continue
      costs.set(neighbor, cost); previous.set(neighbor, entry.node)
      open.push({ node: neighbor, cost, score: cost + navDistance(next, target) })
    }
  }
  return []
}
