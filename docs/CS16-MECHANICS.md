# CS 1.6 firing and movement reference

Target: original CS 1.6 compatibility behavior, not CS2 spray patterns. Reference
revision: ReGameDLL_CS `b0889847fe6d03898be88acc9e366660efb40ab5`.
ReGameDLL is a reverse-engineered implementation, so tests against an actual
CS 1.6 client remain necessary before claiming parity.

## AK firing

There are two different effects: punch angles move the firing direction upward
and sideways, while random spread scatters individual bullets around that
recoiling direction. Counter-aiming can compensate for punch, but cannot remove
random spread. Each weapon needs its own profile.

The AK fires every 0.0955 seconds. Spread is based on the accuracy value from
before the shot. Grounded at <=140 units/s it is `0.0275 * accuracy`; above that
speed it is `0.04 + 0.07 * accuracy`; airborne it is `0.04 + 0.4 * accuracy`.
Each spread axis adds two independent samples from [-0.5, 0.5].

After firing, accuracy becomes `min(1.25, floor(shots^3 / 200) + 0.35)` in the
original integer-division compatibility branch. The optional ReGameDLL_FIXES
branch uses floating division instead. Deploy/reload initialize accuracy to 0.2.
The implementation deliberately follows the compatibility branch. It does not
grant three perfectly accurate opening bullets.

Release caps the shot count at 15 and starts a 0.4-second recovery delay; afterward
one shot is removed every 0.0225 seconds. Vanilla does not reset the stored
accuracy just because the counter reaches zero; a later shot recomputes it.
The scene now sends explicit trigger transitions instead of estimating release
from gaps between network shot requests.

[AK implementation](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_ak47.cpp),
[constants](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapons.h),
[release recovery and KickBack](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapons.cpp),
[bullet sampling](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/cbase.cpp).

## Recoil and movement

AK kick profiles use upward/lateral base, per-shot increase, limits, and a random
chance to change sideways direction. Standing uses 1.0/0.375 base kick; moving
uses 1.5/0.45. Walking still counts as moving for recoil even when it is below the
spread-speed threshold. The branch order checks horizontal movement before the
airborne/crouched profiles; preserve that ordering. Crouching is not yet available
through the current movement controller.

Punch magnitude decays by `(10 + magnitude * 0.5) * dt`; the scene samples this at
100 Hz independent of request cadence. Shots use the decayed punch before the
new shot adds its kick. Lateral direction changes use the profile's random chance.

The configured AK movement cap is 221 units/s, with an initial meter conversion
of 0.025 m/unit and a provisional Shift multiplier of 0.52. This puts configured
walking below the AK's 140-unit spread threshold. Verify actual movement in the
browser; receiving Shift does not itself authorize better server-side accuracy.
[Movement and punch decay](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/pm_shared/pm_shared.cpp).

## Current limits and acceptance checks

Implemented: server-owned cadence, magazine/reload, speed/airborne spread,
punch-driven bullet trajectory, explicit trigger release, range damage, shared
bot/human hit-region queries, and authoritative bullet impact feedback. Random samples use the server
a shared per-round seed: the server picks it, sends it on spawn, and both sides derive each shot's stream from `seed + shotId` (`shared-random.ts`), so client prediction reproduces the server's kick flips and spread samples. GoldSrc only shares the seed for pistols and lets the client choose it; here every gun shares it and the server chooses it.

**Camera punch.** The live view is a scene-driven `VirtualCamera` at 1.6 m eye
height (`fps-camera.ts`), aimed from `PrimaryPointerInfo.screenDelta`. The
predicted recoil punch (`getViewPunch`) and victim pain punch (`getPainPunch`)
rotate that camera as in GoldSrc, so pulling the mouse down counters the punch;
the weapon viewmodel adds a quarter-strength tilt on top. Shot requests send the
mouse aim alone and the server applies its authoritative punch to each shot
once. The virtual camera follows the avatar transform one frame late, so the
client hides its own avatar with a local hide-avatars `AvatarModifierArea`
(every other player and bot excluded) instead of using the engine's first-person
camera, which the scene cannot rotate. Remaining gaps versus CS 1.6 are the
sensitivity/FOV settings, not view handling.

