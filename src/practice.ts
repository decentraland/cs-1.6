import { createBotBody, updateBotBody, killBotBody, botBodyHitRegions, clearBotBodies } from './bot-model'
import { clearGrenades, initializeGrenades, blindedByGrenade, smokeBlocksSight } from './grenades'
import { botAccount, botAccounts, botArmorHit, buyBotRound, storeBotAmmo } from './bot-economy'
import type { BotAccount } from './bot-economy'
import { botDeathGun, switchEmptyBotGun } from './bot-loadout'
import { inBuyZone } from './buy-zones'
import { startReload, finishReload } from './combat-rules'
import { clearDefuseKits, initializeDefuseKits, spawnDefuseKit } from './defuse-kits'
import { clearDroppedWeapons, dropDeadPlayer, initializeDroppedWeapons, spawnDroppedGun } from './dropped-weapons'
import { GltfContainer, engine, Entity, Transform, MeshCollider, PlayerIdentityData, ColliderLayer } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'
import {
  Bot,
  BotBodyPose,
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
import { avatarForward, applyPlayerDamage, recordPracticeStats, resetPlayerAccuracy, matchStats } from './server'
import { initializeInventory, spawnInventory } from './inventory'
import { finishRound } from './round-rules'
import {
  creditPlayer,
  initializeEconomy,
  resetEconomy,
  settleRoundEconomy,
  payRoundReward,
  discardRoundReward
} from './economy'
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
import { damageBatches, hitboxYaw } from './hit-regions'
import { playerVoice } from './player-sound-rules'
import { HitGroup, PLAYER_HIT_REGIONS, ShotTarget } from './ballistics'
import { BotNavigation, createBotNavigation } from './bot-navigation'
import { advanceBot, groundedBotWorld } from './bot-motion'
import { CsMovement, largeFlinch } from './cs-movement-rules'
import { bulletWorldTrace } from './penetration'
import { dust2Navigation, navDistance, navPoint, nearestNavNode, nearestNavNodeBelow } from './navigation'
import { dust2Hotspots } from './bot-behavior'
import type { NavPoint } from './navigation'
import { GUNS, gunProfile, profileByName } from './weapon-profiles'
import { BotCombat, botShot, createBotCombat, BOT_EYE_HEIGHT } from './bot-combat'
import { DEFAULT_BOT_DIFFICULTY, parseBotDifficulty } from './bot-difficulty'
import { BUY_SECONDS, buyTimeRemaining, KILL_REWARD } from './economy-rules'
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
const BOT_TICK = 1 / 30

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
const botMovements = new Map<Entity, CsMovement>()
const botWorld = groundedBotWorld(bulletWorldTrace)
const botHistory = new Map<Entity, PositionSample[]>()
const botSees = new Map<Entity, boolean>()
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
    buyTimeLeft: -1,
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
  BotBodyPose.validateBeforeChange((v) => v.senderAddress === AUTH_SERVER_PEER_ID)
  roundEntity = engine.addEntity()
  Practice.create(roundEntity, freshMatch())
  syncEntity(roundEntity, [Practice.componentId])
  initializeBomb()
  initializeEconomy()
  initializeInventory()
  initializeDroppedWeapons()
  initializeDefuseKits()
  initializeGrenades()
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
  if (!Dead.has(entity) && PlayerHealth.get(entity).current > 0) dropDeadPlayer(entity)
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
  clearDroppedWeapons()
  clearDefuseKits()
  clearGrenades()
  clearBots()
  resetBomb(0)
  resetEconomy()
  for (const [, identity] of engine.getEntitiesWith(PlayerAddress)) recordPracticeStats(identity.address, 0, 0, true)
  Practice.createOrReplace(roundEntity, freshMatch())
}

// --- rounds ---

function enterWaiting(state: { phase: string; timeLeft: number; buyTimeLeft: number; remaining: number }) {
  clearDroppedWeapons()
  clearDefuseKits()
  clearGrenades()
  clearBots()
  resetBomb(0)
  state.phase = 'waiting'
  state.timeLeft = 0
  state.buyTimeLeft = -1
  state.remaining = 0
}

