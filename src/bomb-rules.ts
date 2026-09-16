import { touchesWeaponBox } from './weapon-box-rules'

export interface BombPoint {
  x: number
  y: number
  z: number
}
export interface BombState {
  phase: string
  carrier: string
  planter: string
  defuser: string
  site: string
  position: BombPoint
  settled: boolean
  yaw: number
  actionStarted: number
  actionEnds: number
  readyAt: number
  explodeAt: number
  progress: number
  round: number
}
export interface BombPlayer {
  address: string
  team: number
  alive: boolean
  position: BombPoint
  grounded: boolean
  holding: boolean
  selected: boolean
  canDefuse: boolean
  hasKit: boolean
  canPickup?: boolean
  direction?: BombPoint
}
export const C4_DEPLOY_SECONDS = 0.75
export const C4_DROP_AT = 2.25
export const C4_SPEED = 6.25
export const C4_BLAST_RADIUS = 43.75
export const PLANT_SECONDS = 3
export const BOMB_SECONDS = 45
export const DEFUSE_SECONDS = 10
export const KIT_DEFUSE_SECONDS = 5
export const BOMB_USE_TIMEOUT = 0.35
export const C4_OBJECTIVE_FRAGS = 3
export type BombEvent = 'planted' | 'defused' | 'exploded'
export interface BombFragAward {
  address: string
  frags: number
}
const distance = (a: BombPoint, b: BombPoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

export function freshBomb(round: number, carrier = '', position: BombPoint = { x: 0, y: 0, z: 0 }): BombState {
  return {
    phase: carrier ? 'carried' : 'none',
    carrier,
    planter: '',
    defuser: '',
    site: '',
    position: { ...position },
    settled: false,
    yaw: 0,
    actionStarted: 0,
    actionEnds: 0,
    explodeAt: 0,
    readyAt: 0,
    progress: 0,
    round
  }
}

function cancelAction(state: BombState) {
  if (state.phase === 'planting') state.phase = 'carried'
  state.defuser = ''
  state.actionStarted = 0
  state.actionEnds = 0
  state.progress = 0
}

export function cancelBombPlant(state: BombState, now: number, delay = 1) {
  if (state.phase !== 'planting') return
  cancelAction(state)
  state.readyAt = now + delay
}

export function dropBomb(state: BombState, address: string, position: BombPoint): boolean {
  if (state.carrier !== address || (state.phase !== 'carried' && state.phase !== 'planting')) return false
  cancelAction(state)
  state.phase = 'dropped'
  state.carrier = ''
  state.position = { ...position }
  state.settled = false
  state.site = ''
  return true
}

export function stepBomb(
  state: BombState,
  players: readonly BombPlayer[],
  now: number,
  live: boolean,
  siteAt: (p: BombPoint) => string
): BombEvent | undefined {
  if (!live) cancelAction(state)
  const carrier = players.find((player) => player.address === state.carrier)
  if (state.phase === 'carried' || state.phase === 'planting') {
    if (!carrier?.alive || carrier.team !== 1) dropBomb(state, state.carrier, carrier?.position ?? state.position)
  }
  if (state.phase === 'dropped') {
    if (!state.settled) return
    const player = players
      .filter(
        (player) =>
          player.alive &&
          player.canPickup !== false &&
          player.team === 1 &&
          touchesWeaponBox(player.position, state.position)
      )
      .sort(
        (a, b) =>
          distance(a.position, state.position) - distance(b.position, state.position) ||
          a.address.localeCompare(b.address)
      )[0]
    if (player) {
      state.phase = 'carried'
      state.readyAt = 0
      state.carrier = player.address
      state.position = { ...player.position }
      state.settled = false
    }
    return
  }
  if (!live) return
  if (state.phase === 'carried' && carrier) {
    state.position = { ...carrier.position }
    const site = siteAt(carrier.position)
    if (carrier.selected && carrier.holding && now >= state.readyAt) {
      if (!carrier.grounded || !site) {
        state.readyAt = now + 1
        return
      }
      state.phase = 'planting'
      if (carrier.direction) state.yaw = Math.atan2(carrier.direction.x, carrier.direction.z)
      state.site = site
      state.actionStarted = now
      state.actionEnds = now + PLANT_SECONDS
    }
    return
  }
  if (state.phase === 'planting' && carrier) {
    if (
      !carrier.holding ||
      !carrier.selected ||
      !carrier.grounded ||
      siteAt(carrier.position) !== state.site ||
      distance(carrier.position, state.position) > 0.3
    ) {
      cancelBombPlant(state, now, !carrier.holding || !carrier.selected ? 1 : 1.5)
      return
    }
    state.progress = Math.min(1, (now - state.actionStarted) / PLANT_SECONDS)
    if (now >= state.actionEnds) {
      state.phase = 'planted'
      state.planter = carrier.address
      state.carrier = ''
      state.explodeAt = now + BOMB_SECONDS
      state.actionStarted = 0
      state.actionEnds = 0
      state.progress = 0
      return 'planted'
    }
    return
  }
  if (state.phase !== 'planted') return
  let defuser = players.find((player) => player.address === state.defuser)
  if (
    defuser &&
    (!defuser.alive || defuser.team !== 2 || !defuser.holding || !defuser.grounded || !defuser.canDefuse)
  ) {
    cancelAction(state)
    defuser = undefined
  }
  if (state.defuser && !defuser) cancelAction(state)
  if (defuser && now >= state.actionEnds && state.actionEnds < state.explodeAt) {
    state.phase = 'defused'
    state.progress = 1
    return 'defused'
  }
  if (now >= state.explodeAt) {
    cancelAction(state)
    state.phase = 'exploded'
    return 'exploded'
  }
  if (!defuser) {
    defuser = players.find(
      (player) => player.alive && player.team === 2 && player.holding && player.grounded && player.canDefuse
    )
    if (defuser) {
      state.defuser = defuser.address
      state.actionStarted = now
      state.actionEnds = now + (defuser.hasKit ? KIT_DEFUSE_SECONDS : DEFUSE_SECONDS)
    }
  }
  if (defuser) state.progress = Math.min(1, (now - state.actionStarted) / (state.actionEnds - state.actionStarted))
}

export function bombFragAward(state: BombState, event: BombEvent | undefined): BombFragAward | undefined {
  const address = event === 'defused' ? state.defuser : event === 'exploded' ? state.planter : ''
  return address ? { address, frags: C4_OBJECTIVE_FRAGS } : undefined
}

export function bombBlastDamage(distanceMetres: number): number {
  return Math.max(0, 500 * (1 - distanceMetres / C4_BLAST_RADIUS))
}

export function canDefuseBomb(feet: BombPoint, bomb: BombPoint, aim: BombPoint, team = 2): boolean {
  if (team !== 2) return false
  if (Math.hypot(feet.x - bomb.x, feet.y + 0.96 - bomb.y, feet.z - bomb.z) > 64 * 0.025) return false
  const x = bomb.x - feet.x,
    y = bomb.y - (feet.y + 1.6),
    z = bomb.z - feet.z
  const length = Math.hypot(x, y, z)
  return length > 0 && (x * aim.x + y * aim.y + z * aim.z) / length > 0.7
}

export function bombBeepWave(elapsed: number): number {
  let at = 0,
    interval = Math.floor(BOMB_SECONDS / 4),
    wave = 1
  while (wave < 5 && elapsed >= at + interval) {
    at += interval
    interval *= 0.9
    wave++
  }
  return wave
}
