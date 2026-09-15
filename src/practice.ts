import { AvatarShape, engine, Entity, Transform, MeshCollider, PlayerIdentityData, ColliderLayer } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'
import {
  Bot,
  Practice,
  PlayerHealth,
  PlayerEquipment,
  Weapon,
  PlayerAddress,
  PlayerPose,
  Dead,
  PlayerTeam,
  Team
} from './components'
import { room } from './index'
import { mapDistance } from './world-query'
import { applyPlayerDamage, recordPracticeStats, resetPlayerAccuracy, matchStats } from './server'
import { initializeInventory, spawnInventory } from './inventory'
import { finishRound } from './round-rules'
import { creditPlayer, initializeEconomy, resetEconomy, settleRoundEconomy, payRoundReward } from './economy'
import {
  admitSpectator,
  admitToTeam,
  botFillTeam,
  botIndex,
  botTeam,
  BOT_NAMES,
  fillBots,
  hasBothTeams,
  inTeamRound,
  isBotAddress,
  isLobbyPhase,
  refillBots,
  teamRoundWinner,
  PLAYER_TIMEOUT
} from './team-rules'
import type { PlayingTeam, TeamSeat } from './team-rules'
import { initializeBomb, isBombBusy, resetBomb, tickBomb, getBomb } from './bomb'
import { teamSpawn } from './team-spawns'
import { BOT_HIT_REGIONS, PLAYER_HIT_REGIONS, ShotTarget } from './ballistics'
import { BotNavigation, createBotNavigation, moveBot } from './bot-navigation'
import { dust2Navigation, navDistance, navPoint, nearestNavNode, nearestNavNodeBelow } from './navigation'
import { dust2Hotspots } from './bot-behavior'
import type { NavPoint } from './navigation'
import { GUNS } from './weapon-profiles'
import { BotCombat, botShot, createBotCombat, BOT_EYE_HEIGHT } from './bot-combat'
import { DEFAULT_BOT_DIFFICULTY, parseBotDifficulty } from './bot-difficulty'
import { KILL_REWARD } from './economy-rules'
import { botAddress, soloBombCarrier, soloBombObjectives } from './bot-objective'
import { bombFragAward } from './bomb-rules'
import type { BombEvent, BombPlayer } from './bomb-rules'
import { bombSiteAt } from './bomb-sites'
import { newRoundSeed, shotRandom } from './shared-random'
import { recordSample } from './hit-claims'
import type { PositionSample } from './hit-claims'
export { isBotAddress } from './team-rules'

export interface Attacker {
  address: string
  name: string
  weapon: string
  team: number
}
interface Enemy {
  entity: Entity
  position: Vector3
}
const ROUND_SECONDS = 120
const FREEZE_SECONDS = 3
const RESULT_SECONDS = 5
const BOT_SIGHT = 28
const BOT_DEFUSE_REACH = 1.2
const BOT_DEFUSE_HEIGHT = 1.6
// Bots relay a spotted enemy to teammates within this walking distance.
const BOT_CALLOUT = 40
const BOT_TICK = 1 / 60

let roundEntity: Entity
let roundStarted = 0
// Shared spread seed for the round; clients receive it on spawn (see shared-random.ts).
let roundSeed = 0
const lastSpawns = new Map<string, { position: Vector3; yaw: number }>()
// Team a player last chose, so a heartbeat timeout (tab in background) does not send them back to the menu.
const rememberedTeams = new Map<string, number>()
let lastBotTick = 0
let endedAt = 0
const lastSeen = new Map<string, number>()
const botEntities: Entity[] = []
const botWeapons = new Map<Entity, BotCombat>()
const botSpeeds = new Map<Entity, number>()
const botNavigation = new Map<Entity, BotNavigation>()
const botHistory = new Map<Entity, PositionSample[]>()
const botSees = new Map<Entity, boolean>()
const baseAvatar = 'urn:decentraland:off-chain:base-avatars:'
const botWearables = [
  ['eyes_00', 'eyebrows_00', 'mouth_00', 'curtained_hair', 'safari_shirt', 'safari_pants', 'classic_shoes'],
  ['eyes_02', 'eyebrows_02', 'mouth_03', 'short_hair', 'green_hoodie', 'brown_pants', 'sneakers'],
  ['eyes_05', 'eyebrows_04', 'mouth_01', 'semi_bold', 'black_jacket', 'grey_joggers', 'sport_black_shoes']
].map((wearables) => wearables.map((wearable) => `${baseAvatar}${wearable}`))

