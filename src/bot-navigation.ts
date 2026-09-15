import {
  NavGraph,
  NavPoint,
  dust2Navigation,
  findNavPath,
  navDistance,
  navPoint,
  nearestNavNode,
  straightWalkable,
  walkableNode
} from './navigation'
import {
  ENGAGE_RANGE,
  MEMORY_SECONDS,
  Pace,
  StrafeState,
  WALK_RATIO,
  chooseDestination,
  choosePace,
  holdDuration,
  rememberVisited,
  retreatPoint,
  scanYaw,
  sidestepPoint,
  steerYaw,
  strafeStep,
  yawTo
} from './bot-behavior'

export type BotMode = 'roam' | 'hold' | 'hunt' | 'search' | 'engage' | 'retreat' | 'objective'
export interface BotNavigation {
  position: NavPoint
  node: number
  path: number[]
  goal?: number
  lastSeen?: NavPoint
  lastSeenAt: number
  heard: boolean
  nextPlan: number
  yaw: number
  mode: BotMode
  destination?: NavPoint
  visited: NavPoint[]
  holdUntil: number
  pace: Pace
  scan: number
  nextScan: number
  strafe: StrafeState
  smoothed: boolean
  random: () => number
}
export interface MoveOptions {
  now: number
  dt: number
  speed: number
  observed?: NavPoint
  reported?: NavPoint
  objective?: NavPoint
  reloading?: boolean
  graph?: NavGraph
  hotspots?: readonly NavPoint[]
  holdScale?: number
}

const ARRIVE = 0.75
// Furthest path node a bot may head for directly when the straight line stays on the graph.
const LOOKAHEAD = 12
const TURN_RATE = 400
const TRACK_RATE = 720
const DEFAULT_HOTSPOTS: readonly NavPoint[] = [
  { x: 104.5, y: 10.026, z: 40.5 },
  { x: 33, y: 12.5861, z: 46.5 },
  { x: 85.5, y: 13.4393, z: 131 }
]

export function createBotNavigation(
  position: NavPoint,
  graph = dust2Navigation,
  random: () => number = Math.random,
  yaw = 0
): BotNavigation {
  const node = nearestNavNode(graph, position)
  if (node === undefined) throw new Error('Bot spawn has no walkable navigation node')
  return {
    position: navPoint(graph, node),
    node,
    path: [],
    lastSeenAt: -Infinity,
    heard: false,
    nextPlan: 0,
    yaw,
    mode: 'roam',
    visited: [],
    holdUntil: 0,
    pace: 'run',
    scan: yaw,
    nextScan: 0,
    strafe: { direction: 1, until: 0, moving: false },
    smoothed: false,
    random
  }
}

function cutCorners(state: BotNavigation, graph: NavGraph) {
  for (let i = Math.min(state.path.length - 1, LOOKAHEAD); i > 0; i--) {
    if (!straightWalkable(graph, state.position, navPoint(graph, state.path[i]))) continue
    state.path.splice(0, i)
    return
  }
}

function follow(state: BotNavigation, graph: NavGraph, distance: number) {
  let remaining = distance
  while (state.path.length && remaining > 0) {
    if (!state.smoothed) {
      cutCorners(state, graph)
      state.smoothed = true
    }
    const node = state.path[0],
      next = navPoint(graph, node),
      step = navDistance(state.position, next)
    if (step <= remaining) {
      state.position = next
      state.node = node
      state.path.shift()
      state.smoothed = false
      remaining -= step
    } else {
      const fraction = remaining / step
      state.position = {
        x: state.position.x + (next.x - state.position.x) * fraction,
        y: state.position.y + (next.y - state.position.y) * fraction,
        z: state.position.z + (next.z - state.position.z) * fraction
      }
      remaining = 0
    }
  }
}

// Routes replan at most once per second, except immediately after a new target was chosen.
function travel(
  state: BotNavigation,
  graph: NavGraph,
  target: NavPoint,
  distance: number,
  now: number
): 'arrived' | 'moving' | 'blocked' {
  if (navDistance(state.position, target) < ARRIVE) {
    state.path = []
    return 'arrived'
  }
  const goal = nearestNavNode(graph, target)
  if (goal === undefined) return 'blocked'
  const fresh = state.goal === undefined
  if (fresh || now >= state.nextPlan) {
    state.nextPlan = now + 1
    if (fresh || goal !== state.goal || state.path.length === 0) {
      state.goal = goal
      state.path = findNavPath(graph, state.node, goal)
      state.smoothed = false
    }
  }
  follow(state, graph, distance)
  if (state.path.length) return 'moving'
  return state.node === goal ? 'arrived' : 'blocked'
}

