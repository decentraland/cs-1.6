import { dropDeadPlayer } from './dropped-weapons'
import { resetPlayerFall } from './falling'
import { fallDamage, resolveFall } from './fall-rules'
import { engine, Entity, Transform, PlayerIdentityData, AvatarBase } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'
import { isServer, syncEntity } from '@dcl/sdk/network'
import {
  PlayerHealth,
  PlayerInventory,
  PlayerMoney,
  PlayerEquipment,
  PlayerTeam,
  Team,
  PlayerAddress,
  PlayerPose,
  Dead,
  PlayerStats,
  MatchLeaderboard,
  Weapon,
  Bot
} from './components'
import { room } from './index'
import { armorDamage, START_MONEY } from './economy-rules'
import {
  damageBot,
  getPractice,
  practiceTargets,
  canPlayRound,
  playerHeartbeat,
  creditKill,
  getRoundSeed,
  touchMatchState,
  resendSpawn,
  rejoinPlayer,
  botEntityByAddress,
  botPositionHistory,
  isBotAddress as isBotTarget
} from './practice'
import { shotRandom } from './shared-random'
import type { Attacker } from './practice'
import { AccuracyState, freshAccuracy, setTrigger } from './accuracy'
import { largeFlinch } from './cs-movement-rules'
import { armorCovers, damageBatches } from './hit-regions'
import { playerVoice } from './player-sound-rules'
import { HitGroup, fireAkShot, groundedAt, PLAYER_HIT_REGIONS, ShotTarget } from './ballistics'
import { acceptShotClaim, recordSample } from './hit-claims'
import type { PositionSample } from './hit-claims'
import { giveWeapon, storeActiveGun } from './systems'
import { beginBurst, advanceBurst, BurstState, leaveScope, firedScope } from './weapon-modes'
import { GUNS, modeStats, profileByName } from './weapon-profiles'
import { freshGunAccuracy } from './gun-accuracy'
import { SemiAutoTrigger } from './inventory-rules'
import { canReload, claimShot, fireShot, shotDeadline, SHOT_SCHEDULING_WINDOW, startReload } from './combat-rules'
import { isBombBusy, touchBomb } from './bomb'
import { rankScores } from './scoreboard'
import { victimPunch } from './damage-feedback'
import { freshKnifeCooldown, isKnifeBackstab, KNIFE_ARMOR_RATIO, resolveKnifeAttack, traceKnife } from './knife-rules'
import type { KnifeAttack, KnifeCooldown } from './knife-rules'

// Player registry: Maps player address to their entity
export const playerEntities = new Map<string, Entity>()

// Match stats persistence (survives player disconnect/reconnect)
interface PlayerMatchStats {
  kills: number
  deaths: number
  assists: number
  name: string
}
export const matchStats = new Map<string, PlayerMatchStats>()

interface PlayerShotState {
  burst?: BurstState & { spread: number; revision: number }
  accuracy: AccuracyState
  triggerHeld: boolean
  semi: SemiAutoTrigger
  position?: Vector3
  sampledAt: number
  speed: number
  history: PositionSample[]
}
const shotStates = new Map<string, PlayerShotState>()

export function isPlayerTriggerHeld(address: string): boolean {
  return shotStates.get(address)?.triggerHeld ?? false
}

const knifeStates = new Map<string, KnifeCooldown & { revision: number }>()
const playerFacings = new Map<string, Vector3>()

export function resetPlayerAccuracy(address: string, newRound = false, reload = false) {
  if (newRound) resetPlayerFall(address)
  const player = playerEntities.get(address)
  const profile = profileByName(player === undefined ? 'AK-47' : (Weapon.getOrNull(player)?.name ?? 'AK-47'))
  const gun = profile.kind === 'gun' ? profile : GUNS.ak47
  const state = shotStates.get(address)
  if (state && !newRound) {
    state.accuracy = freshGunAccuracy(gun.id, reload)
    state.burst = undefined
    state.semi.reset()
  } else
    shotStates.set(address, {
      accuracy: freshGunAccuracy(gun.id),
      triggerHeld: false,
      semi: new SemiAutoTrigger(),
      sampledAt: 0,
      speed: 0,
      history: shotStates.get(address)?.history ?? []
    })
}

