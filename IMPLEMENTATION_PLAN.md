# CS 1.6 in Decentraland — implementation plan

Build faithful CS 1.6 gameplay on the existing Dust2 map using Decentraland's
SDK7 authoritative server. The first playable milestone was play against bots;
a match now always runs as T versus CT, with bots filling any side that has no
connected human. Prioritize shooting, movement, scored rounds, and the leaderboard; polish weapon
and character models after that loop works. Exact CS 1.6 UI remains a requirement.
The game is not complete.

## Current priority: playable MVP

Focus on a complete guest match: join a team, buy/equip, fight visible bots,
resolve rounds and bomb objectives, die/spectate, and return for another round
or match. The creator will playtest weapon feel; do not spend extended browser
sessions measuring individual shots while match-flow blockers remain.
Keep the full fidelity goal and its remaining gaps below. Run the offline gate
for changes and only a short, focused browser check when it resolves a specific
MVP uncertainty. Always use the server-only launch command and close owned tests.

## Confirmed scope

- Keep the existing Dust2 model and placement. Use stock Bevy Explorer to preview
  the scene. Editor and engine changes are outside the current scope.
- Match CS 1.6 firing, sustained-fire recoil/spread, movement penalties, walking,
  recovery, and counter-aiming. Document limitations instead of calling approximate
  settings identical physics.
- Playable rounds, persistent kills/deaths, team scores, and a leaderboard sorted
  by kills. Preserve those while adding mechanics.
- Match format: first to 16 wins, with no automatic side switch or halftime money
  reset (creator confirmed 2026-09-15). Do not convert this to MR15.
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

Original Arctic/Urban bot bodies now include independent gait/weapon clips, full-body
corpses and animated source hitboxes. Human avatars, aim blend/twist, directional
throws and additional movement poses remain open. See [body implementation](docs/CS16-PLAYER-MODELS.md).


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
  their bursts; the equipped firearm's shared rules determine hits and damage. BOT SKILL
  (easy/normal/hard/expert, `bot-difficulty.ts`) scales reaction time, attack
  delay and aim error after the CS 1.6 BotProfile.db templates. Bot kills
  feed `playerKill`, bot rows sit inside their team on the scoreboard, and a lone
  dead human spectates the bots.
- Bots render original Arctic/Urban GLBs with source animations and animated
  hitboxes. Server-owned transforms and `BotBodyPose` drive client-local
  animators; `world-weapons.ts` attaches the equipped gun. Human bodies still
  use native avatars and standing hitbox proxies.
- Freeze (3 seconds), live (120 seconds), result (5 seconds), automatic next round,
  and first-to-sixteen match end work. Health and the timer reset each round;
  surviving humans and bots retain equipment/ammo, while dead actors receive
  starting loadouts. Kills, deaths, money and team scores persist. CT wins
  timeout while no bomb is planted.
- Server-owned ammo, cadence, reloads, shot sequence validation, per-weapon
  spread/punch, map penetration, hit regions and distance damage are implemented.
- Shots carry the client's origin, speed, grounded flag and observed target
  position. Origin/movement validation uses recent samples (`hit-claims.ts`).
  Bots rewind position, yaw and animation pose to bounded `ServerClock`/`seenAt`
  time; humans use measured RTT and bounded observed-position correction.
  The server re-traces before applying damage. See [human rewind and its limits](docs/CS16-HUMAN-REWIND.md).
- Desktop Bevy applies weapon speed, acceleration, friction, counter-strafing,
  gravity, jump fatigue and bullet flinch through its velocity components,
  retaining native collision. Mobile/unsupported clients use locomotion speed
  settings. Movement is blocked during freeze, death and match end. Survivors remain active during the result countdown.
  See [movement evidence and remaining physics differences](docs/CS16-MOVEMENT.md).
- The scoreboard sorts each team by kills descending, then fewer deaths.
- Avatar passport interactions are disabled over the 12×12-parcel game area.
  The component was confirmed in Bevy; a two-player click recheck remains open.
- HUD digits/icons now use the original sprite atlas and reference placement.
  Headless Brave verified upright glyphs at 1280 px and HUD values through three
  bot kills, a scored victory, restored health/ammo, and a scored defeat. Full
  reference-image/aspect-ratio parity remains open. The team-selection screen now
  uses the pinned `Teammenu.res` layout, title logo, scheme colors/font tiers, and
  exact Dust II briefing in a centered 4:3 area. Original weapon models and
  animations cover the full roster; human character models remain Decentraland avatars. Shared money, round rewards, equipment buying, armor, and survivor
  equipment/ammo retention are implemented.
- Start/team menus now recover the cursor if the canvas captures it while the
  menu remains open, and noninteractive damage feedback no longer consumes clicks.
- The desktop live view is a scene-driven `VirtualCamera` at eye height; predicted
  recoil punch and victim punch rotate it like GoldSrc and can be counter-aimed.
  The local avatar is hidden with a client-only hide-avatars
  `AvatarModifierArea` so the one-frame camera lag never shows it. The server
  still offsets shots by its authoritative punch.
- Authoritative bot and human damage events now drive the original directional
  pain sprites, hitgroup/armor-dependent camera punch, and local impact sound.
- Desktop death uses a three-second camera transition with a falling 80-degree rolled
  view, then chases a living human teammate, or a living bot when none is available.
- Bot C4 play: T bots rotate carriers and A/B destinations, route the carrier to
  plant, retrieve dropped bombs, and defend a planted site; CT bots route to a
  planted bomb and defuse it while no enemy is visible.
- Keys follow CS 1.6 where the explorer allows: 1 primary, 2 pistol, 3 knife,
  4 C4, Shift+4 drop C4, Shift+1 hold scoreboard, E use/defuse, F reload or
  stab. Esc frees the cursor; the HUD BUY button toggles the buy menu.
  Team menu: 1 Terrorists, 2 Counter-Terrorists; AUTO
  ASSIGN/SPECTATE are click-only (no 5/6 input actions). Menu hover is computed
  from the pointer position each frame rather than mouse-enter events.
