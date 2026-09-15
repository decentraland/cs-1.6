export interface AccuracyState {
  shots: number
  accuracy: number
  lastFire: number
  held: boolean
  recoverAt: number
  updatedAt: number
  pitch: number
  yaw: number
  right: boolean
}

export const freshAccuracy = (): AccuracyState => ({
  shots: 0,
  accuracy: 0.2,
  lastFire: 0,
  held: false,
  recoverAt: 0,
  updatedAt: 0,
  pitch: 0,
  yaw: 0,
  right: false
})

export function recoverAccuracy(state: AccuracyState, now: number) {
  let dt = state.updatedAt ? Math.max(0, now - state.updatedAt) : 0
  let length = Math.hypot(state.pitch, state.yaw)
  const original = length
  // GoldSrc's punch decay, sampled at 100 Hz independently of scene/network tick rate.
  while (dt > 0 && length > 0) {
    const step = Math.min(0.01, dt)
    length = Math.max(0, length - (10 + length * 0.5) * step)
    dt -= step
  }
  if (original > 0) {
    state.pitch *= length / original
    state.yaw *= length / original
  }
  state.updatedAt = now
  if (!state.held && state.shots > 0 && now > state.recoverAt) {
    const count = Math.min(state.shots, Math.ceil((now - state.recoverAt) / 0.0225))
    state.shots -= count
    state.recoverAt += count * 0.0225
  }
}

export function setTrigger(state: AccuracyState, held: boolean, now: number) {
  recoverAccuracy(state, now)
  if (state.held === held) return
  state.held = held
  if (!held) {
    state.shots = Math.min(15, state.shots)
    state.recoverAt = now + 0.4
  }
}

export function akSpread(state: AccuracyState, now: number, speed: number, grounded: boolean): number {
  recoverAccuracy(state, now)
  const spread = !grounded
    ? 0.04 + 0.4 * state.accuracy
    : speed > 140 * 0.025
      ? 0.04 + 0.07 * state.accuracy
      : 0.0275 * state.accuracy
  state.shots++
  // The original compatibility path uses integer division, unlike ReGameDLL_FIXES.
  state.accuracy = Math.min(1.25, Math.floor(state.shots ** 3 / 200) + 0.35)
  state.lastFire = now
  state.held = true
  return spread
}

export function kickBack(
  state: AccuracyState,
  speed: number,
  grounded: boolean,
  crouched: boolean,
  random = Math.random
) {
  const [up, side, upStep, sideStep, maxUp, maxSide, change] =
    speed > 0.001
      ? [1.5, 0.45, 0.225, 0.05, 6.5, 2.5, 7]
      : !grounded
        ? [2, 1, 0.5, 0.35, 9, 6, 5]
        : crouched
          ? [0.9, 0.35, 0.15, 0.025, 5.5, 1.5, 9]
          : [1, 0.375, 0.175, 0.0375, 5.75, 1.75, 8]
  const extra = state.shots === 1 ? 0 : state.shots
  state.pitch = Math.min(maxUp, state.pitch + up + extra * upStep)
  state.yaw = Math.max(-maxSide, Math.min(maxSide, state.yaw + (side + extra * sideStep) * (state.right ? 1 : -1)))
  if (Math.floor(random() * (change + 1)) === 0) state.right = !state.right
}

export function rangedDamage(damage: number, metres: number, hitGroup: 'head' | 'body' | 'legs'): number {
  const multiplier = hitGroup === 'head' ? 4 : hitGroup === 'legs' ? 0.75 : 1
  return Math.floor(damage * multiplier * 0.98 ** (metres / (500 * 0.025)))
}
