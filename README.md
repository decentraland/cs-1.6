# Counter-Strike 1.6 in Decentraland

An SDK7 scene on Dust2, using Decentraland's authoritative server and stock Bevy
Explorer. The target is faithful CS 1.6 gameplay and an exact recreation of its UI.
See [the implementation plan](IMPLEMENTATION_PLAN.md) for the remaining work.

The current [MVP playtest](docs/MVP-PLAYTEST.md) focuses on menus, buying, damage
feedback and death/spectating. Escape reopens team navigation while spectating;
RESUME SPECTATING returns to the chase camera. Purchases confirm what was bought
and how to equip it. Server-confirmed hits produce blood or armor impacts,
incoming-hit indicators scale with the viewport, and up to four kills remain
visible in the feed. These new presentation changes await creator playtesting.

For patterns other creators can reuse, see [SDK7 action-game recipes](docs/CREATOR-RECIPES.md)
and the [recipe template](docs/CREATOR-RECIPE-TEMPLATE.md). They link implementations
to evidence, separate historical captures from current verification, and outline
focused contributions to Decentraland SDK Skills.

## Current playable prototype

Choose **Terrorists** or **Counter-Terrorists** on the team menu to spawn at that
side's original Dust2 spawns. The three-second freeze starts immediately: any
playing side with no connected human is filled with three bots (Guerilla,
Phoenix, Arctic). Eliminate the other side, or plant/defuse the C4, before the
two-minute round expires. Bots navigate around map obstacles, search the last
seen player position, and patrol Dust2 after losing contact. They attack when
map geometry does not block their view; Terrorist bots carry and plant the C4,
Counter-Terrorist bots pursue a planted bomb and defuse it. **BOT SKILL** on the
team menu picks EASY, NORMAL (default), HARD or EXPERT for the whole match, like
the `bot_difficulty` cvar: the levels follow the CS 1.6 BotProfile.db templates
(reaction 1.0/0.6/0.4/0.35 s, attack delay 3.0/1.0/0/0 s, skill 0/50/75/90 that
scales a per-shot aim error). Each bot is a
synchronized `AvatarShape` NPC, so its visible body and walking animation follow
the authoritative navigation transform. Each result awards one team point, shows
the win message for five seconds, then automatically starts the next round.
First to sixteen wins ends the match, opens the scoreboard, and offers **PLAY
AGAIN** on the team menu. Teams stay on their chosen sides throughout the match;
there is no automatic halftime side switch or money reset. Each round restores health, bots, and the timer; surviving players keep their equipment, while dead players receive their starting loadout; player and bot kills/deaths persist across rounds. Bot kills appear in
the kill feed and bot rows appear inside their team on the scoreboard. The
scoreboard sorts each team by kills descending, then deaths ascending. Time
expiry awards the CT side a point, matching the unplanted-bomb timeout rule.
There is no separate solo or practice mode; evidence below that mentions the
solo encounter or **Start game** predates this unified match model.

The server owns enemy health, damage, round state, ammo, reloads, and shot cadence.
Bot navigation and line of sight use a triangle query exported from the existing Dust2
model into the same coordinates used by Bevy. Player and bot bullets use the original Dust2 point hull for surfaces and penetration. Player shots at bots and human target proxies share server-owned ray
intersection, wall occlusion, weapon-specific recoil/spread, and range damage. Clients send aim and a shot sequence only; they cannot choose the hit
verdict; it validates the reported context and re-traces. Each shooter has
independent recoil state. Head, chest, stomach, arms and legs use separate damage/armor rules; shotgun pellets combine before health truncation. The standing avatar regions remain approximate. See [hit response and original voices](docs/CS16-HIT-RESPONSE.md). A human joining a bot-filled
side replaces those bots at the next round start; the match resets to a fresh
lobby when every human leaves. A lone human who dies spectates the bots.
Teams spawn at the original Dust2 locations, share elimination/timeout rounds,
and respawn together after the five-second result. Each team currently has five
seats; testing covers two combatants and a third joining client, not 5v5 capacity.
Late joiners wait until the next round. A player missing heartbeats for 20 seconds
is removed from the active round; rejoining cannot grant a mid-round life.
Kills/deaths persist by address until a new match. A live disconnect counts as a
death. Friendly fire is off. Penetrating bullets can continue through players and surfaces with reduced damage. CTs respawn with a USP (12/24) and Terrorists with a Glock-18 (20/40); both sides always have a knife.
The buy menu contains all 24 original firearms, with team restrictions and original prices. Purchases include a full magazine; spare ammunition is bought separately and shared by caliber.
Empty rifles and pistols wait for fire release before automatic reloading; M3 and
XM1014 can reload and fire inserted shells while fire stays held.
[Reload rules and browser proof](validate/game/empty-reload/README.md).
Glock burst mode repeats while fire is held; semi-auto mode fires once per press.
Glock follow-up bullets advance on scene updates, while FAMAS retains its timed
follow-ups. [Burst rules and browser proof](docs/CS16-BURST-FIRE.md).
Survivors retain ammunition, armor, helmets, and defuse kits. **Shift+2** drops the
active gun with its remaining magazine; reserve ammo stays with you. Buying a
replacement drops the old gun. Purchases and pickups use the original weapon
priorities for automatic selection; buying a pistol while holding a rifle keeps
the rifle selected. Walk over a ground gun with an empty matching slot
to pick it up, including enemy-team weapons. Death drops the best firearm with
its reserve ammo; new rounds clear ground weapons. See the [pickup checks](validate/game/pickups/README.md).

HE ($300, one), flashbangs ($200 each, two) and smoke ($300, one) are available in Equipment. **Shift+3** cycles grenades; hold fire to pull the pin and release to throw. Pins do not cook. HE damage, flash facing/visibility, smoke sight blocking and round cleanup are authoritative. See [grenade rules, models and limits](docs/CS16-GRENADES.md).

All 24 firearms, the knife and the three grenade types use the approved CS 1.6 first-person model pack, with
hands, source animations and original weapon sounds. Other players hold the matching
original third-person guns. Dual Elites attach one original pistol to each hand;
[the model review](validate/game/dual-hands/README.md) covers switching, movement,
death and cleanup. See [arsenal behavior and validation](docs/CS16-ARSENAL.md),
[door penetration and pointer capture checks](validate/game/penetration/README.md)
and [model/audio provenance](asset-sources/cs16-weapons/SOURCE.md). Practice bots use the original Arctic/Urban bodies and death animations; human avatars
remain Decentraland placeholders. See [bot bodies and animated hitboxes](docs/CS16-PLAYER-MODELS.md). The HUD has an initial
amber layout and green crosshair, but is **not yet an exact CS 1.6 match**. Original
HUD digits/icons, the source-defined team menu, and a buy menu in the same VGUI
style (category list, per-category submenus, item info panel) are implemented. The scoreboard now uses the classic layout and Verdana glyphs; pixel-level comparison is still open. Hold **Shift+1** for the scoreboard; the installed SDK does not
expose Tab, which Bevy reserves for its map.
Money and equipment purchases are authoritative in shared rounds.
Original surface-dependent footsteps and jump/landing sounds are implemented;
see [movement audio and the Bevy Avatar-volume setting](docs/CS16-MOVEMENT-AUDIO.md).
Desktop Bevy now uses [CS movement rules](docs/CS16-MOVEMENT.md): acceleration,
friction, counter-strafing, gravity, jump fatigue, air control and bullet flinch.
Native collision still resolves ramps, walls and bounded stair climbing. This is
not complete GoldSrc physics parity. Remaining spectator modes, advanced bot
tactics, crouching, character animations and exact native input bindings remain pending.