// Re-sends the match state to every client (getMutable bumps the CRDT timestamp).
export function touchMatchState() {
  Practice.getMutable(roundEntity)
}

// A client that was suspended through a round start never saw its practiceSpawn message.
export function resendSpawn(address: string) {
  const state = Practice.get(roundEntity)
  const spawn = lastSpawns.get(address)
  const player = playerEntity(address)
  if (!spawn || player === undefined || !inTeamRound(state, address) || Dead.has(player)) return
  if (!['freeze', 'live'].includes(state.phase)) return
  room.send('practiceSpawn', {
    playerAddress: address,
    round: state.round,
    position: spawn.position,
    yaw: spawn.yaw,
    seed: roundSeed
  })
}

export function getRoundSeed() {
  return roundSeed
}

export function roundElapsed() {
  return Date.now() / 1000 - roundStarted
}

export function getPractice() {
  for (const [, state] of engine.getEntitiesWith(Practice)) return state
  return undefined
}

export function canPlayRound(address: string): boolean {
  const state = getPractice()
  return !!state && inTeamRound(state, address)
}

export function playerHeartbeat(address: string) {
  lastSeen.set(address, Date.now() / 1000)
}

export function playerPosition(address: string): Vector3 | undefined {
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (identity.address.toLowerCase() === address) return Transform.getOrNull(entity)?.position
  }
  return undefined
}

export function displayName(address: string): string {
  const bot = botEntity(address)
  if (bot !== undefined) return botDisplayName(Bot.get(bot).name)
  return matchStats.get(address)?.name ?? address
}

function botDisplayName(name: string) {
  return `BOT ${name}`
}

function playerEntity(address: string): Entity | undefined {
  for (const [entity, player] of engine.getEntitiesWith(PlayerAddress)) {
    if (player.address === address) return entity
  }
  return undefined
}

function botEntity(address: string): Entity | undefined {
  if (!isBotAddress(address)) return undefined
  return botEntities.find((entity) => Bot.get(entity).index === botIndex(address))
}

function isAlive(address: string): boolean {
  const bot = botEntity(address)
  if (bot !== undefined) return Bot.get(bot).alive
  const entity = playerEntity(address)
  return entity !== undefined && !Dead.has(entity) && PlayerHealth.get(entity).current > 0
}

function freshMatch() {
  return {
    roster: [],
    phase: 'ready',
    remaining: 0,
    timeLeft: 0,
    round: 0,
    ctScore: 0,
    tScore: 0,
    maxWins: 16,
    matchOver: false,
    botKills: [0, 0, 0],
    botDeaths: [0, 0, 0],
    botDifficulty: DEFAULT_BOT_DIFFICULTY
  }
}

export function initializePractice() {
  Practice.validateBeforeChange((v) => v.senderAddress === AUTH_SERVER_PEER_ID)
  Bot.validateBeforeChange((v) => v.senderAddress === AUTH_SERVER_PEER_ID)
  roundEntity = engine.addEntity()
  Practice.create(roundEntity, freshMatch())
  syncEntity(roundEntity, [Practice.componentId])
  initializeBomb()
  initializeEconomy()
  initializeInventory()
  room.onMessage('teamJoin', (data, context) => {
    if (context) joinTeam(context.from.toLowerCase(), data.team)
  })
  room.onMessage('teamSpectate', (_data, context) => {
    if (context) joinSpectators(context.from.toLowerCase())
  })
  room.onMessage('botDifficulty', (data, context) => {
    const level = parseBotDifficulty(data.level)
    if (!context || level !== data.level || Practice.get(roundEntity).botDifficulty === level) return
    Practice.getMutable(roundEntity).botDifficulty = level
  })
  room.onMessage('teamLeave', (_data, context) => {
    if (!context) return
    rememberedTeams.delete(context.from.toLowerCase())
    disconnectPlayer(context.from.toLowerCase())
  })
  room.onMessage('teamRestart', (_data, context) => {
    const match = Practice.get(roundEntity)
    if (
      !context ||
      !match.matchOver ||
      !match.roster.some(
        (seat) => seat.connected && (seat.team === 1 || seat.team === 2) && seat.address === context.from.toLowerCase()
      )
    )
      return
    resetEconomy()
    clearBots()
    const state = Practice.getMutable(roundEntity)
    state.ctScore = 0
    state.tScore = 0
    state.round = 0
    state.matchOver = false
    state.phase = 'waiting'
    state.remaining = 0
    state.botKills = [0, 0, 0]
    state.botDeaths = [0, 0, 0]
    for (const seat of state.roster) {
      seat.eligibleRound = 1
      recordPracticeStats(seat.address, 0, 0, true)
    }
    fillBots(state, state.round)
    if (hasBothTeams(state)) startTeamRound()
  })
  engine.addSystem(practiceSystem)
}

