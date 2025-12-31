# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Decentraland SDK7 scene template. Decentraland uses an Entity-Component-System (ECS) architecture where entities are just IDs, components are pure data containers, and systems contain the logic.

## SDK7 Reference Documentation

The `dclcontext/` folder contains comprehensive SDK7 reference documentation:
- `sdk7-complete-reference.md` - Complete SDK7 API reference (components, systems, UI, player data, inputs, events, animations, raycasting, network, blockchain)
- `sdk7-examples.mdc` - Common SDK7 patterns and examples
- `ui.mdc` - UI toolkit (dcl-ui-toolkit) reference for creating HUD elements and prompts
- `npc.mdc` - NPC toolkit (dcl-npc-toolkit) reference for creating interactive NPCs with dialogs
- `utils.mdc` - Utils library (@dcl-sdk/utils) for tweens, paths, triggers, timers
- `crypto.mdc` - Crypto toolkit for blockchain operations (MANA, NFTs, marketplace)

When implementing SDK7 features, refer to these context files for detailed API usage and patterns.

## Development Commands

**Preview the scene locally:**
```bash
npm run start
```
This starts a local development server. The scene can also be run through the Decentraland Editor in VS Code.

**Build the scene:**
```bash
npm run build
```
Compiles TypeScript and outputs to `bin/index.js` (as specified in scene.json).

**Deploy to Decentraland:**
```bash
npm run deploy
```

**Upgrade SDK to latest:**
```bash
npm run upgrade-sdk
```

**Upgrade SDK to next version:**
```bash
npm run upgrade-sdk:next
```

## Code Architecture

### Entry Point: `src/index.ts`
The main entry point exports a `main()` function that:
- Registers network message schemas using `registerMessages()`
- Sets up server-authoritative validation rules
- Conditionally runs server or client code using `isServer()` check
- Initializes the UI (client-only)

### Components: `src/components.ts`
Custom components are defined using `engine.defineComponent()` with schema definitions. Components MUST use the built-in `Schemas` types (String, Number, Boolean, Entity, Vector3, etc.) for all fields.

**Important:** When defining custom components, avoid reusing component IDs. IDs 1-2000 are reserved for base SDK components.

### Client Logic: `src/client.ts`
Client-side systems and handlers:
- Input handling (shooting, reloading)
- Local collider creation for hit detection
- Crosshair dynamics and damage feedback
- Message handlers for server responses

### Server Logic: `src/server.ts`
Server-authoritative game logic:
- Player join handling and team balancing
- Hit validation with lag compensation
- Damage application and respawn scheduling
- Leaderboard management

### Systems: `src/systems.ts`
Shared game systems (weapon reload logic, etc.)

### Delay System: `src/delaySystem.ts`
Frame-based timer replacement for `setTimeout` (unavailable in SDK7).

### UI: `src/ui.tsx`
Uses React ECS (`@dcl/sdk/react-ecs`) for declarative UI rendering. The UI is set up by calling `ReactEcsRenderer.setUiRenderer()` with a React component.

## SDK7 Key Concepts

### Entity Creation
```typescript
const entity = engine.addEntity()
```
Entities are just numeric IDs. No need to separately add them to the engine.

### Component Usage
```typescript
// Add component to entity
Transform.create(entity, { position: Vector3.create(0, 1, 0) })

// Read component (immutable)
const transform = Transform.get(entity)

// Modify component (mutable)
const mutableTransform = Transform.getMutable(entity)
mutableTransform.position = Vector3.create(1, 1, 1)

// Remove component
Transform.deleteFrom(entity)
```

### Querying in Systems
```typescript
function mySystem(dt: number) {
  for (const [entity, transform, customComponent] of engine.getEntitiesWith(Transform, CustomComponent)) {
    // transform and customComponent are read-only
    // Use CustomComponent.getMutable(entity) to modify
  }
}
```

### Mutability Best Practices
- Use `.get()` or `.getOrNull()` for read-only access (better performance)
- Use `.getMutable()` ONLY when actually modifying component data
- Immutable access provides significant performance gains

