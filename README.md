# Counter-Strike 1.6 in Decentraland

An SDK7 scene on Dust2, using Decentraland's authoritative server and stock Bevy
Explorer. The target is faithful CS 1.6 gameplay and an exact recreation of its UI.
See [the implementation plan](IMPLEMENTATION_PLAN.md) for the remaining work.

## Current playable prototype

Select **Start game** to spawn in the Dust2 courtyard. After a three-second freeze,
eliminate three enemies before they kill you or the two-minute round expires.
Enemies navigate around map obstacles, search the last seen player position,
and patrol Dust2 after losing contact. They attack when map geometry does not
block their view. Each bot is a synchronized `AvatarShape` NPC, so its visible
body and walking animation follow the authoritative navigation transform. Each result awards one team point, shows the win message for five seconds, then
automatically starts the next round. First to sixteen wins ends the match and offers
**Play again**. Each round restores health, ammunition, enemies, and the timer;
player and bot kills/deaths persist across rounds. The scoreboard sorts each
team by kills descending, then deaths ascending. Time expiry awards the CT side
a point, matching the unplanted-bomb timeout rule. Shared human rounds now support the C4 objective described below.

The server owns enemy health, damage, round state, ammo, reloads, and shot cadence.
Bot hits and line of sight use a triangle query exported from the existing Dust2
model into the same coordinates used by Bevy. Player shots at bots and human target proxies share server-owned ray
intersection, wall occlusion, AK recoil/spread, and range damage. Clients send aim and a shot sequence only; they cannot choose the hit
target, hit point, or shot origin. Each shooter has independent recoil state.
Human standing hit regions are still approximate. Choose **Terrorists** or
**Counter-Terrorists** for a shared human match; **Start game** keeps the solo
bot encounter. Both teams must have a player before the three-second freeze.
Teams spawn at the original Dust2 locations, share elimination/timeout rounds,
and respawn together after the five-second result. Each team currently has five
seats; testing covers two combatants and a third joining client, not 5v5 capacity.
Late joiners wait until the next round. A player missing heartbeats for 20 seconds
is removed from the active round; rejoining cannot grant a mid-round life.
Kills/deaths persist by address until a new match. A live disconnect counts as a
death. Friendly fire is off, and teammates stop bullets. CTs respawn with a USP (12/24) and Terrorists with a Glock-18 (20/40); both sides always have a knife.
Buy an M4A1 as CT or an AK-47 as T; rifles include a magazine and no spare ammo.
Survivors retain ammunition, armor, helmets, and defuse kits.

The current AK, knife, pistols, and Decentraland-avatar enemies are placeholders while the game is built.
[AK source and attribution](asset-sources/ak47/SOURCE.md). The HUD has an initial
amber layout and green crosshair, but is **not yet an exact CS 1.6 match**. Original
HUD digits/icons and the source-defined team menu are implemented; original buy-menu
styling is pending. The scoreboard now uses the classic layout and Verdana glyphs; pixel-level comparison is still open. Hold **1** for the current team scoreboard; the installed SDK does not
expose Tab, which Bevy reserves for its map.
Money and equipment purchases are authoritative in shared rounds.
Remaining firearms, alternate fire modes, remaining spectator modes, weapon/footstep sounds,
advanced bot tactics, crouching, CS acceleration/friction/air control, and
finished character/weapon animations remain pending.

## Run locally

Use Node.js 22.18+ (tested with Node 24). The SDK and runtime are pinned to the
verified authoritative build; a caret range can select a build without these APIs.
Then:

```sh
npm install
npm run start -- --no-client --port 8004
```

Open a stock Bevy web client with:

```text
?realm=http%3A%2F%2Flocalhost%3A8004&position=0%2C0&isPreview=true&hud=0&guest=1
```

