import type { SolidPoint, SolidTrace } from './solid-trace'

export function dropDirection(
  direction: SolidPoint,
  facing: SolidPoint = { x: 0, y: 0, z: 1 }
): SolidPoint | undefined {
  const horizontal = Math.hypot(direction.x, direction.z)
  if (![direction.x, direction.y, direction.z].every(Number.isFinite) || Math.hypot(horizontal, direction.y) < 0.001)
    return undefined
  const yaw = horizontal > 0.001 ? Math.atan2(direction.x, direction.z) : Math.atan2(facing.x, facing.z)
  const pitch = -Math.atan2(direction.y, horizontal) / 3
  return { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) }
}
export function touchesWeaponBox(feet: SolidPoint, position: SolidPoint) {
  return (
    Math.abs(feet.x - position.x) <= 0.8 &&
    Math.abs(feet.z - position.z) <= 0.8 &&
    feet.y <= position.y + 0.4 &&
    feet.y + 1.8 >= position.y
  )
}
export interface TossState {
  position: SolidPoint
  velocity: SolidPoint
  settled: boolean
}
export type TossTrace = (origin: SolidPoint, direction: SolidPoint, limit: number) => SolidTrace
export function throwWeaponBox(feet: SolidPoint, forward: SolidPoint, trace: TossTrace): TossState {
  const source = { x: feet.x, y: feet.y + 0.9, z: feet.z }
  const hit = trace(source, forward, 0.25)
  const position = hit.allSolid
    ? source
    : {
        x: hit.position.x - (hit.solid ? forward.x * 0.001 : 0),
        y: hit.position.y - (hit.solid ? forward.y * 0.001 : 0),
        z: hit.position.z - (hit.solid ? forward.z * 0.001 : 0)
      }
  return { position, velocity: { x: forward.x * 10, y: forward.y * 10, z: forward.z * 10 }, settled: false }
}
export function tossWeaponBox(state: TossState, dt: number, trace: TossTrace) {
  if (state.settled || dt <= 0) return
  const steps = Math.ceil(Math.min(dt, 0.25) * 120),
    step = Math.min(dt, 0.25) / steps
  for (let n = 0; n < steps && !state.settled; n++) {
    state.velocity.y -= 20 * step
    const speed = Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z)
    if (!speed) continue
    const direction = { x: state.velocity.x / speed, y: state.velocity.y / speed, z: state.velocity.z / speed }
    const hit = trace(state.position, direction, speed * step)
    if (hit.allSolid) {
      state.velocity = { x: 0, y: 0, z: 0 }
      break
    }
    state.position = { ...hit.position }
    if (!hit.solid) continue
    const normal = hit.normal ?? { x: 0, y: 1, z: 0 }
    state.position = {
      x: state.position.x + normal.x * 0.001,
      y: state.position.y + normal.y * 0.001,
      z: state.position.z + normal.z * 0.001
    }
    const dot = state.velocity.x * normal.x + state.velocity.y * normal.y + state.velocity.z * normal.z
    state.velocity = {
      x: state.velocity.x - normal.x * dot,
      y: state.velocity.y - normal.y * dot,
      z: state.velocity.z - normal.z * dot
    }
    for (const axis of ['x', 'y', 'z'] as const) if (Math.abs(state.velocity[axis]) < 0.0025) state.velocity[axis] = 0
    if (normal.y > 0.7) {
      state.velocity = { x: 0, y: 0, z: 0 }
      state.settled = true
    }
  }
}