- Mobile (Godot explorer) support: `src/platform.ts` detects `platform: 'mobile'`;
  touch uses the engine first-person camera with aim read from the camera
  transform, fire/slot/spectator inputs no longer require pointer lock, the
  native action buttons are replaced by custom held-action controls and separate
  BUY/SCORES/TEAM buttons. Buy/team cards scale and scroll for touch.
  See [controls and verification](docs/CS16-TOUCH-CONTROLS.md); native multitouch
  and mobile scope magnification remain open.
- The buy menu uses the same 640x480 VGUI frame as the team menu
  (`menu-ui.tsx`): CS 1.6 category list, per-category submenus, money and item
  info panel, keys 1-4 for the first rows. All original firearm categories are
  available, with team, money and inventory restrictions.
- Shared C4 defuse and explosion outcomes award the reference three frags once
  to the defuser or planter. Two-client browser evidence records rows at 4/0
  after one CT kill plus defuse and 3/1 for the successful T planter.
- Server-owned knife swings and stabs implement reach, chained damage,
  cooldowns, armor ratio, hitgroups, and three-times rear-stab multiplier.
  Stationary view yaw is synchronized for authoritative rear-stab checks.

Latest recorded `npm run validate`: 545 tests, asset integrity, bundling and type
checking passed after the [spectator quick-tap correction](validate/game/spectator-taps/README.md).
The earlier touch input, short-tap, round-continuation, auto-buy/rebuy, weapon
action/empty-trigger timing and shield collision preparation changes remain included. Native device verification and
the full parity acceptance gates below remain open.
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

Still required before claiming the full goal complete:

- Compare weapon timing/feel and HUD presentation with CS 1.6; source-rule tests
  and earlier captures do not establish exact parity.
