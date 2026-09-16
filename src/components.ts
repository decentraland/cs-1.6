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
  mode: Schemas.Int,
  zoom: Schemas.Int,
  resumeZoom: Schemas.Int,
  alternateAt: Schemas.Double,
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
  reloadStartTime: Schemas.Double,
  reloadStage: Schemas.Int,
  reloadStepAt: Schemas.Double,
  reloadStep: Schemas.Int
})

export const PlayerInventory = engine.defineComponent('PlayerInventory', {
  active: Schemas.String,
  items: Schemas.Array(
    Schemas.Map({ id: Schemas.String, clip: Schemas.Int, reserve: Schemas.Int, mode: Schemas.Optional(Schemas.Int) })
  ),
  ammo: Schemas.Optional(Schemas.Array(Schemas.Map({ type: Schemas.String, amount: Schemas.Int })))
})

export const DroppedWeapon = engine.defineComponent('DroppedWeapon', {
  gun: Schemas.String,
  clip: Schemas.Int,
  reserve: Schemas.Int,
  mode: Schemas.Int,
  position: Schemas.Vector3,
  yaw: Schemas.Float,
  round: Schemas.Int,
  settled: Schemas.Boolean
})

export const GrenadeProjectile = engine.defineComponent('GrenadeProjectile', {
  kind: Schemas.String,
  owner: Schemas.String,
  team: Schemas.Int,
  position: Schemas.Vector3,
  velocity: Schemas.Vector3,
  center: Schemas.Vector3,
  grounded: Schemas.Boolean,
  bounces: Schemas.Int,
  animation: Schemas.Int,
  phase: Schemas.String,
  created: Schemas.Double,
  activated: Schemas.Double,
  expires: Schemas.Double,
  round: Schemas.Int
})
export const GrenadeFlash = engine.defineComponent('GrenadeFlash', {
  target: Schemas.String,
  start: Schemas.Double,
  hold: Schemas.Float,
  fade: Schemas.Float,
  alpha: Schemas.Int
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
  phase: Schemas.String,
  carrier: Schemas.String,
  planter: Schemas.String,
  defuser: Schemas.String,
  site: Schemas.String,
  position: Schemas.Vector3,
  settled: Schemas.Boolean,
  yaw: Schemas.Float,
  actionStarted: Schemas.Double,
  actionEnds: Schemas.Double,
  explodeAt: Schemas.Double,
  readyAt: Schemas.Double,
  progress: Schemas.Float,
  round: Schemas.Int
})

// Player is dead
export const Dead = engine.defineComponent('Dead', {
  deathTime: Schemas.Float,
  respawnTime: Schemas.Float
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
  roster: Schemas.Array(
    Schemas.Map({ address: Schemas.String, team: Schemas.Int, eligibleRound: Schemas.Int, connected: Schemas.Boolean })
  ),
  phase: Schemas.String,
  remaining: Schemas.Int,
  timeLeft: Schemas.Int,
  buyTimeLeft: Schemas.Int,
  round: Schemas.Int,
  ctScore: Schemas.Int,
  tScore: Schemas.Int,
  maxWins: Schemas.Int,
  matchOver: Schemas.Boolean,
  botKills: Schemas.Array(Schemas.Int),
  botDeaths: Schemas.Array(Schemas.Int),
  botDifficulty: Schemas.String
})

export const Bot = engine.defineComponent('Bot', {
  index: Schemas.Int,
  team: Schemas.Int,
  health: Schemas.Int,
  name: Schemas.String,
  alive: Schemas.Boolean,
  weapon: Schemas.String,
  defuseKit: Schemas.Boolean
})

const bodyLayer = Schemas.Map({
  clip: Schemas.String,
  at: Schemas.Double,
  rate: Schemas.Float,
  loop: Schemas.Boolean,
  revision: Schemas.Double
})
export const BotBodyPose = engine.defineComponent('BotBodyPose', {
  model: Schemas.String,
  upper: bodyLayer,
  lower: Schemas.Optional(bodyLayer)
})