`hud=0` hides Bevy's surrounding interface; `guest=1` enters as a guest.
Click **Start game**, then click the scene to capture the mouse. WASD moves,
Shift walks, Space jumps, left mouse or E fires, **2** selects the primary,
**Shift+2** selects the pistol, and **Shift+3** selects the knife. With the knife,
left mouse swings and **F** stabs; with a gun, **F** reloads. Holding **1** shows scores. These are the current SDK bindings; final
CS key mapping is still pending. Escape releases the cursor to use the menu.
Avatar passport popups are disabled throughout the 12×12-parcel game area, so
clicking another player does not open their profile while shooting.
Only one encounter runs per realm in this prototype.

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
The current gate passes 115 tests plus the weapon, font, team-menu, radar, pain-compass, navigation,
bundle, and type checks.

Run the browser encounter regression with a dedicated browser CDP endpoint:

```sh
npm run test:game -- <browser-CDP-websocket> [evidence.json]
```

It uses the visible Start control and real mouse/keyboard events to
prove initial capture and click-to-recapture, then freeze blocks movement → three bot kills → scored victory → automatic next
round → scored defeat, including persistent kills/deaths. It assumes default
Bevy mouse sensitivity. A separate checkout is needed to isolate a second server:
different ports for the same checkout still share a multiplayer room identity.
The initial run passed in a separate headless Chromium browser with WebGPU enabled.

[Baseline evidence](validate/baseline/browser.json) and the
[baseline screenshot](validate/baseline/dust2.png) record the original prototype.
No editor or engine code is modified by this project.

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

The server now applies AK cadence (0.0955 s), reload time (2.45 s), standing/moving/
airborne spread, and range attenuation. Bot hit regions distinguish head, body,
and legs. Spread is randomized on the server; the client sends aim direction.
Server-confirmed impacts show the actual recoil/spread trajectory. Explicit trigger
release drives recovery, using the vanilla integer-accuracy compatibility branch.
Camera punch and the weapon fire animation now start locally in the firing frame.
Server recoil acknowledgements correct the prediction through a first-person virtual
camera. Mouse aim is stored separately, so the server applies recoil once and
pulling down compensates for it. The camera follows the player's position;
walking follows the view heading. Escape releases the cursor and left-click
recaptures it. Replies are aged from the original input time and pending shots
are replayed; a late reply does not kick the camera a second time. Corrections
blend over 50 ms. GoldSrc shared-seed parity remains unfinished. Mouse sensitivity
uses the measured default Bevy scale; CS sensitivity settings are still pending. See [mechanics research](docs/CS16-MECHANICS.md).

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

Run each encounter test against a fresh isolated server with the Start menu
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

The Start/team menu now keeps requesting an unlocked cursor whenever the canvas
captures the mouse while that menu is open. This fixes the intermittent state
where the buttons were visible but could not be clicked. The full-screen damage
flash also ignores pointer input. A focused browser reproduction is in
`validate/bot-avatars.mjs`.

## Classic team menu

The selection screen uses the original `Teammenu.res` 640×480 coordinates,
`CS_logo.tga` silhouette, `ClientScheme.res` colors/font tiers, and the exact
Dust II briefing. Widescreen viewports keep the source layout centered in a 4:3
area. **Practice with bots** is the one scene-specific extension; **Spectate**
keeps its original disabled presentation until spectator admission is added.

[Team-menu evidence](validate/game/team-menu/README.md) checks all visible labels,
panel and button coordinates at 800×450 and 1280×720, the original logo, the
practice action, and two-client auto-assign behavior. On an empty realm,
auto-assign places the first player on T and the second on CT, then starts freeze
time with the Glock-18 and USP loadouts.

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

Each shared round assigns one Terrorist the bomb. **4** selects C4, **2** selects
the primary weapon (Shift+2 selects the pistol), and **3** drops C4; these are SDK-supported substitutes for the original
5/1/G bindings. Hold left mouse while grounded inside A or B to plant for three
seconds. Releasing, switching, moving out of the zone, or leaving the ground
cancels progress. Planting and defusing block movement and rifle fire.

The original BSP trigger planes define both zones, including B's clipped corner.
A dropped bomb can be picked up by a living Terrorist by approaching it. Carrier
death/disconnect drops it at the last available position. Manual drops snap to
the floor and delay the former owner's pickup for one second; thrown-item physics
are not yet implemented.