function benchPlayer(entity: Entity) {
  PlayerHealth.getMutable(entity).current = 0
  Dead.createOrReplace(entity, { deathTime: Date.now() / 1000, respawnTime: 0 })
}

function joinTeam(address: string, team: number) {
  const player = playerEntity(address)
  if (player === undefined) return
  const alreadyJoined = Practice.get(roundEntity).roster.some(
    (seat) => seat.address === address && seat.connected && seat.team === team
  )
  const state = Practice.getMutable(roundEntity)
  const error = admitToTeam(state, address, team)
  if (error) {
    room.send('matchNotice', { address, message: error })
    return
  }
  rememberedTeams.set(address, team)
  if (alreadyJoined) return
  lastSeen.set(address, Date.now() / 1000)
  PlayerTeam.getMutable(player).team = team
  benchPlayer(player)
  fillBots(state, state.round)
  if (isLobbyPhase(state.phase) && hasBothTeams(state)) startTeamRound()
}

function joinSpectators(address: string) {
  const player = playerEntity(address)
  if (player === undefined) return
  const previous = Practice.get(roundEntity).roster.find((seat) => seat.address === address)
  const wasPlaying = previous?.connected && (previous.team === 1 || previous.team === 2)
  const state = Practice.getMutable(roundEntity)
  if (!admitSpectator(state, address)) return
  rememberedTeams.set(address, Team.NONE)
  if (wasPlaying && state.phase === 'live' && PlayerHealth.get(player).current > 0) recordPracticeStats(address, 0, 1)
  lastSeen.set(address, Date.now() / 1000)
  PlayerTeam.getMutable(player).team = Team.NONE
  benchPlayer(player)
  fillBots(state, state.round)
  if (state.phase === 'freeze' || state.phase === 'live')
    room.send('spectatorStart', { playerAddress: address, round: state.round })
}

// A player whose seat timed out (or whose match was reset while away) gets their last team back on return.
export function rejoinPlayer(address: string) {
  const seated = Practice.get(roundEntity).roster.some((seat) => seat.address === address && seat.connected)
  if (seated) return
  const team = rememberedTeams.get(address)
  if (team === undefined) return
  if (team === Team.NONE) joinSpectators(address)
  else joinTeam(address, team)
}

function disconnectPlayer(address: string) {
  const index = Practice.get(roundEntity).roster.findIndex((seat) => seat.address === address)
  if (index < 0 || !Practice.get(roundEntity).roster[index].connected) return
  const state = Practice.getMutable(roundEntity)
  state.roster[index].connected = false
  const entity = playerEntity(address)
  if (entity !== undefined) {
    if (state.phase === 'live' && PlayerHealth.get(entity).current > 0) recordPracticeStats(address, 0, 1)
    benchPlayer(entity)
    PlayerTeam.getMutable(entity).team = Team.NONE
  }
  fillBots(state, state.round)
}

function resetMatch() {
  clearBots()
  resetBomb(0)
  resetEconomy()
  for (const [, identity] of engine.getEntitiesWith(PlayerAddress)) recordPracticeStats(identity.address, 0, 0, true)
  Practice.createOrReplace(roundEntity, freshMatch())
}

// --- rounds ---

function enterWaiting(state: { phase: string; timeLeft: number; remaining: number }) {
  clearBots()
  resetBomb(0)
  state.phase = 'waiting'
  state.timeLeft = 0
  state.remaining = 0
}

