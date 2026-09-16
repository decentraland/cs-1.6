import type { Point } from './ballistics'

export interface GroundPlane {
  position: Point
  normal: Point
}
export const CS_STEP_HEIGHT = 18 * 0.025
export function supportHeight(ground: GroundPlane, feet: Point) {
  return (
    ground.position.y -
    ((feet.x - ground.position.x) * ground.normal.x + (feet.z - ground.position.z) * ground.normal.z) /
      ground.normal.y +
    0.3 * (1 / ground.normal.y - 1)
  )
}
export function nextStepHeight(floor: number, next: GroundPlane | undefined) {
  if (!next || next.normal.y <= 0.7) return undefined
  const rise = next.position.y - floor
  return rise > 0.04 && rise <= CS_STEP_HEIGHT + 0.001 ? next.position.y + 0.002 : undefined
}
export function keepStepLift(
  startedAt: number,
  now: number,
  height: number,
  floor: number,
  grounded: boolean,
  jumping: boolean
) {
  return !jumping && now - startedAt <= 0.4 && !(grounded && Math.abs(floor - height) < 0.06)
}