Viewmodel tilt and weapon animation still respond to local input before server
feedback. Acknowledgements are mapped back to their original local shot time,
then later predicted shots and trigger/reload events are replayed. A 50 ms
correction blend avoids snapping. Duplicate, stale-round, and reordered replies
cannot replay a kick. Server-rejected shots are removed from the prediction.
Round/shot IDs reject outdated feedback, and the SDK event bus accepts server
events only, so other clients cannot inject kicks.

The client predicts the current lateral kick direction; the server supplies its
random direction changes. This is responsive presentation with reconciliation,
reproduced on the client through the shared per-round seed. Matching CS sensitivity/FOV still needs work. The
the browser checks of visible camera kick/recovery (`validate/camera.mjs`) were
rewritten to read the viewmodel during a brief engine-camera experiment and have
not been re-run since the `VirtualCamera` view returned.

The SDK maintainer confirmed that native crouch hulls, acceleration, friction,
and gravity are not configurable through AvatarLocomotionSettings. Its supported
controls are movement/gliding speeds, jump heights, falling-speed limits while
gliding, and the hard-landing cooldown. Exact counter-strafing and air acceleration
remain unimplemented. Penetration remains open. Weapon switching and knife
combat are implemented; the remaining weapon presets have not yet received this reference pass.

Validation matrix: 30-round standing spray, moving spray, Shift-walking spray,
release-and-refire before/after 0.4 seconds, jump shooting, reload, and
counter-aiming. Tests cover the reference scalar values, vanilla accuracy change,
recoil limits/direction change, release recovery, and head/body/leg range damage.
Browser checks must additionally cover real movement, visible bullet impacts,
and complete scored rounds. See `validate/game.mjs`.

## Frame and network timing

Client firing retains fractional frame time between requests. Server arrival
jitter previously rejected valid shots just before the cooldown ended. Requests
up to 50 ms early now wait for the existing cadence deadline, with one pending
request per player. The shot is authorized and ammunition consumed only when the
server executes it. Logical firing deadlines preserve the configured interval
across server ticks; old deadlines are discarded after long stalls. The server
still checks current health, phase, reload state, and ammo at execution time.
An intervening trigger release remains released after a deferred shot executes.

The latest full-magazine browser check with local recoil prediction observed
3.178 s between the first sampled ammo decrease and the empty magazine, against
a reference first-to-last shot interval of 29 × 0.0955 = 2.7695 s. HUD/network
sampling misses individual shots. All 30 rounds, automatic reload, and recoil
recovery passed; exact firing-rate and GoldSrc prediction parity remain open. See `validate/cadence.mjs` and
`validate/game/cadence.json`.

## Shared player ballistics

`ballistics.ts` resolves all player-fired AK rounds. The server constructs the
origin from observed avatar feet plus 1.6 m, applies the shooter's own stored
punch and spread, then selects the nearest target region before map geometry.
`playerShoot` carries the client's own eye position, horizontal speed, grounded
flag and, when its local trace hit someone, that target and the target position it
saw. The server does not rewind: avatar positions and scene messages arrive on
different channels with different latency, so a timestamp rewind would not match
what the client saw. Instead `hit-claims.ts` accepts each value only if it is
within 1 m of a position the server sampled for that shooter/target in the last
second (speed within 2 m/s of the server's estimate; "grounded" only when the
server cannot see the shooter clearly airborne), then re-runs the deterministic
trace itself from the accepted origin with the claimed target box at the accepted
position. Rejected values fall back to the server's own samples. Misses still
consume an accepted round. The same resolver runs for bots.

