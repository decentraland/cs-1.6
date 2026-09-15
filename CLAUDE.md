# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Counter-Strike 1.6 clone on Dust2 as a Decentraland SDK7 scene, using the authoritative server and stock Bevy Explorer. Decentraland uses an Entity-Component-System (ECS) architecture: entities are IDs, components are pure data, systems hold the logic. Gameplay is server-authoritative; pure rule modules (`src/*-rules.ts`) are unit-tested with `node --test`, and ECS adapters wrap them on the server and client. See `README.md` for behavior, `IMPLEMENTATION_PLAN.md` for status, and `docs/CS16-MECHANICS.md` for the pinned CS references.

## SDK7 Reference Documentation

- `dclcontext/sdk7-complete-reference.md` is now a stub that points to the official [Decentraland SDK Skills](https://github.com/decentraland/sdk-skills); install those for the full SDK7 reference.
- `dclcontext/sdk7-examples.mdc` - Common SDK7 patterns and examples
- `dclcontext/ui.mdc` - UI toolkit (dcl-ui-toolkit) reference
- `dclcontext/npc.mdc` - NPC toolkit (dcl-npc-toolkit) reference
- `dclcontext/utils.mdc` - Utils library (@dcl-sdk/utils) for tweens, paths, triggers, timers
- `dclcontext/crypto.mdc` - Crypto toolkit for blockchain operations

## Development Commands

```bash
npm run start -- --no-client --port 8004   # local authoritative server; open a Bevy web client against it
npm run build                               # compile to bin/index.js
npm test                                    # node --test over tests/*.test.mjs (149 tests)
npm run validate                            # tests + asset integrity + build/typecheck
npx prettier --check src tests validate     # formatting gate (.prettierignore skips generated files)
npm run deploy
```

Browser regressions live in `validate/*.mjs` and need a CDP websocket; see `README.md`.

## Code Architecture

Entry: `src/index.ts` registers the message schemas, then runs the server (`setupServerAuthoritative`, `initializePractice`) or the client (`setupClientMessageHandlers`, `addClientSystems`, `setupUI`) based on `isServer()`. `src/components.ts` defines all synced components with `Schemas`; server-owned ones use `validateBeforeChange` against `AUTH_SERVER_PEER_ID`.

- **Match and bots (server):** `practice.ts` owns the `Practice` round state, team roster, bot spawning/AI loop and kill credit; rules in `team-rules.ts` (`fillBots`, `admitToTeam`, `teamRoundWinner`), `round-rules.ts`, `team-spawns.ts`, `bot-navigation.ts`/`navigation.ts` (movement state machine, string-pulled routes), `bot-behavior.ts` (pure roam/hold/strafe/callout heuristics), `bot-combat.ts`, `bot-objective.ts`.
- **Combat (server):** `server.ts` validates shots/knife attacks and applies damage; `ballistics.ts`, `combat-rules.ts`, `accuracy.ts`/`gun-accuracy.ts`, `knife-rules.ts`, `weapon-profiles.ts`, `world-query.ts`/`map-collision.ts`, `systems.ts` (reloads).
- **Objective and economy (server):** `bomb.ts` + `bomb-rules.ts`/`bomb-sites.ts`; `economy.ts` + `economy-rules.ts`/`buy-zones.ts`; `inventory.ts` + `inventory-rules.ts`.
- **Client input and view:** `client.ts` (shooting, reload, damage feedback, systems registration), `bomb-client.ts` (weapon slot keys, C4 select/drop/plant/defuse), `buy-client.ts`, `locomotion.ts`, `fps-camera.ts` (live/death/chase `VirtualCamera` with punch, recoil prediction), `weapon-view.ts` (first-person viewmodel, `CameraModeArea`, punch tilt), `world-weapons.ts` (right-hand weapon models on other players and bots via `AvatarAttach`), `spectator.ts` + `spectator-rules.ts`, `damage-feedback.ts`, `movement-feedback.ts`, `recoil-prediction.ts`, `aim.ts`.
- **UI (React ECS):** `ui.tsx` root; `hud.tsx`, `scoreboard-ui.tsx` + `scoreboard.ts`, `team-menu-ui.tsx` + `buy-ui.tsx` on the shared `menu-ui.tsx` frame + `menu-state.ts`, `bomb-ui.tsx`, `radar-ui.tsx` + `radar-rules.ts`, `pain-ui.tsx`, `bitmap-text.tsx`.
- **Shared:** `delaySystem.ts` (frame-based `delay()`; there is no `setTimeout`).

## Key Bindings

The explorer only exposes a fixed set of input actions (no Tab, B, G, 5, 6, right mouse). Current mapping: 1 primary, 2 pistol, 3 knife, 4 C4, Shift+4 drop C4, Shift+1 hold for the scoreboard, E hold to use/defuse, F reload (guns) or stab (knife), left mouse fire/swing/plant, Shift walk, Esc release cursor and buy menu. Team menu: 1 Terrorists, 2 Counter-Terrorists; AUTO ASSIGN and SPECTATE are click-only. Menu hover is computed from `PrimaryPointerInfo.screenCoordinates` each frame, not from mouse-enter events.

## Match Model

One match per realm. Picking a team starts the freeze immediately; a playing side with no connected human is filled with three bots (`BOT_FILL`, `BOT_NAMES`, addresses `bot:<index>`, `isBotAddress`). Bots leave when a human joins their side at the next round; the match resets when every human leaves. Bot seats live in the same roster as humans; bot entities carry `Bot` + `AvatarShape` and are synced from the server. `Practice.botDifficulty` (easy/normal/hard/expert, `bot-difficulty.ts`) is match-wide, set from the team menu's BOT SKILL row via the `botDifficulty` message, and gates bot reaction, attack delay and aim error.

## Camera

On desktop the live view is a scene-driven `VirtualCamera` at eye height (`fps-camera.ts`) so recoil and victim punch can rotate it like CS 1.6; the same camera does the death fall and spectator chase cam. It follows the avatar transform one frame late, so `client.ts` hides the local avatar with a client-only hide-avatars `AvatarModifierArea` (all other players and bots in `excludeIds`). The engine first-person camera cannot be rotated by the scene, so do not switch to it on desktop. Shots send mouse aim alone; the server applies punch.

**Touch (Godot mobile):** the explorer reports `platform: 'mobile'` via `getExplorerInformation` and never sets `PointerLock.isPointerLocked`, and its `PrimaryPointerInfo.screenDelta` is not a look input. `src/platform.ts` exposes `isTouchPlatform()`/`hasAimControl()`; on touch the live view is the engine first-person camera (aim from the camera transform), every pointer-lock gate uses `hasAimControl()`, `TouchScreenControls` makes the big button fire, and the HUD adds BUY/SCORES buttons. Keep both paths working.

## SDK7 Key Concepts

### Entity Creation

```typescript
const entity = engine.addEntity()
```

Entities are just numeric IDs. No need to separately add them to the engine.

### Component Usage

```typescript
Transform.create(entity, { position: Vector3.create(0, 1, 0) })
const transform = Transform.get(entity) // read-only
const mutableTransform = Transform.getMutable(entity) // only when mutating
Transform.deleteFrom(entity)
```

### Querying in Systems

```typescript
function mySystem(dt: number) {
  for (const [entity, transform, customComponent] of engine.getEntitiesWith(Transform, CustomComponent)) {
    // transform and customComponent are read-only; use CustomComponent.getMutable(entity) to modify
  }
}
```

### Mutability: Check First, Mutate Later

Use `.get()`/`.getOrNull()` for every check and call `.getMutable()` only at the point of mutation. `getMutable()` marks the component dirty and has real overhead.

```typescript
// ❌ WRONG - getMutable called early, used for conditions
function reload(player: Entity) {
  const weapon = Weapon.getMutable(player)
  if (weapon.isReloading || weapon.ammoClip === weapon.maxAmmoClip) return
  weapon.isReloading = true
}

// ✅ CORRECT
function reload(player: Entity) {
  const weapon = Weapon.getOrNull(player)
  if (!weapon || weapon.isReloading || weapon.ammoClip === weapon.maxAmmoClip) return
  const mutableWeapon = Weapon.getMutable(player)
  mutableWeapon.isReloading = true
}
```

The same applies inside `for (const [entity, weapon] of engine.getEntitiesWith(Weapon))`: check `weapon`, then `Weapon.getMutable(entity)` only when a change is needed.

## Project Configuration

- **TypeScript Config:** Extends `@dcl/sdk/types/tsconfig.ecs7.json` with strict mode enabled
- **Scene Config:** `scene.json` defines scene metadata, parcels, spawn points, and feature toggles
- **Build Output:** `bin/index.js` (specified in scene.json's `main` field)
- **Prettier:** no semicolons, single quotes, 120 char width, no trailing commas; run `npx prettier --write` on files you touch
- **SDK pin:** `@dcl/sdk` and `@dcl/js-runtime` are pinned to `7.27.1-33533530571.commit-451d001`; keep the exact pin

## Node Requirements

- Node.js >= 22.18.0 (tests use `--experimental-strip-types`)
- npm >= 6.0.0

## Multiplayer Best Practices & Findings

### Player Identification

Entity IDs are local per client. Use lowercase player addresses in messages and as map keys; never send entity IDs.

```typescript
import { myProfile } from '@dcl/sdk/network'

const myUserId = myProfile.userId?.toLowerCase()
if (myUserId && playerAddr.toLowerCase() === myUserId) {
  localPlayerEntity = entity
}
```

### Server-Authoritative Components

```typescript
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

PlayerHealth.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
```

Clients send intent only (aim direction, shot/knife sequence, trigger state, use held). The server resolves the ray against humans and bots, applies punch/spread, damage, deaths, round results, money and inventory, then broadcasts the result. Clients never choose the hit target, hit point, or shot origin.

### Message Schemas (Not Plain JSON)

```typescript
import { Schemas } from '@dcl/sdk/ecs'

const Messages = {
  playerShoot: Schemas.Map({ shotId: Schemas.Int, revision: Schemas.Int, direction: Schemas.Vector3 })
}
const room = registerMessages(Messages)
```

### Avatar Entities & PlayerIdentityData

```typescript
for (const [avatarEntity, identityData] of engine.getEntitiesWith(PlayerIdentityData)) {
  const transform = Transform.get(avatarEntity) // avatar entities already have a Transform
}
```

- `engine.PlayerEntity` - local player's avatar (use this for position, not `engine.CameraEntity`)
- `engine.CameraEntity` - local player's camera
- Entity IDs 0-511 are reserved by the engine

Server and clients read player positions from `PlayerIdentityData` entities; do not sync `Transform` for players. Avatars are rendered by the engine; attach things to them by parenting, not by adding meshes to player data entities.

### Component Queries Over Maps

Prefer `engine.getEntitiesWith(...)` over a parallel `Map` so components stay the single source of truth.

### Entity Synchronization

Sync only game state components (`Practice`, `PlayerHealth`, `PlayerTeam`, `PlayerAddress`, `Dead`, bot `Transform`/`AvatarShape`/`Bot`, ...). Client-only presentation (crosshair, damage feedback, viewmodel, markers) is never synced.

### No setTimeout/setInterval

Browser timers are unavailable in SDK7. Use `delay(ms, callback)` from `src/delaySystem.ts`; `delaySystem` runs on both server and client.

### Rounds and Respawn

Death and respawn are round-based, not per-player timers. The server marks `Dead`, waits for the round result, then spawns everyone on the next round through `practiceSpawn`; clients teleport with `movePlayerTo` from `~system/RestrictedActions` and never modify their own health or transform.

### Client vs Server Systems

```typescript
engine.addSystem(delaySystem) // always
if (isServer()) {
  /* authoritative handlers and bot loop */
} else {
  /* input, prediction, UI */
}
```
