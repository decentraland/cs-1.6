## Automated previews

Use `npm run start:server -- --port <port>` (or explicit `--web --no-browser --no-client`).
For mobile, `npm start -- --mobile --no-browser` prints the SDK QR without opening a client.
Use its exact link (including `pulse-realm` and any `pulse-server`), also available
at `/mobile-preview`; never handcraft a QR from only the LAN URL. Let the installed
auth-server SDK choose the authority version; update SDK/runtime together and restart
the process after upgrades. The former scene-specific server pin is obsolete.
Plain `npm start -- --web` opens the default browser and must not be used by automation.
Use one isolated muted headless browser, track its server and close both afterward.
Do not launch Unity or native Explorer. Preserve the creator's port 8000 server.

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
npm test                                    # node --test over tests/*.test.mjs
npm run validate                            # tests + asset integrity + build/typecheck
npx prettier --check src tests validate     # formatting gate (.prettierignore skips generated files)
npm run deploy
```

Use `npm run test:smoke` for bounded Bevy readiness checks. It starts npm web preview
from a temporary copy with its own multiplayer identity on a free port, and uses
the official hosted decentraland.org/bevy-web build.
Pass `--realm http://127.0.0.1:<port>` to reuse a creator-owned preview.
It owns one muted headless browser, writes full evidence to disk, and prints a compact
PASS/FAIL. Read that summary first; inspect only the relevant failure details. No
automatic retries or broad browser checks for unrelated changes. The longer existing
encounter regression is opt-in with `--scenario game --timeout 240` on an isolated
scene/server identity. Other browser regressions in `validate/*.mjs` still accept a
CDP websocket; see `README.md`. Native phone input/comfort needs a device check.

## Code Architecture

Entry: `src/index.ts` registers the message schemas, then runs the server (`setupServerAuthoritative`, `initializePractice`) or the client (`setupClientMessageHandlers`, `addClientSystems`, `setupUI`) based on `isServer()`. `src/components.ts` defines all synced components with `Schemas`; server-owned ones use `validateBeforeChange` against `AUTH_SERVER_PEER_ID`.

- **Match and bots (server):** `practice.ts` owns the `Practice` round state, team roster, bot spawning/AI loop and kill credit; rules in `team-rules.ts` (`fillBots`, `admitToTeam`, `teamRoundWinner`), `round-rules.ts`, `team-spawns.ts`, `bot-navigation.ts`/`navigation.ts` (movement state machine, string-pulled routes), `bot-motion.ts` (shared CS velocity/flinch plus authoritative map clipping), `bot-behavior.ts` (pure roam/hold/strafe/callout heuristics), `bot-combat.ts`, `bot-objective.ts`.
- **Combat (server):** `server.ts` validates shots/knife attacks and applies damage; `ballistics.ts`, `combat-rules.ts`, `accuracy.ts`/`gun-accuracy.ts`, `knife-rules.ts`, `weapon-profiles.ts`, `world-query.ts`/`map-collision.ts`, `systems.ts` (reloads), `rewind-rules.ts` (bot lag compensation: per-bot one-second history, `ServerClock`, shot `seenAt`, bounded observed-position claim), `human-rewind.ts` (server-measured RTT, per-life human history, bounded observed-position claims; see `docs/CS16-HUMAN-REWIND.md`).
- **Objective and economy (server):** `bomb.ts` + `bomb-rules.ts`/`bomb-sites.ts`; shared `weapon-box-rules.ts` for gun/C4 body-pitch tosses and grounded touch volumes; `economy.ts` + `economy-rules.ts`/`buy-zones.ts`; `inventory.ts` + `inventory-rules.ts`; `defuse-kits.ts`/`defuse-kit-rules.ts` for separate ground-kit pickup, bot/human ownership and round cleanup.
- **Client input and view:** `client.ts` (shooting, reload, damage feedback, systems registration), `bomb-client.ts` (weapon slot keys, C4 select/drop/plant/defuse), `buy-client.ts`, `locomotion.ts`, `cs-movement.ts` + `cs-movement-rules.ts`/`movement-ground.ts` (Bevy velocity controller, native ground rays, bounded stair lift and bullet flinch), `fps-camera.ts` (live/death/chase `VirtualCamera` with punch, recoil prediction), `weapon-view.ts` (first-person viewmodel, `CameraModeArea`, punch tilt), `world-weapons.ts` (hand-attached weapon models on other players and bots via `AvatarAttach`; Dual Elites use both hands), `spectator.ts` + `spectator-rules.ts`, `damage-feedback.ts`, `movement-feedback.ts`, `recoil-prediction.ts`, `aim.ts`.
- **UI (React ECS):** `ui.tsx` root; `touch-controls.tsx`, `touch-menu-ui.tsx` and `touch-layout.ts` for mobile controls/menus; `hud.tsx`, `scoreboard-ui.tsx` + `scoreboard.ts`, `team-menu-ui.tsx` + `buy-ui.tsx` on the shared `menu-ui.tsx` frame + `menu-state.ts`, `bomb-ui.tsx`, `radar-ui.tsx` + `radar-rules.ts`, `pain-ui.tsx`, `bitmap-text.tsx`.
- **Shared:** `delaySystem.ts` (frame-based `delay()`; there is no `setTimeout`).

