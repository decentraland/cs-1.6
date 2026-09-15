# CS 1.6 in Decentraland — implementation plan

Build faithful CS 1.6 gameplay on the existing Dust2 map using Decentraland's
SDK7 authoritative server. The first playable milestone was play against bots;
a match now always runs as T versus CT, with bots filling any side that has no
connected human. Prioritize shooting, movement, scored rounds, and the leaderboard; polish weapon
and character models after that loop works. Exact CS 1.6 UI remains a requirement.
The game is not complete.

## Confirmed scope

- Keep the existing Dust2 model and placement. Use stock Bevy Explorer to preview
  the scene. Editor and engine changes are outside the current scope.
- Match CS 1.6 firing, sustained-fire recoil/spread, movement penalties, walking,
  recovery, and counter-aiming. Document limitations instead of calling approximate
  settings identical physics.
- Playable rounds, persistent kills/deaths, team scores, and a leaderboard sorted
  by kills. Preserve those while adding mechanics.
- Recreate the original HUD, scoreboard, team/buy menus, and input behavior.
- Use Decentraland's authoritative server for combat and match state. Extend the
  bot foundation to multiplayer, bomb defusal, and economy.
- Gun/character assets may be made in Blender or sourced without purchases.
  Use Blender MCP to inspect final geometry, materials, orientation, animation,
  and exports. Placeholder models are acceptable during gameplay development.

Final multiplayer capacity, deployment destination, hardware targets, and any
paid-asset budget remain unspecified. Use a two-client local regression before
choosing server capacity; no public deployment or purchase is assumed.

## Current implementation and evidence

The scene runs with SDK/runtime `7.27.1-33533530571.commit-451d001`. Keep this exact
pin until a replacement proves the same authoritative APIs. Node 22.18+ is needed
for the current rule tests.

- One match model: picking a team on the menu starts the freeze immediately.
  Any playing side with no connected human is filled with three bots
  (Guerilla/Phoenix/Arctic, `team-rules.ts` `fillBots`); bots leave when a
  human joins their side at the next round, and the match resets when every
  human leaves. There is no separate solo/practice mode or owner.
- Bots pursue visible enemies, strafe and stop to shoot inside 10 m, back off
  while reloading, relay sightings to teammates, search last-seen positions and
  roam between per-side strategic spots and random reachable nodes with holds,
  scanning and walk/run pacing (`bot-behavior.ts`, seeded per round). Routes are
  string-pulled over the collision-derived graph. Server line of sight gates
  their bursts; shared AK/M4A1 bullet rules determine hits and damage. BOT SKILL
  (easy/normal/hard/expert, `bot-difficulty.ts`) scales reaction time, attack
  delay and aim error after the CS 1.6 BotProfile.db templates. Bot kills
  feed `playerKill`, bot rows sit inside their team on the scoreboard, and a lone
  dead human spectates the bots.
- Bots render as synchronized named `AvatarShape` NPCs. Bevy animates
  them from the authoritative navigation transforms, and `world-weapons.ts`
  attaches a weapon model to the right hand of every bot and remote player;
  faithful CS character assets remain a later presentation pass.
- Freeze (3 seconds), live (120 seconds), result (5 seconds), automatic next round,
  and first-to-sixteen match end work. Health/ammo/bots reset each round; kills,
  deaths, and team scores persist. CT wins timeout while no bomb is planted.
- Server-owned ammo, cadence, reloads, shot sequence validation, AK spread/punch,
  map occlusion, shared avatar hit regions, and distance damage are implemented.
- Shots carry the client's origin, speed, grounded flag and observed target
  position; the server validates them against one second of position history
  (`hit-claims.ts`) and re-traces. No timestamp rewind: comms and scene messages
  are separate channels.
- Run/walk/jump settings use `AvatarLocomotionSettings`; movement is blocked during
  freeze, death, and results. Measured speeds are approximately 5.44/2.87 m/s.
- The scoreboard sorts each team by kills descending, then fewer deaths.
- Avatar passport interactions are disabled over the 12×12-parcel game area.
  The component was confirmed in Bevy; a two-player click recheck remains open.