function startTeamRound() {
  const state = Practice.getMutable(roundEntity)
  refillBots(state, state.round + 1)
  if (!hasBothTeams(state)) {
    enterWaiting(state)
    return
  }
  state.round++
  state.phase = 'freeze'
  state.timeLeft = FREEZE_SECONDS
  roundSeed = newRoundSeed()
  roundStarted = Date.now() / 1000
  const slots = { 1: 0, 2: 0 }
  for (const seat of state.roster) {
    if (!seat.connected || (seat.team !== 1 && seat.team !== 2) || isBotAddress(seat.address)) continue
    const player = playerEntity(seat.address)
    if (player === undefined) continue
    const spawn = teamSpawn(seat.team, slots[seat.team]++)
    seat.eligibleRound = state.round
    const health = PlayerHealth.getMutable(player)
    payRoundReward(seat.address)
    const respawning = Dead.has(player)
    health.current = health.max
    if (respawning) {
      health.armor = 0
      PlayerEquipment.createOrReplace(player, { bombSelected: false, defuseKit: false, helmet: false })
      spawnInventory(player, seat.team)
    } else {
      Weapon.getMutable(player).isReloading = false
    }
    Dead.deleteFrom(player)
    PlayerTeam.getMutable(player).team = seat.team
    PlayerPose.createOrReplace(player, { position: spawn.position, valid: true })
    resetPlayerAccuracy(seat.address, true)
    lastSpawns.set(seat.address, { position: spawn.position, yaw: spawn.yaw })
    room.send('practiceSpawn', {
      playerAddress: seat.address,
      round: state.round,
      position: spawn.position,
      yaw: spawn.yaw,
      seed: roundSeed
    })
  }
  for (const seat of state.roster) {
    if (seat.connected && seat.team === 0)
      room.send('spectatorStart', { playerAddress: seat.address, round: state.round })
  }
  spawnBots(state.roster, slots)
  state.remaining = botEntities.length
  const terrorists = state.roster.filter((seat) => seat.connected && seat.team === 1 && !isBotAddress(seat.address))
  const carrier =
    terrorists.length > 0
      ? terrorists[(state.round - 1) % terrorists.length].address
      : soloBombCarrier(
          botsOfTeam(1).map((entity) => Bot.get(entity).index),
          state.round
        )
  const carrierBot = botEntity(carrier)
  resetBomb(state.round, carrier, carrierBot === undefined ? undefined : botNavigation.get(carrierBot)?.position)
}

function endRound(winner: 'ct' | 't' | 'draw') {
  const timeout =
    Practice.get(roundEntity).timeLeft <= 0 && !['planted', 'defused', 'exploded'].includes(getBomb()?.phase ?? '')
  if (finishRound(Practice.getMutable(roundEntity), winner)) {
    endedAt = Date.now() / 1000
    settleRoundEconomy(winner, getBomb()?.phase ?? '', timeout)
  }
}

function recordBombFrags(event: BombEvent | undefined) {
  const bomb = getBomb()
  if (!bomb) return
  const award = bombFragAward(bomb, event)
  if (!award) return
  const bot = botEntity(award.address)
  if (bot !== undefined) Practice.getMutable(roundEntity).botKills[Bot.get(bot).index] += award.frags
  else recordPracticeStats(award.address, award.frags, 0)
}

function practiceSystem() {
  const now = Date.now() / 1000
  const state = Practice.get(roundEntity)
  for (const seat of state.roster) {
    if (seat.connected && !isBotAddress(seat.address) && now - (lastSeen.get(seat.address) ?? 0) > PLAYER_TIMEOUT)
      disconnectPlayer(seat.address)
  }
  if (!state.roster.some((seat) => seat.connected && !isBotAddress(seat.address))) {
    if (state.phase !== 'ready') resetMatch()
    return
  }
  if (isLobbyPhase(state.phase)) {
    if (botFillTeam(state) !== botTeam(state)) fillBots(Practice.getMutable(roundEntity), state.round)
    if (hasBothTeams(Practice.get(roundEntity))) startTeamRound()
    return
  }
  if (state.phase === 'won' || state.phase === 'lost' || state.phase === 'draw') {
    if (state.matchOver) return
    const timeLeft = Math.max(0, Math.ceil(RESULT_SECONDS - (now - endedAt)))
    if (state.timeLeft !== timeLeft) Practice.getMutable(roundEntity).timeLeft = timeLeft
    if (now - endedAt >= RESULT_SECONDS) startTeamRound()
    return
  }
  if (state.phase === 'freeze') {
    if (!hasBothTeams(state, state.round)) {
      enterWaiting(Practice.getMutable(roundEntity))
      return
    }
    const timeLeft = Math.max(0, Math.ceil(FREEZE_SECONDS - (now - roundStarted)))
    if (state.timeLeft === timeLeft) return
    const mutable = Practice.getMutable(roundEntity)
    mutable.timeLeft = timeLeft
    if (timeLeft === 0) {
      mutable.phase = 'live'
      mutable.timeLeft = ROUND_SECONDS
      roundStarted = now
    }
    return
  }
  if (state.phase !== 'live') return
  const timeLeft = Math.max(0, Math.ceil(ROUND_SECONDS - (now - roundStarted)))
  if (state.timeLeft !== timeLeft) Practice.getMutable(roundEntity).timeLeft = timeLeft
  botLoop(now)
  recordBombFrags(tickBomb(true, botBombActors()))
  const winner = teamRoundWinner(Practice.get(roundEntity), isAlive, timeLeft, getBomb()?.phase)
  if (winner) endRound(winner)
}