## Key Bindings

The explorer only exposes a fixed set of input actions (no Tab, B, G, 5, 6, right mouse). Current mapping: 1 primary, 2 pistol, 3 knife, 4 C4, Shift+4 drop C4, Shift+1 hold for the scoreboard, E hold to use/defuse, F reload (guns) or stab (knife), left mouse fire/swing/plant, Shift walk, Esc only releases the cursor (engine); the HUD BUY button opens/closes the buy menu on every platform, 0 CANCEL or a backdrop click closes it. Team menu: 1 Terrorists, 2 Counter-Terrorists; AUTO ASSIGN and SPECTATE are click-only. Menu hover is computed from `PrimaryPointerInfo.screenCoordinates` each frame, not from mouse-enter events.

## Match Model

One match per realm. Picking a team starts the freeze immediately; a playing side with no connected human is filled with three bots (`BOT_FILL`, `BOT_NAMES`, addresses `bot:<index>`, `isBotAddress`). Bots leave when a human joins their side at the next round; the match resets when every human leaves. Bot seats live in the same roster as humans; bot entities carry `Bot`, `GltfContainer`, `Animator` and `BotBodyPose` and are synced from the server. `Practice.botDifficulty` (easy/normal/hard/expert, `bot-difficulty.ts`) is match-wide, set from the team menu's BOT SKILL row via the `botDifficulty` message, and gates bot reaction, attack delay and aim error.

## Camera

On desktop the live view is a scene-driven `VirtualCamera` at eye height (`fps-camera.ts`) so recoil and victim punch can rotate it like CS 1.6; the same camera does the death fall and spectator chase cam. It follows the avatar transform one frame late, so `client.ts` hides the local avatar with a client-only hide-avatars `AvatarModifierArea` (all other players and bots in `excludeIds`). The engine first-person camera cannot be rotated by the scene, so do not switch to it on desktop. Shots send mouse aim alone; the server applies punch.

**Touch (Godot mobile):** use the native first-person camera and `hasAimControl()`;
mobile never locks the pointer. `touch-actions.ts` builds the root
`TouchScreenControls`: FIRE is `mainAction: IA_ACTION_6`, jump is a satellite,
F reloads/stabs, ACTION_3 toggles walk/run, ACTION_4 changes the weapon mode.
Unused actions are explicitly hidden; keep at most five visible to avoid native
overflow. `client.ts` updates the component only when its configuration changes.
`touch-controls.tsx` draws the carried-weapon bar, buy-zone-only cart, OPTIONS
utilities, defuse and spectator actions. Native controls hide during menus,
death and lost sync; equipment-kind/context changes cancel held input. Keep
root-event collection in `combat-input.ts` and the UI hold adapter for defuse and
spectating. Never use IA_POINTER for mobile fire; ordinary UI taps emit it.
Team/buy/slot keyboard shortcuts are disabled on touch. Mobile buying uses `touch-buy-ui.tsx`: the desktop numbered lists and separate
Auto Buy/Rebuy buttons, with purchases on completed taps and slide-off cancellation.
Defuse is hidden out of reach and turns green when in range and facing the C4;
leaving range cancels its hold without cancelling FIRE. Native icons come from
`asset-sources/touch-controls/icons.svg`, exported by `render-native.cjs` using
`@resvg/resvg-js`; see `docs/CS16-TOUCH-CONTROLS.md`. Headless Bevy cannot prove
native iOS gamepad layout or multitouch behavior.

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
- **SDK versions:** use the versions selected in `package.json`. Keep the installed root `@dcl/js-runtime` on the same build as `@dcl/sdk`; the compact runner checks this before launching. SDK 7.29 fixes the older cross-entity input scan bug, so tests must assert current input behavior rather than require that bug.

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

Clients send intent (aim, shot/knife sequence, trigger/use state) and observed shot context (origin, movement, target position and bot view time). These observations are bounded claims, not damage verdicts. The server validates them, resolves the ray against historical humans/bots, applies punch/spread, damage, deaths, round results, money and inventory, then broadcasts the result. See `docs/CS16-HUMAN-REWIND.md` for timing and trust limits.

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