- HUD digits/icons now use the original sprite atlas and reference placement.
  Headless Brave verified upright glyphs at 1280 px and HUD values through three
  bot kills, a scored victory, restored health/ammo, and a scored defeat. Full
  reference-image/aspect-ratio parity remains open. The team-selection screen now
  uses the pinned `Teammenu.res` layout, title logo, scheme colors/font tiers, and
  exact Dust II briefing in a centered 4:3 area. Other UI/models are still
  placeholders. Shared money, round rewards, equipment buying, armor, and survivor
  equipment/ammo retention are implemented.
- Start/team menus now recover the cursor if the canvas captures it while the
  menu remains open, and noninteractive damage feedback no longer consumes clicks.
- The live view is a scene-driven `VirtualCamera` at eye height; predicted
  recoil punch and victim punch rotate it like GoldSrc and can be counter-aimed.
  The local avatar is hidden with a client-only hide-avatars
  `AvatarModifierArea` so the one-frame camera lag never shows it. The server
  still offsets shots by its authoritative punch.
- Authoritative bot and human damage events now drive the original directional
  pain sprites, hitgroup/armor-dependent camera punch, and local impact sound.
- Death uses a three-second camera transition with a falling 80-degree rolled
  view, then chases a living human teammate, or a living bot when none is available.
- Bot C4 play: T bots rotate carriers and A/B destinations, route the carrier to
  plant, retrieve dropped bombs, and defend a planted site; CT bots route to a
  planted bomb and defuse it while no enemy is visible.
- Keys follow CS 1.6 where the explorer allows: 1 primary, 2 pistol, 3 knife,
  4 C4, Shift+4 drop C4, Shift+1 hold scoreboard, E use/defuse, F reload or
  stab, Esc buy menu. Team menu: 1 Terrorists, 2 Counter-Terrorists; AUTO
  ASSIGN/SPECTATE are click-only (no 5/6 input actions). Menu hover is computed
  from the pointer position each frame rather than mouse-enter events.
- Mobile (Godot explorer) support: `src/platform.ts` detects `platform: 'mobile'`;
  touch uses the engine first-person camera with aim read from the camera
  transform, fire/slot/spectator inputs no longer require pointer lock, the
  native gamepad's central button fires, and the HUD gets BUY/SCORES buttons.
  Verified only by type-check/tests; needs a run on a device.
- The buy menu uses the same 640x480 VGUI frame as the team menu
  (`menu-ui.tsx`): CS 1.6 category list, per-category submenus, money and item
  info panel, keys 1-4 for the first rows. Unavailable categories (shotguns,
  SMGs, machine gun) are shown disabled.
- Shared C4 defuse and explosion outcomes award the reference three frags once
  to the defuser or planter. Two-client browser evidence records rows at 4/0
  after one CT kill plus defuse and 3/1 for the successful T planter.
- Server-owned knife swings and stabs use the reference reach, chained damage,
  cooldowns, armor ratio, hitgroups, and three-times rear-stab multiplier.
  Stationary view yaw is synchronized for authoritative rear-stab checks.

`npm run validate` passes 129 tests, asset integrity, bundling, and type checking;
`npx prettier --check src tests validate` checks formatting.
`validate/game/team-menu` records the exact visible team labels and source geometry
at 800×450 and 1280×720 and two-client auto-assignment
to T then CT with the expected spawn pistols (recorded before bot filling).
`validate/game/rounds.json` records three kills → CT point → automatic next round
→ death → T point, retaining 3/1 player stats. `validate/game/movement.json` records
actual browser movement. `validate/game/teams.json` records two-client team
selection, original spawns, shared scored kills, dead input restrictions, and
automatic round respawns. `validate/game/bomb.json` records both objective frag
awards through complete defuse and explosion rounds. `validate/game/knife.json`
records 20→15 primary damage, a 65-damage frontal stab, a 195-damage rear stab,
and two credited kills. These results do not establish complete CS parity. See [README](README.md) for commands and
[mechanics research](docs/CS16-MECHANICS.md) for pinned reference sources.