## Run locally

Use Node.js 22.18+ (tested with Node 24). The SDK and runtime are pinned to the
verified authoritative build; a caret range can select a build without these APIs.
The start scripts also pin Bevy headless server `0.1.0-34588802161.commit-3926f33`.
An older cached server can receive shots without receiving avatar positions, making
ammo appear unlimited and bots unhittable. Stop and restart your preview after
updating these scripts, then reload its browser scene. `DCL_SERVER_PACKAGE` remains
available as an explicit override for engine development.
[Reproduction and real-input proof](validate/game/combat-recovery/README.md).
Then:

```sh
npm install
npm start -- --web --port 8000
```

Open a stock Bevy web client with:

```text
https://decentraland.org/bevy-web/?preview=true&realm=http%3A%2F%2F127.0.0.1%3A8000&position=5%2C8&guest=1
```

For automation or an already-open client, use `npm run start:server -- --port 8000`.
This suppresses browser tabs and native-client launches; connect an isolated muted
headless browser separately. Automation must use this command and close its owned
server/browser afterward.

`guest=1` enters as a guest. Allow loopback access when Chromium asks to reach the local preview.
Pick a side on the team menu. Spawning requests mouse capture automatically;
once captured with the mouse released, your first shot or use key works without
an extra click. If the cursor is free, clicking the scene captures it and that
capture click is consumed until release. [Input regression](validate/game/input-capture/README.md). Button
hover follows the pointer position each frame; while the menu is open, **1**
joins Terrorists and **2** joins Counter-Terrorists. AUTO ASSIGN and SPECTATE
are click-only because the explorer exposes no 5/6 input actions.

| Key            | Action                                                      |
| -------------- | ----------------------------------------------------------- |
| WASD, Space    | Move, jump                                                  |
| Shift (hold)   | Walk                                                        |
| Left mouse     | Fire, knife swing, hold/release grenade, hold to plant C4                |
| 1 / 2 / 3      | Primary / pistol / knife                                    |
| 4              | C4 (carrier only)                                           |
| Shift+2        | Drop active gun (or selected C4)                            |
| Shift+3        | Cycle Flash / HE / Smoke                                    |
| Shift+4        | Drop C4                                                     |
| Shift+1 (hold) | Scoreboard                                                  |
| E              | Zoom / silencer / burst mode; hold near C4 to defuse        |
| F              | Reload with a gun, stab with the knife                      |
| Esc            | Release the cursor (the engine handles it); click **BUY** to open the buy menu |
| 1-4 (buy menu) | Pick the matching row; 0/5-8 rows are click-only            |

These are the input actions the explorer exposes to scenes; Tab, B, G, 5 and 6
are not available, so the scoreboard, buy menu, C4 drop and menu shortcuts use
substitutes.

**Sounds.** Gunshots, silencers, model-timed reload/draw events, knife swing/hit and dry fire use the original CS sound files, recorded in the [source manifest](asset-sources/cs16-weapons/SOURCE.md). Your own weapon plays on the camera; other players' and
bots' shots play positionally at the shooter. Hit and death voices now use the original flesh, headshot, Kevlar, helmet and death files. Each actor has one voice emitter, so a new hit or death replaces its preceding voice. [C4 audio](docs/CS16-C4.md) also uses the original cues.

**Reconnection.** Transient `room.send` messages (round spawns, shot results)
are lost while a client is suspended, and the SDK only re-requests the full CRDT
state when the explorer toggles `RealmInfo.isConnectedSceneRoom`, so a client
that was in the background can come back frozen on the last state it saw. The
client watches `Practice.timeLeft` (it ticks every second outside the lobby);
after 8 s without change, or after a frame gap over 5 s, it sends `resync` and
shows "Reconnecting to the match...". The server answers by touching every
synced component (which re-sends them) and, if the client missed a round start,
re-sending that player's spawn. A seat dropped by the 20 s heartbeat timeout is
restored automatically on the next heartbeat: the server remembers the team each
player last chose (until they leave the team on purpose) and re-admits them, so
coming back never lands on the team menu. Scene-side workaround for
[decentraland/sdk#1198](https://github.com/decentraland/sdk/issues/1198).

**Mobile (Godot explorer).** Desktop scope magnification uses Bevy-specific camera components and has not been implemented on mobile.

The explorer reports `platform: 'mobile'` and never
locks the pointer, so the scene switches to touch mode (`src/platform.ts`): the
live view is the engine's first-person camera driven by the touch look-drag, aim
is read from the camera transform, and recoil only tilts the viewmodel. The
native gamepad's big central button fires (`TouchScreenControls.setMainAction`
`IA_POINTER`), E/F/1-4 keep their desktop roles through the on-screen buttons,
and the HUD shows tappable **BUY** (in the buy zone) and **SCORES** buttons since
there is no Esc or Shift. The explorer crosshair is hidden in favour of the
scene's own. The scene never sets a `VirtualCamera` on touch, so there is no
death fall or chase cam on mobile: the Godot camera controller only re-enables
touch look after an uninterrupted transition back from a scene camera, and a
respawn could leave the camera frozen. Avatar passport popups are disabled throughout the 12×12-parcel
game area, so clicking another player does not open their profile while
shooting. Only one match runs per realm.

Gunfire and knife attacks wait for a valid server-observed player position and a
fresh match connection. The HUD shows “Waiting for player position...” or
“Reconnecting to the match...” instead of predicting ineffective shots.

A headless-server restart can leave synchronized values stale in the current
preview SDK. Reload the browser scene after source/test changes before testing.
Periodic joins recreate the server's player registry but do not fully resolve
this synchronization defect.

## Validate

```sh
npm run validate
```

This runs combat and map-query tests, the GLB integrity check, scene bundle,
and TypeScript check. The map tests include the courtyard wall that exposed a
GLTF coordinate mismatch, so that regression has a reproducible check.
The scene gate runs the rule tests plus the weapon, font, team-menu, radar, pain-compass, navigation,
bundle, and type checks. The source is Prettier-formatted; check it with
`npx prettier --check src tests validate` (`.prettierignore` skips generated files).

Run the browser encounter regression with a dedicated browser CDP endpoint:

```sh
npm run test:game -- <browser-CDP-websocket> [evidence.json]
```

