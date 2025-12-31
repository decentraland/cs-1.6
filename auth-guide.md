# Decentraland SDK7 Authoritative Server Guide

## Table of Contents

1. [101 Quick Start](#101-quick-start)
2. [What is the Authoritative Server?](#what-is-the-authoritative-server)
3. [Core Concepts](#core-concepts)
4. [Message System](#message-system)
5. [Component Validation](#component-validation)
6. [Advanced Patterns](#advanced-patterns)
7. [Common Pitfalls & Solutions](#common-pitfalls--solutions)
8. [Complete Working Examples](#complete-working-examples)
9. [Testing & Development](#testing--development)

---

## 101 Quick Start

### Your First Authoritative Scene in 5 Minutes

**Step 1: Install the SDK**
```bash
npm install @dcl/sdk@see-link-below
```
[@dcl/sdk@authoritative-link](https://github.com/decentraland/js-sdk-toolchain/pull/1168#issuecomment-3111841718)

**Step 2: Create your entry point (`src/index.ts`)**
```typescript
import { engine, Schemas } from '@dcl/sdk/ecs'
import { registerMessages, isServer, syncEntity } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

// 1. Define your messages (how client and server communicate)
const Messages = {
  increment: Schemas.Map({}),
}

// 2. Register messages to create the "room"
export const room = registerMessages(Messages)

// 3. Define a component for shared state
const Counter = engine.defineComponent('Counter', {
  value: Schemas.Int
})

// 4. Lock the component so only server can modify
Counter.validateBeforeChange((value) => {
  return value.senderAddress === AUTH_SERVER_PEER_ID
})

// 5. Entry point
export function main() {
  if (isServer()) {
    // SERVER: Create and sync the counter
    const counterEntity = engine.addEntity()
    syncEntity(counterEntity, [Counter.componentId])
    Counter.create(counterEntity, { value: 0 })

    // SERVER: Handle increment requests
    room.onMessage('increment', (data, context) => {
      console.log(`Player ${context.from} clicked!`)
      const counter = Counter.getMutable(counterEntity)
      counter.value += 1
    })
  } else {
    // CLIENT: Display counter and handle clicks
    // (Add your UI here to show Counter.get(entity).value)
    // (On button click: room.send('increment', {}))
  }
}
```

**Step 3: Start the server**
```bash
npx @dcl/hammurabi-server
```

**Step 4: Run your scene**
```bash
npm run start
```

That's it! You now have a server-authoritative counter that:
- Only the server can modify
- All clients see the same value
- Players can't cheat by modifying it locally

---

## What is the Authoritative Server?

The authoritative server is **your entire scene running as a headless simulation**. It's not a separate server application - it's the same scene code you write, but running in the background without rendering graphics.

### The Trust Problem

Without an authoritative server:
- Players can modify their health, score, or position
- Game state becomes inconsistent between players
- No way to enforce game rules

With an authoritative server:
- Server validates all actions
- Consistent game state for everyone
- Fair, cheat-resistant gameplay

### How It Works

```
Players (Clients)              Authoritative Server
     |                                |
     |-- Send action request ------>  |
     |                                | (Validates action)
     |                                | (Updates state if valid)
     |<-- Receive state update -----  |
     |                                |
```

**Key Insight:** The server and client run the SAME code. Use `isServer()` to separate logic:

```typescript
import { isServer } from '@dcl/sdk/network'

export function main() {
  if (isServer()) {
    // Runs ONLY on the server
    console.log("I'm the server - I make the rules!")
  } else {
    // Runs ONLY on players' clients
    console.log("I'm a player - I follow the rules!")
  }
}
```

---

## Core Concepts

### 1. Entity IDs Are LOCAL (Critical!)

**Entity IDs differ between clients.** Entity 512 on Player A's client is NOT the same as Entity 512 on Player B's client.

```typescript
// WRONG - Entity IDs don't match across clients
room.send('attack', { targetEntity: 512 })

// CORRECT - Use player addresses (wallet IDs)
room.send('attack', { targetPlayerAddress: '0xabc123...' })
```

**Pattern: Use wallet addresses as unique identifiers:**

```typescript
// Server maintains a registry of player addresses to entities
const playerEntities = new Map<string, Entity>()

room.onMessage('playerJoin', (data, context) => {
  const playerAddress = context.from  // Wallet address
  const playerEntity = engine.addEntity()
  playerEntities.set(playerAddress, playerEntity)
})
```

### 2. Position Data - Don't Sync!

Player positions are already available via `PlayerIdentityData`. Don't sync Transform:

```typescript
import { PlayerIdentityData, Transform } from '@dcl/sdk/ecs'

// Server reads any player's position:
function getPlayerPosition(playerAddress: string): Vector3 | null {
  for (const [avatarEntity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (identity.address === playerAddress) {
      return Transform.get(avatarEntity).position
    }
  }
  return null
}

// Sync game state, NOT position
syncEntity(playerEntity, [
  PlayerHealth.componentId,
  PlayerTeam.componentId,
  PlayerAddress.componentId,
  // NOT Transform.componentId - positions come from PlayerIdentityData
])
```

### 3. Local Player Detection

Find your own entity by comparing with `myProfile.userId`:

```typescript
import { myProfile } from '@dcl/sdk/network'

engine.addSystem(() => {
  for (const [entity, address] of engine.getEntitiesWith(PlayerAddress)) {
    const myUserId = myProfile.userId?.toLowerCase()
    if (myUserId && address.address.toLowerCase() === myUserId) {
      localPlayerEntity = entity
      console.log('Found my entity!')
    }
  }
})
```

**Always normalize to lowercase** - addresses may have mixed case.

---

## Message System

### Defining Messages with Schemas

All messages MUST use `Schemas.Map()`. Plain objects don't work.

```typescript
import { Schemas } from '@dcl/sdk/ecs'
import { registerMessages } from '@dcl/sdk/network'

// CORRECT - All fields use Schema types
const Messages = {
  // Simple action (no data)
  ping: Schemas.Map({}),

  // Action with data
  playerShoot: Schemas.Map({
    direction: Schemas.Vector3,
    targetPlayerAddress: Schemas.Optional(Schemas.String),
    hitPosition: Schemas.Optional(Schemas.Vector3),
    timestamp: Schemas.Int64
  }),

  // Server response
  damageConfirmed: Schemas.Map({
    targetPlayerAddress: Schemas.String,
    damage: Schemas.Int,
    newHealth: Schemas.Int,
    wasKill: Schemas.Boolean
  })
}

export const room = registerMessages(Messages)
```

### Available Schema Types

```typescript
// Primitives
Schemas.String      // "hello"
Schemas.Int         // 42
Schemas.Float       // 3.14
Schemas.Boolean     // true/false
Schemas.Int64       // Date.now()

// Vectors
Schemas.Vector3     // { x: 1, y: 2, z: 3 }
Schemas.Quaternion  // { x, y, z, w }

// Complex types
Schemas.Array(Schemas.String)     // ["a", "b", "c"]
Schemas.Entity                    // Entity reference
Schemas.Optional(Schemas.String)  // "hello" or undefined

// Nested objects
Schemas.Map({
  name: Schemas.String,
  stats: Schemas.Map({
    kills: Schemas.Int,
    deaths: Schemas.Int
  })
})

// Enums
enum Team { NONE = 0, RED = 1, BLUE = 2 }
Schemas.EnumNumber<Team>(Team, Team.NONE)
```

### Sending Messages

**Client to Server:**
```typescript
// Simple action
room.send('playerJoin', {})

// Action with data
room.send('playerShoot', {
  direction: cameraDirection,
  targetPlayerAddress: '0xabc...',
  hitPosition: { x: 10, y: 1, z: 5 },
  timestamp: Date.now()
})
```

**Server to All Clients:**
```typescript
room.send('damageConfirmed', {
  targetPlayerAddress: '0xabc...',
  damage: 30,
  newHealth: 70,
  wasKill: false
})
```

**Server to Specific Client:**
```typescript
room.send('respawnPlayer', { playerAddress }, { to: [playerAddress] })
```

### Receiving Messages

```typescript
room.onMessage('playerShoot', (data, context) => {
  // context.from = sender's wallet address
  console.log(`${context.from} shot towards`, data.direction)

  if (data.targetPlayerAddress) {
    // Validate and process hit...
  }
})
```

---

## Component Validation

### Making Components Server-Authoritative

Use `validateBeforeChange()` to prevent clients from modifying components:

```typescript
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

// Define component
const PlayerHealth = engine.defineComponent('PlayerHealth', {
  current: Schemas.Int,
  max: Schemas.Int
})

// Lock it to server-only writes
PlayerHealth.validateBeforeChange((value) => {
  return value.senderAddress === AUTH_SERVER_PEER_ID
})
```

**Setup validation early (before any components are created):**

```typescript
export function main() {
  // Setup validation rules FIRST (runs on both server and client)
  setupServerAuthoritative()

  if (isServer()) {
    // Now create entities...
  }
}

function setupServerAuthoritative() {
  PlayerHealth.validateBeforeChange((v) => v.senderAddress === AUTH_SERVER_PEER_ID)
  PlayerTeam.validateBeforeChange((v) => v.senderAddress === AUTH_SERVER_PEER_ID)
  Dead.validateBeforeChange((v) => v.senderAddress === AUTH_SERVER_PEER_ID)
  // ... all server-authoritative components
}
```

### Syncing Entities

Only sync what needs to be shared:

```typescript
import { syncEntity } from '@dcl/sdk/network'

if (isServer()) {
  const playerEntity = engine.addEntity()

  // Sync these components to all clients
  syncEntity(playerEntity, [
    PlayerHealth.componentId,
    PlayerTeam.componentId,
    PlayerAddress.componentId,
    Dead.componentId
  ])

  // Create the components
  PlayerHealth.create(playerEntity, { current: 100, max: 100 })
  PlayerTeam.create(playerEntity, { team: Team.RED })
  PlayerAddress.create(playerEntity, { address: playerWallet })
}
```

---

## Advanced Patterns

### 1. Optimistic Client Feedback

Show immediate feedback, then let server confirm/reject:

```typescript
// CLIENT: Show hit marker immediately (optimistic)
if (raycastHit) {
  showHitMarker(hitPosition)  // Instant feedback
  room.send('playerShoot', { targetPlayerAddress, hitPosition, timestamp: Date.now() })
}

// SERVER: Validate and confirm
room.onMessage('playerShoot', (data, context) => {
  if (validateHit(data)) {
    applyDamage(data.targetPlayerAddress)
    room.send('damageConfirmed', { ... })  // Broadcast to all
  }
  // If invalid, hit marker was "wrong" but player sees instant response
})
```

### 2. Lag Compensation for Hit Validation

Allow tolerance for network latency:

```typescript
// SERVER: Validate hit position
const targetPos = getPlayerPosition(targetAddress)
const reportedHitPos = data.hitPosition
const distance = Vector3.distance(targetPos, reportedHitPos)

const MAX_TOLERANCE = 2.0  // 2 meters for lag

if (distance > MAX_TOLERANCE) {
  console.log(`Hit rejected - too far (${distance}m)`)
  return  // Don't apply damage
}

// Hit is valid, apply damage
```

### 3. Client-Side Colliders (Zero Latency)

Create colliders locally instead of syncing them:

```typescript
// CLIENT ONLY - Creates colliders that follow avatars instantly
function clientColliderSystem() {
  for (const [avatarEntity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (identity.address === myProfile.userId) continue  // Skip self
    if (playerColliders.has(identity.address)) continue  // Already created

    // Create local collider (not synced)
    const collider = engine.addEntity()

    Transform.create(collider, {
      scale: Vector3.create(0.5, 1.8, 0.5)
    })
    MeshCollider.setBox(collider)

    // Tag for hit detection
    PlayerCollider.create(collider, { playerAddress: identity.address })

    // Attach to avatar (follows automatically, zero latency)
    AvatarAttach.create(collider, {
      avatarId: identity.address,
      anchorPointId: AvatarAnchorPointType.AAPT_HIP
    })

    playerColliders.set(identity.address, collider)
  }
}
```

**Why this works:**
- Colliders follow avatars instantly (parented)
- No network sync latency
- Server validates the actual hit, not collider position

### 4. Stats Persistence Across Reconnects

Server maintains stats even if players disconnect:

```typescript
// SERVER: Persistent storage (survives player disconnect)
const matchStats = new Map<string, { kills: number, deaths: number }>()

room.onMessage('playerJoin', (data, context) => {
  const address = context.from

  // Check if returning player
  let stats = matchStats.get(address)
  if (!stats) {
    stats = { kills: 0, deaths: 0 }
    matchStats.set(address, stats)
  } else {
    console.log(`Player returning with ${stats.kills} kills`)
  }

  // Create entity with existing stats
  PlayerStats.create(playerEntity, {
    kills: stats.kills,
    deaths: stats.deaths
  })
})
```

### 5. Server-Controlled Death & Respawn

Never let clients control death/respawn:

```typescript
// SERVER: Handle death
if (health.current <= 0 && !Dead.has(target)) {
  Dead.create(target, {
    deathTime: Date.now() / 1000,
    respawnTime: Date.now() / 1000 + 5
  })

  // Schedule respawn (see delay system below)
  delay(5000, () => {
    Dead.deleteFrom(target)
    const health = PlayerHealth.getMutable(target)
    health.current = health.max
    room.send('respawnPlayer', { playerAddress: targetAddr })
  })
}

// CLIENT: Listen for respawn command
room.onMessage('respawnPlayer', (data) => {
  if (data.playerAddress.toLowerCase() === myProfile.userId?.toLowerCase()) {
    movePlayerTo({ newRelativePosition: getSpawnPoint() })
    giveWeapon(localPlayer)
  }
})
```

### 6. Custom Delay System (No setTimeout)

`setTimeout`/`setInterval` are unavailable in SDK7. Use a frame-based system:

```typescript
// delaySystem.ts
type DelayedCallback = {
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
  // Reverse iterate to safely splice
  for (let i = delayedCallbacks.length - 1; i >= 0; i--) {
    if (delayedCallbacks[i].executeAt <= now) {
      const { callback } = delayedCallbacks[i]
      delayedCallbacks.splice(i, 1)
      callback()
    }
  }
}

// Add to engine (runs every frame)
engine.addSystem(delaySystem)
```

**Usage:**
```typescript
delay(5000, () => {
  console.log('5 seconds later!')
  respawnPlayer(entity)
})
```

### 7. Team Balancing

Auto-assign players to smaller team:

```typescript
function assignBalancedTeam(): Team {
  let redCount = 0, blueCount = 0

  for (const [_, team] of engine.getEntitiesWith(PlayerTeam)) {
    if (team.team === Team.RED) redCount++
    else if (team.team === Team.BLUE) blueCount++
  }

  if (redCount < blueCount) return Team.RED
  if (blueCount < redCount) return Team.BLUE
  return Math.random() > 0.5 ? Team.RED : Team.BLUE
}
```

---

## Common Pitfalls & Solutions

### Pitfall 1: Using Entity IDs Across Network

```typescript
// WRONG
room.send('heal', { targetEntity: 512 })

// CORRECT
room.send('heal', { targetPlayerAddress: '0xabc...' })
```

### Pitfall 2: Client Modifying Health Directly

```typescript
// WRONG - Client controls own health (cheatable)
if (touchedHealthPack) {
  PlayerHealth.getMutable(localPlayer).current += 25
}

// CORRECT - Client requests, server validates
room.send('pickupHealth', { itemId: healthPackId })

// Server:
room.onMessage('pickupHealth', (data, context) => {
  if (isItemNearPlayer(data.itemId, context.from)) {
    const health = PlayerHealth.getMutable(playerEntity)
    health.current = Math.min(health.current + 25, health.max)
  }
})
```

### Pitfall 3: Syncing Positions

```typescript
// WRONG - Syncing player positions wastes bandwidth
syncEntity(playerEntity, [Transform.componentId, PlayerHealth.componentId])

// CORRECT - Positions come from PlayerIdentityData automatically
syncEntity(playerEntity, [PlayerHealth.componentId])

// Read positions from avatar entities:
for (const [avatar, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
  if (identity.address === targetAddress) {
    const position = Transform.get(avatar).position
  }
}
```

### Pitfall 4: Case-Sensitive Address Comparison

```typescript
// WRONG - May fail due to mixed case
if (playerAddress === myProfile.userId) { ... }

// CORRECT - Always normalize to lowercase
if (playerAddress.toLowerCase() === myProfile.userId?.toLowerCase()) { ... }
```

### Pitfall 5: getMutable Before Checks

```typescript
// WRONG - Wasted getMutable call
function reload(player: Entity) {
  const weapon = Weapon.getMutable(player)  // Expensive!
  if (weapon.isReloading) return  // Bailed out after mutation call
  weapon.isReloading = true
}

// CORRECT - Check first, mutate when needed
function reload(player: Entity) {
  const weapon = Weapon.getOrNull(player)  // Read-only
  if (!weapon || weapon.isReloading) return

  const mutableWeapon = Weapon.getMutable(player)  // Only when mutating
  mutableWeapon.isReloading = true
}
```

### Pitfall 6: Sending Messages Every Frame

```typescript
// WRONG - Flooding the network
engine.addSystem(() => {
  room.send('position', { pos: getPlayerPosition() })  // 60x per second!
})

// CORRECT - Throttle updates
let lastSendTime = 0
engine.addSystem(() => {
  const now = Date.now()
  if (now - lastSendTime > 100) {  // Every 100ms max
    room.send('position', { pos: getPlayerPosition() })
    lastSendTime = now
  }
})
```

### Pitfall 7: Forgetting Validation Setup

```typescript
// WRONG - No validation, clients can modify!
const Score = engine.defineComponent('Score', { value: Schemas.Int })

// CORRECT - Always add validation for server-authoritative components
const Score = engine.defineComponent('Score', { value: Schemas.Int })
Score.validateBeforeChange((v) => v.senderAddress === AUTH_SERVER_PEER_ID)
```

### Pitfall 8: Creating Visual Entities for Players

```typescript
// WRONG - Players already have avatars rendered by Decentraland
const remotePlayerVisual = engine.addEntity()
MeshRenderer.setBox(remotePlayerVisual)
// ... trying to manually render remote players

// CORRECT - Just track their data, avatars render automatically
playerEntities.set(playerAddress, playerDataEntity)
// Use AvatarAttach to add things TO avatars (markers, effects)
```

---

## Complete Working Examples

### Example 1: FPS Game Hit Registration

```typescript
// index.ts
import { engine, Schemas } from '@dcl/sdk/ecs'
import { registerMessages, isServer, syncEntity } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

const Messages = {
  playerShoot: Schemas.Map({
    direction: Schemas.Vector3,
    targetPlayerAddress: Schemas.Optional(Schemas.String),
    hitPosition: Schemas.Optional(Schemas.Vector3),
    timestamp: Schemas.Int64
  }),
  damageConfirmed: Schemas.Map({
    targetPlayerAddress: Schemas.String,
    damage: Schemas.Int,
    newHealth: Schemas.Int,
    wasKill: Schemas.Boolean
  })
}

const PlayerHealth = engine.defineComponent('PlayerHealth', {
  current: Schemas.Int,
  max: Schemas.Int
})

const PlayerAddress = engine.defineComponent('PlayerAddress', {
  address: Schemas.String
})

// Lock components to server
PlayerHealth.validateBeforeChange((v) => v.senderAddress === AUTH_SERVER_PEER_ID)
PlayerAddress.validateBeforeChange((v) => v.senderAddress === AUTH_SERVER_PEER_ID)

export const room = registerMessages(Messages)
const playerEntities = new Map<string, Entity>()

export function main() {
  if (isServer()) {
    setupServer()
  } else {
    setupClient()
  }
}

function setupServer() {
  room.onMessage('playerJoin', (_, context) => {
    const addr = context.from
    if (playerEntities.has(addr)) return

    const entity = engine.addEntity()
    syncEntity(entity, [PlayerHealth.componentId, PlayerAddress.componentId])
    PlayerHealth.create(entity, { current: 100, max: 100 })
    PlayerAddress.create(entity, { address: addr })
    playerEntities.set(addr, entity)
  })

  room.onMessage('playerShoot', (data, context) => {
    if (!data.targetPlayerAddress || !data.hitPosition) return

    const target = playerEntities.get(data.targetPlayerAddress)
    if (!target || !PlayerHealth.has(target)) return

    // Validate hit (lag compensation)
    const targetPos = getPlayerPosition(data.targetPlayerAddress)
    if (!targetPos) return

    const distance = Vector3.distance(targetPos, data.hitPosition)
    if (distance > 2.0) return  // Reject if too far

    // Apply damage
    const health = PlayerHealth.getMutable(target)
    health.current = Math.max(0, health.current - 30)

    room.send('damageConfirmed', {
      targetPlayerAddress: data.targetPlayerAddress,
      damage: 30,
      newHealth: health.current,
      wasKill: health.current === 0
    })
  })
}

function setupClient() {
  room.send('playerJoin', {})

  // Client shooting logic would go here
  // On raycast hit: room.send('playerShoot', {...})

  room.onMessage('damageConfirmed', (data) => {
    console.log(`${data.targetPlayerAddress} took ${data.damage} damage`)
  })
}
```

### Example 2: Capture the Flag

```typescript
const Messages = {
  grabFlag: Schemas.Map({}),
  dropFlag: Schemas.Map({}),
  captureFlag: Schemas.Map({})
}

const FlagState = engine.defineComponent('FlagState', {
  carriedBy: Schemas.Optional(Schemas.String),  // Player address or undefined
  position: Schemas.Vector3,
  team: Schemas.EnumNumber<Team>(Team, Team.NONE)
})

FlagState.validateBeforeChange((v) => v.senderAddress === AUTH_SERVER_PEER_ID)

// SERVER
room.onMessage('grabFlag', (_, context) => {
  const flag = FlagState.getMutable(flagEntity)

  // Only grab if not carried
  if (flag.carriedBy) return

  // Check if player is close enough
  const playerPos = getPlayerPosition(context.from)
  if (Vector3.distance(playerPos, flag.position) > 2) return

  flag.carriedBy = context.from
})

room.onMessage('captureFlag', (_, context) => {
  const flag = FlagState.getMutable(flagEntity)

  // Only carrier can capture
  if (flag.carriedBy !== context.from) return

  // Check if at capture point
  const playerPos = getPlayerPosition(context.from)
  if (Vector3.distance(playerPos, capturePoint) > 3) return

  // Score!
  updateScore(context.from)
  flag.carriedBy = undefined
  flag.position = flagSpawnPoint
})
```

---

## Testing & Development

### Development Workflow

1. **Terminal 1 - Start the server:**
   ```bash
   npx @dcl/hammurabi-server
   # Or with custom port:
   npx @dcl/hammurabi-server --realm=localhost:8080
   ```

2. **Terminal 2 - Run your scene:**
   ```bash
   npm run start
   ```

3. **Make changes** - Both server and scene auto-reload

4. **Check logs** - Server logs appear in Terminal 1

### Debugging Tips

**Add context to logs:**
```typescript
if (isServer()) {
  console.log('[SERVER] Starting...')
  room.onMessage('test', (data, ctx) => {
    console.log('[SERVER] Received from:', ctx.from)
  })
} else {
  console.log('[CLIENT] Starting...')
  room.onMessage('test', (data) => {
    console.log('[CLIENT] Received:', data)
  })
}
```

**Verify entity sync:**
```typescript
// Client system to check synced entities
engine.addSystem(() => {
  const entities = Array.from(engine.getEntitiesWith(PlayerHealth))
  console.log(`[CLIENT] Synced player entities: ${entities.length}`)
})
```

### Testing Client

To test the authoritative server with multiple clients:
- **Download build:** [Unity Explorer PR #4857](https://github.com/decentraland/unity-explorer/pull/4857)
- **Or run Unity locally:** Clone that branch

### Current Limitations

`npx @dcl/hammurabi-server` may fail due to gatekeeper authentication.

**Workarounds:**
- Wait for fix: [comms-gatekeeper PR #107](https://github.com/decentraland/comms-gatekeeper/pull/107)
- Run gatekeeper locally (contact team for env vars)

---

## File Organization Recommendation

```
src/
├── index.ts         # Entry point, message schemas, main()
├── components.ts    # All component definitions
├── server.ts        # Server-only logic (validation, handlers)
├── client.ts        # Client-only logic (input, UI, effects)
├── systems.ts       # Shared systems (both server & client)
├── delaySystem.ts   # Frame-based timer replacement
└── ui.tsx           # React ECS UI components
```

**Key principle:** Use `isServer()` check in `main()` to call the right setup functions.

---

## Summary Checklist

Before shipping your authoritative scene:

- [ ] All critical components have `validateBeforeChange()`
- [ ] Messages use `Schemas.Map()`, not plain objects
- [ ] Player identification uses addresses, not entity IDs
- [ ] Addresses are normalized to lowercase for comparison
- [ ] Positions read from `PlayerIdentityData`, not synced
- [ ] Client shows optimistic feedback where appropriate
- [ ] Server validates all actions before applying
- [ ] Death/respawn controlled entirely by server
- [ ] Delay system used instead of setTimeout
- [ ] Stats persist across player reconnects
- [ ] Hit detection uses lag compensation tolerance

---

*Remember: Never trust the client. Always validate on the server.*