function stepStraight(state: BotNavigation, graph: NavGraph, target: NavPoint, distance: number) {
  const length = navDistance(state.position, target)
  if (length < 0.001) return
  const fraction = Math.min(1, distance / length)
  state.position = {
    x: state.position.x + (target.x - state.position.x) * fraction,
    y: state.position.y + (target.y - state.position.y) * fraction,
    z: state.position.z + (target.z - state.position.z) * fraction
  }
  const node = walkableNode(graph, state.position) ?? nearestNavNode(graph, state.position)
  if (node !== undefined) state.node = node
  state.path = []
  state.goal = undefined
}

function beginHold(state: BotNavigation, now: number, seconds: number) {
  state.holdUntil = now + seconds
  state.nextScan = now + 0.6 + state.random() * 0.8
  state.scan = state.yaw
}

function holding(state: BotNavigation, now: number): boolean {
  if (now >= state.holdUntil) return false
  if (now >= state.nextScan) {
    state.scan = scanYaw(state.yaw, state.random)
    state.nextScan = now + 1 + state.random() * 1.5
  }
  return true
}

function retarget(state: BotNavigation) {
  state.path = []
  state.goal = undefined
}

export function moveBot(state: BotNavigation, options: MoveOptions) {
  const { now, dt, speed, observed, reported, objective } = options
  const graph = options.graph ?? dust2Navigation
  const random = state.random
  if (observed) {
    state.lastSeen = { ...observed }
    state.lastSeenAt = now
    state.heard = false
  } else if (reported && (!state.lastSeen || state.heard || now - state.lastSeenAt > 2)) {
    state.lastSeen = { ...reported }
    state.lastSeenAt = now
    state.heard = true
  }
  if (state.lastSeen && now - state.lastSeenAt > MEMORY_SECONDS) state.lastSeen = undefined
  const budget = Math.max(0, Math.min(dt, 0.2)) * speed
  const previous = state.position
  const before = state.mode

  if (objective) {
    if (before !== 'objective') retarget(state)
    state.mode = 'objective'
    travel(state, graph, objective, budget, now)
  } else if (observed && options.reloading) {
    if (before !== 'retreat') retarget(state)
    state.mode = 'retreat'
    const point = retreatPoint(graph, state.position, observed)
    if (point) stepStraight(state, graph, point, budget)
  } else if (observed) {
    if (before !== 'engage') {
      retarget(state)
      state.strafe = { direction: random() < 0.5 ? 1 : -1, until: now + 0.3 + random() * 0.4, moving: false }
    }
    state.mode = 'engage'
    if (navDistance(state.position, observed) > ENGAGE_RANGE) travel(state, graph, observed, budget, now)
    else if (strafeStep(state.strafe, now, random).moving) {
      let point = sidestepPoint(graph, state.position, observed, state.strafe.direction)
      if (!point) {
        state.strafe.direction = state.strafe.direction === 1 ? -1 : 1
        point = sidestepPoint(graph, state.position, observed, state.strafe.direction)
      }
      if (point) stepStraight(state, graph, point, budget)
    }
  } else if (state.lastSeen) {
    if (before === 'search' && holding(state, now)) {
      // Looked around at the last known position long enough: give up the chase.
    } else if (before === 'search') {
      state.lastSeen = undefined
      state.mode = 'roam'
      state.destination = undefined
    } else {
      if (before !== 'hunt') retarget(state)
      state.mode = 'hunt'
      if (travel(state, graph, state.lastSeen, budget, now) !== 'moving') {
        state.mode = 'search'
        beginHold(state, now, 1.5 + random() * 1.5)
      }
    }
  } else if (holding(state, now)) {
    state.mode = 'hold'
  } else {
    if (before !== 'roam' && before !== 'hold') {
      retarget(state)
      state.destination = undefined
    }
    state.mode = 'roam'
    if (!state.destination) {
      const hotspots = options.hotspots ?? DEFAULT_HOTSPOTS
      state.destination = chooseDestination(graph, state.position, hotspots, state.visited, random)
      if (state.destination) rememberVisited(state.visited, state.destination)
      state.pace = choosePace(random)
      retarget(state)
    }
    if (state.destination) {
      const pace = state.pace === 'walk' ? WALK_RATIO : 1
      if (travel(state, graph, state.destination, budget * pace, now) !== 'moving') {
        state.destination = undefined
        beginHold(state, now, holdDuration(random, options.holdScale ?? 1))
        state.mode = 'hold'
      }
    }
  }

  const moved = { x: state.position.x - previous.x, z: state.position.z - previous.z }
  let desired = state.yaw
  if (observed) desired = yawTo(state.position, observed)
  else if (Math.hypot(moved.x, moved.z) > 1e-4) desired = (Math.atan2(moved.x, moved.z) * 180) / Math.PI
  else if (state.mode === 'hold' || state.mode === 'search') desired = state.scan
  state.yaw = steerYaw(state.yaw, desired, dt, observed ? TRACK_RATE : TURN_RATE)
}
