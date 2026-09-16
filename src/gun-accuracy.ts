import { AccuracyState, freshAccuracy, recoverAccuracy } from './accuracy'
import { GunId, GUNS } from './weapon-profiles'

interface AutomaticAccuracy {
  power: number
  divisor: number
  bias: number
  maximum: number
  airBase: number
  airScale: number
  moveBase: number
  moveScale: number
  standScale: number
  moveThreshold: number
}
const AUTOMATIC: Partial<Record<GunId, AutomaticAccuracy>> = {
  ak47: {
    power: 3,
    divisor: 200,
    bias: 0.35,
    maximum: 1.25,
    airBase: 0.04,
    airScale: 0.4,
    moveBase: 0.04,
    moveScale: 0.07,
    standScale: 0.0275,
    moveThreshold: 140
  },
  m4a1: {
    power: 3,
    divisor: 220,
    bias: 0.3,
    maximum: 1,
    airBase: 0.035,
    airScale: 0.4,
    moveBase: 0.035,
    moveScale: 0.07,
    standScale: 0.02,
    moveThreshold: 140
  },
  aug: {
    power: 3,
    divisor: 215,
    bias: 0.3,
    maximum: 1,
    airBase: 0.035,
    airScale: 0.4,
    moveBase: 0.035,
    moveScale: 0.07,
    standScale: 0.02,
    moveThreshold: 140
  },
  sg552: {
    power: 3,
    divisor: 220,
    bias: 0.3,
    maximum: 1,
    airBase: 0.035,
    airScale: 0.45,
    moveBase: 0.035,
    moveScale: 0.075,
    standScale: 0.02,
    moveThreshold: 140
  },
  galil: {
    power: 3,
    divisor: 200,
    bias: 0.35,
    maximum: 1.25,
    airBase: 0.04,
    airScale: 0.3,
    moveBase: 0.04,
    moveScale: 0.07,
    standScale: 0.0375,
    moveThreshold: 140
  },
  famas: {
    power: 3,
    divisor: 215,
    bias: 0.3,
    maximum: 1,
    airBase: 0.03,
    airScale: 0.3,
    moveBase: 0.03,
    moveScale: 0.07,
    standScale: 0.02,
    moveThreshold: 140
  },
  mp5: {
    power: 2,
    divisor: 220.1,
    bias: 0.45,
    maximum: 0.75,
    airBase: 0,
    airScale: 0.2,
    moveBase: 0,
    moveScale: 0.04,
    standScale: 0.04,
    moveThreshold: 140
  },
  mac10: {
    power: 3,
    divisor: 200,
    bias: 0.6,
    maximum: 1.65,
    airBase: 0,
    airScale: 0.375,
    moveBase: 0,
    moveScale: 0.03,
    standScale: 0.03,
    moveThreshold: 140
  },
  tmp: {
    power: 3,
    divisor: 200,
    bias: 0.55,
    maximum: 1.4,
    airBase: 0,
    airScale: 0.25,
    moveBase: 0,
    moveScale: 0.03,
    standScale: 0.03,
    moveThreshold: 140
  },
  ump45: {
    power: 2,
    divisor: 210,
    bias: 0.5,
    maximum: 1,
    airBase: 0,
    airScale: 0.24,
    moveBase: 0,
    moveScale: 0.04,
    standScale: 0.04,
    moveThreshold: 140
  },
  p90: {
    power: 2,
    divisor: 175,
    bias: 0.45,
    maximum: 1,
    airBase: 0,
    airScale: 0.3,
    moveBase: 0,
    moveScale: 0.115,
    standScale: 0.045,
    moveThreshold: 170
  },
  m249: {
    power: 3,
    divisor: 175,
    bias: 0.4,
    maximum: 0.9,
    airBase: 0.045,
    airScale: 0.5,
    moveBase: 0.045,
    moveScale: 0.095,
    standScale: 0.03,
    moveThreshold: 140
  }
}
type Kick = readonly [number, number, number, number, number, number, number]
interface RecoilProfile {
  moving: Kick
  airborne: Kick
  crouched: Kick
  standing: Kick
  movingFirst: boolean
}
const RECOIL: Partial<Record<GunId, RecoilProfile>> = {
  ak47: {
    moving: [1.5, 0.45, 0.225, 0.05, 6.5, 2.5, 7.0],
    airborne: [2.0, 1.0, 0.5, 0.35, 9.0, 6.0, 5.0],
    crouched: [0.9, 0.35, 0.15, 0.025, 5.5, 1.5, 9.0],
    standing: [1.0, 0.375, 0.175, 0.0375, 5.75, 1.75, 8.0],
    movingFirst: true
  },
  m4a1: {
    moving: [1.0, 0.45, 0.28, 0.045, 3.75, 3.0, 7.0],
    airborne: [1.2, 0.5, 0.23, 0.15, 5.5, 3.5, 6.0],
    crouched: [0.6, 0.3, 0.2, 0.0125, 3.25, 2.0, 7.0],
    standing: [0.65, 0.35, 0.25, 0.015, 3.5, 2.25, 7.0],
    movingFirst: true
  },
  aug: {
    moving: [1.0, 0.45, 0.275, 0.05, 4.0, 2.5, 7.0],
    airborne: [1.25, 0.45, 0.22, 0.18, 5.5, 4.0, 5.0],
    crouched: [0.575, 0.325, 0.2, 0.011, 3.25, 2.0, 8.0],
    standing: [0.625, 0.375, 0.25, 0.0125, 3.5, 2.25, 8.0],
    movingFirst: true
  },
  sg552: {
    moving: [1.0, 0.45, 0.28, 0.04, 4.25, 2.5, 7.0],
    airborne: [1.25, 0.45, 0.22, 0.18, 6.0, 4.0, 5.0],
    crouched: [0.6, 0.35, 0.2, 0.0125, 3.7, 2.0, 10.0],
    standing: [0.625, 0.375, 0.25, 0.0125, 4.0, 2.25, 9.0],
    movingFirst: true
  },
  galil: {
    moving: [1.0, 0.45, 0.28, 0.045, 3.75, 3.0, 7.0],
    airborne: [1.2, 0.5, 0.23, 0.15, 5.5, 3.5, 6.0],
    crouched: [0.6, 0.3, 0.2, 0.0125, 3.25, 2.0, 7.0],
    standing: [0.65, 0.35, 0.25, 0.015, 3.5, 2.25, 7.0],
    movingFirst: true
  },
  famas: {
    moving: [1.0, 0.45, 0.275, 0.05, 4.0, 2.5, 7.0],
    airborne: [1.25, 0.45, 0.22, 0.18, 5.5, 4.0, 5.0],
    crouched: [0.575, 0.325, 0.2, 0.011, 3.25, 2.0, 8.0],
    standing: [0.625, 0.375, 0.25, 0.0125, 3.5, 2.25, 8.0],
    movingFirst: true
  },
  mp5: {
    moving: [0.5, 0.275, 0.2, 0.03, 3.0, 2.0, 10.0],
    airborne: [0.9, 0.475, 0.35, 0.0425, 5.0, 3.0, 6.0],
    crouched: [0.225, 0.15, 0.1, 0.015, 2.0, 1.0, 10.0],
    standing: [0.25, 0.175, 0.125, 0.02, 2.25, 1.25, 10.0],
    movingFirst: false
  },
  mac10: {
    moving: [0.9, 0.45, 0.25, 0.035, 3.5, 2.75, 7.0],
    airborne: [1.3, 0.55, 0.4, 0.05, 4.75, 3.75, 5.0],
    crouched: [0.75, 0.4, 0.175, 0.03, 2.75, 2.5, 10.0],
    standing: [0.775, 0.425, 0.2, 0.03, 3.0, 2.75, 9.0],
    movingFirst: false
  },
  tmp: {
    moving: [0.8, 0.4, 0.2, 0.03, 3.0, 2.5, 7.0],
    airborne: [1.1, 0.5, 0.35, 0.045, 4.5, 3.5, 6.0],
    crouched: [0.7, 0.35, 0.125, 0.025, 2.5, 2.0, 10.0],
    standing: [0.725, 0.375, 0.15, 0.025, 2.75, 2.25, 9.0],
    movingFirst: false
  },
  ump45: {
    moving: [0.55, 0.3, 0.225, 0.03, 3.5, 2.5, 10.0],
    airborne: [0.125, 0.65, 0.55, 0.0475, 5.5, 4.0, 10.0],
    crouched: [0.25, 0.175, 0.125, 0.02, 2.25, 1.25, 10.0],
    standing: [0.275, 0.2, 0.15, 0.0225, 2.5, 1.5, 10.0],
    movingFirst: false
  },
  p90: {
    moving: [0.45, 0.3, 0.2, 0.0275, 4.0, 2.25, 7.0],
    airborne: [0.9, 0.45, 0.35, 0.04, 5.25, 3.5, 4.0],
    crouched: [0.275, 0.2, 0.125, 0.02, 3.0, 1.0, 9.0],
    standing: [0.3, 0.225, 0.125, 0.02, 3.25, 1.25, 8.0],
    movingFirst: false
  },
  m249: {
    moving: [1.1, 0.5, 0.3, 0.06, 4.0, 3.0, 8.0],
    airborne: [1.8, 0.65, 0.45, 0.125, 5.0, 3.5, 8.0],
    crouched: [0.75, 0.325, 0.25, 0.025, 3.5, 2.5, 9.0],
    standing: [0.8, 0.35, 0.3, 0.03, 3.75, 3.0, 9.0],
    movingFirst: false
  }
}
const PISTOLS: Partial<
  Record<
    GunId,
    { air: number; move: number; crouch: number; stand: number; interval: number; recovery: number; minimum: number }
  >
