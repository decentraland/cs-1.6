import { engine, Schemas } from '@dcl/sdk/ecs'
import { registerMessages, isServer } from '@dcl/sdk/network'
import { initializePractice } from './practice'
import { weaponSystem } from './systems'
import { setupUI } from './ui'
import { delaySystem } from './delaySystem'
import { setupServerAuthoritative, initializeServerEntities, setupServerMessageHandlers } from './server'
import { setupClientMessageHandlers, addClientSystems } from './client'

// Define message schemas for client-server communication
const Messages = {
  // Client sends when they join the game
  playerJoin: Schemas.Map({}),
  // Client noticed its synced state stopped changing (app suspended); the server re-sends state.
  resync: Schemas.Map({ missedSpawn: Schemas.Boolean }),

  // Client sends when they shoot
  playerShoot: Schemas.Map({
    shotId: Schemas.Int,
    revision: Schemas.Int,
    direction: Schemas.Vector3,
    // Client-side context the server validates against recent samples (see hit-claims.ts).
    origin: Schemas.Vector3,
    speed: Schemas.Float,
    grounded: Schemas.Boolean,
    target: Schemas.Optional(Schemas.String),
    targetPosition: Schemas.Optional(Schemas.Vector3)
  }),
  playerFacing: Schemas.Map({ direction: Schemas.Vector3 }),
  knifeAttack: Schemas.Map({
    shotId: Schemas.Int,
    revision: Schemas.Int,
    attack: Schemas.String,
    direction: Schemas.Vector3
  }),
  knifeResult: Schemas.Map({
    owner: Schemas.String,
    round: Schemas.Int,
    shotId: Schemas.Int,
    attack: Schemas.String,
    position: Schemas.Vector3,
    contact: Schemas.Boolean,
    target: Schemas.Boolean
  }),

  playerReload: Schemas.Map({}),
  weaponSelect: Schemas.Map({ slot: Schemas.String, round: Schemas.Int, revision: Schemas.Int }),
  playerTrigger: Schemas.Map({ held: Schemas.Boolean, sequence: Schemas.Double }),
  practiceShot: Schemas.Map({
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
  shotRejected: Schemas.Map({ owner: Schemas.String, round: Schemas.Int, shotId: Schemas.Int }),
  teamJoin: Schemas.Map({ team: Schemas.Int }),
  teamSpectate: Schemas.Map({}),
  spectatorStart: Schemas.Map({ playerAddress: Schemas.String, round: Schemas.Int }),
  buyEquipment: Schemas.Map({ item: Schemas.String, round: Schemas.Int, sequence: Schemas.Double }),
  bombSelect: Schemas.Map({ selected: Schemas.Boolean, round: Schemas.Int }),
  bombDrop: Schemas.Map({ round: Schemas.Int }),
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
  playerKill: Schemas.Map({ killer: Schemas.String, victim: Schemas.String, weapon: Schemas.String }),
  practiceSpawn: Schemas.Map({
    playerAddress: Schemas.String,
    round: Schemas.Int,
    position: Schemas.Vector3,
    yaw: Schemas.Float,
    seed: Schemas.Int
  }),
  practiceAttack: Schemas.Map({ origin: Schemas.Vector3, target: Schemas.Vector3 }),

  // Server confirms damage was applied
  damageConfirmed: Schemas.Map({
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
  } else {
    setupClientMessageHandlers()
    addClientSystems()
    setupUI()
  }
}

// Local preview sceneId: 5a3d79406dc374a378efbbace78b4ff6c34f475c3164f395abd50b76111f188a (from machine UUID)