Humans and bots share one standing-avatar hit box set (head at 1.6 m, body at
1.05 m, legs at 0.325 m above the feet); bots used to carry a lower head box that
sat at the neck. They do not reproduce model-specific CS hitboxes or crouch
geometry. Armor/helmet behavior is implemented for the current AK and bomb damage
paths.
Every round is a T/CT match; a side with no connected human is filled with three
bots, and shots are resolved against humans and bots through the same targets
list. Do not infer complete PvP from passing geometric hit tests.

## Walking crosshair feedback

The HUD samples horizontal displacement over at least 100 ms and uses the same
walking-modifier state as locomotion. Walking suppresses the running expansion
floor, including W+D transitions, while firing expansion still recovers normally.
The server continues to use observed physical speed for weapon accuracy; a client
walking flag does not grant a smaller server spread.

## Victim hit feedback

The authoritative damage result for both human and bot attacks includes the shot
origin, hit group, and server-computed victim punch. The client uses the original
four-frame `640_pain.spr` art and GoldSrc's front/right/rear/left dot products,
0.4 display threshold, two-units-per-second fade, and all-directions behavior for
attacks within 50 source units. The sprites are amber above 25 health and red at
25 health or below, matching the original
[health HUD](https://github.com/ValveSoftware/halflife/blob/master/cl_dll/health.cpp)
layout and color rule.

Victim punch follows ReGameDLL's
[player trace handling](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/player.cpp)
for unarmored hits: head pitch is half damage capped at 12 degrees with random
roll capped at 9 degrees; body pitch is one tenth damage capped at 4 degrees;
leg and armor-protected hits do not punch. It decays with the same GoldSrc punch
formula used for weapon recoil. The punch rotates the live `VirtualCamera`
(`getPainPunch`) with a subtle viewmodel tilt, and it never changes the aim
direction sent with later shots. The generated local impact sound restarts on every confirmed hit. The
scene's combined body region approximates the original chest, stomach, and arm
hitgroups, and victim punch is visual rather than part of the server's
next-shot direction.

## Bomb objective

The same pinned ReGameDLL revision supplies the objective reference:
[C4 arming](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_c4.cpp),
[grenade/defuse/beep behavior](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/ggrenade.cpp),
[round resolution](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/multiplay_gamerules.cpp),
[default fuse cvar](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/game.cpp),
[arming constant](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapons.h).

Planting takes 3 seconds; `mp_c4timer` defaults to 45. Defuse takes 10 seconds
without a kit and 5 with one. Held-use messages expire after 350 ms in the scene
so a lost release cannot finish an unattended action. This networking grace is
scene-specific, not an assertion of original prediction parity. Plant/defuse
movement is blocked through the supported locomotion API.

Use range is 64 source units measured from the standing hull center; the aim
cone starts at the eyes. As in the compatibility use path, no extra wall ray is
required for the use action. The scene uses a 0.96 m hull-center offset for this
range check and its existing 1.6 m camera eye height. Trigger overlap uses the
map's transformed original brush planes and a standing proxy hull; crouching
and a complete original collision hull are still pending.

Bomb blast uses the reference `CBaseMonster::RadiusDamage` path: 500 damage,
linear falloff, radius 500 × 3.5 source units, mapped with the map scale 2/75.
Sources: [wrapper](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/basemonster.cpp),
[falloff](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/combat.cpp).
Armor, water, breakable objects, and exact blast-origin displacement are not yet
modeled. On a completed defuse, the pinned ReGameDLL source gives the defuser
three frags; when the C4 explodes, it gives the planter three. The plant event
itself gives no frags. The authoritative scene applies these awards once to the
human or solo-bot scoreboard row. Sources: [defuse award](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/ggrenade.cpp#L1144-L1156),
[explosion award](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/ggrenade.cpp#L1530-L1544).

After planting, ordinary round timeout and T elimination cannot award CT a win.
CT elimination still awards T. A completed earlier defuse wins even if observed
on a delayed tick; an exact fuse/defuse tie explodes. This explicit ordering
avoids the compatibility source's same-tick scheduling ambiguity.

When bots fill the Terrorist side they select alternating A/B objectives and
rotate the carrier. The carrier routes to the chosen site and plants after the
same uninterrupted three seconds; the nearest living bot retrieves a dropped
bomb, and survivors take stable defensive positions around a planted site. When
bots fill the CT side they route to a planted bomb and, within 1.2 m of it with
no enemy visible, hold the same server-owned defuse as a human without a kit.
These are scene tactics built on the production navigation graph, not recovered
CS bot AI.

## Economy and armor

Reference pin remains `b0889847fe6d03898be88acc9e366660efb40ab5`.
[`gamerules.h`](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/gamerules.h)
defines reward constants; [`multiplay_gamerules.cpp`](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/multiplay_gamerules.cpp)
shows round-start payouts, loss-history changes, bomb-outcome awards and timeout
exclusion. The initial loss series reaches 3400 because the code checks the 3000
threshold before adding 500; breaking a multi-round streak resets the shared
bonus to 1500. The scene models that behavior rather than a modern CS economy.

[`client.cpp`](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/client.cpp)
and [`weapontype.h`](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapontype.h)
define equipment/upgrade/ammo costs and eligibility. The scene uses the original
`func_buyzone` brushes *29 (CT) and *30 (T), converted with the existing map
transform. `mp_buytime` defaults to 1.5 minutes; the scene permits freeze buys and
90 seconds from live start. Esc substitutes for the unavailable B binding.

[`player.cpp`](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/player.cpp)
uses body protection plus helmet-only head coverage, with no leg protection.
AK health ratio is 0.5×1.55 and armor consumption is half the prevented damage.
Explosion damage uses ratio 0.5; exhausted armor subtracts its remaining value
from blast damage, compared with twice its remaining value for bullets. The
scene preserves fractional armor but rounds applied damage to integer health.
Dropped kit pickup and the original buy UI remain required for full
economy/inventory parity; default pistols and weapon purchases are implemented.

## Starting pistols and primary inventory

The same pinned source supplies [USP](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_usp.cpp),
[Glock-18](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_glock18.cpp),
and [M4A1](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_m4a1.cpp)
firing formulas. `weapons.h` defines profile damage/range/speed/reload constants;
`weapontype.h` defines clips, ammo packs/caps/prices. `GiveDefaultItems` in
`player.cpp` supplies USP+24 reserve for CT and Glock+40 reserve for T.

USP cycle 0.225−0.075 and Glock semi-auto cycle 0.2−0.05 both yield 0.15 seconds.
Both allow one shot per press and update accuracy from the interval since the
previous shot. USP adds two degrees of vertical punch; Glock's ordinary fire
path does not add server punch. M4 accuracy divides the cubic shot count by
220.0 (floating point), unlike the compatibility AK integer division. Prediction
and server tracing share these profile operations. The generic default deploy
in [weapons.cpp](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapons.cpp)
sets a 0.75-second attack delay.

Inventory is server-owned and snapshots the outgoing magazine/reserve when
switching. Shots include an equipped-weapon revision, rechecked when a buffered
shot executes. Equipment requests share the existing zone/time/funds/sequence
validation. Current implementations are unsilenced USP/M4A1 and semi-auto Glock;
alternate modes, other weapons and dropped weapon pickup are still open.

C4 planting now redeploys the held gun through the same inventory path, preserving
ammo and applying its draw delay. The reference [C4 implementation](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_c4.cpp)
retires C4 after planting. The inventory browser regression checks that releasing
the planting button on completion does not accidentally fire a pistol shot.

## Knife attacks

The pinned [knife implementation](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_knife.cpp)
and [knife constants](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapons.h#L1176-L1185)
set a 250-unit movement cap, a 48-unit primary reach, and a 32-unit stab reach.
With the scene's 0.025 m/unit conversion these are 1.2 m and 0.8 m. The first or
paused primary hit deals 20 damage; a chained hit deals 15. Primary miss/contact
cooldowns are 0.35/0.4 seconds and lock the stab for 0.5 seconds. Stabs deal 65,
miss/contact cooldowns are 1.0/1.1 seconds, and a horizontal facing dot product
above 0.8 triples damage from behind.

Knife traces run on the authoritative server against the same human/bot hit
regions and Dust2 occlusion used by firearms. Stationary avatar body transforms
do not track camera yaw in this Bevy build, so each client sends a normalized
horizontal facing direction; the server validates and stores it for rear-stab
classification, using the avatar transform as a fallback. The pinned
[player armor path](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/player.cpp#L1185-L1223)
combines the knife's 0.5 base armor ratio with its 1.7 weapon multiplier, producing
the implemented 0.85 ratio.

**3** equips the implicit knife (**1** primary, **2** pistol, as in CS 1.6). Left
mouse swings. Bevy reserves right mouse for camera lock and does not expose it to
this scene, so **F** currently performs the stab; with a gun the same key reloads. The first-person knife is a geometry proxy pending the asset
pass. The two-client browser regression verifies range rejection, 20→15 chained
damage, a 65-damage frontal stab, a 195-damage rear stab, Knife kill feed credit,
and two scoreboard kills in `validate/game/knife.json`.

## Death camera and chase spectator

The pinned [observer implementation](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/observer.cpp)
uses attack/attack2 to advance/reverse the followed player, throttles target
selection to 0.25 seconds, and supports force-camera team restrictions. This
scene chooses teammate-only free chase over human teammates, falling back to
living bots when no human teammate is available, with Shift+click as the
reverse-input substitute. The [GoldSrc client view implementation](https://github.com/ValveSoftware/halflife/blob/master/cl_dll/view.cpp)
registers a default chase distance of 112 units and uses player mouse angles in
free-chase mode. Here that distance is scaled to 2.8 metres and limited by the
production map ray with 0.15 m clearance. This is not a full engine hull trace.

Current target filtering additionally requires admission to the current round.
Dead input remains disabled. The same `VirtualCamera` serves the live view, the
death fall, and the chase cam.
The [player death flow](https://raw.githubusercontent.com/rehlds/ReGameDLL_CS/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/player.cpp)
uses a three-second dying window before the observer camera. The scene holds that
window and reproduces the GoldSrc dead-view 80-degree roll, with a smooth 0.6-second
fall to the 28-unit eye height. A rendered body death animation, full observer UI,
other observer modes, and complete collision/smoothing behavior still require
implementation.

Bot AK shots now invoke the same resolver and weapon profile as player shots,
with the proxy bot's 1.4 m eye origin. Their state owns its ammunition, recoil,
burst release and reload timing. The AI uses scene-defined range-based bursts;
these are not claims of original CS bot behavior. CT bots
use the M4A1 profile. Skill levels (`bot-difficulty.ts`) take ReactionTime,
AttackDelay and Skill from the CS 1.6 bot's `BotProfile.db` templates that
`bot_difficulty` 0-3 selects (Easy 0/1.0/3.0, Normal 50/0.6/1.0, Hard 75/0.4/0,
Expert 90/0.3/0; the scene uses 0.35 s for Expert). Sighting starts the reaction
timer, the attack delay follows before the first burst, and each shot's aim is
offset by up to `(1 - skill/100) * 0.12` rad per axis, a scene-defined mapping of
the template's Skill. Sight range (28 m) and burst pauses do not vary by level. Movement heuristics (roaming, holds, strafing, reload
retreats, callouts) are likewise scene-defined; only the 52% shift-walk ratio
comes from CS 1.6.