// --- bots ---

function spawnBots(roster: readonly TeamSeat[], slots: Record<PlayingTeam, number>) {
  clearBots()
  for (const seat of roster) {
    if (!seat.connected || !isBotAddress(seat.address) || (seat.team !== 1 && seat.team !== 2)) continue
    const spawn = teamSpawn(seat.team, slots[seat.team]++)
    spawnBot(botIndex(seat.address), seat.team, spawn.position, spawn.yaw)
  }
}

function spawnBot(index: number, team: PlayingTeam, start: Vector3, yaw: number) {
  const random = shotRandom(roundSeed, 0x5000 + index)
  const navigation = createBotNavigation(start, dust2Navigation, random, (yaw * 180) / Math.PI)
  const entity = engine.addEntity()
  botNavigation.set(entity, navigation)
  botHistory.set(entity, [{ at: Date.now() / 1000, position: { ...navigation.position } }])
  Transform.create(entity, {
    position: navigation.position,
    rotation: Quaternion.fromEulerDegrees(0, navigation.yaw, 0)
  })
  MeshCollider.setBox(entity, ColliderLayer.CL_POINTER)
  const name = BOT_NAMES[index]
  const gun = team === Team.COUNTER_TERRORIST ? 'm4a1' : 'ak47'
  Bot.create(entity, { index, team, health: 100, name, alive: true, weapon: gun })
  AvatarShape.create(entity, {
    id: botAddress(index),
    name: botDisplayName(name),
    bodyShape: `${baseAvatar}BaseMale`,
    skinColor: { r: 0.63, g: 0.44, b: 0.3 },
    hairColor: { r: 0.12, g: 0.07, b: 0.04 },
    eyeColor: { r: 0.25, g: 0.18, b: 0.12 },
    wearables: botWearables[index],
    emotes: []
  })
  Transform.validateBeforeChange(entity, (v) => v.senderAddress === AUTH_SERVER_PEER_ID)
  MeshCollider.validateBeforeChange(entity, (v) => v.senderAddress === AUTH_SERVER_PEER_ID)
  AvatarShape.validateBeforeChange(entity, (v) => v.senderAddress === AUTH_SERVER_PEER_ID)
  syncEntity(entity, [Transform.componentId, MeshCollider.componentId, AvatarShape.componentId, Bot.componentId])
  botEntities.push(entity)
  botWeapons.set(entity, createBotCombat(Date.now() / 1000 + 6 + index, gun))
  botSpeeds.set(entity, 0)
}

function clearBots() {
  for (const entity of botEntities) engine.removeEntity(entity)
  botEntities.length = 0
  botWeapons.clear()
  botSpeeds.clear()
  botNavigation.clear()
  botHistory.clear()
  botSees.clear()
  lastBotTick = 0
}

function botsOfTeam(team: number): Entity[] {
  return botEntities.filter((entity) => Bot.get(entity).team === team)
}

function aliveBots(): Entity[] {
  return botEntities.filter((entity) => Bot.get(entity).alive)
}

export function practiceTargets(): ShotTarget<Entity>[] {
  return aliveBots().map((entity) => ({ id: entity, center: Transform.get(entity).position, regions: BOT_HIT_REGIONS }))
}

export function botEntityByAddress(address: string): Entity | undefined {
  return aliveBots().find((entity) => botAddress(Bot.get(entity).index) === address)
}

export function botPositionHistory(address: string): readonly PositionSample[] | undefined {
  const entity = botEntityByAddress(address)
  return entity === undefined ? undefined : botHistory.get(entity)
}

