import { engine, inputSystem, InputAction, PointerEventType, Transform } from '@dcl/sdk/ecs'
import { myProfile } from '@dcl/sdk/network'
import { Bot, Dead, MatchLeaderboard, PlayerAddress, PlayerHealth, PlayerPose } from './components'
import { getLocalPlayerEntity } from './client'
import { getPractice } from './practice'
import { hasAimControl, isTouchPlatform } from './platform'
import { setSpectatorView } from './fps-camera'
import { botAddress } from './team-rules'
import { isTeamMenuOpen } from './menu-state'
import { ObserverModes, ObserverMode, OBSERVER_MODE_DELAY } from './observer-roaming'
import {
  DEATH_TRANSITION_SECONDS,
  selectSpectatorTarget,
  matchSpectatorTargets,
  SpectatorCycleInput
} from './spectator-rules'

let active = false
let target: string | undefined
const cycleInput = new SpectatorCycleInput()
const modeInput = new SpectatorCycleInput(OBSERVER_MODE_DELAY)
const modes = new ObserverModes()
let mode: ObserverMode = 'chase'
let deathStartedAt = 0
let deathAnchor: { x: number; y: number; z: number } | undefined
let deathRound = 0
let targetDetails = new Map<
  string,
  { address: string; name: string; team: number; health: number; position: { x: number; y: number; z: number } }
>()
export function isSpectating() {
  return active
}
export function isDeathTransitioning() {
  return active && Date.now() / 1000 - deathStartedAt < DEATH_TRANSITION_SECONDS
}
export function getSpectatorTarget() {
  return !active || mode === 'roaming' || isDeathTransitioning() || !target ? undefined : targetDetails.get(target)
}
export function getObserverMode() {
  return mode
}

export function spectatorSystem() {
  const match = getPractice(),
    player = getLocalPlayerEntity(),
    address = myProfile.userId?.toLowerCase() ?? ''
  const seat = match?.roster.find((seat) => seat.address === address && seat.connected)
  const canObserve = !!seat
  // Spectators and players benched until the next round never died this round, so no death fall.
  const voluntary = seat === undefined || seat.team === 0 || seat.eligibleRound > (match?.round ?? 0)
  // Everyone eligible for the round is alive during freeze: a synced Dead there is the previous
  // round's, still in flight behind the spawn message, and must not re-enter the spectator camera.
  const staleDeath =
    !!match && !!seat && match.phase === 'freeze' && seat.team !== 0 && seat.eligibleRound <= match.round
  const wasActive = active
  active =
    !!match &&
    canObserve &&
    player !== null &&
    Dead.has(player) &&
    !staleDeath &&
    (seat?.team === 0 || !['ready', 'waiting'].includes(match.phase)) &&
    !match.matchOver
  if (!active || !match) {
    target = undefined
    cycleInput.reset()
    modeInput.reset()
    modes.reset()
    mode = 'chase'
    deathStartedAt = 0
    deathAnchor = undefined
    deathRound = 0
    targetDetails = new Map()
    setSpectatorView(false, undefined, match?.round ?? 0)
    return
  }
  const now = Date.now() / 1000
  if (!wasActive || deathRound !== match.round) {
    cycleInput.reset()
    modeInput.reset()
    deathStartedAt = voluntary ? now - DEATH_TRANSITION_SECONDS : now
    deathAnchor = voluntary ? undefined : { ...Transform.get(engine.PlayerEntity).position }
    deathRound = match.round
  }
  if (voluntary && deathAnchor) {
    deathStartedAt = now - DEATH_TRANSITION_SECONDS
    deathAnchor = undefined
  }
  const health = new Map(
    Array.from(engine.getEntitiesWith(PlayerAddress, PlayerHealth)).map(([entity, identity, value]) => [
      identity.address,
      { alive: !Dead.has(entity) && value.current > 0, current: value.current }
    ])
  )
  const positions = new Map(
    Array.from(engine.getEntitiesWith(PlayerAddress, PlayerPose))
      .filter(([, , pose]) => pose.valid)
      .map(([, identity, pose]) => [identity.address, pose.position])
  )
  const names = new Map(
    Array.from(engine.getEntitiesWith(MatchLeaderboard))
      .flatMap(([, board]) => board.players)
      .map((player) => [player.address, player.name])
  )
  targetDetails = new Map()
  const bots = new Map(
    Array.from(engine.getEntitiesWith(Bot, Transform)).map(([, bot, transform]) => [
      botAddress(bot.index),
      { bot, transform }
    ])
  )
  const eligible = matchSpectatorTargets(
    match.roster.map((candidate) => ({
      ...candidate,
      alive: bots.has(candidate.address)
        ? bots.get(candidate.address)!.bot.alive && bots.get(candidate.address)!.bot.health > 0
        : health.get(candidate.address)?.alive === true && positions.has(candidate.address)
    })),
    address,
    seat?.team ?? 0,
    match.round
  )
  for (const key of eligible) {
    const bot = bots.get(key)
    if (bot) {
      targetDetails.set(key, {
        address: key,
        name: `BOT ${bot.bot.name}`,
        team: bot.bot.team,
        health: bot.bot.health,
        position: bot.transform.position
      })
      continue
    }
    const position = positions.get(key)
    if (position)
      targetDetails.set(key, {
        address: key,
        name: names.get(key) ?? key.slice(0, 10) + '...',
        team: match.roster.find((candidate) => candidate.address === key)?.team ?? 0,
        health: health.get(key)?.current ?? 0,
        position
      })
  }
  const controls = !isDeathTransitioning() && hasAimControl() && !isTeamMenuOpen()
  const step = cycleInput.step(
    controls,
    inputSystem.isPressed(InputAction.IA_POINTER),
    inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN),
    inputSystem.isPressed(InputAction.IA_MODIFIER),
    now
  )
  target = selectSpectatorTarget(eligible, target, step)
  const toggle = modeInput.step(
    controls,
    inputSystem.isPressed(InputAction.IA_JUMP),
    inputSystem.isTriggered(InputAction.IA_JUMP, PointerEventType.PET_DOWN),
    false,
    now
  )
  mode = modes.update(seat?.team === 0 && !isTouchPlatform(), !!target, toggle !== 0)
  setSpectatorView(
    true,
    target ? targetDetails.get(target)?.position : undefined,
    match.round,
    deathAnchor ? { anchor: deathAnchor, startedAt: deathStartedAt } : undefined,
    { mode, moving: controls, jumpToTarget: step !== 0 }
  )
}
