import { engine, inputSystem, InputAction, PointerEventType, Transform } from '@dcl/sdk/ecs'
import { myProfile } from '@dcl/sdk/network'
import { Bot, Dead, MatchLeaderboard, PlayerAddress, PlayerHealth, PlayerPose } from './components'
import { getLocalPlayerEntity } from './client'
import { getPractice } from './practice'
import { hasAimControl } from './platform'
import { setSpectatorView } from './fps-camera'
import { botAddress } from './team-rules'
import {
  botSpectatorTargets,
  DEATH_TRANSITION_SECONDS,
  selectSpectatorTarget,
  spectatorTargets,
  SPECTATOR_SWITCH_DELAY
} from './spectator-rules'

let active = false
let target: string | undefined
let nextSwitch = 0
let deathStartedAt = 0
let deathAnchor: { x: number; y: number; z: number } | undefined
let deathRound = 0
let targetDetails = new Map<
  string,
  { address: string; name: string; health: number; position: { x: number; y: number; z: number } }
>()
export function isSpectating() {
  return active
}
export function isDeathTransitioning() {
  return active && Date.now() / 1000 - deathStartedAt < DEATH_TRANSITION_SECONDS
}
export function getSpectatorTarget() {
  return !active || isDeathTransitioning() || !target ? undefined : targetDetails.get(target)
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
    !['ready', 'waiting'].includes(match.phase) &&
    !match.matchOver
  if (!active || !match) {
    target = undefined
    nextSwitch = 0
    deathStartedAt = 0
    deathAnchor = undefined
    deathRound = 0
    targetDetails = new Map()
    setSpectatorView(false, undefined, match?.round ?? 0)
    return
  }
  const now = Date.now() / 1000
  if (!wasActive || deathRound !== match.round) {
    deathStartedAt = voluntary ? now - DEATH_TRANSITION_SECONDS : now
    deathAnchor = voluntary ? undefined : { ...Transform.get(engine.PlayerEntity).position }
    deathRound = match.round
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
  let eligible = spectatorTargets(
    match.roster.map((candidate) => ({
      ...candidate,
      alive: health.get(candidate.address)?.alive === true && positions.has(candidate.address)
    })),
    address,
    seat?.team ?? 0,
    match.round
  )
  for (const key of eligible) {
    const position = positions.get(key)
    if (position)
      targetDetails.set(key, {
        address: key,
        name: names.get(key) ?? key.slice(0, 10) + '...',
        health: health.get(key)?.current ?? 0,
        position
      })
  }
  // With no living human teammate left, chase the bots (either side) so a lone human keeps a view.
  if (eligible.length === 0) {
    const bots = Array.from(engine.getEntitiesWith(Bot, Transform)).map(([, bot, transform]) => ({ bot, transform }))
    eligible = botSpectatorTargets(bots.map(({ bot }) => ({ index: bot.index, alive: bot.alive && bot.health > 0 })))
    for (const { bot, transform } of bots) {
      const key = botAddress(bot.index)
      if (bot.alive && bot.health > 0)
        targetDetails.set(key, {
          address: key,
          name: `BOT ${bot.name}`,
          health: bot.health,
          position: transform.position
        })
    }
  }
  const cycling =
    !isDeathTransitioning() &&
    hasAimControl() &&
    inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN) &&
    now >= nextSwitch
  const step = cycling ? (inputSystem.isPressed(InputAction.IA_MODIFIER) ? -1 : 1) : 0
  target = selectSpectatorTarget(eligible, target, step)
  if (cycling) nextSwitch = now + SPECTATOR_SWITCH_DELAY
  setSpectatorView(
    true,
    target ? targetDetails.get(target)?.position : undefined,
    match.round,
    deathAnchor ? { anchor: deathAnchor, startedAt: deathStartedAt } : undefined
  )
}
