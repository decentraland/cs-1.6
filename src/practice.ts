import { AvatarShape, engine, Entity, Transform, MeshCollider, PlayerIdentityData, ColliderLayer } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'
import { Bot, Practice, PlayerHealth, PlayerEquipment, Weapon, PlayerAddress, PlayerPose, Dead, PlayerTeam, Team } from './components'
import { room } from './index'
import { giveWeapon } from './systems'
import { mapDistance } from './world-query'
import { recordPracticeStats, resetPlayerAccuracy, matchStats } from './server'
import { initializeInventory, spawnInventory } from './inventory'
import { finishRound } from './round-rules'
import { initializeEconomy, resetEconomy, settleRoundEconomy, payRoundReward } from './economy'
import { admitSpectator, admitToTeam, hasBothTeams, inTeamRound, teamRoundWinner, PLAYER_TIMEOUT } from './team-rules'
import { initializeBomb, resetBomb, tickBomb, getBomb } from './bomb'
import { teamSpawn } from './team-spawns'
import { BOT_HIT_REGIONS, PLAYER_HIT_REGIONS, ShotTarget } from './ballistics'
import { BotNavigation, createBotNavigation, moveBot } from './bot-navigation'
import { GUNS } from './weapon-profiles'
import { BotCombat, botShot, createBotCombat, BOT_EYE_HEIGHT } from './bot-combat'
import { armorDamage } from './economy-rules'
import { botAddress, soloBombCarrier, soloBombObjectives } from './bot-objective'
import { bombFragAward } from './bomb-rules'
import type { BombEvent, BombPlayer } from './bomb-rules'
import { bombSiteAt } from './bomb-sites'
import { victimPunch } from './damage-feedback'

export const PRACTICE_SPAWN = { x: 95, y: 10.1, z: 52 }
export const PRACTICE_LOOK = { x: 85, y: 9.5, z: 52 }
const botStarts = [{ x: 88, y: 10.026, z: 50 }, { x: 85, y: 10.026, z: 54 }, { x: 90, y: 10.026, z: 48 }]
let roundEntity: Entity
let roundStarted = 0
let lastBotTick = 0
let roundGeneration = 0
let endedAt = 0
const lastSeen = new Map<string, number>()
const botEntities: Entity[] = []
const botWeapons = new Map<Entity, BotCombat>()
const botSpeeds = new Map<Entity, number>()
const botNavigation = new Map<Entity, BotNavigation>()
const baseAvatar = 'urn:decentraland:off-chain:base-avatars:'
const botWearables = [
  ['eyes_00', 'eyebrows_00', 'mouth_00', 'curtained_hair', 'safari_shirt', 'safari_pants', 'classic_shoes'],
  ['eyes_02', 'eyebrows_02', 'mouth_03', 'short_hair', 'green_hoodie', 'brown_pants', 'sneakers'],
  ['eyes_05', 'eyebrows_04', 'mouth_01', 'semi_bold', 'black_jacket', 'grey_joggers', 'sport_black_shoes']
].map(wearables => wearables.map(wearable => `${baseAvatar}${wearable}`))

export function roundElapsed() { return Date.now()/1000-roundStarted }

export function getPractice() {
  for (const [, state] of engine.getEntitiesWith(Practice)) return state
  return undefined
}

function playerEntity(address: string): Entity | undefined {
  for (const [entity, player] of engine.getEntitiesWith(PlayerAddress)) {
    if (player.address === address) return entity
  }
  return undefined
}

export function playerPosition(address: string): Vector3 | undefined {
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (identity.address.toLowerCase() === address) return Transform.getOrNull(entity)?.position
  }
  return undefined
}