function shotState(address: string): PlayerShotState {
  const existing = shotStates.get(address)
  if (existing) return existing
  const state = {
    accuracy: freshAccuracy(),
    triggerHeld: false,
    semi: new SemiAutoTrigger(),
    sampledAt: 0,
    speed: 0,
    history: []
  }
  shotStates.set(address, state)
  return state
}

function setPlayerTrigger(address: string, held: boolean) {
  if (!playerEntities.has(address)) return
  const state = shotState(address)
  state.triggerHeld = held
  state.semi.update(held)
  setTrigger(state.accuracy, held, Date.now() / 1000)
}

function avatarPosition(address: string): Vector3 | undefined {
  for (const [entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (identity.address.toLowerCase() === address) return Transform.getOrNull(entity)?.position
  }
  return undefined
}

function samplePlayerMotion(now: number) {
  for (const [address, entity] of playerEntities) {
    const state = shotState(address)
    if (now - state.sampledAt < 0.1) continue
    const position = avatarPosition(address)
    if (!position) {
      state.position = undefined
      state.speed = 0
      state.sampledAt = now
      const pose = PlayerPose.getMutableOrNull(entity)
      if (pose) pose.valid = false
      continue
    }
    state.speed = state.position
      ? Math.hypot(position.x - state.position.x, position.z - state.position.z) / (now - state.sampledAt)
      : 0
    state.position = { ...position }
    recordSample(state.history, position, now)
    PlayerPose.createOrReplace(entity, { position: state.position, valid: true })
    state.sampledAt = now
  }
}

function humanTargets(shooter: Entity): ShotTarget<Entity>[] {
  const targets: ShotTarget<Entity>[] = []
  for (const [address, entity] of playerEntities) {
    if (
      entity === shooter ||
      !canPlayRound(address) ||
      Dead.has(entity) ||
      (PlayerHealth.getOrNull(entity)?.current ?? 0) <= 0
    )
      continue
    const center = avatarPosition(address)
    if (center) {
      const forward = avatarForward(address)
      targets.push({
        id: entity,
        center,
        yaw: forward ? Math.atan2(forward.x, forward.z) : 0,
        regions: PLAYER_HIT_REGIONS
      })
    }
  }
  return targets
}

export function playerLookDirection(address: string): Vector3 | undefined {
  return playerFacings.get(address)
}
export function avatarForward(address: string): Vector3 | undefined {
  const reported = playerFacings.get(address)
  if (reported) {
    const length = Math.hypot(reported.x, reported.z)
    if (length > 0.001) return { x: reported.x / length, y: 0, z: reported.z / length }
  }
  for (const [, identity, transform] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
    if (identity.address.toLowerCase() !== address) continue
    return rotationForward(transform.rotation)
  }
  return undefined
}

function rotationForward(rotation: { x: number; y: number; z: number; w: number }): Vector3 {
  return {
    x: 2 * (rotation.x * rotation.z + rotation.w * rotation.y),
    y: 0,
    z: 1 - 2 * (rotation.x * rotation.x + rotation.y * rotation.y)
  }
}

function humanAttacker(address: string, shooter: Entity, weapon: string): Attacker {
  return {
    address,
    name: matchStats.get(address)?.name ?? address,
    weapon,
    team: PlayerTeam.getOrNull(shooter)?.team ?? Team.NONE
  }
}

function shotTargets(shooter: Entity): ShotTarget<Entity>[] {
  return [...humanTargets(shooter), ...practiceTargets()]
}

function routeDamage(
  attacker: Attacker,
  target: Entity,
  damage: number,
  hitGroup: HitGroup,
  origin: Vector3,
  armorRatio: number,
  traces = [{ group: hitGroup, damage }]
) {
  if (Bot.has(target)) damageBot(target, damage, attacker, hitGroup, armorRatio)
  else applyPlayerDamage(attacker, target, damage, hitGroup, origin, armorRatio, false, traces)
}

// Shared by human shooters and bots: same-team hits are ignored, kills are credited per attacker kind.
let flinchSequence = 0
export function applyPlayerDamage(
  attacker: Attacker,
  target: Entity,
  damage: number,
  hitGroup: HitGroup,
  origin: Vector3,
  armorRatio: number,
  blast = false,
  traces = [{ group: hitGroup, damage }]
) {
  if (
    PlayerTeam.getOrNull(target)?.team === attacker.team &&
    (!blast || PlayerAddress.get(target).address !== attacker.address)
  )
    return
  if (Dead.has(target) || PlayerHealth.get(target).current <= 0) return
  const targetAddress = PlayerAddress.get(target).address
  const health = PlayerHealth.getMutable(target)
  const equipment = PlayerEquipment.getMutable(target)
  const previousArmor = health.armor
  const hadArmor = health.armor > 0
  const armorProtected = armorCovers(hitGroup, health.armor, equipment.helmet)
  let punch = { pitch: 0, roll: 0 }
  if (!blast)
    for (const trace of traces) {
      const next = victimPunch(trace.group, trace.damage, armorCovers(trace.group, health.armor, equipment.helmet))
      if (next.pitch || next.roll) punch = next
    }
  const hit = armorDamage(damage, health.armor, equipment.helmet, hitGroup, blast, armorRatio)
  health.armor = hit.armor
  if (health.armor === 0) equipment.helmet = false
  const previousHealth = health.current
  health.current = Math.max(0, health.current - Math.floor(hit.damage))
  const wasKill = health.current === 0
  console.log(`[SERVER] Damage confirmed: ${hit.damage} (${previousHealth} -> ${health.current})`)
  if (!blast && !wasKill) {
    const profile = profileByName(attacker.weapon),
      bot = botEntityByAddress(attacker.address)
    const source = avatarPosition(attacker.address) ??
      (bot === undefined ? undefined : Transform.getOrNull(bot)?.position) ?? { ...origin, y: origin.y - 1.6 }
    room.send('playerFlinch', {
      address: targetAddress,
      round: getPractice()?.round ?? 0,
      sequence: ++flinchSequence,
      source,
      large: profile.kind === 'gun' && largeFlinch(profile.id, hitGroup)
    })
  }
  if (wasKill) killPlayer(target, attacker, !blast && hitGroup === 'head')
  if (health.current < previousHealth || health.armor < previousArmor)
    room.send('combatImpact', {
      target: targetAddress,
      position: avatarPosition(targetAddress) ?? origin,
      hitGroup,
      armor: armorProtected,
      wasKill
    })
  room.send('playerVoice', {
    address: targetAddress,
    position: avatarPosition(targetAddress) ?? origin,
    clip: playerVoice(hitGroup, blast ? hadArmor : armorProtected, equipment.helmet, wasKill)
  })
  room.send('damageConfirmed', {
    targetPlayerAddress: targetAddress,
    damage: Math.floor(hit.damage),
    newHealth: health.current,
    wasKill,
    origin,
    hitGroup,
    punchPitch: punch.pitch,
    punchRoll: punch.roll
  })
}

function killPlayer(target: Entity, attacker?: Attacker, headshot = false) {
  if (Dead.has(target)) return
  const address = PlayerAddress.get(target).address
  dropDeadPlayer(target)
  Dead.create(target, { deathTime: Date.now() / 1000, respawnTime: 0 })
  if (attacker?.address === address) recordPracticeStats(address, -1, 0)
  else if (attacker) creditKill(attacker)
  recordPracticeStats(address, 0, 1)
  room.send('playerKill', {
    weapon: attacker?.weapon ?? 'worldspawn',
    killer: attacker?.name ?? '',
    victim: matchStats.get(address)?.name ?? address,
    killerTeam: attacker?.team ?? 0,
    victimTeam: PlayerTeam.get(target).team,
    headshot,
    suicide: !attacker || attacker.address === address
  })
}

export function applyFallDamage(target: Entity, speed: number, position: Vector3) {
  if (Dead.has(target) || fallDamage(speed) <= 0) return
  const health = PlayerHealth.getMutable(target)
  if (health.current <= 0) return
  const address = PlayerAddress.get(target).address,
    result = resolveFall(health.current, speed)
  health.current = result.health
  shotState(address).accuracy.pitch = 0
  const wasKill = health.current === 0
  if (wasKill) killPlayer(target)
  room.send('playerVoice', { address, position, clip: playerVoice('body', false, false, wasKill) })
  if (result.splat) room.send('playerVoice', { address, position, clip: 'bodysplat' })
  room.send('damageConfirmed', {
    kind: 'fall',
    splat: result.splat,
    targetPlayerAddress: address,
    damage: result.damage,
    newHealth: health.current,
    wasKill,
    origin: position,
    hitGroup: 'body',
    punchPitch: 0,
    punchRoll: 0
  })
}

// Singleton entity for match leaderboard
let leaderboardEntity: Entity | null = null

// Only the server installs incoming component validators.
export function setupServerAuthoritative() {
  PlayerInventory.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
  PlayerMoney.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
  if (!isServer()) return
  PlayerEquipment.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
  Weapon.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
  // Only server can modify health
  PlayerHealth.validateBeforeChange((value) => {
    return value.senderAddress === AUTH_SERVER_PEER_ID
  })

  // Only server can modify team
  PlayerTeam.validateBeforeChange((value) => {
    return value.senderAddress === AUTH_SERVER_PEER_ID
  })

  // Only server can modify player address
  PlayerAddress.validateBeforeChange((value) => {
    return value.senderAddress === AUTH_SERVER_PEER_ID
  })

  // Only server can modify dead state
  Dead.validateBeforeChange((value) => {
    return value.senderAddress === AUTH_SERVER_PEER_ID
  })

  // Only server can modify player stats
  PlayerStats.validateBeforeChange((value) => {
    return value.senderAddress === AUTH_SERVER_PEER_ID
  })

  // Only server can modify match leaderboard
  MatchLeaderboard.validateBeforeChange((value) => {
    return value.senderAddress === AUTH_SERVER_PEER_ID
  })
}

// Initialize server-only entities (runs only on server)
export function initializeServerEntities() {
  // Create singleton leaderboard entity
  leaderboardEntity = engine.addEntity()
  MatchLeaderboard.create(leaderboardEntity, {
    players: []
  })

  // Sync leaderboard entity to clients
  syncEntity(leaderboardEntity, [MatchLeaderboard.componentId])

  console.log('[SERVER] Created match leaderboard entity')
}

// Update leaderboard from matchStats
export function updateLeaderboard() {
  if (!leaderboardEntity) return

  // Convert matchStats to array and sort by kills (descending)
  const sortedPlayers = rankScores(
    Array.from(matchStats.entries()).map(([address, stats]) => ({
      address,
      name: stats.name,
      kills: stats.kills,
      deaths: stats.deaths
    }))
  ).slice(0, 10) // Top 10

  // Update leaderboard component
  const leaderboard = MatchLeaderboard.getMutable(leaderboardEntity)
  leaderboard.players = sortedPlayers

  console.log(
    '[SERVER] Updated leaderboard, top player:',
    sortedPlayers[0]?.name || 'none',
    'with',
    sortedPlayers[0]?.kills || 0,
    'kills'
  )
}

export function recordPracticeStats(address: string, kills: number, deaths: number, reset = false) {
  const stats = matchStats.get(address)
  const entity = playerEntities.get(address)
  if (!stats || entity === undefined || !PlayerStats.has(entity)) return
  stats.kills = (reset ? 0 : stats.kills) + kills
  stats.deaths = (reset ? 0 : stats.deaths) + deaths
  PlayerStats.createOrReplace(entity, { kills: stats.kills, deaths: stats.deaths, assists: stats.assists })
  updateLeaderboard()
}

// Get player name from PlayerIdentityData/AvatarBase
function getPlayerName(playerAddress: string): string {
  for (const [_, identity, avatarBase] of engine.getEntitiesWith(PlayerIdentityData, AvatarBase)) {
    if (identity.address.toLowerCase() === playerAddress.toLowerCase()) {
      return avatarBase.name || playerAddress.substring(0, 10) + '...'
    }
  }
  return playerAddress.substring(0, 10) + '...'
}

// Server message handlers
export function setupServerMessageHandlers() {
  // SERVER: Handle player join
  // Workaround for clients whose synced state went stale while suspended: decentraland/sdk#1198.
  room.onMessage('resync', (data, context) => {
    if (!context) return
    const address = context.from.toLowerCase()
    playerHeartbeat(address)
    rejoinPlayer(address)
    touchMatchState()
    touchBomb()
    if (leaderboardEntity !== null) MatchLeaderboard.getMutable(leaderboardEntity)
    const player = playerEntities.get(address)
    if (player !== undefined) {
      for (const component of [
        PlayerHealth,
        PlayerMoney,
        PlayerInventory,
        PlayerEquipment,
        PlayerTeam,
        PlayerPose,
        PlayerStats,
        Weapon
      ]) {
        if (component.has(player)) component.getMutable(player)
      }
    }
    if (data.missedSpawn) resendSpawn(address)
  })

  room.onMessage('playerJoin', (_data, context) => {
    if (!context) return

    const playerAddress = context.from.toLowerCase()
    playerHeartbeat(playerAddress)

    // Check if player already exists
    const existing = playerEntities.get(playerAddress)
    if (existing !== undefined && PlayerAddress.getOrNull(existing)?.address === playerAddress) {
      rejoinPlayer(playerAddress)
      return
    }

    // Get player name
    const playerName = getPlayerName(playerAddress)

    // Check if player has existing match stats (rejoining)
    let stats = matchStats.get(playerAddress)
    if (!stats) {
      // New player - initialize match stats
      stats = {
        kills: 0,
        deaths: 0,
        assists: 0,
        name: playerName
      }
      matchStats.set(playerAddress, stats)
      console.log(`[SERVER] Initialized new match stats for ${playerName}`)
    } else {
      console.log(`[SERVER] Player ${playerName} rejoining with ${stats.kills} kills, ${stats.deaths} deaths`)
    }

    // Create entity for this player (data container)
    const playerEntity = engine.addEntity()
    playerEntities.set(playerAddress, playerEntity)

    // Sync this entity (including PlayerAddress so clients can identify which entity is theirs)
    syncEntity(playerEntity, [
      PlayerHealth.componentId,
      PlayerMoney.componentId,
      PlayerInventory.componentId,
      PlayerEquipment.componentId,
      PlayerTeam.componentId,
      PlayerAddress.componentId,
      PlayerPose.componentId,
      Dead.componentId,
      PlayerStats.componentId,
      Weapon.componentId
    ])

    // Add player address component
    PlayerAddress.create(playerEntity, {
      address: playerAddress
    })
    const initialPosition = avatarPosition(playerAddress)
    PlayerPose.create(playerEntity, {
      position: initialPosition ?? { x: 0, y: 0, z: 0 },
      valid: initialPosition !== undefined
    })

    const assignedTeam = Team.NONE

    PlayerTeam.create(playerEntity, {
      team: assignedTeam
    })

    PlayerHealth.create(playerEntity, {
      current: 0,
      max: 100,
      armor: 0,
      maxArmor: 100
    })

    Dead.create(playerEntity, { deathTime: Date.now() / 1000, respawnTime: 0 })
    PlayerEquipment.create(playerEntity, { bombSelected: false, defuseKit: false, helmet: false })
    PlayerMoney.create(playerEntity, { amount: START_MONEY })
    giveWeapon(playerEntity, 'AK47')

    // Restore stats from matchStats (handles both new and returning players)
    PlayerStats.create(playerEntity, {
      kills: stats.kills,
      deaths: stats.deaths,
      assists: stats.assists
    })

    // Update leaderboard with new/returning player
    updateLeaderboard()
  })

  const triggerSequences = new Map<string, number>()
  room.onMessage('playerTrigger', (data, context) => {
    if (!context) return
    const address = context.from.toLowerCase()
    if (!Number.isSafeInteger(data.sequence) || data.sequence <= (triggerSequences.get(address) ?? 0)) return
    triggerSequences.set(address, data.sequence)
    setPlayerTrigger(address, data.held)
  })

  room.onMessage('playerFacing', (data, context) => {
    if (!context) return
    const address = context.from.toLowerCase()
    if (!playerEntities.has(address)) return
    const length = Math.hypot(data.direction.x, data.direction.y, data.direction.z)
    if (!Number.isFinite(length) || length < 0.001) return
    playerFacings.set(address, {
      x: data.direction.x / length,
      y: data.direction.y / length,
      z: data.direction.z / length
    })
  })

  room.onMessage('playerReload', (_data, context) => {
    if (!context) return
    const player = playerEntities.get(context.from.toLowerCase())
    if (player === undefined) return
    const weapon = Weapon.getOrNull(player)
    const health = PlayerHealth.getOrNull(player)
    if (!weapon || !health) return
    const alive = health.current > 0 && !Dead.has(player)
    if (!canReload(weapon, alive)) return
    const now = Date.now() / 1000
    if ((shotState(context.from.toLowerCase()).burst?.readyAt ?? 0) > now) return
    if (startReload(Weapon.getMutable(player), now, alive)) {
      const gun = profileByName(weapon.name)
      if (gun.kind === 'gun') leaveScope(Weapon.getMutable(player), gun)
      resetPlayerAccuracy(context.from.toLowerCase(), false, true)
    }
  })

  const pendingShots = new Map<string, { at: number; round: number | undefined; fire: (at: number) => void }>()
  const flushShot = (address: string, now: number) => {
    const pending = pendingShots.get(address)
    if (!pending || now < pending.at) return
    pendingShots.delete(address)
    if (getPractice()?.round !== pending.round) return
    pending.fire(now - pending.at > SHOT_SCHEDULING_WINDOW ? now : pending.at)
  }
  engine.addSystem(() => {
    const now = Date.now() / 1000
    samplePlayerMotion(now)
    for (const address of pendingShots.keys()) flushShot(address, now)
  })

  // SERVER: Handle incoming shoot requests
  room.onMessage('playerShoot', (data, context) => {
    if (!context) return

    const shooterAddress = context.from.toLowerCase()
    const shooter = playerEntities.get(shooterAddress)
    if (shooter === undefined) return
    const practice = getPractice()
    if (!Weapon.has(shooter) || !PlayerHealth.has(shooter)) return
    const directionLength = Vector3.length(data.direction)
    if (!Number.isFinite(directionLength) || Math.abs(directionLength - 1) > 0.01) return
    const weapon = Weapon.getMutable(shooter)
    if (claimShot(weapon, data.shotId)) return
    const reject = () =>
      room.send('shotRejected', { owner: shooterAddress, round: practice?.round ?? 0, shotId: data.shotId })
    if (data.revision !== weapon.revision) {
      reject()
      return
    }
    const profile = profileByName(weapon.name)
    if (profile.kind !== 'gun') {
      reject()
      return
    }
    if (
      practice?.phase !== 'live' ||
      !canPlayRound(shooterAddress) ||
      isBombBusy(shooterAddress) ||
      PlayerEquipment.getOrNull(shooter)?.bombSelected
    ) {
      reject()
      return
    }
    const now = Date.now() / 1000
    flushShot(shooterAddress, now)
    if (pendingShots.has(shooterAddress)) {
      reject()
      return
    }
    const state = shotState(shooterAddress)
    const burstIndex = data.burstIndex ?? 0
    const burstMode = profile.alternate === 'burst' && weapon.mode === 1
    const burst = state.burst?.revision === weapon.revision ? state.burst : undefined
    if (
      !Number.isInteger(burstIndex) ||
      burstIndex < 0 ||
      burstIndex > 2 ||
      (burstIndex > 0 &&
        (!burstMode || !burst || burst.index !== burstIndex || burst.remaining <= 0 || now > burst.readyAt))
    ) {
      reject()
      return
    }
    const continuation = burstIndex > 0
    const at =
      continuation && burst
        ? burst.interval === 0
          ? now
          : shotDeadline(burst.nextAt, 0, now)
        : burstMode && burst
          ? shotDeadline(burst.readyAt, 0, now)
          : shotDeadline(weapon.lastShotTime, weapon.fireRate, now)
    if (at === undefined || now < weapon.readyAt) {
      reject()
      return
    }
    if (!continuation && !modeStats(profile, weapon.mode).automatic && !state.semi.claim()) {
      reject()
      return
    }
    const execute = (scheduledTime: number) => {
      const currentPractice = getPractice()
      if (
        currentPractice?.phase !== 'live' ||
        !canPlayRound(shooterAddress) ||
        isBombBusy(shooterAddress) ||
        PlayerEquipment.getOrNull(shooter)?.bombSelected
      ) {
        reject()
        return
      }
      const current = Weapon.getOrNull(shooter)
      if (!current || !PlayerHealth.has(shooter)) return
      const feet = avatarPosition(shooterAddress)
      if (!feet) {
        reject()
        return
      }
      if (current.revision !== data.revision || Date.now() / 1000 < current.readyAt) {
        reject()
        return
      }
      const weapon = Weapon.getMutable(shooter)
      const fireRate = weapon.fireRate
      if (burstMode) weapon.fireRate = Math.max(0, scheduledTime - weapon.lastShotTime)
      const rejected = fireShot(
        weapon,
        Date.now() / 1000,
        PlayerHealth.get(shooter).current > 0 && !Dead.has(shooter),
        scheduledTime
      )
      weapon.fireRate = fireRate
      if (rejected) {
        reject()
        console.log('[SERVER] Shot rejected:', data.shotId, rejected)
        return
      }
      weapon.lastFiredShotId = data.shotId
      console.log('[SERVER] Shot accepted:', data.shotId, 'ammo:', weapon.ammoClip)
      const state = shotState(shooterAddress)
      const targets = shotTargets(shooter)
      const claimedEntity =
        data.target === undefined
          ? undefined
          : isBotTarget(data.target)
            ? botEntityByAddress(data.target)
            : playerEntities.get(data.target)
      const accepted = acceptShotClaim(
        {
          origin: data.origin,
          speed: data.speed,
          grounded: data.grounded,
          target: data.target,
          targetPosition: data.targetPosition
        },
        {
          eyeHeight: 1.6,
          shooterHistory: state.history,
          serverFeet: feet,
          serverSpeed: state.speed,
          serverAirborne: !groundedAt(feet, 0.6),
          targetHistory:
            data.target === undefined
              ? undefined
              : isBotTarget(data.target)
                ? botPositionHistory(data.target)
                : shotStates.get(data.target)?.history
        }
      )
      if (accepted.rejected.length) console.log('[SERVER] Shot claim rejected:', data.shotId, accepted.rejected)
      if (accepted.targetPosition && claimedEntity !== undefined) {
        const claimed = targets.find((target) => target.id === claimedEntity)
        if (claimed) claimed.center = accepted.targetPosition
      }
      const result = fireAkShot({
        gun: profile.id,
        mode: weapon.mode,
        zoom: weapon.zoom,
        continuationSpread: continuation ? burst?.spread : undefined,
        feet: accepted.feet,
        aim: data.direction,
        accuracy: state.accuracy,
        triggerHeld: state.triggerHeld,
        speed: accepted.speed,
        grounded: accepted.grounded,
        now: Date.now() / 1000,
        damage: continuation && profile.id === 'famas' ? 30 : weapon.damage,
        targets,
        random: shotRandom(getRoundSeed(), data.shotId)
      })
      if (!result) return
      if (continuation && burst) advanceBurst(burst, scheduledTime)
      else if (burstMode) {
        const next = beginBurst(profile, weapon.mode, weapon.ammoClip + 1, scheduledTime)
        if (next)
          state.burst = { ...next, revision: weapon.revision, spread: profile.id === 'glock18' ? 0.05 : result.spread }
      }
      firedScope(weapon, profile)
      storeActiveGun(shooter)
      room.send('practiceShot', {
        owner: shooterAddress,
        round: currentPractice?.round ?? 0,
        shotId: data.shotId,
        pitch: result.pitch,
        yaw: result.yaw,
        position: result.position,
        shots: state.accuracy.shots,
        accuracy: state.accuracy.accuracy,
        right: state.accuracy.right
      })
      for (const hit of damageBatches(result.impacts))
        routeDamage(
          humanAttacker(shooterAddress, shooter, weapon.name),
          hit.target,
          hit.damage,
          hit.group,
          result.origin,
          profile.armorRatio,
          hit.traces
        )
    }
    if (at > now) pendingShots.set(shooterAddress, { at, round: practice?.round, fire: execute })
    else execute(at)
  })

  room.onMessage('knifeAttack', (data, context) => {
    if (!context || (data.attack !== 'swing' && data.attack !== 'stab')) return
    const attack: KnifeAttack = data.attack
    const shooterAddress = context.from.toLowerCase(),
      shooter = playerEntities.get(shooterAddress),
      practice = getPractice()
    if (
      shooter === undefined ||
      practice?.phase !== 'live' ||
      !canPlayRound(shooterAddress) ||
      Dead.has(shooter) ||
      PlayerHealth.get(shooter).current <= 0 ||
      isBombBusy(shooterAddress) ||
      PlayerEquipment.getOrNull(shooter)?.bombSelected
    )
      return
    const current = Weapon.getOrNull(shooter)
    const length = Vector3.length(data.direction),
      feet = avatarPosition(shooterAddress)
    if (
      !current ||
      current.name !== 'Knife' ||
      current.revision !== data.revision ||
      Date.now() / 1000 < current.readyAt ||
      !feet ||
      !Number.isFinite(length) ||
      Math.abs(length - 1) > 0.01
    )
      return
    const weapon = Weapon.getMutable(shooter)
    if (claimShot(weapon, data.shotId)) return
    const now = Date.now() / 1000
    let state = knifeStates.get(shooterAddress)
    if (!state || state.revision !== weapon.revision) {
      state = { ...freshKnifeCooldown(), revision: weapon.revision }
      knifeStates.set(shooterAddress, state)
    }
    const origin = { x: feet.x, y: feet.y + 1.6, z: feet.z }
    const trace = traceKnife(origin, data.direction, shotTargets(shooter), attack)
    if (!trace) return
    const target = trace.hit?.target
    let backstab = false
    if (target !== undefined && attack === 'stab') {
      const victimForward = Bot.has(target)
        ? rotationForward(Transform.get(target).rotation)
        : avatarForward(PlayerAddress.get(target).address)
      backstab = !!victimForward && isKnifeBackstab(data.direction, victimForward)
    }
    const outcome = resolveKnifeAttack(
      state,
      attack,
      now,
      trace.contact,
      trace.hit?.group,
      backstab,
      target !== undefined
    )
    if (!outcome) return
    weapon.lastFiredShotId = data.shotId
    room.send('knifeResult', {
      owner: shooterAddress,
      round: practice.round,
      shotId: data.shotId,
      attack,
      position: trace.position,
      contact: trace.contact,
      target: target !== undefined
    })
    if (target === undefined) return
    routeDamage(
      humanAttacker(shooterAddress, shooter, 'Knife'),
      target,
      outcome.damage,
      trace.hit!.group,
      origin,
      KNIFE_ARMOR_RATIO
    )
  })
}
