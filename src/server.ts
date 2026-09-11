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
  Weapon
} from './components'
import { room } from './index'
import { creditPlayer } from './economy'
import { armorDamage } from './economy-rules'
import { damagePracticeBot, getPractice, practiceTargets, canPlayRound, playerHeartbeat } from './practice'
import { AccuracyState, freshAccuracy, setTrigger } from './accuracy'
import { fireAkShot, PLAYER_HIT_REGIONS, ShotTarget } from './ballistics'
import { giveWeapon } from './systems'
import { GUNS, profileByName } from './weapon-profiles'
import { freshGunAccuracy } from './gun-accuracy'
import { SemiAutoTrigger } from './inventory-rules'
import { claimShot, fireShot, shotDeadline, SHOT_SCHEDULING_WINDOW, startReload } from './combat-rules'
import { isBombBusy } from './bomb'
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
  accuracy: AccuracyState
  triggerHeld: boolean
  semi: SemiAutoTrigger
  position?: Vector3
  sampledAt: number
  speed: number
}
const shotStates = new Map<string, PlayerShotState>()
const knifeStates = new Map<string, KnifeCooldown & { revision: number }>()
const playerFacings = new Map<string, Vector3>()

export function resetPlayerAccuracy(address: string, newRound = false) {
  const player=playerEntities.get(address)
  const profile=profileByName(player===undefined?'AK-47':Weapon.getOrNull(player)?.name ?? 'AK-47')
  const gun=profile.kind==='gun'?profile:GUNS.ak47
  const state = shotStates.get(address)
  if (state && !newRound) { state.accuracy = freshGunAccuracy(gun.id);state.semi.reset() }
  else shotStates.set(address, { accuracy: freshGunAccuracy(gun.id), triggerHeld: false, semi:new SemiAutoTrigger(), sampledAt: 0, speed: 0 })
}

function shotState(address: string): PlayerShotState {
  const existing = shotStates.get(address)
  if (existing) return existing
  const state = { accuracy: freshAccuracy(), triggerHeld: false, semi:new SemiAutoTrigger(), sampledAt: 0, speed: 0 }
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
    if (!position) { state.position = undefined; state.speed = 0; continue }
    state.speed = state.position ? Math.hypot(position.x - state.position.x, position.z - state.position.z) / (now - state.sampledAt) : 0
    state.position = { ...position }
    PlayerPose.createOrReplace(entity, { position: state.position, valid: true })
    state.sampledAt = now
  }
}

function humanTargets(shooter: Entity): ShotTarget<Entity>[] {
  const targets: ShotTarget<Entity>[] = []
  for (const [address, entity] of playerEntities) {
    if (entity === shooter || !canPlayRound(address) || Dead.has(entity) || (PlayerHealth.getOrNull(entity)?.current ?? 0) <= 0) continue
    const center = avatarPosition(address)
    if (center) targets.push({ id: entity, center, regions: PLAYER_HIT_REGIONS })
  }
  return targets
}

function avatarForward(address: string): Vector3 | undefined {
  const reported=playerFacings.get(address)
  if(reported)return reported
  for (const [, identity, transform] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
    if (identity.address.toLowerCase() !== address) continue
    return rotationForward(transform.rotation)
  }
  return undefined
}

function rotationForward(rotation: { x: number; y: number; z: number; w: number }): Vector3 {
  return {x:2*(rotation.x*rotation.z+rotation.w*rotation.y),y:0,z:1-2*(rotation.x*rotation.x+rotation.y*rotation.y)}
}

function applyPlayerDamage(shooterAddress: string, shooter: Entity, target: Entity, damage: number, hitGroup: 'head' | 'body' | 'legs', origin: Vector3, weaponName: string, armorRatio: number) {
  if (PlayerTeam.getOrNull(target)?.team === PlayerTeam.getOrNull(shooter)?.team) return
  const targetAddress = PlayerAddress.get(target).address
  const health = PlayerHealth.getMutable(target)
  const equipment = PlayerEquipment.getMutable(target)
  const armorProtected = health.armor > 0 && (hitGroup === 'body' || hitGroup === 'head' && equipment.helmet)
  const punch = victimPunch(hitGroup, damage, armorProtected)
  const hit = armorDamage(damage,health.armor,equipment.helmet,hitGroup,false,armorRatio)
  health.armor = hit.armor
  if (health.armor === 0) equipment.helmet = false
  const previousHealth = health.current
  health.current = Math.max(0, health.current - Math.floor(hit.damage))
  const wasKill = health.current === 0
  console.log(`[SERVER] Damage confirmed: ${hit.damage} (${previousHealth} -> ${health.current})`)
  if (wasKill && !Dead.has(target)) {
    Dead.create(target, { deathTime: Date.now() / 1000, respawnTime: 0 })
    recordPracticeStats(shooterAddress, 1, 0)
    creditPlayer(shooterAddress,300)
    recordPracticeStats(targetAddress, 0, 1)
    room.send('playerKill', { weapon:weaponName,killer: matchStats.get(shooterAddress)?.name ?? shooterAddress, victim: matchStats.get(targetAddress)?.name ?? targetAddress })
  }
  room.send('damageConfirmed', {
    targetPlayerAddress: targetAddress, damage: Math.floor(hit.damage), newHealth: health.current, wasKill,
    origin, hitGroup, punchPitch: punch.pitch, punchRoll: punch.roll
  })
}