## Work order and acceptance gates

### 1. Match shooting and movement

Keep mouse aim separate from displayed recoil so the server applies punch once.
Add timely local presentation and reconciliation with server results. Validate
standing, running, Shift-walking, airborne fire, full-auto spray,
release/recovery, reload, and counter-aiming against the pinned CS reference.
Punch is predicted in the firing frame on the live `VirtualCamera` and reconciled
without replaying a late kick, so counter-aiming works on the client. Earlier browser
checks of visible camera kick/recovery, mouse turning, movement following the
view, click-to-recapture after Escape, and complete scored rounds were recorded
with the previous virtual camera. Full-magazine timing
now preserves fractional frame intervals and buffers early arrivals; the browser
most recently sampled 3.178 s from the first observed ammo decrease to empty
and verified automatic reload (2.7695 s reference first-to-last shot interval). Immediate camera/weapon presentation is implemented; direct original-client
comparison remains open; spread now uses a server-chosen shared per-round seed so client prediction matches.

The SDK maintainer confirmed that AvatarLocomotionSettings exposes speeds, jump
heights, gliding limits, and hardLandingCooldown, but no acceleration, friction,
gravity, or crouch collider setting. Keep these fidelity requirements open; a
new SDK version is not an assumed solution. Measure supported speed/jump settings
and investigate scene-side options only if they preserve real collision and
authoritative combat. Do not present speed tuning or a camera-height change as
complete CS movement or crouching.
Complete the original input mapping as the client APIs allow.

Gate: real browser input controls the view and player correctly; shooting and
counter-aiming work through complete scored rounds. Compare recorded traces and
sprays with CS 1.6 before claiming identical handling.

### 2. Complete rounds and authoritative multiplayer

Player shots against bots and humans now share the server geometry, AK recoil/spread, and range-
damage resolver; client proximity-hit claims and client shot origins are removed.
Eight production-resolver regressions cover walls, misses, hit regions, target
ordering, independent recoil, and stance spread. Human standing bounds are proxies
and need comparison against actual avatars. Team selection, original Dust2
spawns, no mid-round respawns, shared round restart, and admission rules are now
implemented. Two-client human combat and matching scores passed in Bevy; a
third-client check exercised late joins and disconnect expiry. Dead players are
frozen in place; the death transition and teammate/bot free-chase spectating
are implemented, while other observer modes remain open. Bomb assignment, original A/B trigger planes, dropping/pickup, planting,
defusing, timed explosion, and post-plant win rules are now implemented.
Kit buying and armor are implemented. Bot carrying, planting, retrieval, site
defense and CT-bot defusing are implemented. Defusing and successful C4 explosions award the
reference three scoreboard frags to the defuser or planter. Advanced bot tactics remain open.

Money awards/losses, equipment buys restricted by zone/time, armor, reserve ammo,
and survivor retention are implemented. USP/Glock starting pistols, AK/M4A1 buying, weapon switching, caliber ammo
purchases, and knife attacks are implemented. Complete other weapons, alternate modes, and dropped
equipment. Weapon-specific
handling must use CS 1.6 references rather than the existing modern presets.
Add bot routes, perception, target choice, and objective behavior across Dust2.

Gate: two independent clients agree on shots, health, deaths, scores, round phase,
bomb state, and money. Invalid/duplicate requests cannot award damage or points;
late joins and disconnects cannot strand a match. A lone guest can still play a
complete match against bots. Validate full-map routes and each bomb outcome.

### 3. Recreate the CS 1.6 interface

Use original reference captures to reproduce HUD digits/icons, health/armor/ammo,
money, timer, radar, crosshair, kill feed, round messages, scoreboard, team menu,
and buy menu. Populate these from actual authoritative game state. Preserve
kill ordering. Remove Decentraland interactions that interrupt firing using
supported scene components.

Gate: compare screenshots at fixed viewport sizes against CS references, covering
live play, damage, reload, death, scoreboard, round results, and menus. Verify
controls and readable layout at multiple aspect ratios. A similar amber theme
alone does not pass this gate.

