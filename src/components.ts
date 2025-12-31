import { Schemas, engine } from '@dcl/sdk/ecs'

// Player health and state
export const PlayerHealth = engine.defineComponent('PlayerHealth', {
  current: Schemas.Int,
  max: Schemas.Int,
  armor: Schemas.Int,
  maxArmor: Schemas.Int
})

// Team assignment
export enum Team {
  NONE = 0,
  TERRORIST = 1,
  COUNTER_TERRORIST = 2
}

export const PlayerTeam = engine.defineComponent('PlayerTeam', {
  team: Schemas.EnumNumber<Team>(Team, Team.NONE)
})

// Weapon data
export const Weapon = engine.defineComponent('Weapon', {
  name: Schemas.String,
  damage: Schemas.Int,
  ammoClip: Schemas.Int,
  maxAmmoClip: Schemas.Int,
  ammoReserve: Schemas.Int,
  maxAmmoReserve: Schemas.Int,
  fireRate: Schemas.Float, // seconds between shots
  lastShotTime: Schemas.Float,
  isReloading: Schemas.Boolean,
  reloadTime: Schemas.Float,
  reloadStartTime: Schemas.Float
})

// Money system
export const PlayerMoney = engine.defineComponent('PlayerMoney', {
  amount: Schemas.Int
})

// Kill/Death tracking
export const PlayerStats = engine.defineComponent('PlayerStats', {
  kills: Schemas.Int,
  deaths: Schemas.Int,
  assists: Schemas.Int
})

// Bomb component (for terrorists)
export const Bomb = engine.defineComponent('Bomb', {
  isPlanted: Schemas.Boolean,
  plantTime: Schemas.Float,
  detonateTime: Schemas.Float,
  isDefusing: Schemas.Boolean,
  defuseProgress: Schemas.Float
})

// Spawn point
export const SpawnPoint = engine.defineComponent('SpawnPoint', {
  team: Schemas.EnumNumber<Team>(Team, Team.NONE),
  isActive: Schemas.Boolean
})

// Bomb site
export const BombSite = engine.defineComponent('BombSite', {
  site: Schemas.String, // "A" or "B"
  isActive: Schemas.Boolean
})

// Game state
export enum GamePhase {
  WAITING = 0,
  WARMUP = 1,
  FREEZE_TIME = 2,
  LIVE = 3,
  ROUND_END = 4,
  HALFTIME = 5,
  MATCH_END = 6
}

export enum RoundEndReason {
  NONE = 0,
  T_WIN_ELIMINATION = 1,
  CT_WIN_ELIMINATION = 2,
  CT_WIN_TIME = 5
}

export const GameState = engine.defineComponent('GameState', {
  phase: Schemas.EnumNumber<GamePhase>(GamePhase, GamePhase.WAITING),
  roundNumber: Schemas.Int,
  tScore: Schemas.Int,
  ctScore: Schemas.Int,
  roundTimeLeft: Schemas.Float,
  freezeTimeLeft: Schemas.Float,
  roundEndReason: Schemas.EnumNumber<RoundEndReason>(RoundEndReason, RoundEndReason.NONE),
  bombPlanted: Schemas.Boolean,
  maxRounds: Schemas.Int
})

// Damage indicator (for hit markers)
export const DamageIndicator = engine.defineComponent('DamageIndicator', {
  damage: Schemas.Int,
  timestamp: Schemas.Float,
  lifetime: Schemas.Float
})

// Player is dead
export const Dead = engine.defineComponent('Dead', {
  deathTime: Schemas.Float,
  respawnTime: Schemas.Float
})

// Buyzone
export const BuyZone = engine.defineComponent('BuyZone', {
  team: Schemas.EnumNumber<Team>(Team, Team.NONE),
  isActive: Schemas.Boolean
})

// Player address (unique identifier for each player)
export const PlayerAddress = engine.defineComponent('PlayerAddress', {
  address: Schemas.String
})

// Player collider (attached to avatar, used for hit detection)
export const PlayerCollider = engine.defineComponent('PlayerCollider', {
  playerAddress: Schemas.String // Which player this collider belongs to
})

// Crosshair state (for dynamic crosshair expansion)
export const CrosshairState = engine.defineComponent('CrosshairState', {
  spread: Schemas.Float, // Current spread (0-1)
  baseSpread: Schemas.Float, // Base spread when standing still
  maxSpread: Schemas.Float, // Max spread when moving/shooting
  lastShotTime: Schemas.Float,
  isMoving: Schemas.Boolean,
  consecutiveShots: Schemas.Int, // Track burst fire count
  movementIntensity: Schemas.Float // How intensely player is moving
})

// Damage feedback (for visual damage indication)
export const DamageFeedback = engine.defineComponent('DamageFeedback', {
  intensity: Schemas.Float, // 0-1, how much red overlay to show
  lastDamageTime: Schemas.Float,
  previousHealth: Schemas.Int // Track health to detect damage
})

// Match leaderboard (singleton entity, server-authoritative, top 10 players)
export const MatchLeaderboard = engine.defineComponent('MatchLeaderboard', {
  players: Schemas.Array(
    Schemas.Map({
      address: Schemas.String,
      name: Schemas.String,
      kills: Schemas.Int,
      deaths: Schemas.Int
    })
  )
})
