// Pure movement heuristics for bots: where to roam, how long to hold, how to strafe, how to turn.
// These are scene heuristics seeded per bot and round, not recovered CS bot AI.
import {
  NavGraph,
  NavPoint,
  findNavPath,
  navDistance,
  navDistanceXZ,
  navPoint,
  nearestNavNodeXZ,
  randomNavNode,
  straightWalkable,
  walkableNode
} from './navigation'

export type Pace = 'run' | 'walk'
export interface StrafeState {
  direction: 1 | -1
  until: number
  moving: boolean
}

// CS 1.6 shift-walk keeps 52% of the run speed.
export const WALK_RATIO = 0.52
export const WALK_CHANCE = 0.25
// Closer than this the bot strafes and shoots instead of closing in.
export const ENGAGE_RANGE = 10
export const HOTSPOT_CHANCE = 0.55
export const WANDER_MIN = 8
export const WANDER_MAX = 25
export const MEMORY_SECONDS = 8
export const SIDESTEP = 1.2
export const RETREAT = 3
const VISITED_KEPT = 3
const SAME_SPOT = 1.5

export function holdDuration(random: () => number, scale = 1): number {
  if (random() < 0.35) return 0
  return (1 + random() * 6) * scale
}

export function choosePace(random: () => number): Pace {
  return random() < WALK_CHANCE ? 'walk' : 'run'
}

export function rememberVisited(visited: NavPoint[], point: NavPoint) {
  visited.push({ ...point })
  while (visited.length > VISITED_KEPT) visited.shift()
}

// Prefer the strategic spots not visited recently; otherwise wander to a random reachable node nearby.
export function chooseDestination(
  graph: NavGraph,
  position: NavPoint,
  hotspots: readonly NavPoint[],
  visited: readonly NavPoint[],
  random: () => number
): NavPoint | undefined {
  const fresh = hotspots.filter(
    (spot) => navDistance(spot, position) > SAME_SPOT && !visited.some((seen) => navDistance(seen, spot) < SAME_SPOT)
  )
  if (fresh.length && random() < HOTSPOT_CHANCE) return fresh[Math.floor(random() * fresh.length) % fresh.length]
  const node = randomNavNode(graph, position, WANDER_MIN, WANDER_MAX, random)
  if (node !== undefined) return navPoint(graph, node)
  return fresh[0] ?? hotspots[0]
}

export function yawTo(from: NavPoint, to: NavPoint): number {
  return (Math.atan2(to.x - from.x, to.z - from.z) * 180) / Math.PI
}

export function wrapDegrees(angle: number): number {
  return ((((angle + 180) % 360) + 360) % 360) - 180
}

// Turns toward `desired` at most `rate` degrees per second along the shorter arc.
export function steerYaw(current: number, desired: number, dt: number, rate: number): number {
  const delta = wrapDegrees(desired - current)
  const limit = Math.max(0, rate * dt)
  return wrapDegrees(current + Math.max(-limit, Math.min(limit, delta)))
}

export function scanYaw(base: number, random: () => number): number {
  return wrapDegrees(base + (random() * 2 - 1) * 120)
}

// Alternates short sidesteps with standing bursts; direction usually flips between sidesteps.
export function strafeStep(strafe: StrafeState, now: number, random: () => number): StrafeState {
  if (now < strafe.until) return strafe
  if (strafe.moving) {
    strafe.moving = false
    strafe.until = now + 0.35 + random() * 0.55
  } else {
    strafe.moving = true
    if (random() < 0.7) strafe.direction = strafe.direction === 1 ? -1 : 1
    strafe.until = now + 0.25 + random() * 0.35
  }
  return strafe
}

function offsetPoint(graph: NavGraph, position: NavPoint, dx: number, dz: number): NavPoint | undefined {
  const point = { x: position.x + dx, y: position.y, z: position.z + dz }
  const node = walkableNode(graph, point)
  if (node === undefined) return undefined
  point.y = graph.positions[node][1]
  return straightWalkable(graph, position, point) ? point : undefined
}

