import { AccuracyState, akSpread, freshAccuracy, kickBack, recoverAccuracy } from './accuracy'
import { GunId, GUNS } from './weapon-profiles'

export function freshGunAccuracy(id: GunId): AccuracyState {
  return { ...freshAccuracy(), accuracy: GUNS[id].accuracy }
}
export function gunSpread(state: AccuracyState, id: GunId, now: number, speed: number, grounded: boolean): number {
  if (id === 'ak47') return akSpread(state, now, speed, grounded)
  recoverAccuracy(state, now)
  const moving = speed > 0.001
  const spread =
    id === 'm4a1'
      ? !grounded
        ? 0.035 + 0.4 * state.accuracy
        : speed > 3.5
          ? 0.035 + 0.07 * state.accuracy
          : 0.02 * state.accuracy
      : (!grounded ? (id === 'usp' ? 1.2 : 1) : moving ? (id === 'usp' ? 0.225 : 0.165) : 0.1) * (1 - state.accuracy)
  state.shots++
  if (id === 'm4a1') state.accuracy = Math.min(1, state.shots ** 3 / 220 + 0.3)
  else if (state.lastFire)
    state.accuracy = Math.max(
      0.6,
      Math.min(GUNS[id].accuracy, state.accuracy - ((id === 'usp' ? 0.3 : 0.325) - (now - state.lastFire)) * 0.275)
    )
  state.lastFire = now
  state.held = true
  return spread
}
export function gunKick(state: AccuracyState, id: GunId, speed: number, grounded: boolean, random = Math.random) {
  if (id === 'ak47') {
    kickBack(state, speed, grounded, false, random)
    return
  }
  if (id === 'glock18') return
  if (id === 'usp') {
    state.pitch += 2
    return
  }
  const [up, side, upStep, sideStep, maxUp, maxSide, change] =
    speed > 0.001
      ? [1, 0.45, 0.28, 0.045, 3.75, 3, 7]
      : !grounded
        ? [1.2, 0.5, 0.23, 0.15, 5.5, 3.5, 6]
        : [0.65, 0.35, 0.25, 0.015, 3.5, 2.25, 7]
  const extra = state.shots === 1 ? 0 : state.shots
  state.pitch = Math.min(maxUp, state.pitch + up + extra * upStep)
  state.yaw = Math.max(-maxSide, Math.min(maxSide, state.yaw + (side + extra * sideStep) * (state.right ? 1 : -1)))
  if (Math.floor(random() * (change + 1)) === 0) state.right = !state.right
}