- Verify native mobile multi-touch on a device. Godot scope magnification,
  camera recoil and death/chase camera support remain unresolved; see
  [camera compatibility](docs/EXPLORER-INCONSISTENCIES.md#15-virtualcamerafov-support-differs-between-clients).
- Playtest a complete first-to-16 match and moving human targets in two clients;
  tune rewind against actual transport and avatar smoothing. Full 5v5 capacity
  is not yet demonstrated.
- Complete the remaining movement, observer, character and equipment gaps
  listed below, including crouch hulls and shield; nightvision brightness controls are now implemented.
  The [shield source preparation](docs/CS16-SHIELD.md) now includes 24 pinned source
  files and explicit bodygroup selection, checked by five offline Python tests.
  Model conversion/visual validation and shield gameplay are still outstanding.

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
gravity, or crouch collider setting. A later hosted-Bevy check confirmed that
`AvatarMovement`/`AvatarMovementInfo` let the scene supply CS movement rules while
retaining native collision; see [the implementation and its limits](docs/CS16-MOVEMENT.md).
Crouch and complete GoldSrc collision remain open; a new SDK version is not an assumed solution. Measure supported speed/jump settings
and investigate scene-side options only if they preserve real collision and
authoritative combat. Do not present speed tuning or a camera-height change as
complete CS movement or crouching.
Complete the original input mapping as the client APIs allow.

Gate: real browser input controls the view and player correctly; shooting and
counter-aiming work through complete scored rounds. Compare recorded traces and
sprays with CS 1.6 before claiming identical handling.

### 2. Complete rounds and authoritative multiplayer

Player shots against bots and humans share server geometry, weapon-specific
recoil/spread and range damage. Validated origin/observation claims and historical
target queries compensate for transport delay; only the server awards damage.
Eight production-resolver regressions cover walls, misses, hit regions, target
ordering, independent recoil, and stance spread. Human standing bounds are proxies
and need comparison against actual avatars. Team selection, original Dust2
spawns, no mid-round respawns, shared round restart, and admission rules are now
implemented. Two-client human combat and matching scores passed in Bevy; a
third-client check exercised late joins and disconnect expiry. Dead players are
frozen in place; the death transition, teammate/bot free-chase spectating and
desktop neutral-spectator roaming are implemented. Neutral spectators can explore
an empty lobby and return to team play. First-person and map observer modes remain
open. Bomb assignment, original A/B trigger planes, dropping/pickup, planting,
defusing, timed explosion, and post-plant win rules are now implemented.
Kit buying and armor are implemented. Bot carrying, planting, retrieval, site
defense and CT-bot defusing are implemented. Defusing and successful C4 explosions award the
reference three scoreboard frags to the defuser or planter. Advanced bot tactics remain open.

Money awards/losses, equipment buys restricted by zone/time, armor, reserve ammo,
and survivor retention are implemented. The server replicates buy time separately
from the result countdown, allowing surviving players to buy after an early
round result until the original deadline. Match end closes buying.
All 24 firearms, alternate modes, weapon
switching, caliber ammo, knife attacks, grenades, dropped guns and recoverable
defuse kits are implemented. Shield and the remaining source-level
handling differences still need work; see `docs/CS16-ARSENAL.md`.
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
hitgroup/armor-dependent camera reaction. The later hit-response pass replaces the generated impact sound with original positional player voices. Death then falls and rolls for the three-second CS dying
window before solo bot or team teammate chase begins. Focused rules cover
direction, fade, punch caps, armor suppression, target ordering, death pose, and
handoff timing. The later hit-response pass splits the body proxy into chest, stomach and arms; animated CS character hitboxes remain outstanding.

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

## Current priority: complete weapon behavior with approved models

The user approved expanding the original GameBanana pack beyond the reviewed AK.
Implement all 24 firearms plus knife, retaining playable rounds and scoreboard.
See [arsenal status](docs/CS16-ARSENAL.md) for implemented rules, tests and remaining
engine/scene parity gaps. Headless Bevy review and the full validation gate passed for the weapon expansion.
Exact GoldSrc parity remains the broader target.

Arsenal milestone validated: 24 firearms and knife loaded, fired and reloaded in headless Bevy; silencer/burst modes and AWP zoom/bolt cycling passed. Full scene gate: 158 tests, asset/source validation, bundle and typecheck. See `docs/CS16-ARSENAL.md` for remaining parity gaps.

Bullet penetration now follows the source caliber, material, impact-count and damage
rules. An exported point hull from the original Dust2 BSP supplies solid transitions
and texture materials; render triangles no longer decide bullet wall traversal.
The browser fixture verifies that the USP stops at the middle door while the AWP
causes 56 damage per body hit through it. The menu's pointer-capture click is
consumed until release. See `validate/game/penetration/README.md` for a runnable
reproduction and evidence. The full gate now includes 164 rule tests and the
source hull integrity check. Original player hulls and GoldSrc movement remain open.

## 2026-09-15: weapon drops and pickup economy

Original ground models now cover all 24 firearms. Manual drops, purchase
replacements, enemy pickups and human/bot death drops use authoritative inventory
and source ammo/weight rules. Shift+2 supplies the unavailable native drop key.
Dropped guns toss against the original point hull, settle before pickup, and are
removed on a round reset or after five minutes. Source ground-model pixels and
geometry have their own validator. See `validate/game/pickups/README.md` for the
runnable browser proof and fixture limitations. The muted headless run passed
scoped dropping, walking pickup, enemy weapons, purchase replacement, human death
and next-round cleanup. The gate includes 174 rule tests and 24 ground-model checks.

Purchase selection now follows the original drop-then-weight comparison: buying
a pistol with a rifle keeps the rifle selected. The regression failed with the
previous unconditional selection; the headless pickup proof also exercises a
Deagle purchase while holding a captured AK.


### Grenades (2026-09-15)

Original HE, flashbang and smoke models, prices/capacities, pin/throw animations, positional sounds, server-owned flight/fuses, HE armor/self-damage, flash facing/occlusion/stacking and smoke sight blocking are implemented. Flashbangs return to another weapon after throwing, even with another flash carried. Death drops a primed grenade and the best firearm; spare grenades are discarded. New rounds clear effects.

The installed scene gate passed 183 tests, 28 original view/held models, 24 ground models, three animated grenade projectiles, nine original sprite atlases, source hashes, build and typecheck. Muted headless Bevy verified purchases/caps, slot cycling, no cooking, flash timing/facing/door blocking, HE armor and through-door damage, smoke rendering/lifetime, primed death and next-round cleanup. Camera-parallel sprite planes fix the intersecting billboard seams visible from inside smoke. See `docs/CS16-GRENADES.md` and `validate/game/grenades/README.md` for reproduction, evidence and remaining limits.

## Original C4 models and source action timing

C4 now uses the approved original first-person model and original held, planted
and dropped-backpack models. Blender validated the 37-bone viewmodel and original
clips; its largest sampled pose error is below 0.000002. Keypad sounds, LED blink,
fireballs and smoke use original assets. Authoritative deployment/retry delays,
local plant/cancel animation, holster cancellation, C4 movement speed, best-weapon
retirement and bomb removal after defusing are implemented. C4 blast falloff now
uses the established 0.025m weapon calibration and preserves fractional damage
until armor handling. Terrorist use near a planted C4 no longer freezes movement.

The gate passes 186 tests plus asset verification, bundle and typecheck. Muted
headless Bevy exercises the complete plant/drop/explosion/next-round cycle and
ten-/five-second defuses, including the bot's held C4 model. Reproduction and
remaining differences are in `docs/CS16-C4.md`; evidence is in `validate/game/c4`.
Backpack toss physics, carrier back attachment, native character animations and
an exact C4 HUD/progress comparison remain pending.


### Movement audio — September 15, 2026

Original footsteps now use Dust2 BSP materials, alternating feet, the CS speed
threshold and cadence. Running takeoff and high-landing sounds use original clips.
Local velocity feedback prevents transform batching from determining local timing;
remote humans/bots use synced positions. Walking, stopping, respawn and hidden
scene handling are covered. See `docs/CS16-MOVEMENT-AUDIO.md` for the native Avatar
audio setting and remaining movement/fall-damage/hearing limits.


### Fall damage and landing feedback — September 15, 2026

Implemented the original fall-damage formula, armor bypass, integer health damage,
strict splat threshold and world-death scoring. The server requires an observed
fall and bounds the client's native impact report; missing reports fall back to
server motion. Landing roll and recoil-pitch reset are predicted locally without
replaying on a late confirmation. Original pain/death/splat clips are installed.
See `docs/CS16-FALLING.md` for source rules, validation and remaining physics limits.
The pre-existing `validate/movement.mjs` regression is preserved; the newer
footstep-only browser regression is `validate/movement-audio.mjs`.

### Body-part damage and original player voices — September 15, 2026

Added chest/stomach/arm separation and facing-aware shared proxy traces, source hit multipliers with fractional armor processing, and shotgun MultiDamage batches. Arms and protected hits no longer replace the current camera kick with an empty punch. Original flesh/headshot/helmet/Kevlar/death voices now play for humans and bots on one reusable channel per actor; falling uses that same voice channel. SDK Room authenticates client events and supplies no sender context, documented in CLAUDE.md.

The gate passed 209 tests, asset hashes, bundle and typecheck. Muted headless Bevy verified ten incoming cases, HUD health, armor exhaustion, 67-damage armored XM1014 blast, real USP body/head shots at visible bots, deaths and the next round. WebAudio metadata and source samples identify all five sound categories, with independent sample-window gain normalization for Bevy's output chunks. See `docs/CS16-HIT-RESPONSE.md` and `validate/game/hits/README.md`. Original animated character hitboxes, hit slowdown/knockback and exact blood/spark/punch rendering remain open.

### Desktop movement and flinch

Implemented source-based ground/air acceleration, friction, counter-strafing,
gravity, jump fatigue, a bounded stair lift and server-confirmed bullet velocity
flinch. Native physics rays preserve slope contact and support SDK platforms.
Muted headless Bevy checks cover keyboard movement, diagonal walking, platform
jumps, damaging/fatal falls, round reset, stairs and blocking collisions. Exact
GoldSrc hull/cadence parity, crouch and bot velocity response remain open. See
`docs/CS16-MOVEMENT.md` and `validate/game/movement-control`.

### Bot movement and gun-hit response

Bots now apply the shared CS movement class to route intent, including acceleration,
friction and small/large flinch from confirmed gun/knife hits. The server moves the
visible avatar through sampled Dust2 body clearance, rejoining routes after hits.
Route tests cover 20/30/60 Hz, walls, ramps and bomb destinations. Bot jump/crouch,
airborne physics, exact hulls and original tactics remain unfinished. See
`docs/CS16-BOT-MOVEMENT.md` and `validate/game/bot-movement`.

### Dual Elites hand attachments

Split the approved original held model by its left/right hand-bone ancestry. Each
104-triangle pistol now follows its own avatar hand, and both hide on weapon
switch/death. Bot held models read the equipped weapon component. Blender
round-trip checks cover every original triangle and the asset gate compares every
palette pixel. Headless Bevy exercises walking, AK/knife switches, a real AWP kill
and despawn cleanup. Original CS character grips and firing animations remain
open. See `validate/game/dual-hands/README.md`.

### C4 backpack toss and weapon drop pitch

C4 now shares original-style weapon-box motion with guns, using source body pitch,
400-unit/s throws, gravity, point-hull wall/floor clipping and grounded pickup
bounds. It remains unpickable in flight and retrievable during freeze; death
tosses continue through round results and reset on the next round. The former
one-second owner exclusion is removed. Back-mounted carrier models, crouched
origins and exact GoldSrc collision/cadence remain open. See
`docs/CS16-C4.md` and `validate/game/c4-toss/README.md`.

### Recoverable defuse kits

Dead CTs drop the original 80-triangle thighpack. Living CT humans/bots without a
kit can recover it for free and defuse in five seconds. Human and bot survivors
retain kits; unclaimed kits are removed on round reset. Original pickup audio,
localized notice and green status icon provide feedback. Exact GoldSrc item hulls,
body-mounted kit visuals and status-icon stacking remain open. See
`docs/CS16-DEFUSE-KITS.md` and `validate/game/defuse-kits/README.md`.

### First action after delayed cursor capture

The release gate now reads the stored pointer button state, so capture
that arrives after menu mouse-up does not require a spare click before firing
or using C4. Held clicks used to capture the world or close the buy menu remain
suppressed. The isolated delayed-capture fixture records the old failure and
checks first action, menu/world recapture, next round and pistol semi-auto. See
`validate/game/input-capture/README.md`.

### Empty-trigger reloads and controlled preview launches

Magazine-fed guns now wait for authenticated trigger release before automatically
reloading an empty magazine. M3 and XM1014 retain their empty-trigger reload path.
The isolated regression reproduces the old M4 behavior and checks M4/USP release,
full-magazine/reserve conservation and both shotguns' reload-and-fire path.
See `validate/game/empty-reload/README.md`.

Use `npm run start:server` for every automated fixture: it passes `--web`,
`--no-browser` and `--no-client`, then the harness connects one isolated muted
headless browser. Plain `--web` was opening unwanted default-browser tabs.
The hosted FOV limitation is now tracked in upstream issue #1268; support already
merged in #1231 but the official hosted preview still selects an older build.
The SDK maintainer confirmed that native avatar audio cannot be muted per scene.

### MVP bot economy

Bots now share player start money, prices, armor and round/kill income. Their
actual inventory survives or is lost with the round result; paid ammo replaces
free rifle refills. Pistol taps, gun models and firing sounds use the equipped
weapon. Seven focused tests bring the offline gate to 244 tests. Browser balance
and presentation await the creator's playtest. The buying policy and remaining
AI limits are documented in `docs/CS16-BOT-ECONOMY.md`. Arsenal-derived historical
fixtures explicitly retain fixed unarmored rifles and bypass bot purchases.

Bot inventory follow-up: exhausted primaries now switch to the carried pistol,
respecting original draw/reload durations and shared ammo. Death uses the same
weighted gun selection as humans, preserving the rifle drop after switching.
Six rule regressions bring the offline gate to 250 tests; runtime presentation
remains for the creator's playtest.

### MVP spectator flow

Free chase now hides the dead player's health/armor/ammo/money, retains the
round timer and labels the watched player's health in team color. Neutral
spectators cycle humans and bots together. Resume clicks are consumed by
cursor capture before another click can cycle targets. Five rule tests bring
the gate to 255 tests. One muted headless Bevy run passed the three-second
death handoff, HUD, Escape/Resume and forward/reverse target cycling without
spending ammunition; screenshots and reproduction are in
`validate/game/spectator-flow`. The owned browser and port 8011 server were closed.

### Original kill-feed sprites

The feed now uses all 24 gun icons, knife/explosive/skull sprites, server-confirmed
headshot markers and team-colored names. It retains four notices in chronological
order with independent six-second expiry. Human, bot and C4 kill messages include
team/headshot/suicide metadata. Five rule tests and a pixel-coverage asset check
bring the gate to 260 tests. One muted headless run verified a production lethal
headshot plus explicitly staged notices covering all three sprite sheets, queue
order and expiry; evidence is in `validate/game/kill-feed`. The owned browser and
port 8011 server were closed.

### Reload and Scout draw parity

The pinned weapon source audit found that Scout deployed in 0.75 s instead of
1.25 s, and generic reload resets discarded player punch, last-fire timing,
lateral recoil direction and SG550's retained accuracy. Reload now applies only
the original per-weapon changes on the server, in client prediction/reconciliation
and for bots. See [source references and regression steps](docs/CS16-WEAPON-RELOAD.md).

### Held reload input

Desktop F and custom touch RELOAD now wait for weapon readiness while held,
with bounded retries and cancellation on release. Requests identify their weapon
revision and round; the server rejects stale requests, objective use and invalid
match states. Production client/server handler tests reproduce the previous lost
hold and unsafe delayed-request cases. Native multitouch verification remains
pending; see [reload verification](docs/CS16-WEAPON-RELOAD.md).


### Native action input reliability

The real pinned SDK reproduces lost button presses/releases when a newer UI
pointer result is processed before native root input. Mobile combat now samples
root action events before gameplay, preserving held state and one-frame edges
without changing the SDK pin. Fire, reload/stab, plant/defuse, walking and spectator
cycling use the adapter. Six regressions cover SDK events and production client
shots/reloads; five fail before the fix. Native device multitouch and mobile scope
FOV remain open. See [touch input verification](docs/CS16-TOUCH-CONTROLS.md).


### Native Bevy scope rendering

Hosted Bevy `0.1.0-35345436542.commit-593f384` now applies VirtualCamera FOV.
The 2026-09-21 headless check produced distinct magnification at 90/40/10 from an
unchanged transform, spent one round and restored scope after the AWP bolt cycle.
The scene uses its existing native camera and removes the obsolete TextureCamera
adapter/render target. Scope, drop and capture validation now inspect native FOV.
Mobile FOV support and native multitouch remain open; Godot main does not expose
a usable native-camera zoom path. See [native scope evidence](validate/game/native-scope/README.md).


### Buy-menu ammunition parity

PRIMARY/SECONDARY AMMO now buy all affordable packs up to the reserve cap,
matching CS 1.6 menu commands. The server retains purchase replay/round/zone
validation, updates shared caliber reserves and leaves magazines unchanged.
Both menus quote the total affordable fill. Per-pack bot purchases remain
available. Five regressions cover all 24 guns, limited funds, final partial
packs, shared reserves, rejected purchases and the actual touch menu quotes.

The full gate passed 336 tests plus assets/build/typecheck. Headless Bevy verified
M4 and USP reserve fills, exact charges, unchanged magazines and full-reserve
taps: [purchase evidence](validate/game/ammo-menu/README.md).


### Mobile menu feedback and alternate-mode labels

Touch buy/team menus reserve a footer for notices, keeping feedback clear of the
scrolling buttons and preserving row positions while messages appear or expire.
Purchase hints name the on-screen slots. FAMAS burst mode now offers AUTO;
Glock retains SEMI. Production UI regressions cover both modes, footer separation,
safe bounds, disabled rows and stable button geometry.

The full gate passed 337 tests plus assets/build/typecheck. Headless Bevy verified
notice placement, FAMAS BURST/AUTO switching, purchases and three canvas sizes.
[Evidence](validate/game/touch-feedback/README.md).


Mobile controls now use original icon artwork, independent left/right FIRE holds,
and a persistent walk/run toggle. Direct UI press/release drives combat when native
UiInputBinding events are missing. The regression fails before the change (zero
shots) and passes afterward. An isolated Bevy fixture with native bindings disabled
confirmed M4 ammunition 30 → 22, stop on release, and walk/run 2.99 → 5.75 m/s.
Native Godot multitouch still needs device verification.


Nightvision now has server-owned $1250 purchases, guarded toggles, survivor/death
ownership and round reset behavior. The local view combines the reference tint
and a player-following light, with original equip/toggle sounds and a separate
mobile goggles icon. The desktop armor info panel now quotes the actual upgrade.
See [nightvision](docs/CS16-NIGHTVISION.md); native mobile lighting remains open.
Brightness adjustment was added in the later controls pass below.

The 357-test gate passed with assets/build/typecheck. Isolated headless Bevy
verified nightvision purchase ($16000 → $14750), rejected repeat purchase, one
local light on toggle and removal on toggle off. [Capture and reproduction](validate/game/nightvision/README.md).

Result phases now preserve combat, movement, reloads, equipment selection, drops
and pickups until the next freeze. Bots continue their normal movement/combat
without starting new bomb objectives. One-shot round scoring and match-end
blocking remain in place. The new regressions cover server hits and queued shots,
all 24 client firearms, knife actions, grenade release, touch controls and
movement; three focused cases failed on the previous implementation.


### Mobile purchase selection

Scrollable purchase rows now select an item; a fixed cart beside its name and
price executes the purchase. This prevents touch-down from spending money before
a scroll begins. Updated funds/ownership disable the cart, and menu/category
changes clear selection. Desktop one-click buying is unchanged. Four new
regressions cover selection, guards, reset and safe-area layout.

The isolated headless Bevy check confirmed row selection without spending, Scout
purchase for $2750, duplicate blocking and selection reset. FIRE used six M4
rounds and stopped on release with native bindings disabled; walk/run remained
a persistent toggle. [Evidence](validate/game/mobile-buy-selection/README.md).
Native Godot touchscreen verification remains open.

Validation: 380 tests, asset integrity, build and typecheck passed. All owned
preview processes were closed.


### Nightvision brightness controls

Plus/minus icons now adjust the local overlay alpha in the pinned client reference's
20-unit steps, from default 110 with limits 30–220. The light radius is unchanged.
The preference survives toggles and respawns; menus and inactive goggles block
adjustments. Both desktop and mobile controls share the same callbacks, and
phone safe-area checks include the active controls. Native mobile rendering is
still unverified. See [nightvision](docs/CS16-NIGHTVISION.md).

Headless Bevy verified actual plus/minus clicks (110 → 130 → 110), purchase
checks and light cleanup in landscape and portrait.
[Evidence](validate/game/nightvision-brightness/README.md).

Validation: 382 tests, asset integrity, build and typecheck passed. The owned
headless browser and fixture server were closed; ports 8034 and 9347 are clear.


### Restore human latency measurements

Removed a client-only sender-context check that discarded all latency probes.
SDK Room already authenticates these messages and invokes clients with payload
only. The production handler now echoes through the normal server route after
synchronization. The new regression uses installed SDK Room and binary event
serialization with production client/server handlers: a measured 400 ms RTT
rewinds a moving human 1.8 m and confirms the headshot. Peer-origin probes remain
blocked. Both cases fail before the fix. Earlier server-only tests supplied the
echo directly and missed this integration failure. Firing-cadence measurement
and real moving-human browser tuning remain open.

A fresh isolated headless preview measured 296–297 ms RTT and a 248 ms rewind
window over real transport. FIRE consumed seven rounds and stopped on release.
[Evidence](validate/game/latency-echo/README.md).

Validation: 384 tests, asset integrity, build and typecheck passed. Owned preview
processes were closed. Real two-player movement tuning remains unverified.


## Short mobile-fire cadence trace and rejection diagnostics

The isolated 2026-09-22 headless Bevy trace accepted IDs 1–8, consumed eight
M4A1 rounds, and stopped on release with native UI bindings disabled. The
production-server regression replays the recorded arrivals and preserves the
87.5 ms scheduled interval. The earlier missing ID did not recur; no cadence
or tolerance rules were changed. Previously silent rejection paths now log
specific guard names. See `validate/game/cadence-trace/README.md` for measurements
and limits. Native-phone input, full-magazine timing and larger packet bursts
still need validation.


## Touch holds across equipment changes

Switching between guns, knife, grenades and C4 now cancels holds attached to
replaced controls. Previously an old FIRE/RELOAD callback hold survived element
removal and could drive the newly equipped weapon; releasing the replacement
button addressed a different label. The client context now includes the control
type. Gun-to-gun switches retain the existing gesture, while late bound releases
and fresh presses still work. Three regressions failed before the fix; tests run
the real touch context collector before the shooting handler. Native-phone
multitouch remains unverified.


## Zoomed AUG / SG552 model visibility

The source review found that the original client hides viewmodels only at FOV
40 or below; this scene hid all zoomed weapons. AUG and SG552 now retain their
models at 55 degrees. Production-SDK component tests cover those rifles and all
sniper zoom states, firing animation, cached-weapon visibility and death. A short
muted headless touch-UI check purchased/zoomed/fired the AUG, then scoped/unzoomed
the AWP. This verifies visibility and action routing, not native-camera mobile
magnification. See `validate/game/rifle-zoom/README.md`. Shield export remains
pending the Blender connection/path decision; its glass rendering and posed
cover are not yet resolved.


## Repeat-buy flow

Added server-owned rebuy snapshots, captured by buy commands and retained through
deaths and rounds. REBUY follows the original rebuy.txt priority, allows partial
purchases without replacing the saved plan, retains a carried primary weapon, and
uses normal money/team/zone/time checks. Mobile selection requires the fixed cart;
desktop has a dedicated REBUY button. Installed-SDK ECS/Room tests cover round
restoration, partial budgets, ammo and armor semantics, authentication and duplicate
requests. Source references and current validation are in docs/CS16-REBUY.md.
Auto-buy is tracked below; the tactical shield remains unfinished.

Validation: 402 tests, asset integrity and build/typecheck passed. The isolated
headless touch check consumed seven rounds, reloaded to 30/83, and rebought reserve
to 90 for $60; row selection and repeating the purchase cost nothing. Landscape
and portrait screenshots were reviewed. Native-phone input remains unverified.
Owned preview processes were closed. See validate/game/rebuy/README.md.


## Default auto-buy

Added the original default primary priorities followed by ammunition, CT defusal
kit and armor with a vest fallback. An attempted gun already carried ends the
primary list; earlier choices can replace a carried primary. The resulting
loadout becomes the rebuy snapshot. Mobile AUTO BUY/REBUY rows appear first and
use the existing select/cart flow; desktop buttons use MainBuyMenu.res positions.
Tests exercise production economy and SDK ECS/Room paths for both teams and
money thresholds. See docs/CS16-REBUY.md and validate/game/autobuy/README.md.

Validation: 410 tests, assets, build/typecheck passed. Headless CT auto-buy cost
$4655; row selection and repeating the completed purchase cost nothing. Portrait
visual review caught a test clicking the selected-item caption; the selector and
state assertion were corrected and the portrait step passed in the same browser.
Native phone input remains unverified. Owned preview processes were closed.


## Grenade taps between server updates

Fixed a dropped grenade gesture when press and release are delivered before the
next server update. A valid, ready press now records the pin immediately; the
existing system retains release, minimum 0.5-second timing, ammo deduction and
retirement. Existing client-only tests stopped at outgoing messages. The new
regression follows SDK UI callbacks through the production client and SDK Room
into the production server, and requires a synced projectile for HE, flash and
smoke. Draw readiness, no cooking, repeat/replay input and cancellation are covered.
No browser or native client is needed for this deterministic packet-batch repro.

Validation: 415 tests, asset integrity, build and typecheck passed. Three of the
five new cases failed before the fix. The integration case covers all three
grenades through authoritative entity creation and the syncEntity call. It uses
SDK Room serialization locally; it does not exercise live CRDT transport or a
native phone. No preview/client was launched. See validate/game/grenade-taps/README.md.


## Shield collision preparation

Separated player collision decoding from the Blender process and retained an
explicit shield export option. Prepared original left-hand hitbox/pose fixtures
for both source player models: 16 shield animations, six gaits and 52 independent
source-corner samples each. Scene collision composition now exposes numeric
source groups while ordinary body tracing continues to exclude group 8.

Six runtime regressions cover source provenance, corner transforms, raised/lowered
partial cover, rear/foot exposure, oriented edges and historical poses. Existing
player collision matched exactly in 2,304 before/after samples. The fixtures
remain outside the scene bundle; ownership, live rewind state, visible models
and purchasable shields are still outstanding. No browser or Blender process
was launched. See docs/CS16-SHIELD.md.

Validation: 421 tests, asset integrity and SDK build/typecheck passed, plus three
offline collision-source tests and the five existing shield-source checks.


## Independent weapon action deadlines

Fixed extra waits after firing immediately following zoom, changing into a slower
fire mode, and finishing Glock/FAMAS bursts. The server captures the primary
deadline and updates the secondary deadline on the first shot; continuation
bullets do not postpone either. Desktop/touch prediction retains the preceding
primary shot's interval, and reload/bolt handling reads the captured deadline.

Six new regressions failed before the fix; all seven now pass. The full gate
passed 428 tests, asset checks and SDK build/typecheck. No browser/native client
was opened. See docs/CS16-WEAPON-ACTIONS.md and validate/game/weapon-action-deadlines.
Blender MCP was rechecked and remains disconnected. A subsequent source audit
resolved the apparent reserve-ammo discrepancy: the original continuation only
decrements cached counters, not the actual reserve inventory. The corrected
explanation is in docs/CS16-BURST-FIRE.md; burst ammunition is unchanged.


## Empty trigger feedback and timing

Empty attempts now obey combat input gates, play the original pistol/rifle click
locally, and reach the server without predicting a live shot. The server applies
the separate empty-fire primary deadline and broadcasts positional feedback to
other players. Magazine-fed guns use 0.2 seconds; shotguns use one second, click
once per hold and can begin shell reloads. Empty AWP/Scout attempts retain the
source unscope/rescope behavior without postponing the alternate deadline.

Eight regression cases failed before the change. The full gate now passes 436
tests, asset integrity and SDK build/typecheck. Tests include desktop/touch input
and the SDK Room message path, with controlled ECS/transport adapters. Native
mobile FIRE and rendered empty-scope timing remain unverified; no browser or
native client was launched. See docs/CS16-EMPTY-TRIGGER.md and
validate/game/empty-trigger/README.md.


## Full shot observations for human rewind

Client target observations now use the same pellet and penetration traces as the
server. Previously only the first pellet's unpenetrated ray could name a target.
A fixed source seed reproduces M3/XM1014 later-pellet hits missed by that claim
path; with a valid 30 cm smoothing offset, the server previously left the target
at 100 health. Production client/server messages through SDK Room now supply the
observation and resolve the kill, consume one shell and reject a duplicate.

Four of five regressions fail against the pre-change client. They also cover
actual Dust2 middle-door penetration, clear-sight targets for all 24 guns and
shotgun range in an empty-world adapter. The full gate passes 441 tests, assets
and SDK build/typecheck. A 612-case comparison preserves previous server results.
No browser or native client was launched. Device input and live human smoothing
remain playtest requirements. The subsequent surface-feedback pass below replaces
the first-impact marker with decals for all contacts.
See validate/game/pellet-claims/README.md.

## Original bullet surface feedback

Replaced temporary endpoint spheres with the five original bullet-hole textures
and eight original ricochet WAVs. Complete traces now carry surface normals,
materials and textures through the authoritative events, for all shotgun pellets,
penetration contacts and bot shots. Predicted decals appear immediately; replies
correct them without replaying sounds. Rejected/unacknowledged predictions clear,
and round resets plus a 256-entity pool bound their lifetime and resource use.

See [implementation and limits](docs/CS16-BULLET-IMPACTS.md) and
[reproduction](validate/game/bullet-impacts/README.md). BSP edge clipping, exit
decals, special glass variants, wall dust/sparks and original actor blood remain
presentation gaps. Native mobile still needs a device check.

## Remote gunfire preserves the weapon that fired

Authoritative shot events now carry their gun, mode and firing position. Remote
M4A1/USP silencers previously played the loud clip; queued shots also used whatever
weapon/avatar state happened to be available on receipt. The receiver now uses
the firing snapshot, with legacy fallbacks when it is absent. Bot events share
the snapshot structure; bots currently fire mode 0. Own acknowledgements retain
recoil correction without a second gun sound.

Six regression cases failed before the change. The production server/client and
installed SDK Room now pass silenced/unsilenced, delayed weapon/position state,
all 24 firearm identities, absent remote avatars, bot modes and message guards.
An optional map preserves explicit mode 0 despite the SDK's falsy-scalar omission.
See [reproduction and source references](validate/game/remote-shot-sound/README.md).


## Knife contact feedback

Knife viewmodels choose stab-hit or stab-miss from the local trace, and slashes
alternate from midslash1 after each deployment without stabs advancing the order.
Client/server cooldowns share the same contact-dependent intervals. Seven original
WAVs complete deploy, slash, stab, flesh and wall cues; audio carries source pitch.
Wall/miss cues are predicted; flesh cues require authoritative contact. Observers
hear accepted attacks from their firing position. Old-round requests are rejected,
and local replies cannot replay animations or affect expired/replaced weapons.

Seven regressions fail before the change; the eight new cases cover SDK Animator,
AudioSource, Room transport and production client/server behavior. The focused
suite also covers mobile FIRE and release. The following pass adds knife lag compensation. Full GoldSrc hull tracing,
material strike layering and a first-slash damage audit remain open.
See [implementation and limits](docs/CS16-KNIFE-FEEDBACK.md) and
[reproduction](validate/game/knife-feedback/README.md).


## Knife rewind and movement-origin validation

Knife attacks now send the displayed target observation, origin, speed and bot
clock through SDK Room. Humans reuse the existing measured-RTT history and bounded
observation validator; bots use the existing animation-aware view snapshot.
Backstabs use the contact snapshot's facing. Origin claims use the gun path's
existing sampled-movement allowance, without extending it. Current eligibility,
per-life history, range/wall checks, cooldowns and duplicate protection remain.

Seven of nine new regressions fail before the change. Production client/server
checks cover desktop/touch intents through SDK Room, a 1.8-metre moving-human
rewind, historical backstabs, a 1.7-metre leading origin, bounded observations,
wall occlusion, respawns and friendly blockers. The bot adapter checks bounded
view-time routing and historical facing; it does not prove rendered bot poses.
See [reproduction and limits](validate/game/knife-rewind/README.md).
Real two-client knife latency, native mobile multitouch and full hull/source-damage
parity remain open. No native client or browser was launched for this change.


## Buy-menu cursor after spawn and resync

The shared desktop cursor system now checks both team and buy menus, and releases
PointerLock on the camera entity as well as the temporary request entity. A spawn
or resync could previously capture the cursor while BUY remained visible; the
team-menu release also lacked the camera write Unity requires. Three regression
cases fail before the change. The suite also preserves close-click suppression,
normal spawn capture, Escape release and touch behavior.
[Reproduction](validate/game/buy-capture/README.md).

The isolated headless Bevy check passed a real resync while BUY stayed open and
unlocked, followed by a successful $3100 M4A1 purchase. The first attempt stopped
at guest onboarding; the checker now handles it automatically. Both owned
process trees were closed. The capture exposes a separate desktop purchase-notice
overlap with the money panel, resolved by the follow-up below. Native phone and Unity rendering were
not exercised.


## Desktop menu confirmations

Purchase and team notices now use the shared menu header, below its title and
above buttons and item information. The floating HUD notice is hidden while a
menu is open and returns when it closes, retaining the five-second expiry. Mobile
keeps its footer. Both new desktop layout regressions fail before the change;
20 focused checks and the 478-test full gate pass.

One isolated muted headless Bevy run verified a real purchase after resync, one
notice on both buy pages, normal HUD restoration and expiry. Its browser and
server were closed. Native phone/Unity and a rendered team notice remain untested.
[Evidence and reproduction](validate/game/menu-notices/README.md).


## Audited knife damage and actor contact

Pinned source and static inspection of the approved original cs.so show the new
primary deadline is assigned before slash damage is selected. Ordinary first,
held and released/paused slashes use 15 base damage. The scene's previous 20-after-
pause rule was incorrect. Direct hit-group multipliers remain; fallback contacts
now use the standing axis-aligned player box and generic body damage, preventing
expanded head regions from turning a near miss into a lethal headshot.

Five of seven new tests fail before the change. All 28 focused checks and the
485-test full gate pass after it; one existing stomach-damage expectation needed
updating from 25 to 18.75. Real production client/server handlers and SDK Room
cover desktop/touch stabs, armor, duplicates, cooldowns and scored kills. The
legacy browser check has updated damage/model expectations but was not rerun.
No native client or browser was launched. Original world hull/intersection tracing,
crouch and long-stall timing remain open. [Audit and reproduction](validate/game/knife-contact/README.md).


## Knife contact with world edges

Knife traces now try the point line first, then the original Dust2 head hull and
standing actor boxes. A world-hull contact runs the source center/corner ray
refinement against actual surfaces. This catches nearby edges and uses wall-hit
feedback and contact cooldowns where the old thin ray reported a miss.

Five of the six initial regression cases fail before the change. The focused
suite now passes 35 checks, including 24 independently sampled original-BSP
segments; the full gate passes 492 tests, asset integrity, build and typecheck.
The generated hull is 80,156 bytes and has pinned source/exporter hashes.
No browser or native client was launched. Static brush state, mixed map/weapon
scale and numerical differences from GoldSrc remain limits. Mobile FIRE still
needs a device trace; the read-only Godot/SDK input audit found no additional
confirmed scene defect. [Evidence and reproduction](validate/game/knife-world/README.md).


## Dual Elites firing hands and source animations

Elite shots now alternate from the stored source hand and begin 0.125 m left/right
of the eye, including yaw recoil. Reload preserves the hand; even-clip deployment
selects left and odd-clip deployment keeps the stored hand. Client claims continue
to identify the eye, so the server applies the offset once. Human/server/bot paths
share the mode state, and bot inventory stores it for drops and subsequent draws.

Prediction reconciles either message/component arrival order and rejected shots.
The source time-since-shot thresholds select firing animation variants instead
of randomness or magazine parity. Only an empty magazine selects the last-shot
clip; one remaining round uses the original left-empty idle pose.

Six initial regressions fail before the fix. Eleven new cases and 49 focused
checks pass, covering production client/server handlers, real SDK Room and actual
SDK camera/Animator components. The 503-test full gate, assets, build and typecheck
pass. No browser/native client was launched; native FIRE and rendered comparison
remain playtest requirements. [Source and evidence](validate/game/elite-hands/README.md).


## Nearby magazine reloads

The server now sends the original generic reload cue to nearby connected human
listeners after accepted manual, automatic and bot magazine reloads. The reloader
keeps its viewmodel-timed sounds. Distance is three-dimensional, capped at 512
source units (12.8 m at the current weapon scale), with byte-quantized volume.
Bots supply their authoritative position because they have no avatar identity.
M3/XM1014 use a separate shell reload path; their remote shell audio remains open.

Eight new tests cover all 22 magazine-fed guns, denied/duplicate actions,
automatic and bot reloads, private SDK Room delivery and actual AudioSource
components. Five of the initial six tests fail before the change; the final
focused set passes 39 tests, mobile input regressions pass 26, and the full gate
passes 511 plus assets/build/typecheck. No browser or native client was launched.
Native FIRE verification remains pending. [Details](docs/CS16-RELOAD-AUDIO.md).


## Accuracy history follows the weapon

Weapon draws now apply the 24 firearms' source-specific reset assignments while
retaining each item's last-fire clock and recoil direction. SG550 retains its
accuracy; MP5, MAC-10 and UMP45 keep their shot counter. The state follows inventory,
bot loadouts and dropped guns. New purchases start fresh, and camera punch does
not transfer to a new owner. Client prediction starts from a fixed authoritative
draw snapshot and replays it across late acknowledgments/rejections.

The original-compatibility SG550 starts at zero accuracy, making its first two
scoped standing shots use 0.05 spread. The prior 0.9 initialization used the
ReGameDLL fixes branch. Pinned source, zeroed private allocation and static
original-server inspection support the correction; no original CS client ran.

Ten new regressions fail against the previous source. All 55 focused tests and
the full 521-test gate pass, including assets/build/typecheck. The component
schema changed, so refresh server and clients together. Native FIRE, original
client feel and the broader parity acceptance remain open. Item attack-timer
persistence is covered by the following step. [Details](docs/CS16-WEAPON-STATE.md).


### Attack timers across selection — 2026-09-22

Each gun and the knife now retain primary/secondary deadlines across selection.
This prevents shortening M4A1/USP silencer changes or contact knife stabs by
switching away and back. Gun drops/pickups carry those deadlines, including bot
drops; AWP and Scout keep their explicit draw resets. Magazine reloads can still
be cancelled by holstering, and new items/lives start without an old lock.

Client firing uses a fixed draw snapshot so delayed ongoing server shot updates
cannot lengthen automatic cadence. Required doubles inside optional maps preserve
zero and fractional epoch deadlines through SDK serialization. Shotgun reload
start now records both source attack clocks as well as the player lock.

Nine of eleven new regressions fail before the change. All 24 focused tests and
the full 532-test gate pass, including assets/build/typecheck. Refresh server and
clients together after the schema update. No browser or preview server started;
native phone FIRE and live original-client parity remain unverified.
[Details and limits](docs/CS16-SWITCH-TIMERS.md).


### XM1014 shell audio — 2026-09-22

Each XM1014 shell insertion now emits the original server-chosen loading variant
and pitch for its owner and other listeners. Both human and bot reload paths
emit once per active insertion; holstering/death cancel future sounds. Per-owner
channels replace the previous variant, preserving the original item-channel
behavior instead of overlapping the long sample. M3 retains its model event.
Two pinned original WAVs and hashes were added. Five of seven new regressions
fail before the correction; all 22 focused tests and the full 539-test gate pass,
including asset integrity/build/typecheck. No new browser or native client was
launched. Native phone FIRE remains unverified: the existing debug hub is live
but had no device connection during this check. The reporting build and URL are
still needed. [Audio source and evidence](docs/CS16-RELOAD-AUDIO.md).