function startTeamRound() {
  const state = Practice.getMutable(roundEntity)
  refillBots(state, state.round + 1)
  if (!hasBothTeams(state)) {
    enterWaiting(state)
    return
  }
  clearDroppedWeapons()
  clearDefuseKits()
  clearGrenades()
  state.round++
  state.phase = 'freeze'
  state.timeLeft = FREEZE_SECONDS
  state.buyTimeLeft = BUY_SECONDS
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
    const state = Practice.getMutable(roundEntity)
    state.buyTimeLeft = buyTimeRemaining(state.phase, endedAt - roundStarted, state.matchOver)
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
  if (state.phase !== 'live') {
    for (const entity of aliveBots()) {
      const combat = botWeapons.get(entity)!
      finishReload(combat.weapon, now)
      updateBotBody(entity, combat, 0, now, false)
    }
  }
  const buyTimeLeft = buyTimeRemaining(state.phase, now - roundStarted, state.matchOver)
  if (state.buyTimeLeft !== buyTimeLeft) Practice.getMutable(roundEntity).buyTimeLeft = buyTimeLeft
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
    if (['carried', 'planting', 'dropped'].includes(getBomb()?.phase ?? '')) tickBomb(false, botBombActors())
    if (state.matchOver) return
    const timeLeft = Math.max(0, Math.ceil(RESULT_SECONDS - (now - endedAt)))
    if (state.timeLeft !== timeLeft) Practice.getMutable(roundEntity).timeLeft = timeLeft
    if (now - endedAt >= RESULT_SECONDS) startTeamRound()
    return
  }
  if (state.phase === 'freeze') {
    tickBomb(false, botBombActors())
    if (!hasBothTeams(state, state.round)) {
      enterWaiting(Practice.getMutable(roundEntity))
      return
    }
    const timeLeft = Math.max(0, Math.ceil(FREEZE_SECONDS - (now - roundStarted)))
    if (state.timeLeft === timeLeft) return
    const mutable = Practice.getMutable(roundEntity)
    mutable.timeLeft = timeLeft
    if (timeLeft === 0) {
      lastBotTick = now
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
  const survivors = new Set<number>()
  for (const entity of botEntities) {
    const bot = Bot.get(entity),
      account = botAccounts.get(botAddress(bot.index)),
      combat = botWeapons.get(entity)
    if (bot.alive) survivors.add(bot.index)
    if (account && combat) {
      storeBotAmmo(account, combat.gun, combat.weapon.ammoClip, combat.weapon.ammoReserve)
      account.defuseKit = bot.defuseKit
    }
  }
  const wanted = new Set(
    roster.filter((seat) => seat.connected && isBotAddress(seat.address)).map((seat) => seat.address)
  )
  for (const address of botAccounts.keys())
    if (!wanted.has(address)) {
      botAccounts.delete(address)
      discardRoundReward(address)
    }
  clearBots()
  for (const seat of roster) {
    if (!seat.connected || !isBotAddress(seat.address) || (seat.team !== 1 && seat.team !== 2)) continue
    const spawn = teamSpawn(seat.team, slots[seat.team]++)
    const account = botAccount(seat.address, seat.team)
    payRoundReward(seat.address)
    const dropped = buyBotRound(account, Practice.get(roundEntity).round, survivors.has(botIndex(seat.address)), {
      alive: true,
      eligible: true,
      team: seat.team,
      phase: 'freeze',
      elapsed: 0,
      inZone: inBuyZone(spawn.position, seat.team)
    })
    for (const gun of dropped)
      spawnDroppedGun(gun, spawn.position, { x: Math.sin(spawn.yaw), y: 0, z: Math.cos(spawn.yaw) }, false)
    spawnBot(botIndex(seat.address), seat.team, spawn.position, spawn.yaw, account)
  }
}

function spawnBot(index: number, team: PlayingTeam, start: Vector3, yaw: number, account: BotAccount) {
  const random = shotRandom(roundSeed, 0x5000 + index)
  const navigation = createBotNavigation(start, dust2Navigation, random, (yaw * 180) / Math.PI)
  const entity = engine.addEntity()
  botNavigation.set(entity, navigation)
  botMovements.set(entity, new CsMovement())
  botHistory.set(entity, [{ at: Date.now() / 1000, position: { ...navigation.position } }])
  Transform.create(entity, {
    position: navigation.position,
    rotation: Quaternion.fromEulerDegrees(0, navigation.yaw, 0)
  })
  MeshCollider.setBox(entity, ColliderLayer.CL_POINTER)
  const name = BOT_NAMES[index]
  const gun = (gunProfile(account.inventory.active) ?? GUNS[team === 2 ? 'usp' : 'glock18']).id
  const stored = account.inventory.items.find((item) => item.id === gun)!
  Bot.create(entity, { index, team, health: 100, name, alive: true, weapon: gun, defuseKit: account.defuseKit })
  const combat = createBotCombat(Date.now() / 1000 + 6 + index, gun, stored)
  startReload(combat.weapon, Date.now() / 1000, true)
  createBotBody(entity, team, combat, Date.now() / 1000)
  Transform.validateBeforeChange(entity, (v) => v.senderAddress === AUTH_SERVER_PEER_ID)
  MeshCollider.validateBeforeChange(entity, (v) => v.senderAddress === AUTH_SERVER_PEER_ID)
  GltfContainer.validateBeforeChange(entity, (v) => v.senderAddress === AUTH_SERVER_PEER_ID)
  syncEntity(entity, [
    Transform.componentId,
    MeshCollider.componentId,
    GltfContainer.componentId,
    Bot.componentId,
    BotBodyPose.componentId
  ])
  botEntities.push(entity)
  botWeapons.set(entity, combat)
  botSpeeds.set(entity, 0)
}

function clearBots() {
  clearBotBodies()
  for (const entity of botEntities) engine.removeEntity(entity)
  botEntities.length = 0
  botWeapons.clear()
  botSpeeds.clear()
  botNavigation.clear()
  botMovements.clear()
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
  return aliveBots().map((entity) => ({
    id: entity,
    center: Transform.get(entity).position,
    yaw: hitboxYaw(Transform.get(entity).rotation),
    regions: botBodyHitRegions(entity, Date.now() / 1000)
  }))
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
    if (distance >= bestDistance || smokeBlocksSight(eye, aim)) continue
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
    const enemy = blindedByGrenade(botAddress(bot.index), now)
      ? undefined
      : visibleEnemy(botNavigation.get(entity)!.position, humans.get(3 - bot.team) ?? [])
    sightings.set(entity, enemy)
    botSees.set(entity, enemy !== undefined)
  }
  for (const entity of aliveBots()) {
    const bot = Bot.get(entity)
    const navigation = botNavigation.get(entity)!
    let combat = botWeapons.get(entity)!
    const account = botAccounts.get(botAddress(bot.index))
    if (account && !isBombBusy(botAddress(bot.index))) {
      const selected = switchEmptyBotGun(account, combat, now)
      if (selected !== combat) {
        combat = selected
        botWeapons.set(entity, combat)
        Bot.getMutable(entity).weapon = combat.gun
      }
    }
    const gun = GUNS[combat.gun]
    const enemies = humans.get(3 - bot.team) ?? []
    const enemy = sightings.get(entity)
    if (navigate) {
      const previous = navigation.position
      const previousYaw = navigation.yaw
      advanceBot(
        navigation,
        botMovements.get(entity)!,
        {
          now,
          dt,
          speed: gun.speed,
          observed: enemy?.position,
          reported: enemy ? undefined : teammateSighting(entity, bot.team, navigation.position, sightings),
          objective: objectives.get(botAddress(bot.index)),
          reloading: combat.weapon.isReloading,
          hotspots: hotspots[bot.team === Team.COUNTER_TERRORIST ? 2 : 1],
          holdScale: bot.team === Team.COUNTER_TERRORIST ? 2 : 1
        },
        botWorld
      )
      botSpeeds.set(entity, Math.hypot(navigation.position.x - previous.x, navigation.position.z - previous.z) / dt)
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
        ...enemies.map((human) => ({
          id: human.entity,
          center: human.position,
          yaw: (() => {
            const forward = avatarForward(PlayerAddress.get(human.entity).address)
            return forward ? Math.atan2(forward.x, forward.z) : 0
          })(),
          regions: PLAYER_HIT_REGIONS
        }))
      ]
    })
    const bomb = getBomb()
    updateBotBody(
      entity,
      combat,
      botSpeeds.get(entity) ?? 0,
      now,
      bomb?.phase === 'planting' && bomb.carrier === botAddress(bot.index)
    )
    if (!shot) continue
    room.send('practiceAttack', { origin: shot.origin, target: shot.position, gun: combat.gun })
    const attacker: Attacker = {
      address: botAddress(bot.index),
      name: botDisplayName(bot.name),
      weapon: gun.name,
      team: bot.team
    }
    for (const hit of damageBatches(shot.impacts))
      if (!Bot.has(hit.target))
        applyPlayerDamage(attacker, hit.target, hit.damage, hit.group, shot.origin, gun.armorRatio, false, hit.traces)
  }
}