function aliveHumansByTeam(state: { roster: readonly TeamSeat[]; round: number }) {
  const teams = new Map<number, Enemy[]>([
    [1, []],
    [2, []]
  ])
  for (const seat of state.roster) {
    if (!seat.connected || isBotAddress(seat.address) || seat.eligibleRound > state.round) continue
    const team = teams.get(seat.team)
    const entity = playerEntity(seat.address)
    if (!team || entity === undefined || Dead.has(entity) || PlayerHealth.get(entity).current <= 0) continue
    const position = playerPosition(seat.address)
    if (position) team.push({ entity, position })
  }
  return teams
}

function visibleEnemy(feet: NavPoint, enemies: readonly Enemy[]): (Enemy & { aim: Vector3 }) | undefined {
  const eye = Vector3.add(feet, { x: 0, y: BOT_EYE_HEIGHT, z: 0 })
  let best: (Enemy & { aim: Vector3 }) | undefined
  let bestDistance = BOT_SIGHT
  for (const enemy of enemies) {
    const aim = Vector3.add(enemy.position, { x: 0, y: 1.05, z: 0 })
    const distance = Vector3.distance(eye, aim)
    if (distance >= bestDistance) continue
    const direction = Vector3.normalize(Vector3.subtract(aim, eye))
    if (mapDistance(eye, direction, distance) < distance - 0.2) continue
    best = { ...enemy, aim }
    bestDistance = distance
  }
  return best
}

function botObjectives(round: number): Map<string, NavPoint> {
  const bomb = getBomb()!
  const objectives = soloBombObjectives(
    botsOfTeam(1).map((entity) => ({
      index: Bot.get(entity).index,
      alive: Bot.get(entity).alive,
      position: botNavigation.get(entity)!.position
    })),
    bomb,
    round
  )
  if (bomb.phase === 'planted')
    for (const entity of botsOfTeam(2)) objectives.set(botAddress(Bot.get(entity).index), bombApproach(bomb.position))
  return objectives
}

// The bomb may sit on a crate above the walkable graph; bots head for the node beside it.
function bombApproach(bomb: NavPoint): NavPoint {
  const node = nearestNavNode(dust2Navigation, bomb) ?? nearestNavNodeBelow(dust2Navigation, bomb)
  return node === undefined ? bomb : navPoint(dust2Navigation, node)
}

function teammateSighting(
  self: Entity,
  team: number,
  position: NavPoint,
  sightings: ReadonlyMap<Entity, Enemy | undefined>
): NavPoint | undefined {
  let best: NavPoint | undefined
  let bestDistance = BOT_CALLOUT
  for (const [entity, seen] of sightings) {
    if (entity === self || !seen || Bot.get(entity).team !== team) continue
    const distance = navDistance(position, seen.position)
    if (distance >= bestDistance) continue
    best = seen.position
    bestDistance = distance
  }
  return best
}