**Important Pattern - Check First, Mutate Later:**
```typescript
// ❌ WRONG - getMutable called early, used for conditions
function reload(player: Entity) {
  if (!Weapon.has(player)) return

  const weapon = Weapon.getMutable(player)  // Too early!

  // Checking conditions (read-only operations)
  if (weapon.isReloading || weapon.ammoClip === weapon.maxAmmoClip) return
  if (weapon.ammoReserve <= 0) return

  // Finally mutating
  weapon.isReloading = true
  weapon.reloadStartTime = Date.now() / 1000
}

// ✅ CORRECT - Use get/getOrNull for checks, getMutable only when mutating
function reload(player: Entity) {
  const weapon = Weapon.getOrNull(player)  // Read-only
  if (!weapon) return

  // All checks use read-only weapon
  if (weapon.isReloading || weapon.ammoClip === weapon.maxAmmoClip) return
  if (weapon.ammoReserve <= 0) return

  // NOW call getMutable when we actually need to change values
  const mutableWeapon = Weapon.getMutable(player)
  mutableWeapon.isReloading = true
  mutableWeapon.reloadStartTime = Date.now() / 1000
}
```

**In Systems:**
```typescript
// ❌ WRONG - getMutable in for loop, used for conditions
export function weaponSystem(dt: number) {
  for (const [entity, weapon] of engine.getEntitiesWith(Weapon)) {
    const mutableWeapon = Weapon.getMutable(entity)  // Too early!

    if (mutableWeapon.isReloading) {
      const reloadProgress = currentTime - mutableWeapon.reloadStartTime
      if (reloadProgress >= mutableWeapon.reloadTime) {
        // Mutation happens here
        mutableWeapon.ammoClip += ammoToReload
        mutableWeapon.isReloading = false
      }
    }
  }
}

// ✅ CORRECT - Use weapon from iteration for checks, getMutable only when mutating
export function weaponSystem(dt: number) {
  for (const [entity, weapon] of engine.getEntitiesWith(Weapon)) {
    // Use read-only weapon for checks
    if (weapon.isReloading) {
      const reloadProgress = currentTime - weapon.reloadStartTime
      if (reloadProgress >= weapon.reloadTime) {
        // NOW call getMutable when we need to change values
        const mutableWeapon = Weapon.getMutable(entity)
        mutableWeapon.ammoClip += ammoToReload
        mutableWeapon.isReloading = false
      }
    }
  }
}
```

**Why this matters:**
- `getMutable()` has performance overhead - only call when necessary
- Read operations are much faster with `get()` or `getOrNull()`
- Following this pattern can significantly improve frame rate in complex scenes

## Project Configuration