function botBombActors(): BombPlayer[] {
  const bomb = getBomb()!
  return botEntities.map((entity) => {
    const bot = Bot.get(entity)
    const navigation = botNavigation.get(entity)!
    const position = navigation.position
    const yaw = (navigation.yaw * Math.PI) / 180
    const direction = { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) }
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
        direction,
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
      direction,
      grounded: true,
      holding: defusing,
      selected: false,
      canDefuse: defusing,
      hasKit: bot.defuseKit
    }
  })
}

// --- damage ---

export function creditKill(attacker: Attacker) {
  creditPlayer(attacker.address, KILL_REWARD)
  if (isBotAddress(attacker.address)) {
    Practice.getMutable(roundEntity).botKills[botIndex(attacker.address)]++
    return
  }
  recordPracticeStats(attacker.address, 1, 0)
}

export function damageBot(
  target: Entity,
  damage: number,
  attacker: Attacker,
  group: HitGroup = 'body',
  armorRatio = 0.775
): boolean {
  const bot = Bot.getOrNull(target)
  if (Practice.get(roundEntity).phase !== 'live' || !bot?.alive || bot.team === attacker.team) return false
  if (!isBotAddress(attacker.address) && !canPlayRound(attacker.address)) return false
  const result = hurtBot(target, damage, attacker, group, armorRatio)
  if (result === 'kill') creditKill(attacker)
  else if (result === 'hit') {
    const movement = botMovements.get(target),
      position = botNavigation.get(target)?.position
    const otherBot = botEntity(attacker.address),
      profile = profileByName(attacker.weapon)
    const source =
      playerPosition(attacker.address) ?? (otherBot === undefined ? undefined : botNavigation.get(otherBot)?.position)
    if (movement && position)
      movement.hit(profile.kind === 'gun' && largeFlinch(profile.id, group), source ?? position, position)
  }
  return result !== 'none'
}