> = {
  usp: { air: 1.2, move: 0.225, crouch: 0.08, stand: 0.1, interval: 0.3, recovery: 0.275, minimum: 0.6 },
  glock18: { air: 1, move: 0.165, crouch: 0.075, stand: 0.1, interval: 0.325, recovery: 0.275, minimum: 0.6 },
  deagle: { air: 1.5, move: 0.25, crouch: 0.115, stand: 0.13, interval: 0.4, recovery: 0.35, minimum: 0.55 },
  p228: { air: 1.5, move: 0.255, crouch: 0.075, stand: 0.15, interval: 0.325, recovery: 0.3, minimum: 0.6 },
  elite: { air: 1.3, move: 0.175, crouch: 0.08, stand: 0.1, interval: 0.325, recovery: 0.275, minimum: 0.55 },
  fiveseven: { air: 1.5, move: 0.255, crouch: 0.075, stand: 0.15, interval: 0.275, recovery: 0.25, minimum: 0.725 }
}

export function freshGunAccuracy(id: GunId, reload = false): AccuracyState {
  return { ...freshAccuracy(), accuracy: reload && ['aug', 'famas', 'mac10'].includes(id) ? 0 : GUNS[id].accuracy }
}

export function gunSpread(
  state: AccuracyState,
  id: GunId,
  now: number,
  speed: number,
  grounded: boolean,
  mode = 0,
  zoom = 90,
  crouched = false
): number {
  recoverAccuracy(state, now)
  const automatic = AUTOMATIC[id]
  const pistol = PISTOLS[id]
  const units = speed / 0.025
  let spread = 0
  if (automatic) {
    const still = id === 'm4a1' && mode ? 0.025 : automatic.standScale
    spread = !grounded
      ? automatic.airBase + automatic.airScale * state.accuracy
      : units > automatic.moveThreshold
        ? automatic.moveBase + automatic.moveScale * state.accuracy
        : still * state.accuracy
    if (id === 'famas' && !mode) spread += 0.01
    const ratio = (state.shots + 1) ** automatic.power / automatic.divisor
    state.accuracy = Math.min(automatic.maximum, (id === 'mp5' ? ratio : Math.floor(ratio)) + automatic.bias)
  } else if (pistol) {
    let { air, move, crouch, stand } = pistol
    if (id === 'usp' && mode) {
      air = 1.3
      move = 0.25
      crouch = 0.125
      stand = 0.15
    }
    if (id === 'glock18' && mode) {
      air = 1.2
      move = 0.185
      crouch = 0.095
      stand = 0.3
    }
    spread = (!grounded ? air : units > 0.001 ? move : crouched ? crouch : stand) * (1 - state.accuracy)
    if (state.lastFire)
      state.accuracy = Math.max(
        pistol.minimum,
        Math.min(GUNS[id].accuracy, state.accuracy - (pistol.interval - (now - state.lastFire)) * pistol.recovery)
      )
  } else if (id === 'awp') {
    spread =
      (!grounded ? 0.85 : units > 140 ? 0.25 : units > 10 ? 0.1 : crouched ? 0 : 0.001) + (zoom === 90 ? 0.08 : 0)
  } else if (id === 'scout') {
    spread = (!grounded ? 0.2 : units > 170 ? 0.075 : crouched ? 0 : 0.007) + (zoom === 90 ? 0.025 : 0)
  } else if (id === 'g3sg1') {
    state.accuracy = state.lastFire ? Math.min(0.98, (now - state.lastFire) * 0.3 + 0.55) : 0.98
    spread =
      ((!grounded ? 0.45 : units > 0.001 ? 0.15 : crouched ? 0.035 : 0.055) + (zoom === 90 ? 0.025 : 0)) *
      (1 - state.accuracy)
  } else if (id === 'sg550') {
    spread =
      (!grounded
        ? 0.45 * (1 - state.accuracy)
        : units > 0.001
          ? 0.15
          : (crouched ? 0.04 : 0.05) * (1 - state.accuracy)) + (zoom === 90 ? 0.025 : 0)
    if (state.lastFire) state.accuracy = Math.min(0.98, (now - state.lastFire) * 0.35 + 0.65)
  } else if (id === 'm3' || id === 'xm1014') spread = id === 'm3' ? 0.0675 : 0.0725
  state.shots++
  state.lastFire = now
  state.held = true
  return spread
}