- **TypeScript Config:** Extends `@dcl/sdk/types/tsconfig.ecs7.json` with strict mode enabled
- **Scene Config:** `scene.json` defines scene metadata, parcels, spawn points, and feature toggles
- **Build Output:** `bin/index.js` (specified in scene.json's `main` field)
- **Prettier:** Configured for no semicolons, single quotes, 120 char width, no trailing commas

## Node Requirements
- Node.js >= 16.0.0
- npm >= 6.0.0

## Multiplayer Best Practices & Findings

### Player Identification
**Problem:** Entity IDs are LOCAL per client - Entity 512 on Client A ≠ Entity 512 on Client B.

**Solution:** Use player addresses (wallet IDs) as unique identifiers across all clients.

```typescript
// ❌ WRONG - Don't use entity IDs in messages
room.send('shoot', { targetEntity: 512 })

// ✅ CORRECT - Use player addresses
const playerEntities = new Map<string, Entity>()
room.send('shoot', { targetPlayerAddress: '0xabc...' })
```

**Local Player Detection:**
```typescript
// ❌ WRONG - Assumes first entity is local player
if (!localPlayerAddress) {
  localPlayerAddress = playerAddr
}

// ✅ CORRECT - Compare with actual userId
import { myProfile } from '@dcl/sdk/network'

const myUserId = myProfile.userId?.toLowerCase()
if (myUserId && playerAddr.toLowerCase() === myUserId) {
  localPlayerAddress = playerAddr
  localPlayerEntity = entity
}
```

### Server-Authoritative Architecture
For competitive multiplayer, use server-authoritative pattern with lag compensation:

```typescript
// Make components server-only writable
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

PlayerHealth.validateBeforeChange((value) => {
  return value.senderAddress === AUTH_SERVER_PEER_ID
})

// Server validates hits with tolerance
const distance = Vector3.distance(targetPos, reportedHitPos)
const MAX_TOLERANCE = 2.0 // 2 meters for lag
if (distance > MAX_TOLERANCE) {
  // Reject invalid hit
  return
}
```

**Pattern:**
1. Client reports hit optimistically (instant feedback)
2. Client sends hit data to server for validation
3. Server validates hit distance (lag compensation)
4. Server applies damage and broadcasts confirmation
5. All clients update based on server confirmation

### Message Schemas (Not Plain JSON)
**Always use Schemas.Map() for network messages:**

```typescript
// ❌ WRONG - Plain objects don't work
const Messages = {
  shoot: { direction: Vector3, target: string }
}

// ✅ CORRECT - Use Schemas
import { Schemas } from '@dcl/sdk/ecs'

const Messages = {
  playerShoot: Schemas.Map({
    direction: Schemas.Vector3,
    targetPlayerAddress: Schemas.Optional(Schemas.String),
    hitPosition: Schemas.Optional(Schemas.Vector3),
    timestamp: Schemas.Int64
  })
}

const room = registerMessages(Messages)
```

### Client-Side Colliders (Zero Latency)
**Problem:** Syncing colliders from server causes latency - colliders lag behind avatar positions.

**Solution:** Create colliders locally on each client using Reserved Entities (avatar entities).

```typescript
// ❌ WRONG - Server syncs colliders (high latency)
// Server:
const colliderEntity = engine.addEntity()
syncEntity(colliderEntity, [AvatarAttach.componentId, ...])

// ✅ CORRECT - Client creates local colliders (zero latency)
// Client only:
function clientColliderSystem() {
  for (const [avatarEntity, identityData] of engine.getEntitiesWith(PlayerIdentityData)) {
    const playerAddress = identityData.address

    // Check if collider already exists
    let colliderExists = false
    for (const [_, collider] of engine.getEntitiesWith(PlayerCollider)) {
      if (collider.playerAddress === playerAddress) {
        colliderExists = true
        break
      }
    }

    if (colliderExists) continue

    // Create local collider (not synced)
    const colliderEntity = engine.addEntity()

    // Parent to avatar - follows automatically
    Transform.create(colliderEntity, {
      position: Vector3.create(0, 1, 0),
      scale: Vector3.create(0.5, 2, 0.5),
      parent: avatarEntity
    })

    PlayerCollider.create(colliderEntity, { playerAddress })
    MeshCollider.setBox(colliderEntity)
  }
}
```

**Benefits:**
- Zero sync latency - colliders follow avatars instantly
- Reduced network bandwidth - no collider sync
- Better hit detection accuracy

### Avatar Entities & PlayerIdentityData
**Access player avatars (Reserved Entities):**

```typescript
import { PlayerIdentityData } from '@dcl/sdk/ecs'

// Iterate over all player avatars
for (const [avatarEntity, identityData] of engine.getEntitiesWith(PlayerIdentityData)) {
  console.log('Player address:', identityData.address)

  // Avatar entities already have Transform - no need to add it
  const transform = Transform.get(avatarEntity)
}
```

**Reserved Entity IDs:**
- `engine.PlayerEntity` - Local player's avatar
- `engine.CameraEntity` - Local player's camera
- Entity IDs 0-511 are reserved by engine
- `PlayerIdentityData` component exists on all player avatar entities

### Deprecated Functions & Replacements

**Avatar Attachment:**
```typescript
// ❌ DEPRECATED
AvatarAttach.create(entity, {
  avatarId: playerAddress,
  anchorPointId: AvatarAnchorPointType.AAPT_POSITION
})

// ✅ CORRECT - Parent to avatar entity
Transform.create(colliderEntity, {
  parent: avatarEntity,
  position: Vector3.create(0, 1, 0)
})
```

**Raycasting:**
```typescript
// ⚠️ DEPRECATED (still works, but may be removed)
raycastSystem.registerGlobalDirectionRaycast(
  engine.CameraEntity,
  (result) => { /* callback */ },
  { direction, maxDistance: 100 }
)

// Note: Check latest SDK docs for replacement pattern
```

### Component Queries Over Maps
**Use ECS component queries instead of maintaining separate tracking Maps:**

```typescript
// ❌ WRONG - External state tracking
const avatarColliders = new Map<string, Entity>()
if (avatarColliders.has(playerAddress)) {
  return
}
avatarColliders.set(playerAddress, colliderEntity)

// ✅ CORRECT - Query components directly
let colliderExists = false
for (const [_, collider] of engine.getEntitiesWith(PlayerCollider)) {
  if (collider.playerAddress === playerAddress) {
    colliderExists = true
    break
  }
}
```

**Benefits:**
- Single source of truth (components)
- No state synchronization issues
- More reliable - checks actual component existence

### Entity Synchronization
**Only sync necessary entities from server:**

```typescript
// Server creates player data entity
const playerEntity = engine.addEntity()

// Only sync essential components
syncEntity(playerEntity, [
  PlayerHealth.componentId,
  PlayerTeam.componentId,
  Transform.componentId,
  PlayerAddress.componentId
])

// Don't sync:
// - Colliders (create client-side)
// - Client-only components (CrosshairState, DamageFeedback)
// - Visual effects (hit markers, damage indicators)
```

### Custom Delay System (No setTimeout/setInterval)
**Browser APIs not available in SDK7 - use custom frame-based delay:**

```typescript
// delaySystem.ts
interface DelayedCallback {
  executeAt: number
  callback: () => void
}

const delayedCallbacks: DelayedCallback[] = []

export function delay(milliseconds: number, callback: () => void) {
  delayedCallbacks.push({
    executeAt: Date.now() + milliseconds,
    callback
  })
}

export function delaySystem() {
  const now = Date.now()
  for (let i = delayedCallbacks.length - 1; i >= 0; i--) {
    if (delayedCallbacks[i].executeAt <= now) {
      delayedCallbacks[i].callback()
      delayedCallbacks.splice(i, 1)
    }
  }
}

// Add to engine
engine.addSystem(delaySystem)
```

### Case Sensitivity in Player Addresses
**Always normalize player addresses to lowercase:**

```typescript
// Player addresses must be lowercase
const myUserId = myProfile.userId?.toLowerCase()
const playerAddr = address.toLowerCase()

if (myUserId === playerAddr) {
  // Matched!
}
```

### Client vs Server Systems
**Organize systems by execution context:**

```typescript
import { isServer } from '@dcl/sdk/network'

// Always runs
engine.addSystem(delaySystem)

// Client-only systems
if (!isServer()) {
  engine.addSystem(weaponSystem)
  engine.addSystem(crosshairSystem)
  engine.addSystem(clientColliderSystem)
  setupUI()
}

// Server-only logic
if (isServer()) {
  room.onMessage('playerShoot', handleShoot)
}
```

### Player Movement & Teleportation
**Use `movePlayerTo` restricted action instead of modifying Transform:**

```typescript
// ❌ WRONG - Modifying camera or player transform directly
const cameraTransform = Transform.getMutable(engine.CameraEntity)
cameraTransform.position = newPosition

// ✅ CORRECT - Use movePlayerTo restricted action
import { movePlayerTo } from '~system/RestrictedActions'

movePlayerTo({
  newRelativePosition: Vector3.create(x, y, z),
  cameraTarget: Vector3.create(lookAtX, lookAtY, lookAtZ) // Optional
})
```

**Always use `engine.PlayerEntity` (avatar), not `engine.CameraEntity`:**

```typescript
// ❌ WRONG - Reading from camera
const cameraTransform = Transform.get(engine.CameraEntity)
const playerPosition = cameraTransform.position

// ✅ CORRECT - Reading from avatar
const avatarTransform = Transform.get(engine.PlayerEntity)
const playerPosition = avatarTransform.position
```

**Key differences:**
- `engine.CameraEntity` - Player's camera/view (can be detached in some scenarios)
- `engine.PlayerEntity` - Player's avatar body (actual position in world)

### Player Position Tracking (Don't Sync!)
**Server and clients already have access to player positions via PlayerIdentityData:**

```typescript
// ❌ WRONG - Syncing positions from client to server
syncEntity(playerEntity, [
  Transform.componentId,  // Don't sync Transform!
  PlayerHealth.componentId
])

// Syncing player position every frame
function syncPlayerPositionSystem() {
  const avatarTransform = Transform.get(engine.PlayerEntity)
  const playerTransform = Transform.getMutable(playerEntity)
  playerTransform.position = avatarTransform.position
}

// ✅ CORRECT - Read positions from PlayerIdentityData when needed
// Server reads player positions:
for (const [avatarEntity, identityData] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
  if (identityData.address === playerAddress) {
    const avatarTransform = Transform.get(avatarEntity)
    const playerPosition = avatarTransform.position
    break
  }
}

// Only sync game state components
syncEntity(playerEntity, [
  PlayerHealth.componentId,
  PlayerTeam.componentId,
  PlayerAddress.componentId,
  Dead.componentId
])
```

**Benefits:**
- No redundant position syncing
- Less network traffic
- Single source of truth (PlayerIdentityData entities)
- Server always has up-to-date positions

### Server-Authoritative Respawn
**Death and respawn must be handled server-side to prevent cheating:**

```typescript
// ❌ WRONG - Client controls respawn
// Client detects death and respawns self
if (health.current <= 0) {
  health.current = 100  // Client modifying health!
  movePlayerTo({ newRelativePosition: spawnPos })
}

// ✅ CORRECT - Server controls respawn
// Server side:
if (isServer()) {
  room.onMessage('playerShoot', (data, context) => {
    // Apply damage
    health.current -= damage

    if (health.current <= 0) {
      // Mark as dead (synced to clients)
      Dead.create(playerEntity, { deathTime, respawnTime })

      // Schedule respawn after 5 seconds
      delay(5000, () => {
        Dead.deleteFrom(playerEntity)
        health.current = health.max

        // Tell client to teleport
        room.send('respawnPlayer', { playerAddress })
      })
    }
  })
}

// Client side:
room.onMessage('respawnPlayer', (data) => {
  if (data.playerAddress === myProfile.userId) {
    movePlayerTo({ newRelativePosition: spawnPos })
    giveWeapon(player, weaponType)
  }
})

// Make Dead component server-authoritative
Dead.validateBeforeChange((value) => {
  return value.senderAddress === AUTH_SERVER_PEER_ID
})
```

**Pattern:**
1. Server detects death → adds `Dead` component → syncs to clients
2. Client UI shows death overlay when `Dead` component exists
3. Server waits 5 seconds → removes `Dead` → restores health → sends respawn message
4. Client receives message → teleports player → gives weapon
5. Client UI removes overlay when `Dead` component removed

### Avatar Rendering
**Don't create visual representations for players - avatars are already rendered:**

```typescript
// ❌ WRONG - Adding visuals to player entities
if (isRemotePlayer) {
  MeshRenderer.setBox(playerEntity)
  Material.setPbrMaterial(playerEntity, { albedoColor: teamColor })
}

// ✅ CORRECT - Avatars are already rendered by Decentraland
// Just track the player data entity
playerEntities.set(playerAddress, entity)
console.log('[CLIENT] Detected remote player')

// Avatars with PlayerIdentityData are automatically rendered
// You can attach things TO avatars using AvatarAttach or parenting
```

**Note:** Player avatars (entities with `PlayerIdentityData`) are automatically rendered by the Decentraland engine. You only need to track player data (health, team, etc.) in your own entities
