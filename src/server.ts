import { engine, Entity, Transform, PlayerIdentityData, AvatarBase } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'
import { syncEntity } from '@dcl/sdk/network'
import {
  PlayerHealth,
  PlayerTeam,
  Team,
  PlayerAddress,
  Dead,
  PlayerStats,
  MatchLeaderboard
} from './components'
import { delay } from './delaySystem'
import { room } from './index'

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

// Singleton entity for match leaderboard
let leaderboardEntity: Entity | null = null

// Set up validation rules (runs on both server and client)
export function setupServerAuthoritative() {
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
function updateLeaderboard() {
  if (!leaderboardEntity) return

  // Convert matchStats to array and sort by kills (descending)
  const sortedPlayers = Array.from(matchStats.entries())
    .map(([address, stats]) => ({
      address,
      name: stats.name,
      kills: stats.kills,
      deaths: stats.deaths
    }))
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 10) // Top 10

  // Update leaderboard component
  const leaderboard = MatchLeaderboard.getMutable(leaderboardEntity)
  leaderboard.players = sortedPlayers

  console.log('[SERVER] Updated leaderboard, top player:', sortedPlayers[0]?.name || 'none', 'with', sortedPlayers[0]?.kills || 0, 'kills')
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

// Get team counts for balancing
function getTeamCounts(): { terrorists: number; counterTerrorists: number } {
  let terrorists = 0
  let counterTerrorists = 0

  for (const [_, team] of engine.getEntitiesWith(PlayerTeam)) {
    if (team.team === Team.TERRORIST) {
      terrorists++
    } else if (team.team === Team.COUNTER_TERRORIST) {
      counterTerrorists++
    }
  }

  return { terrorists, counterTerrorists }
}

// Assign team with balancing
function assignBalancedTeam(): Team {
  const counts = getTeamCounts()

  // Assign to team with fewer players
  if (counts.terrorists < counts.counterTerrorists) {
    return Team.TERRORIST
  } else if (counts.counterTerrorists < counts.terrorists) {
    return Team.COUNTER_TERRORIST
  } else {
    // Teams are equal, randomly assign
    return Math.random() > 0.5 ? Team.TERRORIST : Team.COUNTER_TERRORIST
  }
}

// Server-side respawn handler
export function handleServerRespawn(playerEntity: Entity, playerAddress: string) {
  if (!PlayerHealth.has(playerEntity)) return

  console.log(`[SERVER] Respawning player ${playerAddress}`)

  // Remove dead marker
  Dead.deleteFrom(playerEntity)

  // Restore health
  const health = PlayerHealth.getMutable(playerEntity)
  health.current = health.max
  health.armor = 0

  // Tell client to teleport and re-equip
  const message = {
    playerAddress: playerAddress
  }
  console.log('[SERVER] >>> Sending respawnPlayer:', message)
  room.send('respawnPlayer', message)
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

    const playerAddress = context.from
    console.log('[SERVER] <<< Received playerJoin from:', playerAddress)

    // Check if player already exists
    if (playerEntities.has(playerAddress)) {
      console.log('[SERVER] Player already exists')
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
    // Note: We don't sync Transform - server/clients read player positions from PlayerIdentityData entities
    syncEntity(playerEntity, [
      PlayerHealth.componentId,
      PlayerTeam.componentId,
      PlayerAddress.componentId,
      Dead.componentId,
      PlayerStats.componentId
    ])

    // Add player address component
    PlayerAddress.create(playerEntity, {
      address: playerAddress
    })

    // Assign team with balancing
    const assignedTeam = assignBalancedTeam()

    PlayerTeam.create(playerEntity, {
      team: assignedTeam
    })

    PlayerHealth.create(playerEntity, {
      current: 100,
      max: 100,
      armor: 0,
      maxArmor: 100
    })

    // Restore stats from matchStats (handles both new and returning players)
    PlayerStats.create(playerEntity, {
      kills: stats.kills,
      deaths: stats.deaths,
      assists: stats.assists
    })

    const counts = getTeamCounts()
    console.log(`[SERVER] Created player entity for ${playerName} (team: ${assignedTeam}, balance: T=${counts.terrorists} CT=${counts.counterTerrorists})`)

    // Update leaderboard with new/returning player
    updateLeaderboard()
  })

  // SERVER: Handle incoming shoot requests
  room.onMessage('playerShoot', (data, context) => {
    if (!context) return

    const shooterAddress = context.from
    console.log('[SERVER] <<< Received playerShoot from:', shooterAddress, 'data:', data)

    // If client reported a hit, validate it
    if (data.targetPlayerAddress && data.hitPosition) {
      const targetAddress = data.targetPlayerAddress as string
      const target = playerEntities.get(targetAddress)

      if (!target) {
        console.log('[SERVER] Target player not found:', targetAddress, playerEntities)
        return
      }

      // Check if target exists and has health
      if (!PlayerHealth.has(target)) {
        console.log('[SERVER] Invalid target entity')
        return
      }

      // Get target position from PlayerIdentityData (avatar entity)
      let targetPos: Vector3 | null = null
      for (const [_avatarEntity, identityData] of engine.getEntitiesWith(PlayerIdentityData)) {
        if (identityData.address === targetAddress) {
          const avatarTransform = Transform.getOrNull(_avatarEntity)
          if (avatarTransform) targetPos = avatarTransform.position
          break
        }
      }

      if (!targetPos) {
        console.log('[SERVER] Could not find target avatar position')
        return
      }

      // Validate hit is reasonably close (lag compensation tolerance)
      const distance = Vector3.distance(targetPos, data.hitPosition)
      const MAX_TOLERANCE = 2.0 // 2 meters tolerance for lag

      if (distance > MAX_TOLERANCE) {
        console.log(`[SERVER] Hit rejected - target too far (${distance}m)`)
        return
      }

      // Get shooter's weapon (assume 30 damage for now, or lookup)
      const baseDamage = 30

      // Apply damage
      const health = PlayerHealth.getMutable(target)
      let actualDamage = baseDamage

      // Armor reduces damage
      if (health.armor > 0) {
        const armorDamage = Math.min(health.armor, actualDamage * 0.5)
        health.armor -= Math.floor(armorDamage)
        actualDamage -= armorDamage
      }

      const previousHealth = health.current
      health.current -= Math.floor(actualDamage)

      // Clamp to 0
      if (health.current < 0) {
        health.current = 0
      }

      const wasKill = health.current === 0

      console.log(`[SERVER] Damage confirmed: ${actualDamage} (${previousHealth} -> ${health.current})`)

      // If player died, mark as dead and schedule respawn
      if (wasKill && !Dead.has(target)) {
        const currentTime = Date.now() / 1000
        Dead.create(target, {
          deathTime: currentTime,
          respawnTime: currentTime + 5
        })

        // Update kill/death stats in matchStats (persistent)
        const shooterStats = matchStats.get(shooterAddress)
        if (shooterStats) {
          shooterStats.kills++
          console.log(`[SERVER] ${shooterStats.name} now has ${shooterStats.kills} kills`)
        }

        const targetStats = matchStats.get(targetAddress)
        if (targetStats) {
          targetStats.deaths++
          console.log(`[SERVER] ${targetStats.name} now has ${targetStats.deaths} deaths`)
        }

        // Also update entity components (for current session display)
        const shooter = playerEntities.get(shooterAddress)
        if (shooter && PlayerStats.has(shooter)) {
          const entityStats = PlayerStats.getMutable(shooter)
          entityStats.kills = shooterStats?.kills || 0
          entityStats.deaths = shooterStats?.deaths || 0
        }

        if (PlayerStats.has(target)) {
          const entityStats = PlayerStats.getMutable(target)
          entityStats.kills = targetStats?.kills || 0
          entityStats.deaths = targetStats?.deaths || 0
        }

        // Update leaderboard
        updateLeaderboard()

        console.log(`[SERVER] Player ${targetAddress} died (killed by ${shooterAddress}), respawning in 5 seconds`)

        // Schedule respawn after 5 seconds
        delay(5000, () => {
          handleServerRespawn(target, targetAddress)
        })
      }

      // Broadcast damage confirmation to all clients
      const damageMessage = {
        targetPlayerAddress: targetAddress,
        damage: Math.floor(actualDamage),
        newHealth: health.current,
        wasKill: wasKill
      }
      console.log('[SERVER] >>> Sending damageConfirmed:', damageMessage)
      room.send('damageConfirmed', damageMessage)
    }
  })
}