function spawnBot(index: number) {
  const configured = botStarts[index]
  const probe = { ...configured, y: configured.y + .1 }
  const floor = mapDistance(probe, { x: 0, y: -1, z: 0 }, 6)
  if (floor === 6) throw new Error('Bot spawn has no Dust2 floor')
  const navigation = createBotNavigation({ ...configured, y: probe.y - floor }, index)
  const start = navigation.position
  const entity = engine.addEntity()
  botNavigation.set(entity, navigation)
  Transform.create(entity, { position: start })
  MeshCollider.setBox(entity, ColliderLayer.CL_POINTER)
  const name = ['Guerilla', 'Phoenix', 'Arctic'][index]
  Bot.create(entity, { index, health: 100, name, alive: true })
  AvatarShape.create(entity, {
    id: botAddress(index),
    name: `BOT ${name}`,
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
  botWeapons.set(entity, createBotCombat(Date.now() / 1000 + 6 + index))
  botSpeeds.set(entity, 0)
}

function startRound(address: string, newMatch = false) {
  const player = playerEntity(address)
  if (player === undefined) return
  const existing = Practice.get(roundEntity)
  if (newMatch) {
    if (existing.mode === 'teams' && existing.roster.some(seat => seat.connected)) return
    if (existing.phase !== 'ready' && !existing.matchOver) return
    resetEconomy()
    roundGeneration = 0
    recordPracticeStats(address, 0, 0, true)
  } else if (existing.owner !== address) return
  clearBots()
  roundGeneration++
  resetPlayerAccuracy(address, true)
  roundStarted = Date.now() / 1000
  Practice.createOrReplace(roundEntity, {
    mode: 'solo', roster: [], phase: 'freeze', owner: address, remaining: 3, timeLeft: 3, round: roundGeneration, kills: 0,
    ctScore: newMatch ? 0 : existing.ctScore, tScore: newMatch ? 0 : existing.tScore,
    maxWins: 16, matchOver: false,
    botKills: newMatch ? [0, 0, 0] : [...existing.botKills],
    botDeaths: newMatch ? [0, 0, 0] : [...existing.botDeaths]
  })
  PlayerHealth.getMutable(player).current = 100
  Dead.deleteFrom(player)
  PlayerTeam.getMutable(player).team = Team.COUNTER_TERRORIST
  PlayerPose.createOrReplace(player, { position: PRACTICE_SPAWN, valid: true })
  giveWeapon(player, 'AK47')
  for (let index = 0; index < botStarts.length; index++) spawnBot(index)
  const carrier = soloBombCarrier(botEntities.map(entity => Bot.get(entity).index), roundGeneration)
  const carrierEntity = botEntities.find(entity => botAddress(Bot.get(entity).index) === carrier)
  resetBomb(roundGeneration, carrier, carrierEntity === undefined ? undefined : botNavigation.get(carrierEntity)?.position)
  room.send('practiceSpawn', { playerAddress: address, round: roundGeneration, position: PRACTICE_SPAWN, yaw: -Math.PI / 2 })
}

function enterTeamMode() {
  const state = Practice.getMutable(roundEntity)
  if (state.mode === 'teams') return state
  clearBots()
  resetEconomy()
  state.mode = 'teams'; state.owner = ''; state.phase = 'waiting'
  state.ctScore = 0; state.tScore = 0; state.round = 0; state.matchOver = false
  state.timeLeft = 0; state.remaining = 0
  for (const [entity, identity] of engine.getEntitiesWith(PlayerAddress, PlayerTeam)) {
    recordPracticeStats(identity.address, 0, 0, true)
    PlayerTeam.getMutable(entity).team = Team.NONE
    benchPlayer(entity)
  }
  state.roster.forEach(seat => { seat.eligibleRound = 1 })
  return state
}

export function initializePractice() {
  Practice.validateBeforeChange((v) => v.senderAddress === AUTH_SERVER_PEER_ID)
  Bot.validateBeforeChange((v) => v.senderAddress === AUTH_SERVER_PEER_ID)
  roundEntity = engine.addEntity()
  Practice.create(roundEntity, { mode: 'solo', roster: [], phase: 'ready', owner: '', remaining: 3, timeLeft: 120, round: 0, kills: 0, ctScore: 0, tScore: 0, maxWins: 16, matchOver: false, botKills: [0, 0, 0], botDeaths: [0, 0, 0] })
  syncEntity(roundEntity, [Practice.componentId])
  initializeBomb()
  initializeEconomy()
  initializeInventory()
  room.onMessage('practiceStart', (_data, context) => {
    if (context) startRound(context.from.toLowerCase(), true)
  })
  room.onMessage('teamJoin', (data, context) => {
    if (!context) return
    const address = context.from.toLowerCase()
    const player = playerEntity(address)
    if (player === undefined) return
    const current = Practice.get(roundEntity)
    if (current.mode !== 'teams' && current.phase !== 'ready' && !current.matchOver) {
      room.send('matchNotice', { address, message: 'A solo match is in progress.' })
      return
    }
    const state = enterTeamMode()
    const alreadyJoined = state.roster.some(seat => seat.address === address && seat.connected && seat.team === data.team)
    const error = admitToTeam(state, address, data.team)
    if (error) { room.send('matchNotice', { address, message: error }); return }
    if (alreadyJoined) return
    lastSeen.set(address, Date.now() / 1000)
    PlayerTeam.getMutable(player).team = data.team
    benchPlayer(player)
    if (state.phase === 'waiting' && hasBothTeams(state)) startTeamRound()
  })
  room.onMessage('teamSpectate', (_data, context) => {
    if (!context) return
    const address = context.from.toLowerCase()
    const player = playerEntity(address)
    if (player === undefined) return
    const current = Practice.get(roundEntity)
    if (current.mode !== 'teams' && current.phase !== 'ready' && !current.matchOver) {
      room.send('matchNotice', { address, message: 'A solo match is in progress.' })
      return
    }
    const state = enterTeamMode()
    const previous = state.roster.find(seat => seat.address === address)
    const wasPlaying = previous?.connected && (previous.team === 1 || previous.team === 2)
    if (!admitSpectator(state, address)) return
    if (wasPlaying && state.phase === 'live' && PlayerHealth.get(player).current > 0) recordPracticeStats(address, 0, 1)
    lastSeen.set(address, Date.now() / 1000)
    PlayerTeam.getMutable(player).team = Team.NONE
    benchPlayer(player)
    if (state.phase === 'freeze' || state.phase === 'live') room.send('spectatorStart', { playerAddress: address, round: state.round })
  })
  room.onMessage('teamLeave', (_data, context) => {
    if (context) disconnectPlayer(context.from.toLowerCase())
  })
  room.onMessage('teamRestart', (_data, context) => {
    const state = Practice.getMutable(roundEntity)
    if (!context || state.mode !== 'teams' || !state.matchOver || !state.roster.some(seat => seat.connected && (seat.team === 1 || seat.team === 2) && seat.address === context.from.toLowerCase())) return
    resetEconomy()
    state.ctScore = 0; state.tScore = 0; state.round = 0; state.matchOver = false; state.phase = 'waiting'
    for (const seat of state.roster) {
      seat.eligibleRound = 1
      recordPracticeStats(seat.address, 0, 0, true)
    }
    if (hasBothTeams(state)) startTeamRound()
  })
  engine.addSystem(practiceSystem)
}

export function practiceTargets(): ShotTarget<Entity>[] {
  return botEntities.filter(entity => Bot.getOrNull(entity)?.alive).map(entity => ({
    id: entity, center: Vector3.add(Transform.get(entity).position, { x: 0, y: 0.9, z: 0 }), regions: BOT_HIT_REGIONS
  }))
}

export function damagePracticeBot(address: string, target: Entity, damage: number): boolean {
  const state = Practice.get(roundEntity)
  if (state.owner !== address || state.phase !== 'live' || !Bot.getOrNull(target)?.alive) return false
  const bot = Bot.getMutable(target)
  bot.health = Math.max(0, bot.health - damage)
  room.send('practiceHit', { killed: bot.health === 0, name: bot.name })
  if (bot.health === 0) {
    bot.alive = false
    MeshCollider.deleteFrom(target)
    const transform = Transform.getMutable(target)
    transform.rotation = Quaternion.fromEulerDegrees(0, 0, 90)
    const mutable = Practice.getMutable(roundEntity)
    mutable.remaining--
    mutable.kills++
    mutable.botDeaths[bot.index]++
    recordPracticeStats(address, 1, 0)
    if (mutable.remaining === 0 && getBomb()?.phase !== 'planted') endRound('ct')
  }
  return true
}

function endRound(winner: 'ct' | 't' | 'draw') {
  const state = Practice.getMutable(roundEntity)
  const timeout = state.timeLeft <= 0 && !['planted','defused','exploded'].includes(getBomb()?.phase ?? '')
  if (finishRound(state, winner)) {
    endedAt = Date.now()/1000
    settleRoundEconomy(winner,getBomb()?.phase ?? '',timeout)
  }
}

function recordBombFrags(event: BombEvent | undefined) {
  const bomb = getBomb()
  if (!bomb) return
  const award = bombFragAward(bomb, event)
  if (!award) return
  const bot = botEntities.find(entity => botAddress(Bot.get(entity).index) === award.address)
  if (bot !== undefined) Practice.getMutable(roundEntity).botKills[Bot.get(bot).index] += award.frags
  else recordPracticeStats(award.address, award.frags, 0)
}

function practiceSystem() {
  const now = Date.now() / 1000
  const state = Practice.get(roundEntity)
  if (state.mode === 'teams') { teamSystem(now); return }
  if ((state.phase === 'won' || state.phase === 'lost') && !state.matchOver) {
    Practice.getMutable(roundEntity).timeLeft = Math.max(0, Math.ceil(5 - (now - endedAt)))
    if (now - endedAt >= 5) startRound(state.owner)
    return
  }
  if (state.phase === 'freeze') {
    const remaining = 3 - (now - roundStarted)
    Practice.getMutable(roundEntity).timeLeft = Math.max(0, Math.ceil(remaining))
    if (remaining <= 0) { Practice.getMutable(roundEntity).phase = 'live'; Practice.getMutable(roundEntity).timeLeft = 120; roundStarted = now }
    return
  }
  if (state.phase !== 'live') return
  const player = playerEntity(state.owner)
  const position = playerPosition(state.owner)
  if (player === undefined || !position) return
  const health = PlayerHealth.getMutable(player)
  const remaining = Math.max(0, Math.ceil(120 - (now - roundStarted)))
  if (state.timeLeft !== remaining) Practice.getMutable(roundEntity).timeLeft = remaining
  if (health.current <= 0) { endRound('t'); return }
  if (remaining === 0 && getBomb()?.phase !== 'planted') { endRound('ct'); return }
  const dt = now - lastBotTick
  const navigate = dt >= .1
  if (navigate) lastBotTick = now
  const objective = soloBombObjectives(botEntities.map(entity => ({
    index: Bot.get(entity).index,
    alive: Bot.get(entity).alive,
    position: botNavigation.get(entity)!.position
  })), getBomb()!, state.round)
  const visibility = new Map<Entity, boolean>()
  for (const entity of botEntities) {
    const bot = Bot.get(entity)
    if (!bot.alive) continue
    const transform = Transform.getMutable(entity)
    const navigation = botNavigation.get(entity)!
    const target = Vector3.add(position, { x: 0, y: 1.05, z: 0 })
    const eye = Vector3.add(navigation.position, { x: 0, y: BOT_EYE_HEIGHT, z: 0 })
    const distance = Vector3.distance(eye, target)
    const direction = Vector3.normalize(Vector3.subtract(target, eye))
    const visible = distance < 28 && mapDistance(eye, direction, distance) >= distance - 0.2
    visibility.set(entity, visible)
    const previous = { ...navigation.position }
    if (navigate) {
      moveBot(navigation, visible ? position : undefined, now, dt, GUNS.ak47.speed, undefined, undefined, objective.get(botAddress(bot.index)))
      botSpeeds.set(entity, Vector3.distance(navigation.position, previous) / dt)
      transform.position = navigation.position
    }
    const facing = visible ? Vector3.subtract(position, transform.position) : Vector3.subtract(navigation.position, previous)
    if (Math.hypot(facing.x, facing.z) > .001) transform.rotation = Quaternion.fromEulerDegrees(0, Math.atan2(facing.x, facing.z) * 180 / Math.PI, 0)
    const shot: ReturnType<typeof botShot<Entity>> = botShot<Entity>(botWeapons.get(entity)!, { feet: navigation.position, target: visible ? target : undefined, speed: botSpeeds.get(entity) ?? 0, now, alive: true,
      targets: [...practiceTargets().filter(target => target.id !== entity), { id: player, center: position, regions: PLAYER_HIT_REGIONS }] })
    if (!shot) continue
    room.send('practiceAttack', { origin: shot.origin, target: shot.position })
    if (shot.hit?.target !== player) continue
    const equipment = PlayerEquipment.getMutable(player)
    const armorProtected = health.armor > 0 && (shot.hit.group === 'body' || shot.hit.group === 'head' && equipment.helmet)
    const punch = victimPunch(shot.hit.group, shot.damage, armorProtected)
    const hit = armorDamage(shot.damage, health.armor, equipment.helmet, shot.hit.group, false, GUNS.ak47.armorRatio)
    health.armor = hit.armor
    if (health.armor === 0) equipment.helmet = false
    health.current = Math.max(0, health.current - Math.floor(hit.damage))
    const wasKill = health.current === 0
    room.send('damageConfirmed', {
      targetPlayerAddress: state.owner,
      damage: Math.floor(hit.damage),
      newHealth: health.current,
      wasKill,
      origin: shot.origin,
      hitGroup: shot.hit.group,
      punchPitch: punch.pitch,
      punchRoll: punch.roll
    })
    if (wasKill) {
      Dead.createOrReplace(player, { deathTime: now, respawnTime: 0 })
      Practice.getMutable(roundEntity).botKills[bot.index]++
      recordPracticeStats(state.owner, 0, 1)
      room.send('playerKill', { killer: bot.name, victim: matchStats.get(state.owner)?.name ?? state.owner, weapon: GUNS.ak47.name })
      endRound('t')
      break
    }
  }
  if (health.current <= 0) return
  const bomb = getBomb()!
  const bombPlayers: BombPlayer[] = botEntities.map(entity => {
    const bot = Bot.get(entity), navigation = botNavigation.get(entity)!
    const address = botAddress(bot.index)
    const planting = bomb.carrier === address && !!bombSiteAt(navigation.position) && (bomb.phase === 'planting' || !visibility.get(entity))
    return { address, team: Team.TERRORIST, alive: bot.alive, position: navigation.position,
      grounded: true, holding: planting, selected: planting, canDefuse: false, hasKit: false }
  })
  const bombEvent = tickBomb(true, bombPlayers)
  recordBombFrags(bombEvent)
  if (bombEvent === 'defused') { endRound('ct'); return }
  if (bombEvent === 'exploded') { endRound('t'); return }
  if (Practice.get(roundEntity).remaining === 0 && getBomb()?.phase !== 'planted') endRound('ct')
}

function clearBots() {
  for (const entity of botEntities) engine.removeEntity(entity)
  botEntities.length = 0; botWeapons.clear(); botSpeeds.clear(); botNavigation.clear(); lastBotTick = 0
}

function benchPlayer(entity: Entity) {
  PlayerHealth.getMutable(entity).current = 0
  Dead.createOrReplace(entity, { deathTime: Date.now() / 1000, respawnTime: 0 })
}

export function canPlayRound(address: string): boolean {
  const state = getPractice()
  return !!state && (state.mode === 'teams' ? inTeamRound(state, address) : state.owner === address)
}

export function playerHeartbeat(address: string) {
  lastSeen.set(address, Date.now() / 1000)
}

function disconnectPlayer(address: string) {
  const state = Practice.getMutable(roundEntity)
  const seat = state.roster.find(seat => seat.address === address)
  if (!seat?.connected) return
  seat.connected = false
  const entity = playerEntity(address)
  if (entity !== undefined) {
    if (state.phase === 'live' && PlayerHealth.get(entity).current > 0) recordPracticeStats(address, 0, 1)
    benchPlayer(entity)
    PlayerTeam.getMutable(entity).team = Team.NONE
  }
}

function startTeamRound() {
  const state = Practice.getMutable(roundEntity)
  if (!hasBothTeams(state)) { state.phase = 'waiting'; state.timeLeft = 0; return }
  state.round++; state.phase = 'freeze'; state.timeLeft = 3
  roundStarted = Date.now() / 1000
  const slots = { 1: 0, 2: 0 }
  const terrorists = state.roster.filter(seat => seat.connected && seat.team === 1)
  resetBomb(state.round, terrorists[(state.round - 1) % terrorists.length]?.address)
  for (const seat of state.roster) {
    if (!seat.connected || (seat.team !== 1 && seat.team !== 2)) continue
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
      PlayerEquipment.createOrReplace(player,{bombSelected:false,defuseKit:false,helmet:false})
      spawnInventory(player,seat.team)
    } else {
      Weapon.getMutable(player).isReloading = false
    }
    Dead.deleteFrom(player)
    PlayerTeam.getMutable(player).team = seat.team
    PlayerPose.createOrReplace(player, { position: spawn.position, valid: true })
    resetPlayerAccuracy(seat.address, true)
    room.send('practiceSpawn', { playerAddress: seat.address, round: state.round, position: spawn.position, yaw: spawn.yaw })
  }
  for (const seat of state.roster) {
    if (seat.connected && seat.team === 0) room.send('spectatorStart', { playerAddress: seat.address, round: state.round })
  }
}

function teamSystem(now: number) {
  const state = Practice.getMutable(roundEntity)
  for (const seat of state.roster) {
    if (seat.connected && now - (lastSeen.get(seat.address) ?? 0) > PLAYER_TIMEOUT) disconnectPlayer(seat.address)
  }
  if (!state.roster.some(seat => seat.connected)) {
    resetBomb(0)
    state.phase = 'ready'; state.mode = 'solo'; state.roster = []; state.owner = ''; state.matchOver = false
    return
  }
  if (state.phase === 'waiting') {
    if (hasBothTeams(state)) startTeamRound()
    return
  }
  if (state.phase === 'won' || state.phase === 'lost' || state.phase === 'draw') {
    if (state.matchOver) return
    state.timeLeft = Math.max(0, Math.ceil(5 - (now - endedAt)))
    if (now - endedAt >= 5) startTeamRound()
    return
  }
  if (state.phase === 'freeze') {
    if (!hasBothTeams(state)) { state.phase = 'waiting'; state.timeLeft = 0; return }
    state.timeLeft = Math.max(0, Math.ceil(3 - (now - roundStarted)))
    if (state.timeLeft === 0) { state.phase = 'live'; state.timeLeft = 120; roundStarted = now }
    return
  }
  const bombEvent = tickBomb(state.phase === 'live')
  recordBombFrags(bombEvent)
  if (state.phase !== 'live') return
  state.timeLeft = Math.max(0, Math.ceil(120 - (now - roundStarted)))
  const winner = teamRoundWinner(state, address => {
    const entity = playerEntity(address)
    return entity !== undefined && !Dead.has(entity) && PlayerHealth.get(entity).current > 0
  }, state.timeLeft, getBomb()?.phase)
  if (winner) endRound(winner)
}