export function gunKick(
  state: AccuracyState,
  id: GunId,
  speed: number,
  grounded: boolean,
  random = Math.random,
  crouched = false
) {
  const recoil = RECOIL[id]
  if (!recoil) {
    if (id === 'glock18') return
    if (id === 'g3sg1' || id === 'sg550') {
      state.pitch = state.pitch * 0.75 + 0.75 + random() * (id === 'g3sg1' ? 1 : 0.5)
      state.yaw += random() * 1.5 - 0.75
    } else if (id === 'm3' || id === 'xm1014') {
      const low = grounded ? (id === 'm3' ? 4 : 3) : id === 'm3' ? 8 : 7
      state.pitch += low + Math.floor(random() * (grounded ? 3 : 4))
    } else state.pitch += 2
    return
  }
  const values =
    recoil.movingFirst && speed > 0.001
      ? recoil.moving
      : !grounded
        ? recoil.airborne
        : speed > 0.001
          ? recoil.moving
          : crouched
            ? recoil.crouched
            : recoil.standing
  const [up, side, upStep, sideStep, maxUp, maxSide, change] = values
  const extra = state.shots === 1 ? 0 : state.shots
  state.pitch = Math.min(maxUp, state.pitch + up + extra * upStep)
  state.yaw = Math.max(-maxSide, Math.min(maxSide, state.yaw + (side + extra * sideStep) * (state.right ? 1 : -1)))
  if (Math.floor(random() * (change + 1)) === 0) state.right = !state.right
}