It uses real mouse/keyboard events to
prove initial capture and click-to-recapture, then freeze blocks movement → three bot kills → scored victory → automatic next
round → scored defeat, including persistent kills/deaths. It assumes default
Bevy mouse sensitivity. A separate checkout is needed to isolate a second server:
different ports for the same checkout still share a multiplayer room identity.
Open the page with `preview=true` (the react-web query parameter; `isPreview` is
ignored): the script teleports to sniping spots with the preview-only
`/move_player_to` engine command, because bots hold the sites instead of walking
into the player, see 28 m all round and fire 0.35 s after sighting. Each spot is
about 31 m from its target, has ground under it, a line of sight to the target and
no other bot within sight. The scene server hot-reloads on any project file
change, `validate/` included, and open clients go stale after a reload, so do not
edit files while a run is in progress.
The initial run passed in a separate headless Chromium browser with WebGPU enabled.
On 2026-09-12 the full flow passed again in headless Brave (`agent-browser`,
`--enable-unsafe-webgpu`) with the unified match model: the server accepted the
player's client-claimed AK-47 shots, three bots died, the Terrorist round win was
scored, the next round started with health restored and the magazine kept, the
idle round ended as a scored CT win, and the kills stayed on the scoreboard. The
same run recorded the AK-47 fire cue as a playing `AudioSource` parented to the
camera. Money went from 800 to 4950 after the win (elimination award plus three
kill rewards). The other browser
scripts under `validate/` have not been re-run since the unified match model and
CS key layout landed; several still wait for the removed **Start game** menu
label, and their evidence files record the earlier flow.

[Baseline evidence](validate/baseline/browser.json) and the
[baseline screenshot](validate/baseline/dust2.png) record the original prototype.
No editor or engine code is modified by this project.

The full 24-firearm and knife browser review, including AWP zoom and bolt cycling, is recorded in [arsenal evidence](validate/game/arsenal/README.md).

## Mechanics fidelity

`AvatarLocomotionSettings` sets AK movement to 5.525 m/s, walking to 52% of
that, and jump height to 1.125 m. This uses an initial calibration of 0.025 m per
CS unit (72 units = 1.8 m); map traversal still needs comparison against CS.
`InputModifier` blocks movement/jumping during freeze, death, and round results,
and disables double jump/gliding. The locomotion component does not expose
GoldSrc acceleration, friction, gravity, crouched hulls, or air acceleration.
The SDK maintainer confirmed these API limits. The native client uses Ctrl for
walk, default movement for jog, and Shift for run. The scene reads Shift/Ctrl
and sets all three speed fields to the selected value, so Shift slows movement
for CS-style walking. Jump heights and the hard-landing cooldown are configurable;
gravity and collision hull height are not. These settings are a supported first
step, **not identical CS movement physics**.

Original movement audio uses Bevy velocity feedback locally and synced positions
for other players/bots. Shift/Ctrl walking stays below the audible-step threshold.
Set **Settings → Audio → Avatar Volume to 0** while leaving Scene Volume enabled
to prevent native avatar sounds from overlapping the CS clips.
[Rules, source and limits](docs/CS16-MOVEMENT-AUDIO.md).

[Authoritative fall damage and landing feedback](docs/CS16-FALLING.md) now use
the original damage formula, armor bypass and world-death scoring. Native impact
velocity is checked against a server-observed landing; missing reports use the
server estimate. Movement physics and identical-height fall parity remain open.

The server now applies AK cadence (0.0955 s), reload time (2.45 s), standing/moving/
airborne spread, and range attenuation. Humans and bots share the same
head/body/leg boxes (head at eye height). The client sends its aim direction plus
what it saw: its eye position, speed, grounded state and the target position it
hit locally; the server accepts each value only if it matches a sample from the
last second and then re-runs the trace itself (`src/hit-claims.ts`), so what you
saw is what counts without trusting the client's verdict.
The client shows an impact marker in the firing frame by resolving the shot locally (aim, predicted punch, shared-seed spread) against the map, bots and players; the server's confirmation snaps it only if the inputs diverged. Explicit trigger
release drives recovery, using the vanilla integer-accuracy compatibility branch.
Recoil punch and the weapon fire animation start locally in the firing frame, and
server recoil acknowledgements correct the prediction. The live view is a
scene-driven `VirtualCamera` at eye height, so predicted recoil punch and victim
pain punch rotate the view like GoldSrc and pulling the mouse down counters the
punch. The camera follows the avatar's transform one frame late, so the client
hides its own avatar with a local hide-avatars `AvatarModifierArea` that excludes
every other player and bot. The weapon viewmodel adds a subtle extra tilt. Shots
send mouse aim alone and the server offsets each shot by its authoritative punch;
see [mechanics research](docs/CS16-MECHANICS.md).
Escape releases the cursor and left-click recaptures it. Replies are aged from
the original input time and pending shots are replayed; a late reply does not
kick the view a second time. Corrections blend over 50 ms. Spread uses a
shared per-round seed (server-chosen, sent on spawn, `src/shared-random.ts`):
client and server draw the same kick flips and spread samples per shot id, so
the local impact marker normally matches the server's confirmation exactly. Mouse sensitivity is the
`MOUSE_SENSITIVITY` constant in `src/aim.ts`; a CS-style setting is still pending.