A planted bomb has a 45-second fuse and hides the round timer. CT must face it,
remain grounded and in use range, and hold **E** for ten uninterrupted seconds.
CTs can buy a $200 defuse kit in their buy zone for a five-second defuse. E no longer fires the rifle in team mode; the
existing E-fire alias remains in the solo encounter.

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
[Sound provenance](asset-sources/c4/SOURCE.md). Bomb/view models and progress UI
remain placeholders; other weapons and advanced bot bomb tactics are still pending.

Solo rounds now rotate a bot bomb carrier and A/B destination. The carrier uses
the production Dust2 graph to reach the selected site and plant; another living
bot retrieves a dropped bomb, and living bots spread around an active planted
site. The server keeps the chosen objective stable through the round. The
[solo C4 browser evidence](validate/game/solo-bomb.json) records a bot traversing
to B, planting, and teammates moving into defensive positions.

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

In shared matches, press **Esc** in your team's spawn buy zone to open equipment
purchases, then click **Close** to resume aiming. Buying is available during freeze
and the first 90 seconds of live play. This is a temporary input/menu presentation;
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
Blast damage uses its separate reference armor calculation. Dropped kit pickup,
the remaining weapons, and grenades remain open.
The solo bot encounter still uses its original free loadout and fixed starting money.

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

Team rounds now start with the original USP/Glock magazines and two spare
magazines. The free AK remains only in solo practice. Buy weapons through the
spawn equipment menu: CT M4A1 $3100, T AK-47 $2500, USP $500, Glock-18 $400.
Switch with **2** (primary), **Shift+2** (pistol), and **Shift+3** (knife). Switching preserves ammo,
cancels the interrupted reload, and enforces the reference 0.75-second draw delay.
The server rejects delayed shots whose weapon revision no longer matches.

USP/Glock require a fresh press per shot (0.15-second minimum); rifles repeat
while held. Damage falloff, armor penetration, recoil, moving/airborne spread,
reload times, and movement speed come from each weapon's reference profile.
Prediction uses the same profile so a pistol cannot replay AK recoil. The current
USP and M4A1 are unsilenced and the Glock is semi-auto; silencers/burst mode,
other guns, weapon drops/pickup, and complete animation/sound fidelity remain open.
Both rifles currently share the AK proxy; pistols and the knife use simple mesh proxies.

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
Older team/C4 scripts now use default-pistol ammo and the current buy menu;
their earlier evidence records remain historical.

The [post-inventory solo regression](validate/game/inventory-solo.json) passed
three bot kills, scored victory, automatic respawn with restored health/ammo,
then a scored defeat retaining 3/1 kills/deaths. The current gate passes 84 tests,
asset integrity, bundling, and type checking.

## Death camera and spectating

Death starts with a 0.6-second fall from eye height to the CS 1.6 dead-view height
and an 80-degree roll. The view remains at the body until the original three-second
death window ends, then enters free chase. Team rounds follow a living teammate;
solo rounds follow a living bot. Move the mouse to orbit; click to select the next
target, or Shift+click for the previous one. Team targets must be connected,
alive, and eligible for the current round. The camera holds its last position
when no target is available. Respawning restores the player's own first-person
camera. Dead-player inputs cannot move, shoot, reload, or buy.

Team rounds use teammate-only spectating. The chase distance is 112 CS units at
the scene's physical scale; a map ray limits the camera distance with 0.15 m
clearance. First-person/roaming/map observer modes, the original observer menu,
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

## Classic scoreboard

Hold **1** to view the scoreboard. It opens automatically at match completion;
ordinary round wins display a separate message instead of opening the board.
The scoreboard uses the original 520×340 proportional panel, compact rows,
team-colored dividers, player counts, Score/Deaths/Latency columns, and a local
player highlight. Team scores and player kills/deaths come from shared state,
and each team's player rows remain sorted by kills, then fewer deaths.
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
spectators have no radar. Solo mode shows the radar without enemy bot markers.

The original `radar640.spr` supplies the background. SDK alpha blending differs
from the original additive rendering; exact blending, radio flashes and location
labels remain unfinished. Geometry and visibility rules have automated coverage
in `tests/radar.test.mjs`.

