import {
  engine,
  Transform,
  GltfContainer
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { registerMessages, isServer } from '@dcl/sdk/network'
import { Schemas } from '@dcl/sdk/ecs'
import { setupUI } from './ui'
import { delaySystem } from './delaySystem'
import { setupServerAuthoritative, initializeServerEntities, setupServerMessageHandlers } from './server'
import { setupClientMessageHandlers, addClientSystems, attachWeaponModel, hidePlayerPassports } from './client'

// Define message schemas for client-server communication
const Messages = {
  // Debug ping-pong
  ping: Schemas.Map({
    timestamp: Schemas.Int64
  }),
  pong: Schemas.Map({
    timestamp: Schemas.Int64
  }),

  // Client sends when they join the game
  playerJoin: Schemas.Map({}),

  // Client sends when they shoot
  playerShoot: Schemas.Map({
    direction: Schemas.Vector3, // Direction of shot
    targetPlayerAddress: Schemas.Optional(Schemas.String), // Player address if hit detected
    hitPosition: Schemas.Optional(Schemas.Vector3), // Where the client thinks they hit
    timestamp: Schemas.Int64 // Client timestamp for lag compensation
  }),

  // Server confirms damage was applied
  damageConfirmed: Schemas.Map({
    targetPlayerAddress: Schemas.String,
    damage: Schemas.Int,
    newHealth: Schemas.Int,
    wasKill: Schemas.Boolean
  }),

  // Server tells client to respawn
  respawnPlayer: Schemas.Map({
    playerAddress: Schemas.String
  })
}

// Register messages and get room
export const room = registerMessages(Messages)

export function main() {
  console.log('Starting CS 1.6 scene :)')
  // Make components server-authoritative (validation rules on both server and client)
  setupServerAuthoritative()

  // Add game systems
  engine.addSystem(delaySystem)

  // Set up multiplayer
  if (isServer()) {
    initializeServerEntities() // Create leaderboard entity (server only)
    setupServerMessageHandlers()
  } else {
    hidePlayerPassports()
    setupClientMessageHandlers()
    addClientSystems()
    setupUI()
    attachWeaponModel()
  }
}

// Local preview sceneId: 5a3d79406dc374a378efbbace78b4ff6c34f475c3164f395abd50b76111f188a (from machine UUID)