Mechanical references: [AK firing implementation](https://github.com/rehlds/ReGameDLL_CS/blob/master/regamedll/dlls/wpn_shared/wpn_ak47.cpp),
[weapon constants](https://github.com/rehlds/ReGameDLL_CS/blob/master/regamedll/dlls/weapons.h),
[weapon recovery](https://github.com/rehlds/ReGameDLL_CS/blob/master/regamedll/dlls/weapons.cpp),
and [movement implementation](https://github.com/rehlds/ReGameDLL_CS/blob/master/regamedll/pm_shared/pm_shared.cpp).

The full-round browser regression with local recoil prediction passed: three kills, CT point,
automatic next round, T point after player death, and persistent 3/1 player stats.
Measured browser movement was 5.44 m/s running and 2.87 m/s Shift-walking.
Evidence: [rounds](validate/game/rounds.json), [movement](validate/game/movement.json).
With a match running, measure movement using:

```sh
node validate/movement.mjs <browser-CDP-websocket> [evidence.json]
```

This measurement waits for the next freeze/live transition. Headless Brave is
the currently working validation browser on this machine.

To check avatar click behavior, join the same scene with two browser clients,
stand near each other inside Dust2, and left-click the other avatar. Their
passport must stay closed, both before starting a match and while firing in a
live round. Existing open passports may need to be dismissed once after reload.

The camera regression measures upward kick under sustained firing, recovery to
mouse aim after release, a 45-degree mouse turn, and movement along that heading:

```sh
node validate/camera.mjs <browser-CDP-websocket> [evidence.json]
```

`validate/camera.mjs` was rewritten to measure the viewmodel tilt during a brief
engine-camera experiment; the live view is a `VirtualCamera` again, so its
camera-pitch assertions should be restored and the script re-run.
Run each encounter test against a fresh isolated server with the team menu
available. The camera test reloads the selected SDK7 scene before starting;
for the round test, use `node validate/game.mjs <browser-CDP-websocket> [evidence.json] --fresh-page`
with a freshly opened browser to avoid an unnecessary engine reload. Use a
dedicated headless browser with WebGPU enabled to avoid physical mouse input
contaminating measurements. [Left-mouse camera evidence](validate/game/camera.json)
and [keyboard-fire evidence](validate/game/camera-keyboard.json) record visible
kick and recovery to the original pitch. The amount observed differs with shot
cadence; these runs do not establish a reference-matched spray. The full round
regression also passes with the new camera active. These checks are not
a complete comparison against the original CS client.

Full-auto timing preserves the fractional 95.5 ms AK interval between client
frames. The server buffers at most one request per player within a 50 ms timing
window and waits until its deadline; it does not fire early or spend ammo while
waiting. Duplicate/out-of-order IDs remain rejected, and queued shots recheck
round, health, reload, and ammunition when executed. Long stalls start a fresh
schedule instead of accumulating a burst of catch-up shots.

```sh
node validate/cadence.mjs <browser-CDP-websocket> [evidence.json]
```

This regression holds left mouse through a full magazine, measures the first-to-
last-shot interval from the HUD, releases fire, and checks automatic reload to
30/60 and recoil recovery. [Timing evidence](validate/game/cadence.json) recorded
3.178 s between the first observed ammo decrease and empty magazine
(reference first-to-last shot interval: 2.7695 s). HUD/network sampling misses
individual shots, so this does not establish exact firing-rate parity. Unit tests reproduce the earlier dropped-shot failure
with 60 Hz client frames, 30 Hz server ticks, and varying message delay.

## HUD graphics

Health, armor, clock, magazine/reserve ammunition, and money now use the original
bitmap HUD digits and icons, with point filtering and reference pixel positions.
Health, armor, ammo, time, and money follow server-owned game state. The scoreboard,
menus, kill feed, blending, and warning/fade behavior still need fidelity
work. Sprite provenance and the reproducible converter are in
[asset-sources/hud/SOURCE.md](asset-sources/hud/SOURCE.md).

The isolated headless Brave run verified the bitmap HUD through a complete bot
encounter: 100 health and 30/90 ammo at the start, 90 health and 19/90 after three
kills, restored 100 and 30/90 next round, then 0 health on defeat. The check reads
the displayed sprite UVs. See [round evidence](validate/game/rounds.json) and the
[HUD capture](validate/game/hud.png). Digits and icons render upright and in the
intended positions at 1280 pixels wide; full reference-image and aspect-ratio
parity still need review. The Chrome test build hit a WebGPU pipeline/device
failure; using the installed Brave binary with an isolated headless profile
completed these checks without editor or engine changes.

## Authoritative shot regression

Run `node --experimental-strip-types --test tests/ballistics.test.mjs` from the
repository root. It checks a ray aimed away from a nearby claimed hit, an avatar
behind the measured Dust2 east wall, nearest-target selection, head/body/leg
range damage, preserved bot head placement, independent shooter recoil, and
standing/walking/running/airborne spread. These checks exercise the production
shot resolver with fixed random samples.

Shot origins use the server-observed avatar feet plus a 1.6 m eye height. There
is no client-position tolerance or lag rewind; movement/network latency still
needs a two-client comparison. Friendly fire is disabled, with teammates stopping the bullet. Human deaths now
wait for the shared round restart; the old five-second individual respawn path
has been removed. Armor and helmet coverage now follow the reference AK damage rules.

The latest headless Brave cadence check consumed all 30 rounds, then verified
automatic reload to 30/60 and recoil recovery. The sampled ammo-decrease-to-empty
interval was 3.178 seconds; exact CS firing-rate parity remains unverified. [Evidence](validate/game/cadence.json). The
cadence script can start a match or wait for a fresh round in an existing match.

## Input feedback regression

Shift/Ctrl walking now keeps the movement crosshair compact when changing from
W to W+D and back. Horizontal speed is sampled over time instead of dividing
batched avatar updates by a single frame; firing still expands the crosshair.
This changes visual feedback, not the server's speed-based accuracy rules.

The team menu now keeps requesting an unlocked cursor whenever the canvas
captures the mouse while that menu is open. This fixes the intermittent state
where the buttons were visible but could not be clicked. The full-screen damage
flash also ignores pointer input. A focused browser reproduction is in
`validate/bot-avatars.mjs`.

## Classic team menu

The selection screen uses the original `Teammenu.res` 640×480 coordinates,
`CS_logo.tga` silhouette, `ClientScheme.res` colors/font tiers, and the exact
Dust II briefing. Widescreen viewports keep the source layout centered in a 4:3
area. Button hover is computed from the pointer position each frame
(`PrimaryPointerInfo`), because mouse-enter events arrive too late in the
explorer. **1** and **2** join Terrorists and Counter-Terrorists while the menu
is open, mirroring `Teammenu.res`; AUTO ASSIGN and SPECTATE are click-only
because the explorer has no 5/6 input actions. Picking a side starts the round
at once, with bots filling the other side. LEAVE TEAM/LEAVE SPECTATOR returns to
the menu, and PLAY AGAIN appears after a match ends.

[Team-menu evidence](validate/game/team-menu/README.md) checks all visible labels,
panel and button coordinates at 800×450 and 1280×720, the original logo, and
two-client auto-assign behavior. On an empty realm, auto-assign places the
first player on T and the second on CT with the Glock-18 and USP loadouts. That
evidence predates bot filling and the removed PRACTICE WITH BOTS button.

`npm run validate` includes immediate recoil, 500 ms delayed acknowledgements,
reordered replies, pending-shot replay, reload/rejection recovery, ammo reservation,
and the batched diagonal-walking reproduction.

For the browser proof, use an **isolated copy** of this scene with its dependencies:

```sh
node validate/prepare-feedback-latency.mjs /path/to/isolated-scene
```

Start that copy on port 8005 and open a dedicated Bevy browser against it. The
fixture adds 400 ms to shot feedback only and refuses to modify this checkout.
Then run from this repository:

```sh
node validate/input-feedback.mjs <browser-CDP-websocket> [evidence.json]
```

It checks local camera/weapon response before the delayed impact, no second kick
on acknowledgement, Shift+W → Shift+W+D → Shift+W crosshair stability, diagonal
walking speed, and normal running expansion. Restore the copied `src/server.ts`
from this repository before ordinary gameplay/cadence tests.

The headless Brave input-feedback regression passed with the 400 ms delayed-
feedback fixture. Camera kick and weapon animation were visible in the first
116 ms observation; the server impact appeared at 783 ms, with no second camera
kick. These are observation bounds, not frame-accurate input latency. Shift W+D
measured 2.87 m/s and the visible crosshair gap stayed at 5 px through the movement
transitions; normal running expanded it. [Evidence](validate/game/input-feedback.json).

Normal-timing full-round and full-magazine regressions also passed with these
feedback changes in a fresh isolated browser. The round check covered freeze,
three kills, scored victory, automatic restart, scored defeat, and persistent
3/1 player stats. Use `--fresh-page` for the round script on a newly opened page;
in-place engine reload previously stalled the isolated browser.

## Shared team match validation

The shared-team stage passed 84 tests, asset checks, and the SDK build/typecheck.
[Two-client evidence](validate/game/teams.json) records actual team selection,
original spawn positions, frozen movement, human kills and matching team scores
on both clients, blocked dead-player movement/fire, and automatic round respawns.
The combat test uses engine console teleports to stage an unobstructed encounter;
it does not prove route navigation or long-distance latency compensation.
[Spawn provenance and Blender checks](asset-sources/dust2/SOURCE.md) cover the
original 40 spawn coordinates and map alignment.

Use one isolated scene checkout/server and separate headless Brave sessions on
the **same** realm. Launch owned headless sessions with `--args '--mute-audio'`
(for `agent-browser`); headless browsers still play audio unless muted. Close
both sessions and stop the isolated server when finished. Wait for the scene's
Start menu in both clients, then run:

```sh
node validate/teams.mjs <CT-CDP-websocket> <T-CDP-websocket> [evidence.json]
```

Keep that match running, open a third fresh guest on the same realm, then run:

```sh
node validate/team-admission.mjs <CT-CDP-websocket> <T-CDP-websocket> <third-CDP-websocket> [evidence.json]
node validate/team-reconnect.mjs <CT-CDP-websocket> <T-CDP-websocket> <third-CDP-websocket> [evidence.json]
```

These scripts are for owned test browsers: the admission check closes and
reopens the T tab; the reconnect check freezes and resumes the third tab. New guest tabs can receive new addresses, which do not inherit
another guest's stats. Same-address rejoin eligibility has rule-test coverage;
same-address heartbeat expiry, retained stats, no mid-round resurrection, and
next-round spawning also passed in the browser. The first attempt left the
resumed tab hidden; `Page.bringToFront` restored updates in that same tab.
[Same-address evidence](validate/game/team-reconnect.json).
Other spectator modes, full-match
first-to-sixteen browser playthrough, and 5v5 performance remain unverified.

The solo encounter also passed after team support was added: three bot kills,
CT point, automatic round, player death, T point, and persistent 3/1 stats.
The admission check passed late-join exclusion and disconnect resolution before
a new-tab readiness error; resuming at the existing new tab then passed fresh
guest admission and next-round spawning. [Admission evidence](validate/game/team-admission.json).

## C4 objective

Each round assigns one Terrorist the bomb (a human T when one is connected,
otherwise a T bot). **4** selects C4, **1** returns to the primary (**2** the
pistol), and **Shift+4** drops C4; Shift+4 substitutes for the original G
binding, which the explorer does not expose. Hold left mouse while grounded inside A or B to plant for three
seconds. Releasing, switching, moving out of the zone, or leaving the ground
cancels progress. Planting and defusing block movement and rifle fire.

The original BSP trigger planes define both zones, including B's clipped corner.
Manual drops and carrier deaths toss the original backpack forward, with source
body pitch, gravity and Dust2 wall/floor contact. It becomes collectible by a
living Terrorist once it lands, including during freeze time; the former owner
has no extra pickup delay. Physics continues through the round result, and the
next round clears the drop. A disconnect uses the last available carrier position.
See the [C4 toss checks](validate/game/c4-toss/README.md).

A planted bomb has a 45-second fuse and hides the round timer. CT must face it,
remain grounded and in use range, and hold **E** for ten uninterrupted seconds.
CTs can buy a $200 defuse kit in their buy zone or recover one from a fallen CT for a five-second defuse. The original green kit icon shows ownership. E is
the use key only; it never fires.

A plant survives elimination of all Terrorists and the ordinary round timeout.
Defuse awards CT; explosion awards T and damages nearby players on either team.
Killing all CTs still awards T. A defuse must finish before the fuse deadline;
the fuse wins an exact tie. All decisions, input expiry, ammo restrictions, and
round scores are server-owned. Unarmored explosion falloff uses the reference
500 damage over 1750 map units; armor applies the reference explosion reduction.
Completing a defuse adds three scoreboard frags to the defuser; a successful C4
explosion adds three to its planter. Planting by itself adds no frags. These
authoritative awards participate in the existing descending score ordering.

C4 warning and action sounds use the original clips. The five beep waves advance
through the fuse and retrigger every 1.4 seconds. Bevy spatial attenuation and
sound timing still need an audible comparison against the original client.
[Sound provenance](asset-sources/c4/SOURCE.md). C4 now uses the original first-person,
held, planted and dropped-backpack models, keypad clicks and LED/explosion sprites.
Deployment and plant-cancel cooldowns follow the source, C4 restores its own movement
speed, and planting selects the highest-weight weapon. See [C4 details and validation](docs/CS16-C4.md).
The progress UI and advanced bot bomb tactics remain pending.

When bots fill the Terrorist side they rotate a bot bomb carrier and A/B
destination. The carrier uses the production Dust2 graph to reach the selected
site and plant; another living bot retrieves a dropped bomb, and living bots
spread around an active planted site. When bots fill the CT side they move to a
planted bomb and defuse it while no enemy is visible. The server keeps the
chosen objective stable through the round. The
[bot C4 browser evidence](validate/game/solo-bomb.json) records a bot traversing
to B, planting, and teammates moving into defensive positions; it predates CT bot
defusing, which has rule coverage only.

Run `node validate/bomb.mjs <CT-CDP-websocket> <T-CDP-websocket> [evidence.json]`
with two fresh owned browsers on the same isolated scene server. The script
uses console teleports to stage both sites; it does not validate full-map routes.

The muted two-client C4 run passed manual drop/pickup, rejection at B's clipped
corner, interrupted planting, planting at A and B, elimination of the last T
after planting, cancelled/restarted defusing, shared CT/T scores, nearby
explosion damage, and both objective frag awards. The CT scoreboard row reached
4 after one kill plus the three-frag defuse award; the T planter reached 3 after
the explosion. Defusing was observed at 10.402 seconds and the fuse at 44.737
seconds. All five warning clip URLs appeared in the engine state; this verifies
clip emission, not audible fidelity. [Evidence](validate/game/bomb.json).

## Money and equipment

Press **Esc** to free the cursor, then click the **BUY** button (all platforms) in your team's spawn buy zone to open equipment
purchases, then click **Close** to resume aiming. Buying is available during freeze
and for 90 seconds from the start of live play. A living survivor can still buy
during the five-second round result if that window remains open. The menu uses
the server's buy timer; the result countdown does not replace it. The buy menu
renders above combat HUD messages so they cannot cover its controls. Buying closes
at match end. [Buy-window regression](validate/game/buy-window/README.md).
This is a temporary input/menu presentation;
the installed SDK does not expose the original B key. Server checks enforce the
original Dust2 buy volumes, time, team, alive/admitted status, funds, and ownership.

Players start with $800, receive $300 per enemy kill, and carry at most $16,000.
Round rewards arrive on the next shared spawn: $3250 for elimination, timeout, or
defuse wins, $3500 for an explosion win. Defused-bomb losses add $800 to the T
loss reward. Surviving Terrorists receive no payment for an unplanted timeout.
The original shared loss-bonus history is preserved, including its first-streak
$1400/$1900/$2400/$2900/$3400 sequence and $1500 reset when a streak is broken.

Buy a $650 vest, $1000 vest/helmet, $200 CT defuse kit, or ammo for either weapon slot. AK ammo is $80/30 (90 reserve cap), M4A1
$60/30 (90), USP $25/12 (100), and Glock $20/30 (120). A helmet upgrade with full armor costs $350; replenishing
armor while retaining a helmet costs $650. Purchases cannot overdraw money or
charge again for already-full equipment; duplicate request sequences are ignored.
Survivors retain equipment and ammunition. Death clears armor/helmet/kit on
respawn; money survives death and rejoining, and resets with a new match.

Armor protects the body, helmets also protect the head, and legs remain exposed.
AK damage uses the reference armor penetration and depletion arithmetic. Armor
keeps fractional values; health damage is rounded to the scene's integer health.
Blast damage uses its separate reference armor calculation. Weapon drops and pickups
are implemented in the current arsenal. HE, flashbangs and smoke are playable; spare grenades are discarded on death as in CS 1.6. Defusal kits drop on death for living CTs to recover, including bots; survivors keep them. Grenade use by bots remains open. See [kit rules and validation](docs/CS16-DEFUSE-KITS.md).
Bots now use the same start money, prices, round and kill rewards, armor and
paid ammunition through a simple [round buying policy](docs/CS16-BOT-ECONOMY.md).

`node validate/economy.mjs <CT-CDP-websocket> <T-CDP-websocket> [evidence.json]`
checks equipment buying, kit defusing, money rewards, armored combat, death resets,
survivor ammo, and ammo purchases in two owned browsers on a fresh isolated match.
Launch them muted as described above. Pure tests also cover expired/out-of-zone/
dead/queued requests, duplicate sequences, loss streaks, armor exhaustion, and
all 40 spawns against the original buy volumes. See [mechanics references](docs/CS16-MECHANICS.md).

The muted two-client economy regression passed. The purchased kit defuse was
observed at 5.543 seconds. An armored AK body hit left 73 health and 96 displayed
armor. The check verified starting funds, upgrade prices, insufficient-funds and
owned-kit rejection, next-round rewards, immediate kill money, survivor kit/armor/
ammo retention, loss of equipment after death, and paid reserve replenishment.
[Evidence](validate/game/economy.json). Browser timings include input/network and
sampling delay; geometry/expiry/admission rejection also have rule-test coverage.

The solo bot-round regression also passed with this economy build: freeze, three
kills, scored CT victory, restored health/ammo, automatic restart, scored T win,
and persistent 3/1 stats. [Evidence](validate/game/economy-solo.json).

## Weapon inventory

The current 24-firearm roster, prices, alternate modes, original models and validation are documented in [CS16-ARSENAL.md](docs/CS16-ARSENAL.md). The following paragraphs describe the earlier four-weapon milestone and its recorded evidence.

Rounds start with the original USP/Glock magazines and two spare
magazines. Buy weapons through the
spawn equipment menu: CT M4A1 $3100, T AK-47 $2500, USP $500, Glock-18 $400.
Switch with **1** (primary), **2** (pistol), and **3** (knife), as in CS 1.6. Switching preserves ammo,
cancels the interrupted reload, and enforces the reference 0.75-second draw delay.
The server rejects delayed shots whose weapon revision no longer matches.

USP/Glock require a fresh press per shot (0.15-second minimum); rifles repeat
while held. Damage falloff, armor penetration, recoil, moving/airborne spread,
reload times, and movement speed come from each weapon's reference profile.
Prediction uses the same profile so a pistol cannot replay AK recoil. The current
USP and M4A1 are unsilenced and the Glock is semi-auto; silencers/burst mode,
other guns, weapon drops/pickup, and complete animation/sound fidelity remain open.
The AK first-person view now uses the GameBanana **Pack Default Weapon Fixed** model:
1,050 triangles including hands, 11 original textures, and the six source idle,
draw, reload and shooting clips. The M4A1, pistols, knife, and all third-person
weapons retain their existing placeholders. The AK is attached at the camera
origin with unit scale; its source already supplies the first-person placement.
The original animation timing is preserved, firing starts locally, and server
state still controls reload completion and ammunition.

The offline gate checks every texture pixel against the pinned MDL, the complete
rig, animation channels and clip timing. The headless Bevy check passed loaded
clips, held-fire animation changes, reload/ammo transfer, and switching to the
Glock and back. Browser captures show the AK and hands at idle, firing and reload;
see [the runtime evidence and reproduction](validate/game/ak47-cs16/README.md).
Extreme camera angles, wall/near-plane clipping, frame-by-frame animation fidelity
and parcel-boundary behavior remain unverified. See
[AK source, conversion and reuse terms](asset-sources/ak47-cs16/SOURCE.md).

To review it manually, join Terrorists, buy an AK and primary ammo at spawn, and
press 1 to equip it. Check the draw, hold left mouse for several shots, then
press F to reload. The magazine and hands should animate, ammo should refill
only when the reload completes, and shooting should restart the animation on
every round. Switch to pistol/knife and back, then check aiming up/down and
standing near walls for clipping. The recorded run covers firing, reload and
switching; the wider clipping checks remain open.

Knife attacks use server-owned reach, wall occlusion, hit regions, damage, armor,
cooldowns, and rear-stab checks from the pinned CS 1.6 reference. A primary swing
reaches 1.2 m and deals 20 damage after a pause or 15 while chained. A stab reaches
0.8 m and deals 65 damage, tripled from behind. Right mouse is reserved by Bevy and
is not exposed as a scene input, so **F** is the current stab binding. The
[two-client evidence](validate/game/knife.json) covers range rejection, chained
damage, frontal and rear stabs, kill feed credit, and a 2/0 scoreboard row.

`node validate/inventory.mjs <CT-CDP-websocket> <T-CDP-websocket> [evidence.json]`
uses muted owned clients and a fresh isolated match to verify starting pistols,
click/hold behavior, earned-money rifle buying, caliber ammo prices, auto-fire,
switching, reload cancellation/completion, and death/survivor inventories.
The current [inventory browser run](validate/game/inventory.json) passed all of
these checks. It also reproduces a fixed bug where completing a C4 plant fired
the gun immediately: returning to the gun now preserves ammo and applies the
0.75-second draw delay. The updated [pistol economy run](validate/game/economy-pistols.json) also passed
kit timing, armor, rewards, survivor/death resets, and pistol ammo purchases.
Older team/C4 scripts now use default-pistol ammo; the buy-row click formula in
`validate/team-client.mjs`, `economy.mjs`, `inventory.mjs` and `solo-flow.mjs`
still targets the old flat list and must be redone for the VGUI-style buy menu
(rows at 640x480 coordinates x 76, y 116 + 28 per row, categories then submenus).
Their earlier evidence records remain historical.

The [post-inventory solo regression](validate/game/inventory-solo.json) passed
three bot kills, scored victory, automatic respawn with restored health/ammo,
then a scored defeat retaining 3/1 kills/deaths. The current gate passes 84 tests,
asset integrity, bundling, and type checking.

## Death camera and spectating

Death starts with a 0.6-second fall from eye height to the CS 1.6 dead-view height
and an 80-degree roll. The view remains at the body until the original three-second
death window ends, then enters free chase. The chase cam follows a living human
teammate, or a living bot when no human teammate is available, so a lone dead
human spectates the bots. Neutral spectators can cycle humans and bots together.
Move the mouse to orbit; click to select the next
target, or Shift+click for the previous one. Human targets must be connected,
alive, and eligible for the current round. The camera holds its last position
when no target is available. The same `VirtualCamera` serves the live view, the
death fall, and the chase cam. Dead-player inputs cannot move, shoot, reload, or buy.
Free chase hides your own health, armor, ammo and money; the watched player's
name and health use their team color, and the round timer remains visible.
Escape opens the team menu. RESUME SPECTATING keeps the current target and
recaptures the cursor; release that click before using another to cycle targets.
With no living eligible target, the view explicitly says so.

On desktop, neutral spectators can press **Space** to switch between chase and
**Free Look**. WASD flies in the viewing direction (look up/down to climb/descend);
Shift slows flight. Clicking in Free Look jumps to the next eligible player's
viewpoint without leaving that mode. Escape stops flight and opens the team menu;
Resume preserves the camera position. Joining a team restores the playing camera.
Selecting SPECTATE in an empty lobby also enters Free Look, so watching does not
require an active match. Dead team players cannot select roaming.
See [spectator roaming checks](validate/game/observer-roaming/README.md).

Human spectating is teammate-only. The chase distance is 112 CS units at
the scene's physical scale; a map ray limits the camera distance with 0.15 m
clearance. First-person/map observer modes, the original observer menu,
a rendered character death animation, and full camera-hull collision parity
remain open.

Run the owned-browser regression with three CT clients and one T client on a
fresh isolated match, in this order (launch all four with `--mute-audio`):

```sh
node validate/spectator.mjs <dead-CT-CDP> <first-CT-CDP> <second-CT-CDP> <T-CDP> [evidence.json]
```

For a fresh match, close the owned clients and restart the isolated server before
opening fresh clients. Page lifecycle freezing alone did not reliably stop scene
worker heartbeats in the spectator run; it is not a match-reset mechanism.

The [four-client spectator regression](validate/game/spectator.json) passed
death-to-chase, enemy exclusion, forward/reverse cycling, target movement,
automatic selection after target death, no-target fallback, round results, and
restoration of the local camera and shooting after respawn. Disconnect filtering
has rule coverage; live spectator disconnect recovery is not yet browser-verified.

The [post-spectator solo regression](validate/game/spectator-solo.json) also
passed the complete three-kill win, automatic round reset, and scored loss with
3/1 stats retained. All owned test browsers were muted and closed afterward.

The focused [death/spectator evidence](validate/game/death-spectator.json) records
a roughly three-second transition, the camera fall, the first living-bot target, and
click-to-cycle without spending ammunition. The rule tests pin the 80-degree roll.

## Kill feed

Confirmed kills use the original weapon/headshot sprites and team-colored bitmap
names. Four notices appear from oldest to newest at the top right and each lasts
six seconds; overflow removes the oldest. World deaths use a skull, and suicides
omit the repeated killer name. Headshot flags and team colors come from the server,
including bot deaths. C4 and HE use the grenade death icon.
See [source and conversion](asset-sources/hud/SOURCE.md) and
[headless evidence](validate/game/kill-feed/README.md). SDK alpha blending and the
bitmap font are adaptations rather than complete GoldSrc pixel parity.

## Classic scoreboard

Hold **Shift+1** to view the scoreboard. It opens automatically at match completion;
ordinary round wins display a separate message instead of opening the board.
The scoreboard uses the original 520×340 proportional panel, compact rows,
team-colored dividers, player counts, Score/Deaths/Latency columns, and a local
player highlight. Team scores and player kills/deaths come from shared state,
and each team's player rows remain sorted by kills, then fewer deaths. Bots are
listed inside their team as `BOT <name>` with their own kills/deaths.
Dead players show `Dead`; the C4 carrier shows `Bomb` to teammates. Bots show
`BOT` in the latency column; human latency is currently unavailable and displays
`-`, not an invented measurement.

A bitmap Verdana atlas provides the original font family and five reference
size tiers through SDK UI. Unsupported glyphs fall back to native text. Resource
provenance and the font rebuild command are in
[asset-sources/scoreboard/SOURCE.md](asset-sources/scoreboard/SOURCE.md).
Windows GDI pixel matching, human latency, the original Tab binding, and the
remaining HUD/menus remain fidelity requirements.

The solo regression decodes the displayed font glyphs to verify team scores and
visible kill ordering. Add `--screenshots` to capture three desktop viewports:

```sh
node validate/game.mjs <owned-CDP-websocket> /path/to/evidence/rounds.json --fresh-page --screenshots --browser-session <owned-session>
```

Optional screenshots use the installed `agent-browser` CLI and follow the
gameplay checks; gameplay evidence is written first. Raw CDP captures stalled
after resizing this WebGPU preview to 1080p, while CLI captures succeeded in the
same live browser. Inspect a timed-out browser before restarting it.

The [current scoreboard evidence](validate/game/scoreboard-classic/README.md)
covers complete solo rounds, both clients agreeing on shared scores, team counts,
local highlights, C4 status privacy, and the final three-viewport capture sweep.
[1280×720 preview](validate/game/scoreboard-classic/scoreboard-1280x720.png).
The 84-test gate, weapon/font asset checks, bundling, and typecheck pass.

## Classic radar

The top-left 128-pixel radar rotates teammate positions with your aim and marks
height differences of 128 original map units. Only living, connected teammates
admitted to the current round appear. The C4 carrier is red; dropped C4 and the
planted-bomb cross flash every half second for Terrorists only. Dead players and
spectators have no radar. Enemy bots never appear on it.

The original `radar640.spr` supplies the background. SDK alpha blending differs
from the original additive rendering; exact blending, radio flashes and location
labels remain unfinished. Geometry and visibility rules have automated coverage
in `tests/radar.test.mjs`.

Three-player browser validation passed teammate rotation, enemy filtering,
dropped-C4 flashing/privacy, and death removal. See [radar evidence](validate/game/radar/README.md)
and the [rendered radar](validate/game/radar/teammate.png). The structural gate
passes 88 tests, asset checks and SDK build/typecheck.

## Bot navigation

Bots stand on Dust2's sloping floor and plan routes with a graph built from
the existing map collision triangles. Their actual velocity uses CS acceleration,
friction and bullet flinch, clipped against Dust2 solids. Hits can slow or push a
bot, and its route then follows the displaced position. See [bot movement](docs/CS16-BOT-MOVEMENT.md). Walls gate sight and damage; the server
moves them every frame and owns their position, facing and speed. Bots spawn in
their side's original spawn slots after that team's humans, facing the spawn
direction. The server entities now render as original Arctic/Urban models with
independent leg and gun animations, animated source hitboxes and full-body death
clips. Guns bind to their original hand bones through Bevy's `GltfNode`; corpses
release their held weapons and remain until the next round. See [body/death details](docs/CS16-PLAYER-MODELS.md).
Only `BotBodyPose` is synced; each client builds the bot `Animator` locally from it
(`bot-animation.ts`). Unity writes `playing: false` back when a non-looping clip ends,
and a synced server-owned `Animator` rejected that write and re-sent the finished
death clip, so corpses replayed their death forever on Unity. Unity and Godot have no
`GltfNode`: once the body has loaded without a `GltfNodeState`, the held gun is pinned
at a fixed right-hand offset of the aiming pose instead of following the bone.
Unity only honours `PointerLock` on the camera entity, so menu clicks and the buy
menu close also request the lock there; own-weapon sounds alternate two sources
because Unity does not restart a source that is still playing. The green teammate
markers are gone and the local nametag is hidden. See [explorer inconsistencies](docs/EXPLORER-INCONSISTENCIES.md).
Remote human players retain Decentraland avatars and the existing `AvatarAttach`
retry workaround for [bevy-explorer#1255](https://github.com/decentraland/bevy-explorer/issues/1255).
Dual Elites have separate left/right-hand models. C4 uses its original held model,
including while bots plant. The [older avatar evidence](validate/game/bot-avatars/README.md)
predates the new player bodies.

Movement is a small seeded state machine (`bot-behavior.ts`, `bot-navigation.ts`),
so every round plays out differently:

- **Roam.** With no contact a bot picks a destination: 55% a strategic spot for
  its side (T: both sites, the T→A, T→B and T→CT approaches; CT: both sites, the
  six site defense positions, the CT→A/CT→B routes and mid), otherwise a random
  reachable graph node 8–25 m away. It avoids its last three destinations, runs
  or shift-walks (52% speed, one leg in four) and, on arrival, holds for 0–7 s
  (CTs twice as long) while scanning up to 120° either side.
- **Hunt and callouts.** A visible enemy is remembered for eight seconds. When a
  bot spots an enemy, teammates within 40 m of the sighting head there too
  (`heard` sightings are replaced by their own). On reaching the last known
  position the bot searches on the spot for 1.5–3 s, then roams again.
- **Engage.** Beyond 10 m it closes in along the graph. Inside 10 m it alternates
  0.25–0.6 s sidesteps perpendicular to the enemy with 0.35–0.9 s standing bursts,
  usually flipping direction and swapping sides when a wall blocks one; corridors
  leave it fighting in place. While reloading it backs 3 m away from the enemy,
  trying straight back, then the diagonals and sides.
- **Routes.** Paths are string-pulled: the bot heads straight for the furthest of
  the next twelve nodes whose straight line stays on the graph, so it cuts
  corners instead of stair-stepping the 0.5 m grid. Facing turns at 400°/s
  (720°/s when tracking an enemy) instead of snapping.

Bots start with their team's pistol and buy affordable guns, armor, kits and ammo
from earned money. Survivors retain their equipment; dead bots lose it. See
[bot economy](docs/CS16-BOT-ECONOMY.md). Each bot's random stream derives
from the round seed and its index, so a round's decisions are reproducible.

The generated graph has 21,170 connected nodes at 0.5 m spacing, with a 0.3 m
clearance radius, 1.8 m standing height and 0.48 m maximum walking step. Both bomb
sites and all 40 original human spawns connect to it. Rebuild after changing the
map collision export:

```sh
python3 asset-sources/dust2/build_navigation.py
npm run validate
```

This is an initial bot navigation system, not original CS bot AI. Directional
vision, hearing, teammate avoidance, crouch/jump routes, advanced bomb tactics, and
weapon animations on the held models remain unfinished. Bot AK firing now
uses the shared bullet, spread, recoil, ammunition and reload rules described
below; this does not establish original CS bot AI parity.

Navigation browser evidence is in [validate/game/navigation](validate/game/navigation/README.md).
The moving-bot build passed the full scored solo-round check. A separate route
observation tracked bots 83, 53 and 42 m from their starts; a bot reacquired the
player near T spawn after 19.5 seconds. That navigation build passed 93 tests plus asset, graph
integrity, bundle and type checks.

## Bot gunfire

Bots fire their equipped gun at visible players. Shots use the same recoil,
movement/airborne spread, hit regions, distance damage and armor calculations as
player gunfire. Walls and other bots stop bullets; friendly fire is off. The
server owns each bot's ammunition and uses that gun's reload duration. Empty
reserves stay empty; a fully exhausted primary gives way to the carried pistol
after its draw time. Death still drops the carried gun selected by weapon weight.
Losing sight releases the trigger, and reacquisition has a
short reaction delay. Surviving magazines and reserves carry into the next round;
bots pay for additional ammunition and reload partial magazines during freeze.

Bots fire 2–5-round bursts based on range. The initial encounter retains its
6/7/8-second grace measured from spawn, including the three-second freeze.
These burst, reaction and aiming choices are scene AI settings, not recovered
CS bot behavior. Bots shoot from their existing 1.4 m eye height. Full aim blending,
advanced aiming and coordinated tactics remain unfinished.

Impact markers now appear at the traced bullet endpoint. Bot kills identify
the bot and AK in the kill feed. The [bot-combat evidence](validate/game/bot-combat/README.md)
records live health changes and the scored-round regression. Reload and armor
behavior have unit coverage; the live hit trace uses an unarmored player.

Confirmed hits now give the victim the original CS directional pain sprite,
amber above 25 health and red at critical health, plus a hitgroup- and
armor-dependent camera punch (plus a subtle viewmodel tilt) and original hit voices. Bot and human
attacks use the same authoritative event with the attack origin and hit group;
the indicator ignores pointer input. [Rendered hit feedback](validate/game/damage-hit.png),
[pain sprite source](asset-sources/hud/SOURCE.md),
[sound source](asset-sources/player-feedback/SOURCE.md).

The rendered feedback capture uses an isolated test copy with bot shots spaced to
500 ms, because the production close-range burst can kill the player between two
full CRDT snapshots. Prepare that copy with
`node validate/prepare-damage-feedback.mjs /path/to/isolated-scene`, then pass
`--extended-hit-window` to `validate/death-spectator.mjs`. Damage, pain direction,
fade, and punch are unchanged by the capture fixture.

The bot-gun stage passed **99 tests**, asset/graph validation and SDK build/typecheck.
Its live round check passed player victory, reset and bot victory with stats
retained. An idle-player trace observed 35-point AK body hits about 100 ms apart
and the named bot/weapon kill feed.

## Full CS 1.6 arsenal

The current weapon implementation is described in [CS16-ARSENAL.md](docs/CS16-ARSENAL.md).
That section supersedes the earlier four-weapon prototype and one-AK review notes above.
`npm run validate` runs the gameplay regressions, all 28 gun/knife/grenade viewmodel integrity checks (plus C4),
map/HUD checks and SDK build/typecheck. Historical browser captures above describe
older builds; new arsenal captures are recorded separately.