Sync only game state components (`Practice`, `PlayerHealth`, `PlayerTeam`, `PlayerAddress`, `Dead`, bot `Transform`/`GltfContainer`/`Animator`/`BotBodyPose`/`Bot`, ...). Client-only presentation (crosshair, damage feedback, viewmodel, markers) is never synced.

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

## Authoritative client events

Client `room.onMessage` callbacks receive only the payload; the SDK Room already discards senders other than `authoritative-server`. Sender context exists on server callbacks. Checking `context.from` on a client silently rejects every legitimate event. `player-sounds.ts` relies on Room authentication and limits clip names to the fixed original-player-sound list. The latency probe handler follows the same callback contract; `tests/latency-echo.test.mjs` uses SDK Room dispatch to catch accidentally requiring client sender context. Server handlers still require context to identify the responding player.

## Bevy movement controller

`AvatarLocomotionSettings` lacks acceleration/gravity fields, but the existing pinned
Bevy protocol also provides writable `AvatarMovement` and readable `AvatarMovementInfo`.
The official web client accepts the override from a normal scene. Keep collision
response and ground support in the adapter; do not fake player motion with a camera
or per-frame teleport. The renderer uses a capsule, not a GoldSrc hull. Test slopes,
steps, ceilings and server fall damage when changing this adapter; speed-only checks
missed a real stair regression. See `docs/CS16-MOVEMENT.md` for remaining limits.

Bot route intent and actual movement differ during acceleration or flinch. Keep
`intentOnly` waypoint handling and physical corner-clearance checks when changing
navigation; consuming predicted waypoints made bots stick at Dust2 corners at
20 Hz. Run `tests/bot-movement.test.mjs` across its 20/30/60 Hz route cases.

- Bevy CRDT snapshots may retain renderer-owned `GltfContainerLoadingState` or generated hand `Transform` after scene entity removal. Verify despawn by absence of scene-owned `GltfContainer`/`AvatarAttach`, not by requiring the entire snapshot entry to vanish. See `validate/dual-hands.mjs`.

- Bot `Animator` is client-local, built from the synced `BotBodyPose` (`bot-animation.ts`). Unity writes `playing: false` back to the scene when a non-looping clip ends; a synced server-owned `Animator` rejects that write, the server re-sends the finished clip and Unity replays it forever. Keep renderer-written components (Animator, GltfNodeState, loading states) out of the server sync list. Unity/Godot lack Bevy's `GltfNode`, so `world-weapons.ts` pins bot guns at a fixed hand offset once the body loads without a `GltfNodeState`.

- Unity honours `PointerLock` only on `engine.CameraEntity` (Bevy reacts to any changed PointerLock), and does not restart an `AudioSource` that is still playing when `currentTime` is re-sent. Use `requestCameraPointerLock()` and the alternating local sound sources in `weapon-sounds.ts`. Cross-client differences are listed in `docs/EXPLORER-INCONSISTENCIES.md`.

- C4 toss integration runs independently of the live objective tick so a carrier death at round end cannot freeze the backpack in midair. Freeze/result objective ticks permit grounded pickup but never plant/defuse progress. Keep defused/exploded result states out of that extra tick. Original BSP sky can be solid where the exported mesh looks open; place physics fixtures inside original playable space.

- Defuse kits are `CItem` drops: immediate floor placement, not weapon-box throws. The dead owner loses ownership before another living CT can collect; an already-equipped CT must not consume another kit. Kit pickup uses the original voice channel, and survivors retain ownership over round reset.

- After pointer capture, arm combat from `!inputSystem.isPressed(IA_POINTER)`, not a fresh PET_UP event. An automatic spawn capture can arrive after the menu click was already released. Event-only release gating then swallows the first shot and blocks E. Keep held capture/menu clicks suppressed; see `validate/input-capture.mjs` for the before/after reproduction.

### Preview combat readiness

The start wrapper pins Bevy headless `0.1.0-34588802161.commit-3926f33`; an older
cached server can receive game messages but no avatar transforms from hosted Bevy.
Check the actual running binary, not just the npm tag. Never bypass the server's
position validation to make shots work. Missing transforms invalidate `PlayerPose`;
clients suppress gun/knife prediction and show the connection status.
Bot hit prediction and server traces read the same synchronized `BotBodyPose`.
Use `validate/prepare-combat-recovery.mjs` and `validate/combat-recovery.mjs` for
real mouse fire, source-model bot death and finite USP clip/reserve checks.

- The pinned SDK's `Schemas.Optional` drops falsy scalars (`0`, `false`, empty
  strings). When zero/false must differ from absent legacy data, put required
  fields inside an optional map. Gunfire's `fire` snapshot uses this so an
  unsilenced mode 0 cannot fall back to a later mode 1. Keep its SDK Room wire test.
