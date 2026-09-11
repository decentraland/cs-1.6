import { NavGraph, NavPoint, dust2Navigation, findNavPath, navDistance, navPoint, nearestNavNode } from './navigation'

const patrolStops: readonly NavPoint[] = [
  { x: 104.5, y: 10.026, z: 40.5 }, { x: 33, y: 12.5861, z: 46.5 }, { x: 85.5, y: 13.4393, z: 131 }
]
export interface BotNavigation {
  position: NavPoint
  node: number
  path: number[]
  goal?: number
  lastSeen?: NavPoint
  lastSeenAt: number
  nextPlan: number
  patrol: number
}

export function createBotNavigation(position: NavPoint, index: number, graph = dust2Navigation): BotNavigation {
  const node = nearestNavNode(graph, position)
  if (node === undefined) throw new Error('Bot spawn has no walkable navigation node')
  return { position: navPoint(graph, node), node, path: [], lastSeenAt: -Infinity, nextPlan: 0, patrol: index }
}

export function moveBot(state: BotNavigation, observed: NavPoint | undefined, now: number, dt: number, speed: number, graph: NavGraph = dust2Navigation, patrol: readonly NavPoint[] = patrolStops, objective?: NavPoint) {
  if (observed) { state.lastSeen = { ...observed }; state.lastSeenAt = now }
  if (state.lastSeen && now - state.lastSeenAt > 8) state.lastSeen = undefined
  if (!objective && observed && navDistance(state.position, observed) < 8) { state.path = []; return }
  let target = objective ?? state.lastSeen ?? patrol[state.patrol % patrol.length]
  if (!target) return
  if (navDistance(state.position, target) < .75) {
    state.path = []
    if (state.lastSeen) {
      if (now - state.lastSeenAt < 2) return
      state.lastSeen = undefined
    } else if (objective) return
    else state.patrol++
    target = objective ?? state.lastSeen ?? patrol[state.patrol % patrol.length]
  }
  if (now >= state.nextPlan) {
    state.nextPlan = now + 1
    const goal = nearestNavNode(graph, target)
    if (goal !== undefined && (goal !== state.goal || state.path.length === 0)) {
      state.goal = goal
      state.path = findNavPath(graph, state.node, goal)
    }
  }
  let remaining = Math.max(0, Math.min(dt, .2)) * speed
  while (state.path.length && remaining > 0) {
    const node = state.path[0], next = navPoint(graph, node), distance = navDistance(state.position, next)
    if (distance <= remaining) { state.position = next; state.node = node; state.path.shift(); remaining -= distance }
    else {
      const fraction = remaining / distance
      state.position = { x: state.position.x + (next.x - state.position.x) * fraction, y: state.position.y + (next.y - state.position.y) * fraction, z: state.position.z + (next.z - state.position.z) * fraction }
      remaining = 0
    }
  }
}