### 4. Polish and validate assets

Replace placeholder enemies and weapon presentation with faithful low-poly assets
and sounds. Maintain provenance for every selected asset. Use Blender MCP to
inspect visible geometry, scale, orientation, textures, rigging, and animation;
export self-contained GLBs and re-import them. Keep editable source files.

Gate: review first-person and world models in Blender and Bevy, including hands,
draw/fire/reload, movement, death, switching, near-wall clipping, and multiple
players. Set resource budgets from measured target hardware and match capacity.

## Working and validation rules

Keep gameplay changes in `cs-1.6`; preserve the unrelated rewrite of
`dclcontext/sdk7-complete-reference.md`. Do not patch the editor or engine as a
shortcut. Use the existing map's measured coordinate conversion; its east-wall
regression protects the reflected GLTF X-axis placement.

Run `npm run validate` after behavior changes and the relevant browser regression.
A passing build alone is not a gameplay acceptance result. Record failures and
unverified conditions honestly. Bug fixes need a runnable reproduction or a test
that fails before and passes after the fix.

Use a separate checkout and browser for independent encounters. Different ports
on one checkout still share its scene identity. Use headless WebGPU for controlled
input so tests do not capture the user's mouse. Reload the scene after a server
restart: this SDK build can retain stale CRDT state across preview restarts.
Confirm the specific live process before waiting or restarting it.

Keep README, setup instructions, and this plan aligned with the current behavior;
report remaining fidelity gaps until the full scope is implemented and verified.

Latest input fixes: local camera/weapon recoil and stable Shift-diagonal crosshair
feedback pass 44 rule tests and the dedicated browser regression with 400 ms
delayed shot feedback. Normal-timing full-round and full-magazine checks also
pass with prediction in a fresh isolated browser. The sampled magazine interval
was 3.178 s versus a 2.7695 s reference; exact firing-rate parity remains open.

Team-round implementation: one server-owned Practice state carries the admitted
roster (bot seats included since the unified match model). Live/freeze joins become eligible next round;
duplicate admission cannot heal, team changes during active rounds are rejected,
and disconnects expire after 20 seconds without heartbeats. Team capacity is
initially five seats; browser performance has not been verified at 5v5. All 40
original spawn positions have floor support and standing clearance in Blender
and in production map queries. Default-pistol inventory and rifle buying are implemented.

Post-team solo browser regression passed. Shared team admission browser checks
passed live late-join exclusion, timeout of a disconnected opponent, queued
next-round spawn, and fresh-guest admission after reopening a tab. That reopened
tab generated a new guest identity. Same-address recovery then passed using the original suspended tab: its address
and stats were retained, rejoining stayed dead, and the next round restored
health. The resumed tab needed `Page.bringToFront` to receive visible updates.
Evidence: `validate/game/team-reconnect.json`.

Economy browser regression passed in muted CT/T clients: server-owned starting
funds and purchases, kit defusing, deferred round payouts, kill money, armor
damage, helmet upgrades, survivor retention, death resets, and paid AK reserve
ammo. Evidence: `validate/game/economy.json`. Original input/menu fidelity, dropped equipment, and remaining observer modes
remain open. Headless test browsers must launch with `--mute-audio`.

Post-economy solo regression passed the full two-round bot sequence and retained
3/1 stats (`validate/game/economy-solo.json`). That run used 72 tests; the inventory stage passed 81
tests plus asset checks, build, and typecheck.

Default-pistol inventory now replaces the free AK in shared rounds. Current
profiles cover unsilenced USP/M4A1, semi-auto Glock, and AK; buying, slots, ammo,
draw delay, reload cancellation, and stale-weapon shot rejection are implemented.
Original models/sounds, silencers, Glock burst, other guns, and dropped
weapons remain fidelity requirements.