export function hurtBot(
  target: Entity,
  damage: number,
  killer: { name: string; weapon: string; team?: number; address?: string },
  group: HitGroup = 'body',
  armorRatio = 0.775,
  blast = false
): 'none' | 'hit' | 'kill' {
  if (!Bot.getOrNull(target)?.alive) return 'none'
  const bot = Bot.getMutable(target)
  const account = botAccounts.get(botAddress(bot.index))
  const previousArmor = account?.armor ?? 0
  const hadHelmet = account?.helmet ?? false
  const hit = account
    ? botArmorHit(account, damage, group, armorRatio, blast)
    : { damage: Math.floor(damage), protectedByArmor: false }
  const previousHealth = bot.health
  bot.health = Math.max(0, bot.health - hit.damage)
  if (bot.health === previousHealth && (account?.armor ?? 0) === previousArmor) return 'none'
  room.send('combatImpact', {
    target: botAddress(bot.index),
    position: Transform.get(target).position,
    hitGroup: group,
    armor: hit.protectedByArmor,
    wasKill: bot.health === 0
  })
  room.send('playerVoice', {
    address: botAddress(bot.index),
    position: Transform.get(target).position,
    clip: playerVoice(group, hit.protectedByArmor, hadHelmet, bot.health === 0)
  })
  if (bot.health > 0) return 'hit'
  const combat = botWeapons.get(target),
    navigation = botNavigation.get(target)
  const dropped = combat && account ? botDeathGun(account, combat) : undefined
  if (dropped && navigation) {
    const history = botHistory.get(target) ?? [],
      previous = history[history.length - 2],
      latest = history[history.length - 1]
    const span = latest && previous ? latest.at - previous.at : 0
    const velocity =
      latest && previous && span > 0
        ? {
            x: (latest.position.x - previous.position.x) / span,
            y: (latest.position.y - previous.position.y) / span,
            z: (latest.position.z - previous.position.z) / span
          }
        : { x: 0, y: 0, z: 0 }
    const yaw = (navigation.yaw * Math.PI) / 180
    spawnDroppedGun(dropped, navigation.position, { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) }, false, velocity)
  }
  botMovements.get(target)?.reset()
  botSpeeds.set(target, 0)
  if (bot.defuseKit) {
    bot.defuseKit = false
    spawnDefuseKit(navigation?.position ?? Transform.get(target).position)
  }
  bot.alive = false
  MeshCollider.deleteFrom(target)
  killBotBody(target, group, blast, Date.now() / 1000)
  const state = Practice.getMutable(roundEntity)
  state.remaining--
  state.botDeaths[bot.index]++
  room.send('playerKill', {
    killer: killer.name,
    victim: botDisplayName(bot.name),
    weapon: killer.weapon,
    killerTeam: killer.team ?? 0,
    victimTeam: bot.team,
    headshot: !blast && group === 'head',
    suicide: killer.address === botAddress(bot.index)
  })
  return 'kill'
}
