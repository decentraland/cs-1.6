import { CsMovement } from './cs-movement-rules'
import { BotNavigation, MoveOptions, moveBot } from './bot-navigation'
import { NavPoint, dust2Navigation, navPoint, nearestNavNode, straightWalkable, walkableNode } from './navigation'
import type { SolidTrace } from './solid-trace'

export type BotWorldTrace = (origin: NavPoint, direction: NavPoint, distance: number) => SolidTrace
export type BotWorld = (from: NavPoint, displacement: NavPoint) => NavPoint
const STEP = 18 * 0.025
const RADIUS = 0.3

export function groundedBotWorld(trace: BotWorldTrace): BotWorld {
  function candidate(from: NavPoint, x: number, z: number): NavPoint | undefined {
    const floor = trace({ x, y: from.y + STEP + 0.01, z }, { x: 0, y: -1, z: 0 }, STEP * 2 + 0.02)
    if (!floor.solid || (floor.normal?.y ?? 0) < 0.7 || Math.abs(floor.position.y - from.y) > STEP + 0.002) return
    const to = { x, y: floor.position.y, z }
    for (const [dx, dz] of [
      [0, 0],
      [-RADIUS, 0],
      [RADIUS, 0],
      [0, -RADIUS],
      [0, RADIUS]
    ]) {
      const ceiling = trace(
        { x: to.x + dx, y: to.y + STEP + 0.01, z: to.z + dz },
        { x: 0, y: 1, z: 0 },
        1.8 - STEP - 0.01
      )
      if (ceiling.startSolid || ceiling.solid) return
    }
    for (const height of [STEP + 0.01, 1.2, 1.75])
      for (const [x, z] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1]
      ]) {
        const clearance = trace({ x: to.x, y: to.y + height, z: to.z }, { x, y: 0, z }, RADIUS)
        if (clearance.startSolid || (clearance.solid && clearance.distance < RADIUS - 0.001)) return
      }
    const dx = x - from.x,
      dy = to.y - from.y,
      dz = z - from.z,
      length = Math.hypot(dx, dy, dz),
      horizontal = Math.hypot(dx, dz)
    if (length < 1e-6) return to
    const direction = { x: dx / length, y: dy / length, z: dz / length },
      sx = horizontal ? (-dz / horizontal) * RADIUS : 0,
      sz = horizontal ? (dx / horizontal) * RADIUS : 0
    for (const side of [-1, 0, 1])
      for (const height of [STEP + 0.01, 1.2, 1.75]) {
        const ray = trace({ x: from.x + sx * side, y: from.y + height, z: from.z + sz * side }, direction, length)
        if (ray.startSolid || (ray.solid && ray.distance < length - 0.001)) return
      }
    return to
  }
  return (from, displacement) => {
    let position = { ...from }
    const count = Math.max(1, Math.ceil(Math.hypot(displacement.x, displacement.z) / 0.1)),
      dx = displacement.x / count,
      dz = displacement.z / count
    for (let i = 0; i < count; i++) {
      const height = position.y
      const next = candidate(position, position.x + dx, position.z + dz)
      if (next) position = next
      else {
        for (const axis of Math.abs(dx) > Math.abs(dz) ? (['x', 'z'] as const) : (['z', 'x'] as const)) {
          const slide = candidate(position, position.x + (axis === 'x' ? dx : 0), position.z + (axis === 'z' ? dz : 0))
          if (slide && Math.abs(slide.y - height) <= STEP + 0.002) position = slide
        }
      }
    }
    return position
  }
}

export function advanceBot(state: BotNavigation, movement: CsMovement, options: MoveOptions, world: BotWorld) {
  const dt = Math.max(0, Math.min(0.1, options.dt)),
    from = state.position,
    graph = options.graph ?? dust2Navigation
  if (dt <= 0) return
  const canWalk = (from: NavPoint, to: NavPoint) => {
    const resolved = world(from, { x: to.x - from.x, y: 0, z: to.z - from.z })
    return Math.hypot(resolved.x - to.x, resolved.z - to.z) < 0.025 && Math.abs(resolved.y - to.y) < 0.06
  }
  moveBot(state, { ...options, dt, canWalk, intentOnly: true })
  const desired = state.position,
    dx = desired.x - from.x,
    dz = desired.z - from.z,
    length = Math.hypot(dx, dz)
  const walking = state.mode === 'roam' && state.pace === 'walk'
  const velocity = movement.step(
    {
      forward: length > 1e-5 ? 1 : 0,
      side: 0,
      yaw: Math.atan2(dx, dz),
      jump: false,
      grounded: true,
      speed: options.speed * (walking ? 0.52 : 1),
      maxSpeed: options.speed
    },
    dt
  )
  const position = world(from, { x: velocity.x * dt, y: 0, z: velocity.z * dt })
  movement.velocity = { x: (position.x - from.x) / dt, y: 0, z: (position.z - from.z) / dt }
  state.position = position
  const node = walkableNode(graph, position) ?? nearestNavNode(graph, position)
  if (node !== undefined) state.node = node
  // A hit can move the bot away from the corridor its earlier route assumed.
  const clipped = Math.hypot(position.x - from.x - velocity.x * dt, position.z - from.z - velocity.z * dt) > 0.005
  if (state.path.length && (clipped || !straightWalkable(graph, position, navPoint(graph, state.path[0])))) {
    state.smoothed = false
    state.path = []
    state.goal = undefined
  }
}