Three-player browser validation passed teammate rotation, enemy filtering,
dropped-C4 flashing/privacy, and death removal. See [radar evidence](validate/game/radar/README.md)
and the [rendered radar](validate/game/radar/teammate.png). The structural gate
passes 88 tests, asset checks and SDK build/typecheck.

## Bot navigation

Solo bots now stand on Dust2's sloping floor and move along a graph built from
the existing map collision triangles. They approach visible players, stop within
8 m to shoot, search the last seen position for up to eight seconds, and patrol
between A, B and T spawn when contact is lost. Walls gate sight and damage; the
server controls their position and movement speed. The three starting locations
and scored solo-round loop are preserved. The three server entities now render
as named `AvatarShape` NPCs, and Bevy derives their walking animation from those
position updates. [Rendered evidence](validate/game/bot-avatars/README.md) shows
all three in the live encounter.

The generated graph has 21,170 connected nodes at 0.5 m spacing, with a 0.3 m
clearance radius, 1.8 m standing height and 0.48 m maximum walking step. Both bomb
sites and all 40 original human spawns connect to it. Rebuild after changing the
map collision export:

```sh
python3 asset-sources/dust2/build_navigation.py
npm run validate
```

This is an initial bot navigation system, not original CS bot AI. Directional
vision, hearing, teammate avoidance, crouch/jump routes, advanced bomb tactics, and bot
alternate weapons and weapon animations remain unfinished. Bot AK firing now
uses the shared bullet, spread, recoil, ammunition and reload rules described
below; this does not establish original CS bot AI parity.

Navigation browser evidence is in [validate/game/navigation](validate/game/navigation/README.md).
The moving-bot build passed the full scored solo-round check. A separate route
observation tracked bots 83, 53 and 42 m from their starts; a bot reacquired the
player near T spawn after 19.5 seconds. That navigation build passed 93 tests plus asset, graph
integrity, bundle and type checks.

## Bot gunfire

Bots fire traced AK rounds at visible players. Shots use the same recoil,
movement/airborne spread, hit regions, distance damage and armor calculations as
player gunfire. Walls and other bots stop bullets; friendly fire is off. The
server owns each bot's independent 30/90 ammunition and 2.45-second reload. Empty
reserves stay empty. Losing sight releases the trigger, and reacquisition has a
short reaction delay. Each new round creates a fresh bot loadout.

Bots fire 2–5-round bursts based on range. The initial encounter retains its
6/7/8-second grace measured from spawn, including the three-second freeze.
These burst, reaction and aiming choices are scene AI settings, not recovered
CS bot behavior. The avatar shoots from its 1.4 m eye height; faithful CS
character models, held-weapon animation, advanced aiming and coordinated tactics remain unfinished.

Impact markers now appear at the traced bullet endpoint. Bot kills identify
the bot and AK in the kill feed. The [bot-combat evidence](validate/game/bot-combat/README.md)
records live health changes and the scored-round regression. Reload and armor
behavior have unit coverage; the live hit trace uses an unarmored player.

Confirmed hits now give the victim the original CS directional pain sprite,
amber above 25 health and red at critical health, plus hitgroup- and
armor-dependent camera punch and a locally generated impact sound. Bot and human
attacks use the same authoritative event with the attack origin and hit group;
the indicator ignores pointer input. [Rendered hit feedback](validate/game/damage-hit.png),
[pain sprite source](asset-sources/hud/SOURCE.md),
[sound source](asset-sources/player-feedback/SOURCE.md).

The rendered feedback capture uses an isolated test copy with bot shots spaced to
500 ms, because the production close-range burst can kill the player between two
full CRDT snapshots. Prepare that copy with
`node validate/prepare-damage-feedback.mjs /path/to/isolated-scene`, then pass
`--extended-hit-window` to `validate/death-spectator.mjs`. Damage, pain direction,
fade, and camera punch are unchanged by the capture fixture.

The bot-gun stage passed **99 tests**, asset/graph validation and SDK build/typecheck.
Its live round check passed player victory, reset and bot victory with stats
retained. An idle-player trace observed 35-point AK body hits about 100 ms apart
and the named bot/weapon kill feed.