function botLoop(now: number) {
  const state = Practice.get(roundEntity)
  const dt = now - lastBotTick
  const navigate = dt >= BOT_TICK
  if (navigate) lastBotTick = now
  const humans = aliveHumansByTeam(state)
  const objectives = botObjectives(state.round)
  const bots = practiceTargets()
  const hotspots = dust2Hotspots(dust2Navigation)
  const sightings = new Map<Entity, (Enemy & { aim: Vector3 }) | undefined>()
  for (const entity of aliveBots()) {
    const bot = Bot.get(entity)
    const enemy = visibleEnemy(botNavigation.get(entity)!.position, humans.get(3 - bot.team) ?? [])
    sightings.set(entity, enemy)
    botSees.set(entity, enemy !== undefined)
  }
  for (const entity of aliveBots()) {
    const bot = Bot.get(entity)
    const navigation = botNavigation.get(entity)!
    const combat = botWeapons.get(entity)!
    const gun = GUNS[combat.gun]
    const enemies = humans.get(3 - bot.team) ?? []
    const enemy = sightings.get(entity)
    if (navigate) {
      const previous = navigation.position
      const previousYaw = navigation.yaw
      moveBot(navigation, {
        now,
        dt,
        speed: gun.speed,
        observed: enemy?.position,
        reported: enemy ? undefined : teammateSighting(entity, bot.team, navigation.position, sightings),
        objective: objectives.get(botAddress(bot.index)),
        reloading: combat.weapon.isReloading,
        hotspots: hotspots[bot.team === Team.COUNTER_TERRORIST ? 2 : 1],
        holdScale: bot.team === Team.COUNTER_TERRORIST ? 2 : 1
      })
      botSpeeds.set(entity, Vector3.distance(navigation.position, previous) / dt)
      recordSample(botHistory.get(entity) ?? [], navigation.position, now)
      if (navigation.position !== previous || Math.abs(navigation.yaw - previousYaw) > 1e-3) {
        const transform = Transform.getMutable(entity)
        transform.position = navigation.position
        transform.rotation = Quaternion.fromEulerDegrees(0, navigation.yaw, 0)
      }
    }
    const shot = botShot<Entity>(combat, {
      feet: navigation.position,
      target: enemy && !isBombBusy(botAddress(bot.index)) ? enemy.aim : undefined,
      speed: botSpeeds.get(entity) ?? 0,
      now,
      alive: true,
      difficulty: parseBotDifficulty(state.botDifficulty),
      targets: [
        ...bots.filter((target) => target.id !== entity),
        ...enemies.map((human) => ({ id: human.entity, center: human.position, regions: PLAYER_HIT_REGIONS }))
      ]
    })
    if (!shot) continue
    room.send('practiceAttack', { origin: shot.origin, target: shot.position })
    if (!shot.hit || Bot.has(shot.hit.target)) continue
    const attacker: Attacker = {
      address: botAddress(bot.index),
      name: botDisplayName(bot.name),
      weapon: gun.name,
      team: bot.team
    }
    applyPlayerDamage(attacker, shot.hit.target, shot.damage, shot.hit.group, shot.origin, gun.armorRatio)
  }
}

function botBombActors(): BombPlayer[] {
  const bomb = getBomb()!
  return botEntities.map((entity) => {
    const bot = Bot.get(entity)
    const position = botNavigation.get(entity)!.position
    const address = botAddress(bot.index)
    const busy = bot.alive && !botSees.get(entity)
    if (bot.team === Team.TERRORIST) {
      const stopped = (botSpeeds.get(entity) ?? 0) < 0.05
      const planting =
        bomb.carrier === address && !!bombSiteAt(position) && (bomb.phase === 'planting' || (busy && stopped))
      return {
        address,
        team: 1,
        alive: bot.alive,
        position,
        grounded: true,
        holding: planting,
        selected: planting,
        canDefuse: false,
        hasKit: false
      }
    }
    const defusing =
      bomb.phase === 'planted' &&
      busy &&
      Math.hypot(position.x - bomb.position.x, position.z - bomb.position.z) < BOT_DEFUSE_REACH &&
      Math.abs(position.y - bomb.position.y) < BOT_DEFUSE_HEIGHT
    return {
      address,
      team: 2,
      alive: bot.alive,
      position,
      grounded: true,
      holding: defusing,
      selected: false,
      canDefuse: defusing,
      hasKit: false
    }
  })
}

// --- damage ---

export function creditKill(attacker: Attacker) {
  if (isBotAddress(attacker.address)) {
    Practice.getMutable(roundEntity).botKills[botIndex(attacker.address)]++
    return
  }
  recordPracticeStats(attacker.address, 1, 0)
  creditPlayer(attacker.address, KILL_REWARD)
}

export function damageBot(target: Entity, damage: number, attacker: Attacker): boolean {
  const bot = Bot.getOrNull(target)
  if (Practice.get(roundEntity).phase !== 'live' || !bot?.alive || bot.team === attacker.team) return false
  if (!isBotAddress(attacker.address) && !canPlayRound(attacker.address)) return false
  if (hurtBot(target, damage, attacker) === 'kill') creditKill(attacker)
  return true
}

export function hurtBot(
  target: Entity,
  damage: number,
  killer: { name: string; weapon: string }
): 'none' | 'hit' | 'kill' {
  if (!Bot.getOrNull(target)?.alive) return 'none'
  const bot = Bot.getMutable(target)
  bot.health = Math.max(0, bot.health - damage)
  if (bot.health > 0) return 'hit'
  bot.alive = false
  MeshCollider.deleteFrom(target)
  Transform.getMutable(target).rotation = Quaternion.fromEulerDegrees(0, 0, 90)
  const state = Practice.getMutable(roundEntity)
  state.remaining--
  state.botDeaths[bot.index]++
  room.send('playerKill', { killer: killer.name, victim: botDisplayName(bot.name), weapon: killer.weapon })
  return 'kill'
}