Inventory browser validation passed starting pistol magazines, one shot per press,
team rifle purchases, caliber ammo prices, automatic rifle fire, slot switching,
reload cancellation/completion, and death/survivor inventory. Evidence:
`validate/game/inventory.json`. A C4 completion regression now redeploys the gun
with its draw delay instead of firing immediately while the planting button is
held. The updated economy test passed using default pistols, including armor
damage and $20 Glock ammo (`validate/game/economy-pistols.json`).

The same production source also passed the complete solo bot round regression
after inventory changes (`validate/game/inventory-solo.json`), retaining 3/1
stats across the win/reset/loss sequence. All owned browsers in these runs were
muted and closed after validation.

Teammate-only free-chase spectator cameras are implemented. The four-client
browser run passed death entry, enemy exclusion, forward/reverse target cycling,
disabled dead movement/shooting, following target movement, target-death
selection, no-target fallback, and restoration of the player's camera and gun on
next-round respawn (`validate/game/spectator.json`). Three spectator rule checks
bring the current gate to 84 passing tests plus asset/build/typecheck validation.
Other observer modes, original observer UI, rendered body death animation, full chase collision
parity, and live spectator disconnect recovery remain open. Do not use page
lifecycle freezing as proof of heartbeat expiry or a reliable match reset.

The post-spectator solo regression passed the full bot win/reset/loss sequence
with retained 3/1 stats (`validate/game/spectator-solo.json`). Owned test browsers
were muted and closed after these runs.

The scoreboard now uses the original proportional panel/row resources, bitmap
Verdana size tiers, stock team colors/dividers, player counts, aligned
Score/Deaths/Latency columns, local-row highlight, and teammate-visible C4 status.
Normal round wins no longer open the scoreboard; holding Shift+1 or reaching match end
shows it. The installed SDK cannot bind Tab directly. Human latency, exact GDI
rasterization, and the remaining menus/HUD still need fidelity work. Original
resources and font generation are preserved in `asset-sources/scoreboard`.

Classic scoreboard validation passed complete solo rounds and visible kill
ordering, shared CT/T scores across two human rounds, player counts, local-row
highlights, and teammate-only C4 status. The final native-capture sweep passed
all three viewports including 1080p. Evidence is in
`validate/game/scoreboard-classic`; the structural gate remains 84 tests plus
weapon/font assets, build, and typecheck. Full interface parity remains open.

Classic radar now uses the original 128px sprite with camera-relative teammate
positions, the 128-unit height threshold, C4-carrier color and T-only dropped/
planted bomb markers. Three muted browser clients verified teammate rotation,
enemy filtering, dropped-C4 flashing and death removal. Evidence and a runnable
harness are in `validate/game/radar` and `validate/radar.mjs`. The gate passes
88 tests. Exact additive blending, radio flashes and location labels remain;
planted/height glyph rules have unit coverage but still need rendered checks.

Bot navigation now runs on a 21,170-node graph generated from Dust2 collision
geometry. All original spawns and A/B connect; paths support a sampled standing
body and walking steps. The browser exposed the old fixed-height bot spawns on
a slope; floor probing corrected them and a regression now covers each spawn.
Full solo rounds passed with moving bots. They now use synchronized
`AvatarShape` bodies so the authoritative transforms are visible and animated.
Another live run tracked bots 83, 53
and 42 m from their starts with floor/speed checks; a bot reached sight of the
player near T spawn and resumed combat after 19.5 seconds. Evidence and harness:
`validate/game/navigation`, `validate/navigation.mjs`. Gate: 93 tests plus asset/
graph integrity and build/typecheck. Directional perception, hearing, agent
avoidance, jump/crouch routes and advanced tactics remain open.

Bot movement later gained a seeded behaviour layer (`bot-behavior.ts`): roam
destinations mixing per-side strategic spots with random reachable nodes, holds
with scanning, walk/run pacing, sidestep/stop engagement, reload retreats,
teammate callouts, string-pulled routes, rate-limited turning and per-frame
server updates. CT bots carry the M4A1. Every other player and bot now shows a
right-hand weapon model (`world-weapons.ts`). Rules are covered by
`tests/bot-behavior.test.mjs` and the extended navigation tests.