// Singleton entity for match leaderboard
let leaderboardEntity: Entity | null = null

// Only the server installs incoming component validators.
export function setupServerAuthoritative() {
  PlayerInventory.validateBeforeChange(value => value.senderAddress === AUTH_SERVER_PEER_ID)
  PlayerMoney.validateBeforeChange(value => value.senderAddress === AUTH_SERVER_PEER_ID)
  if (!isServer()) return
  PlayerEquipment.validateBeforeChange(value => value.senderAddress === AUTH_SERVER_PEER_ID)
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
  const sortedPlayers = rankScores(Array.from(matchStats.entries())
    .map(([address, stats]) => ({
      address,
      name: stats.name,
      kills: stats.kills,
      deaths: stats.deaths
    })))
    .slice(0, 10) // Top 10

  // Update leaderboard component
  const leaderboard = MatchLeaderboard.getMutable(leaderboardEntity)
  leaderboard.players = sortedPlayers

  console.log('[SERVER] Updated leaderboard, top player:', sortedPlayers[0]?.name || 'none', 'with', sortedPlayers[0]?.kills || 0, 'kills')
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
  // SERVER: Handle ping from client
  room.onMessage('ping', (data, context) => {
    if (!context) return
    console.log('[SERVER] <<< Received ping from:', context.from, 'timestamp:', data.timestamp)
    room.send('pong', { timestamp: data.timestamp })
    console.log('[SERVER] >>> Sent pong')
  })

  // SERVER: Handle player join
  room.onMessage('playerJoin', (_data, context) => {
    if (!context) return

    const playerAddress = context.from.toLowerCase()
    playerHeartbeat(playerAddress)

    // Check if player already exists
    const existing = playerEntities.get(playerAddress)
    if (existing !== undefined && PlayerAddress.getOrNull(existing)?.address === playerAddress) {
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
    PlayerPose.create(playerEntity, { position: initialPosition ?? { x: 0, y: 0, z: 0 }, valid: initialPosition !== undefined })

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
    PlayerMoney.create(playerEntity,{amount:800})
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
    if(!context)return
    const address=context.from.toLowerCase()
    if(!playerEntities.has(address))return
    const length=Math.hypot(data.direction.x,data.direction.z)
    if(!Number.isFinite(length)||length<.001)return
    playerFacings.set(address,{x:data.direction.x/length,y:0,z:data.direction.z/length})
  })

  room.onMessage('playerReload', (_data, context) => {
    if (!context) return
    const player = playerEntities.get(context.from.toLowerCase())
    if (player === undefined) return
    const weapon = Weapon.getMutableOrNull(player)
    const health = PlayerHealth.getOrNull(player)
    if (!weapon || !health) return
    if (startReload(weapon, Date.now() / 1000, health.current > 0 && !Dead.has(player))) resetPlayerAccuracy(context.from.toLowerCase())
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
    const weapon = Weapon.getMutableOrNull(shooter)
    const shooterHealth = PlayerHealth.getOrNull(shooter)
    if (!weapon || !shooterHealth) return
    const directionLength = Vector3.length(data.direction)
    if (!Number.isFinite(directionLength) || Math.abs(directionLength - 1) > 0.01) return
    if (claimShot(weapon, data.shotId)) return
    const reject = () => room.send('shotRejected', { owner: shooterAddress, round: practice?.round ?? 0, shotId: data.shotId })
    if (data.revision !== weapon.revision) { reject(); return }
    const profile=profileByName(weapon.name)
    if(profile.kind!=='gun') { reject();return }
    if (practice?.phase !== 'live' || !canPlayRound(shooterAddress) || isBombBusy(shooterAddress) || PlayerEquipment.getOrNull(shooter)?.bombSelected) { reject(); return }
    const now = Date.now() / 1000
    flushShot(shooterAddress, now)
    if (pendingShots.has(shooterAddress)) { reject(); return }
    const at = shotDeadline(weapon.lastShotTime, weapon.fireRate, now)
    if (at === undefined || now < weapon.readyAt) { reject(); return }
    if (!profile.automatic && !shotState(shooterAddress).semi.claim()) { reject(); return }
    const execute = (scheduledTime: number) => {
      const currentPractice = getPractice()
      if (currentPractice?.phase !== 'live' || !canPlayRound(shooterAddress) || isBombBusy(shooterAddress) || PlayerEquipment.getOrNull(shooter)?.bombSelected) { reject(); return }
      if (!Weapon.has(shooter) || !PlayerHealth.has(shooter)) return
      const feet = avatarPosition(shooterAddress)
      if (!feet) { reject(); return }
      const weapon = Weapon.getMutable(shooter)
      if (weapon.revision !== data.revision || Date.now()/1000 < weapon.readyAt) { reject(); return }
      const rejected = fireShot(weapon, Date.now() / 1000, PlayerHealth.get(shooter).current > 0 && !Dead.has(shooter), scheduledTime)
      if (rejected) {
        reject()
        console.log('[SERVER] Shot rejected:', data.shotId, rejected)
        return
      }
      weapon.lastFiredShotId = data.shotId
      console.log('[SERVER] Shot accepted:', data.shotId, 'ammo:', weapon.ammoClip)
      const state = shotState(shooterAddress)
      const solo = currentPractice?.mode === 'solo'
      const result = fireAkShot({
        gun:profile.id, feet, aim: data.direction, accuracy: state.accuracy, triggerHeld: state.triggerHeld,
        speed: state.speed, now: Date.now() / 1000, damage: weapon.damage,
        targets: solo ? practiceTargets() : humanTargets(shooter)
      })
      if (!result) return
      room.send('practiceShot', {
        owner: shooterAddress, round: currentPractice?.round ?? 0, shotId: data.shotId,
        pitch: result.pitch, yaw: result.yaw, position: result.position,
        shots: state.accuracy.shots, accuracy: state.accuracy.accuracy, right: state.accuracy.right
      })
      if (!result.hit) return
      const target = result.hit.target
      if (solo) {
        damagePracticeBot(shooterAddress, target, result.damage)
        return
      }
      applyPlayerDamage(shooterAddress,shooter,target,result.damage,result.hit.group,result.origin,weapon.name,profile.armorRatio)
    }
    if (at > now) pendingShots.set(shooterAddress, { at, round: practice?.round, fire: execute })
    else execute(at)
  })

  room.onMessage('knifeAttack', (data, context) => {
    if (!context || data.attack !== 'swing' && data.attack !== 'stab') return
    const attack: KnifeAttack=data.attack
    const shooterAddress=context.from.toLowerCase(),shooter=playerEntities.get(shooterAddress),practice=getPractice()
    if(shooter===undefined||practice?.phase!=='live'||!canPlayRound(shooterAddress)||Dead.has(shooter)||PlayerHealth.get(shooter).current<=0||isBombBusy(shooterAddress)||PlayerEquipment.getOrNull(shooter)?.bombSelected)return
    const weapon=Weapon.getMutableOrNull(shooter)
    const length=Vector3.length(data.direction),feet=avatarPosition(shooterAddress)
    if(!weapon||weapon.name!=='Knife'||weapon.revision!==data.revision||Date.now()/1000<weapon.readyAt||!feet||!Number.isFinite(length)||Math.abs(length-1)>.01)return
    if(claimShot(weapon,data.shotId))return
    const now=Date.now()/1000
    let state=knifeStates.get(shooterAddress)
    if(!state||state.revision!==weapon.revision) { state={...freshKnifeCooldown(),revision:weapon.revision};knifeStates.set(shooterAddress,state) }
    const solo=practice.mode==='solo',origin={x:feet.x,y:feet.y+1.6,z:feet.z}
    const trace=traceKnife(origin,data.direction,solo?practiceTargets():humanTargets(shooter),attack)
    if(!trace)return
    const target=trace.hit?.target
    let backstab=false
    if(target!==undefined&&attack==='stab') {
      const targetRotation=solo?Transform.getOrNull(target)?.rotation:undefined
      const victimForward=solo?(targetRotation?rotationForward(targetRotation):undefined):avatarForward(PlayerAddress.get(target).address)
      backstab=!!victimForward&&isKnifeBackstab(data.direction,victimForward)
    }
    const outcome=resolveKnifeAttack(state,attack,now,trace.contact,trace.hit?.group,backstab,target!==undefined)
    if(!outcome)return
    weapon.lastFiredShotId=data.shotId
    room.send('knifeResult',{owner:shooterAddress,round:practice.round,shotId:data.shotId,attack,position:trace.position,contact:trace.contact,target:target!==undefined})
    if(target===undefined)return
    if(solo)damagePracticeBot(shooterAddress,target,outcome.damage)
    else applyPlayerDamage(shooterAddress,shooter,target,outcome.damage,trace.hit!.group,origin,'Knife',KNIFE_ARMOR_RATIO)
  })
}
