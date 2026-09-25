import { engine, Schemas } from '@dcl/sdk/ecs'
import { registerMessages, isServer } from '@dcl/sdk/network'
import { initializeNightVision } from './nightvision'
import { initializePractice } from './practice'
import { weaponSystem } from './systems'
import { setupUI } from './ui'
import { delaySystem } from './delaySystem'
import { initializeFalling } from './falling'
import { setupServerAuthoritative, initializeServerEntities, setupServerMessageHandlers } from './server'
import { setupClientMessageHandlers, addClientSystems } from './client'

// Optional scalar 0 is omitted by the pinned SDK; preserve it inside the map.
const GunfireSchema = Schemas.Map({ gun: Schemas.String, mode: Schemas.Int, origin: Schemas.Vector3 })

const SurfaceImpactSchema = Schemas.Map({
  position: Schemas.Vector3,
  normal: Schemas.Vector3,
  material: Schemas.String,
  texture: Schemas.String
})

// Define message schemas for client-server communication
const Messages = {
  // Client sends when they join the game
  playerJoin: Schemas.Map({}),
  // Client noticed its synced state stopped changing (app suspended); the server re-sends state.
  resync: Schemas.Map({ missedSpawn: Schemas.Boolean }),

  // Client sends when they shoot
  playerShoot: Schemas.Map({
    burstIndex: Schemas.Optional(Schemas.Int),
    shotId: Schemas.Int,
    revision: Schemas.Int,
    direction: Schemas.Vector3,
    // Client-side context the server validates against recent samples (see hit-claims.ts).
    origin: Schemas.Vector3,
    speed: Schemas.Float,
    grounded: Schemas.Boolean,
    target: Schemas.Optional(Schemas.String),
    targetPosition: Schemas.Optional(Schemas.Vector3),
    // Server clock value of the newest state the client had drawn; bots are rewound to it.
    seenAt: Schemas.Optional(Schemas.Double)
  }),
  latencyProbe: Schemas.Map({ token: Schemas.Double }),
  latencyEcho: Schemas.Map({ token: Schemas.Double }),
  playerFacing: Schemas.Map({ direction: Schemas.Vector3 }),
  knifeAttack: Schemas.Map({
    round: Schemas.Int,
    shotId: Schemas.Int,
    revision: Schemas.Int,
    attack: Schemas.String,
    direction: Schemas.Vector3,
    view: Schemas.Optional(
      Schemas.Map({
        origin: Schemas.Vector3,
        speed: Schemas.Float,
        target: Schemas.Optional(Schemas.String),
        targetPosition: Schemas.Optional(Schemas.Vector3),
        seenAt: Schemas.Optional(Schemas.Double)
      })
    )
  }),
  knifeResult: Schemas.Map({
    feedback: Schemas.Optional(Schemas.Map({ sound: Schemas.String, pitch: Schemas.Float, origin: Schemas.Vector3 })),
    owner: Schemas.String,
    round: Schemas.Int,
    shotId: Schemas.Int,
    attack: Schemas.String,
    position: Schemas.Vector3,
    contact: Schemas.Boolean,
    target: Schemas.Boolean
  }),

  playerReload: Schemas.Map({ round: Schemas.Int, revision: Schemas.Int }),
  playerLanding: Schemas.Map({
    round: Schemas.Int,
    sequence: Schemas.Double,
    speed: Schemas.Float,
    position: Schemas.Vector3
  }),
  weaponAlternate: Schemas.Map({ round: Schemas.Int, revision: Schemas.Int }),
  grenadeUse: Schemas.Map({
    round: Schemas.Int,
    revision: Schemas.Int,
    held: Schemas.Boolean,
    direction: Schemas.Vector3,
    sequence: Schemas.Double
  }),
  weaponDrop: Schemas.Map({ round: Schemas.Int, revision: Schemas.Int, direction: Schemas.Vector3 }),
  weaponPickup: Schemas.Map({ address: Schemas.String, position: Schemas.Vector3, round: Schemas.Int }),
  weaponSelect: Schemas.Map({ slot: Schemas.String, round: Schemas.Int, revision: Schemas.Int }),
  playerTrigger: Schemas.Map({ held: Schemas.Boolean, sequence: Schemas.Double }),
  practiceShot: Schemas.Map({
    fire: Schemas.Optional(GunfireSchema),
    impacts: Schemas.Optional(Schemas.Array(SurfaceImpactSchema)),
    owner: Schemas.String,
    position: Schemas.Vector3,
    round: Schemas.Int,
    shotId: Schemas.Int,
    pitch: Schemas.Float,
    yaw: Schemas.Float,
    shots: Schemas.Int,
    accuracy: Schemas.Float,
    right: Schemas.Boolean
  }),
  weaponReloadSound: Schemas.Map({ round: Schemas.Int, volume: Schemas.Int }),
  shellReloadSound: Schemas.Map({
    owner: Schemas.String,
    round: Schemas.Int,
    position: Schemas.Vector3,
    variant: Schemas.Int,
    pitch: Schemas.Int
  }),
  weaponDryFire: Schemas.Map({
    owner: Schemas.String,
    round: Schemas.Int,
    gun: Schemas.String,
    position: Schemas.Vector3
  }),
  shotRejected: Schemas.Map({ owner: Schemas.String, round: Schemas.Int, shotId: Schemas.Int }),
  teamJoin: Schemas.Map({ team: Schemas.Int }),
  teamSpectate: Schemas.Map({}),
  spectatorStart: Schemas.Map({ playerAddress: Schemas.String, round: Schemas.Int }),
  nightVisionToggle: Schemas.Map({ enabled: Schemas.Boolean, round: Schemas.Int, sequence: Schemas.Double }),
  buyEquipment: Schemas.Map({ item: Schemas.String, round: Schemas.Int, sequence: Schemas.Double }),
  bombSelect: Schemas.Map({ selected: Schemas.Boolean, round: Schemas.Int }),
  bombDrop: Schemas.Map({ round: Schemas.Int, direction: Schemas.Vector3 }),
  bombUse: Schemas.Map({
    held: Schemas.Boolean,
    sequence: Schemas.Double,
    round: Schemas.Int,
    direction: Schemas.Vector3
  }),
  teamLeave: Schemas.Map({}),
  teamRestart: Schemas.Map({}),
  botDifficulty: Schemas.Map({ level: Schemas.String }),
  matchNotice: Schemas.Map({ address: Schemas.String, message: Schemas.String }),
  playerKill: Schemas.Map({
    killer: Schemas.String,
    victim: Schemas.String,
    weapon: Schemas.String,
    killerTeam: Schemas.Optional(Schemas.Int),
    victimTeam: Schemas.Optional(Schemas.Int),
    headshot: Schemas.Optional(Schemas.Boolean),
    suicide: Schemas.Optional(Schemas.Boolean)
  }),
  practiceSpawn: Schemas.Map({
    playerAddress: Schemas.String,
    round: Schemas.Int,
    position: Schemas.Vector3,
    yaw: Schemas.Float,
    seed: Schemas.Int
  }),
  practiceAttack: Schemas.Map({
    fire: Schemas.Optional(GunfireSchema),
    round: Schemas.Optional(Schemas.Int),
    impacts: Schemas.Optional(Schemas.Array(SurfaceImpactSchema)),
    origin: Schemas.Vector3,
    target: Schemas.Vector3,
    gun: Schemas.Optional(Schemas.String)
  }),

  playerFlinch: Schemas.Map({
    address: Schemas.String,
    round: Schemas.Int,
    sequence: Schemas.Double,
    source: Schemas.Vector3,
    large: Schemas.Boolean
  }),
  playerVoice: Schemas.Map({ address: Schemas.String, position: Schemas.Vector3, clip: Schemas.String }),
  combatImpact: Schemas.Map({
    target: Schemas.String,
    position: Schemas.Vector3,
    hitGroup: Schemas.String,
    armor: Schemas.Boolean,
    wasKill: Schemas.Boolean
  }),

  // Server confirms damage was applied
  damageConfirmed: Schemas.Map({
    kind: Schemas.Optional(Schemas.String),
    splat: Schemas.Optional(Schemas.Boolean),
    targetPlayerAddress: Schemas.String,
    damage: Schemas.Int,
    newHealth: Schemas.Int,
    wasKill: Schemas.Boolean,
    origin: Schemas.Vector3,
    hitGroup: Schemas.String,
    punchPitch: Schemas.Float,
    punchRoll: Schemas.Float
  })
}

// Register messages and get room
export const room = registerMessages(Messages)

export function main() {
  console.log('Starting CS 1.6 scene :)')

  // Add game systems
  engine.addSystem(delaySystem)

  // Set up multiplayer
  if (isServer()) {
    setupServerAuthoritative()
    engine.addSystem(weaponSystem)
    initializeServerEntities() // Create leaderboard entity (server only)
    setupServerMessageHandlers()
    initializePractice()
    initializeNightVision()
    initializeFalling()
  } else {
    setupClientMessageHandlers()
    addClientSystems()
    setupUI()
  }
}

// Local preview sceneId: 5a3d79406dc374a378efbbace78b4ff6c34f475c3164f395abd50b76111f188a (from machine UUID)