Bot AK shooting now uses the player bullet resolver, movement spread, recoil,
hit regions, armor, finite 30/90 ammo and 2.45 s reloads. Enemy bots obstruct
shots with friendly fire off. Combat ticks independently of 10 Hz navigation
so automatic fire retains fractional 95.5 ms scheduling. Live observation
recorded 100→65→30→0 health at ~100 ms intervals and a named AK bot kill. The
original slow body-shot script lost to the third bot; its input now prioritizes
the encounter reaction order and uses shorter pauses without reducing damage. Full gate: 99 tests, asset/graph checks,
bundle/typecheck. Evidence is in `validate/game/bot-combat`. Bursts/reaction are
scene AI heuristics; original CS bot tactics, faithful character/weapon animation
and coordinated team tactics remain open.

Solo bot objective play now rotates a carrier and A/B destination, follows the
production route to plant, assigns dropped-bomb retrieval, and spreads survivors
around the active site. A browser run observed the B traversal and plant in
`validate/game/solo-bomb.json`.

Victim hit feedback now travels through the authoritative damage result for both
human and bot attacks. It carries the origin, hit group, and server-computed
punch used by the original four-direction GoldSrc pain compass and ReGameDLL's
hitgroup/armor-dependent camera reaction. The generated local impact sound
restarts on every hit. Death then falls and rolls for the three-second CS dying
window before solo bot or team teammate chase begins. Focused rules cover
direction, fade, punch caps, armor suppression, target ordering, death pose, and
handoff timing. The combined body hit region and generated sound remain lower
fidelity than the original game's separate hitgroups and audio assets.

Final bot-combat browser validation passed the complete solo win/reset/loss
loop with retained stats. `hits.json` also confirms muzzle/endpoint effects and
named bot kill attribution. Reload and armor have rule tests; the live hit trace
was unarmored and ended before a full magazine/reload. Test resources were muted
and closed after validation.

## 2026-09-11: hidden local avatar, CS key layout, unified match

- The live `VirtualCamera` trailed the avatar by a frame, so the player's own
  avatar showed in front of the lens while moving. An engine first-person camera
  was tried and rejected because the scene cannot rotate it (no recoil view
  punch). The fix keeps the `VirtualCamera` with camera punch and hides only the
  local avatar through a client-side hide-avatars `AvatarModifierArea` that
  excludes every other player and bot (`client.ts`). The weapon viewmodel adds
  a quarter-strength tilt (`weapon-view.ts`, `getViewPunch`/`getPainPunch`).
- Team menu hover is computed from `PrimaryPointerInfo.screenCoordinates` each
  frame (`menu-state.ts`), replacing delayed mouse-enter events. Keys 1/2 join
  T/CT while the menu is open; AUTO ASSIGN/SPECTATE stay click-only because the
  explorer has no 5/6 input actions.
- Weapon keys match CS 1.6: 1 primary, 2 pistol, 3 knife, 4 C4, Shift+4 drop
  C4, Shift+1 hold for the scoreboard (Tab is unavailable); the scoreboard still
  opens automatically at match end.
- One match model: `Practice` has no mode/owner. Picking a team starts the
  freeze immediately; a playing side with no connected human is filled with
  three bots (`fillBots`, `BOT_FILL`, `BOT_NAMES`, `isBotAddress`). T bots
  carry and plant, CT bots pursue and defuse; kills go through `playerKill`;
  bots appear inside their team on the scoreboard; a lone dead human spectates
  bots. The `practiceStart`/`practiceHit` messages and the PRACTICE WITH BOTS
  button are gone. Unit tests: 129 passing.
- Browser scripts under `validate/` were touched for the new flow but have
  **not** been re-run; `game.mjs`, `camera.mjs`, `cadence.mjs`,
  `input-feedback.mjs`, `bot-avatars.mjs`, `solo-bomb.mjs` and `team-menu.mjs`
  still wait for the removed `Start game`/`PRACTICE WITH BOTS` labels and need
  a pass before they can produce fresh evidence. All existing evidence files
  record the earlier flow and camera.