// A point perpendicular to the enemy on the requested side, or undefined when a wall blocks it.
export function sidestepPoint(
  graph: NavGraph,
  position: NavPoint,
  enemy: NavPoint,
  direction: 1 | -1,
  distance = SIDESTEP
): NavPoint | undefined {
  const length = navDistanceXZ(position, enemy)
  if (length < 0.001) return undefined
  const dx = (enemy.x - position.x) / length,
    dz = (enemy.z - position.z) / length
  return offsetPoint(graph, position, -dz * direction * distance, dx * direction * distance)
}

// The first open direction away from the enemy, trying straight back first, then the diagonals and sides.
export function retreatPoint(
  graph: NavGraph,
  position: NavPoint,
  enemy: NavPoint,
  distance = RETREAT
): NavPoint | undefined {
  const length = navDistanceXZ(position, enemy)
  if (length < 0.001) return undefined
  const base = Math.atan2(position.x - enemy.x, position.z - enemy.z)
  for (const turn of [0, 45, -45, 90, -90]) {
    const angle = base + (turn * Math.PI) / 180
    const point = offsetPoint(graph, position, Math.sin(angle) * distance, Math.cos(angle) * distance)
    if (point) return point
  }
  return undefined
}

// Points at the given fractions of the walking route between two landmarks.
export function routeHotspots(graph: NavGraph, from: NavPoint, to: NavPoint, fractions: readonly number[]): NavPoint[] {
  const start = nearestNavNodeXZ(graph, from),
    goal = nearestNavNodeXZ(graph, to)
  if (start === undefined || goal === undefined) return []
  const path = findNavPath(graph, start, goal)
  if (path.length < 2) return []
  const lengths = [0]
  for (let i = 1; i < path.length; i++)
    lengths.push(lengths[i - 1] + navDistance(navPoint(graph, path[i - 1]), navPoint(graph, path[i])))
  const total = lengths[lengths.length - 1]
  return fractions.map((fraction) => {
    const wanted = Math.max(0, Math.min(1, fraction)) * total
    let index = 0
    while (index < lengths.length - 1 && lengths[index + 1] < wanted) index++
    return navPoint(graph, path[index])
  })
}

export const DUST2_LANDMARKS = {
  siteA: { x: 104.5, y: 10.026, z: 40.5 },
  siteB: { x: 33, y: 12.5861, z: 46.5 },
  tSpawn: { x: 85.5, y: 13.4393, z: 131 },
  ctSpawn: { x: 55, y: 7.68, z: 51 }
} as const
const DUST2_DEFENSES: readonly NavPoint[] = [
  { x: 100.5, y: 10.2341, z: 38.5 },
  { x: 102.5, y: 10.026, z: 44.5 },
  { x: 107.5, y: 10.026, z: 43 },
  { x: 29, y: 11.6431, z: 44.5 },
  { x: 31, y: 12.5861, z: 50 },
  { x: 37, y: 12.5861, z: 43.5 }
]

const hotspotCache = new WeakMap<NavGraph, Record<1 | 2, NavPoint[]>>()
// Terrorists push through the approaches toward the sites; Counter-Terrorists rotate between sites and mid.
export function dust2Hotspots(graph: NavGraph): Record<1 | 2, NavPoint[]> {
  const cached = hotspotCache.get(graph)
  if (cached) return cached
  const { siteA, siteB, tSpawn, ctSpawn } = DUST2_LANDMARKS
  const snap = (point: NavPoint) => {
    const node = nearestNavNodeXZ(graph, point)
    return node === undefined ? point : navPoint(graph, node)
  }
  const result = {
    1: [
      snap(siteA),
      snap(siteB),
      ...routeHotspots(graph, tSpawn, siteA, [0.4, 0.7]),
      ...routeHotspots(graph, tSpawn, siteB, [0.4, 0.7]),
      ...routeHotspots(graph, tSpawn, ctSpawn, [0.5, 0.8])
    ],
    2: [
      snap(siteA),
      snap(siteB),
      ...DUST2_DEFENSES.map(snap),
      ...routeHotspots(graph, ctSpawn, siteA, [0.5]),
      ...routeHotspots(graph, ctSpawn, siteB, [0.5]),
      ...routeHotspots(graph, ctSpawn, tSpawn, [0.35, 0.55])
    ]
  }
  hotspotCache.set(graph, result)
  return result
}
