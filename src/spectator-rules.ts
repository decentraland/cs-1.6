import { isBotAddress, TeamSeat } from './team-rules'

interface Point {
  x: number
  y: number
  z: number
}
export interface SpectatorCandidate extends TeamSeat {
  alive: boolean
}
export interface BotSpectatorCandidate {
  index: number
  alive: boolean
}
export const CHASE_DISTANCE = 112 * 0.025
export const SPECTATOR_SWITCH_DELAY = 0.25
export const DEATH_TRANSITION_SECONDS = 3
export const DEATH_ROLL_DEGREES = 80
const DEATH_FALL_SECONDS = 0.6
const STANDING_EYE_HEIGHT = 1.6
const DEAD_EYE_HEIGHT = 28 * 0.025

export class SpectatorMenuState {
  open = false
  private captured = false

  update(spectator: boolean, captured: boolean) {
    if (!spectator) this.open = false
    else if (this.captured && !captured) this.open = true
    this.captured = spectator && captured
  }

  close() {
    this.open = false
  }
}

export class SpectatorCycleInput {
  private armed = false
  private nextSwitch = 0
  constructor(private readonly delay = SPECTATOR_SWITCH_DELAY) {}

  step(enabled: boolean, held: boolean, pressed: boolean, reverse: boolean, now: number): number {
    if (!enabled) {
      this.armed = false
      return 0
    }
    if (!held) {
      this.armed = true
      return 0
    }
    if (!this.armed || !pressed || now < this.nextSwitch) return 0
    this.armed = false
    this.nextSwitch = now + this.delay
    return reverse ? -1 : 1
  }

  reset() {
    this.armed = false
    this.nextSwitch = 0
  }
}

export function spectatorTargets(
  candidates: readonly SpectatorCandidate[],
  address: string,
  team: number,
  round: number
): string[] {
  return candidates
    .filter(
      (candidate) =>
        candidate.address !== address &&
        (team === 0 ? candidate.team === 1 || candidate.team === 2 : candidate.team === team) &&
        candidate.connected &&
        candidate.eligibleRound <= round &&
        candidate.alive
    )
    .map((candidate) => candidate.address)
}

export function botSpectatorTargets(candidates: readonly BotSpectatorCandidate[]): string[] {
  return candidates
    .filter((candidate) => candidate.alive)
    .sort((a, b) => a.index - b.index)
    .map((candidate) => `bot:${candidate.index}`)
}

export function matchSpectatorTargets(
  candidates: readonly SpectatorCandidate[],
  address: string,
  team: number,
  round: number
): string[] {
  const teammates = spectatorTargets(candidates, address, team, round)
  if (teammates.length || team === 0) return teammates
  return spectatorTargets(
    candidates.filter((candidate) => isBotAddress(candidate.address)),
    address,
    0,
    round
  )
}

export function selectSpectatorTarget(
  targets: readonly string[],
  current: string | undefined,
  step = 0
): string | undefined {
  if (!targets.length) return undefined
  const index = current === undefined ? -1 : targets.indexOf(current)
  if (index < 0) return targets[step < 0 ? targets.length - 1 : 0]
  return targets[(index + step + targets.length) % targets.length]
}

export function chasePosition(
  anchor: Point,
  direction: Point,
  distanceToWall: (origin: Point, direction: Point, limit: number) => number
): Point {
  const eye = { x: anchor.x, y: anchor.y + 1.6, z: anchor.z }
  const backwards = { x: -direction.x, y: -direction.y, z: -direction.z }
  const distance = Math.max(0, Math.min(CHASE_DISTANCE, distanceToWall(eye, backwards, CHASE_DISTANCE + 0.15) - 0.15))
  return { x: eye.x + backwards.x * distance, y: eye.y + backwards.y * distance, z: eye.z + backwards.z * distance }
}

export function deathCameraPose(feet: Point, elapsed: number): { position: Point; roll: number; complete: boolean } {
  const progress = Math.max(0, Math.min(1, elapsed / DEATH_FALL_SECONDS))
  const eased = progress * progress * (3 - 2 * progress)
  return {
    position: {
      x: feet.x,
      y: feet.y + STANDING_EYE_HEIGHT + (DEAD_EYE_HEIGHT - STANDING_EYE_HEIGHT) * eased,
      z: feet.z
    },
    roll: DEATH_ROLL_DEGREES * eased,
    complete: elapsed >= DEATH_TRANSITION_SECONDS
  }
}
