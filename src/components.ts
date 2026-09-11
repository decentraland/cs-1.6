import { Schemas, engine } from '@dcl/sdk/ecs'

// Player health and state
export const PlayerHealth = engine.defineComponent('PlayerHealth', {
  current: Schemas.Int,
  max: Schemas.Int,
  armor: Schemas.Float,
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
  revision: Schemas.Int,
  readyAt: Schemas.Double,
  damage: Schemas.Int,
  ammoClip: Schemas.Int,
  maxAmmoClip: Schemas.Int,
  ammoReserve: Schemas.Int,
  maxAmmoReserve: Schemas.Int,
  fireRate: Schemas.Float, // seconds between shots
  lastShotTime: Schemas.Double,
  lastShotId: Schemas.Int,
  lastFiredShotId: Schemas.Int,
  isReloading: Schemas.Boolean,
  reloadTime: Schemas.Float,
  reloadStartTime: Schemas.Double
})

export const PlayerInventory = engine.defineComponent('PlayerInventory', {
  active: Schemas.String,
  items: Schemas.Array(Schemas.Map({id:Schemas.String,clip:Schemas.Int,reserve:Schemas.Int}))
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

export const PlayerEquipment = engine.defineComponent('PlayerEquipment', {
  bombSelected: Schemas.Boolean,
  defuseKit: Schemas.Boolean,
  helmet: Schemas.Boolean
})

export const BombObjective = engine.defineComponent('BombObjective', {
  phase: Schemas.String, carrier: Schemas.String, planter: Schemas.String,
  defuser: Schemas.String, site: Schemas.String, position: Schemas.Vector3,
  actionStarted: Schemas.Double, actionEnds: Schemas.Double,
  explodeAt: Schemas.Double, progress: Schemas.Float, round: Schemas.Int
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

export const PlayerPose = engine.defineComponent('PlayerPose', {
  position: Schemas.Vector3,
  valid: Schemas.Boolean
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
  front: Schemas.Float,
  right: Schemas.Float,
  rear: Schemas.Float,
  left: Schemas.Float
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

export const Practice = engine.defineComponent('Practice', {
  mode: Schemas.String,
  roster: Schemas.Array(Schemas.Map({ address: Schemas.String, team: Schemas.Int, eligibleRound: Schemas.Int, connected: Schemas.Boolean })),
  phase: Schemas.String,
  owner: Schemas.String,
  remaining: Schemas.Int,
  timeLeft: Schemas.Int,
  round: Schemas.Int,
  ctScore: Schemas.Int,
  tScore: Schemas.Int,
  maxWins: Schemas.Int,
  matchOver: Schemas.Boolean,
  botKills: Schemas.Array(Schemas.Int),
  botDeaths: Schemas.Array(Schemas.Int),
  kills: Schemas.Int
})

export const Bot = engine.defineComponent('Bot', {
  index: Schemas.Int,
  health: Schemas.Int,
  name: Schemas.String,
  alive: Schemas.Boolean
})
