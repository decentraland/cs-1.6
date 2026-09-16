# CS 1.6 arsenal

The scene includes all 24 original firearms, the knife, HE, flashbangs and smoke. The existing rounds,
team scoreboard and authoritative economy remain the playable foundation.

- Pistols: Glock-18, USP, P228, Desert Eagle, Dual Elites, Five-SeveN.
- Shotguns: M3 and XM1014.
- SMGs: MAC-10, TMP, MP5, UMP45 and P90.
- Rifles: Galil, FAMAS, AK-47, M4A1, AUG and SG552.
- Snipers: Scout, AWP, G3SG1 and SG550.
- Machine gun: M249. Melee: knife, with swing/stab and backstab rules.

## Rules

`weapon-profiles.ts` holds each weapon's price, team, magazine/reserve capacity,
ammo caliber/pack price, damage, armor ratio, range falloff, cadence, reload time,
movement speed, and alternate mode. Values follow
[ReGameDLL_CS b0889847](https://github.com/rehlds/ReGameDLL_CS/tree/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls),
using original compatibility branches without REGAMEDLL_FIXES. Examples: AK $2500/36,
M4 $3100/32, AWP $4750/115, USP $500/34, Deagle $650/54. Damage is modified by range,
hit region, armor and weapon mode; it is not the same for every gun.

The server owns purchases, ammunition, reloads, mode changes and every hit.
Clients predict recoil and local effects; confirmations do not replay the camera kick.
Recoil profiles distinguish standing, moving and airborne firing. CS integer-division
accuracy behavior is retained, including M4A1. Crouch profiles exist in the formulas,
but no crouch state is advertised while the SDK lacks a crouching collider.

M4/USP silencers change their damage and spread, with 2/3-second action locks.
Glock burst mode repeats while fire is held, with a 0.5-second burst cycle. Its
follow-up bullets run on successive scene updates, matching the reference's
unguarded `ItemPostFrame` continuation rather than imposing 100 ms between them.
FAMAS preserves its 0.05/0.1-second continuation delays and 0.55-second burst cycle.
Glock semi-auto still requires a new press. Extra bullets do not repeat the first
bullet's recoil/accuracy update. [Burst rules and regression](CS16-BURST-FIRE.md).
AWP/Scout
cycle two zoom levels and leave/re-enter the scope across the bolt cycle. AUG/SG552
have one zoom level and slower scoped fire. G3SG1/SG550 have their own auto-sniper
spread recovery. Shotguns trace 9/6 separate pellets and insert one shell at
a time; loaded shells can interrupt the reload. Ammunition is shared by caliber
and retained when replacing a weapon with a different caliber. Empty magazine-fed
guns wait for trigger release before automatic reloading. M3 and XM1014 reload
from their empty-trigger path and can fire a newly inserted shell while held.
[Reload regression](../validate/game/empty-reload/README.md).

Bullets use each caliber's original penetration power/distance and the weapon's
impact count. Rifles/Deagle can pass a surface; AWP/Scout/G3SG1 have three impacts,
while SG550 has two. Material multipliers, repeated integer damage truncation and
remaining-range reduction follow FireBullets3. Shotgun pellets do not penetrate. Consecutive pellets on the same player accumulate before armor/health truncation; the final hit group sets armor coverage, as in MultiDamage. [Hit response](CS16-HIT-RESPONSE.md) documents the five damage groups, original voices and remaining proxy limits.
The original Dust2 point hull supplies solid regions and source material faces;
GoldSrc's ability to leave an initial solid region is preserved. A penetrating
bullet can damage a second player, while friendly damage remains disabled.
Standing avatar boxes and the scene's existing meter calibration still limit exact
GoldSrc hitbox parity.

Grenade pricing, throwing, damage/flash/smoke rules and original effects are documented in [CS16-GRENADES.md](CS16-GRENADES.md).

## Dropping and picking up weapons

Shift+2 drops the active firearm; knives and grenades cannot be dropped. The magazine and
silencer/burst mode stay with the gun, while manual drops retain reserve ammo on
the player. Buying a replacement drops the previous gun from that slot. The best remaining
weapon is selected before comparing the purchase's weight, so replacing a pistol
while carrying a rifle leaves that rifle selected. Passing
over a settled gun picks it up only when that slot is empty, regardless of the
buying team's restriction. Reserve ammo from death drops adds to the recipient's
caliber pool up to its original limit. Pickup auto-switch follows source weapon
weights, including empty firearms. Equipping a gun puts away the C4 and cancels
an active plant; holding the defuse key can continue defusing.

A death drops the highest-weight firearm with its magazine and reserve ammo,
even while the player holds a pistol or knife; remaining inventory is discarded.
Bots drop their actual remaining ammunition. Round starts remove ground weapons;
unclaimed drops also expire after the original five-minute item lifetime. The
server owns box contents, motion, proximity checks and removal, so two players
cannot receive the same gun. Defuse kits drop separately, including when the owner dies from a fall or C4.
Living CTs without a kit can recover them for free; the original sound and green
status icon confirm collection. See [equipment rules](CS16-DEFUSE-KITS.md).
The ground models use the original `w_*.mdl` assets,
separate from the hand-attached models.

Manual tosses use the original 400-unit/s speed and body pitch (minus one third
of view pitch), including the vertical spawn offset. Looking down gives a slight
upward throw. C4 shares this motion and grounded touch logic; see the
[C4 toss regression](../validate/game/c4-toss/README.md).

Drop/pickup rules follow `DropPlayerItem`, `PackDeadPlayerItems` and `CWeaponBox::Touch`
in the pinned ReGameDLL source. Toss gravity and floor/wall clipping follow
[ReHLDS SV_Physics_Toss](https://github.com/rehlds/ReHLDS/blob/6266cd23faee4a6e9cf3974f9605b2cadd86f0a4/rehlds/engine/sv_phys.cpp).
The scene uses fixed substeps and its existing meter/standing-avatar calibration;
GoldSrc player collision and the native G key still differ in this SDK integration.

## Rendering and input

The approved GameBanana viewmodels retain every original animation and texture.
Aliases of non-looping tracks let identical animations restart through CRDT without
a delayed reset frame. All clips are registered with Animator; only the selected
weapon is visible. Reload animation time is matched to the authoritative reload
window, including source sound events. First-person weapons have no collider.
The original third-person models total 3,325 triangles for the whole roster.
Dual Elites use two original 104-triangle models, each relative to its source hand
bone and attached to the corresponding avatar hand. Switching or death hides both;
despawning removes both attachments. Bot held models follow their equipped weapon
component. [Model review and reproduction](../validate/game/dual-hands/README.md)
records the Blender geometry audit and Bevy checks. Decentraland character poses
and open-hand animations still differ from the original CS character rig.

E switches the selected weapon's alternate mode, F reloads (or stabs with the knife),
1/2/3 select primary/pistol/knife, Shift+2 drops the active gun, Shift+3 cycles grenades, and Shift walks. Near the planted bomb, holding E
keeps its defuse action. These are SDK-exposed controls; native CS right-click/R/Tab
bindings are not available in this client integration.

The hosted Bevy preview checked September 15 serves `0cfd373` (August 27),
which predates the VirtualCamera.fov support merged in
[#1231](https://github.com/decentraland/bevy-explorer/pull/1231).
[Hosted rollout issue #1268](https://github.com/decentraland/bevy-explorer/issues/1268)
tracks the missing deployment. Scoped views currently use its upstream
TextureCamera/CameraLayer components instead. The same published protocol build used
by dcl-editor is installed as `@dcl/bevy-protocol`; a small adapter registers only those
two camera bindings in the existing authoritative SDK. The active scoped weapon warms
its render target during draw. Other guns and spectating release the texture target.
The scene keeps the normal VirtualCamera for movement and recoil; this requires no
engine patch. Scope FOV uses GoldSrc's horizontal-at-4:3 convention converted to
vertical radians. Scoped mouse sensitivity scales with FOV and ratio 1.2.

Closing a desktop menu consumes the pointer-capture click until release; the next
intentional click fires immediately. During development, close the preview before
rebuilding a scoped scene: the current official Bevy build was observed to panic
on a live reload while its directional-light texture camera was active. A fresh
browser process recovers; no engine patch is included.

## Validation

Run `npm run validate`. The gate includes the weapon and hit-response regressions; penetration coverage includes material damage, impact limits, traces starting inside walls, multiple targets, and actual Dust2 mid-door shots. `tests/arsenal.test.mjs` checks all prices/team restrictions,
shared ammo, modes, zoom, burst timing, shell reload interruption, pellet counts,
and prediction/authority agreement for every gun. `validate/cs16-weapons.mjs` checks
all viewmodel topology, source hashes, rigid skin weights, pixel-identical palette
textures, complete bone channels, original animation timing and repeat aliases. It also checks all 28 gun/knife/grenade held weapons (29 hand models) and 175 original media/source hashes. The additional [C4 gate](CS16-C4.md) verifies its view, held, planted and backpack models, source animation timings, click audio and sprites.
`validate/dropped-assets.mjs` checks all 24 gun ground models and the defuse kit (3,125 triangles total),
their source hashes, embedded palette pixels, bounds and topology.

The isolated browser review uses the production source with a separate multiplayer
identity, $16000 and an initial AWP, with bot actions paused, a one-hour round, purchases available throughout the round, and funds restored after each purchase. This fixture is for
asset/weapon verification; it is not evidence for unmodified match balance. All 24 firearms and the knife passed the headless review, including firing/reload playback, silencer/burst modes and AWP magnification/bolt cycling. See [the arsenal captures and fixture](../validate/game/arsenal/README.md) and [drop/pickup checks](../validate/game/pickups/README.md).

[Desktop movement](CS16-MOVEMENT.md) now applies CS acceleration, friction, air
control, gravity, jump fatigue and server-confirmed velocity flinch through Bevy's
collision solver. Bots now share the grounded movement and flinch rules; [their collision and AI limits](CS16-BOT-MOVEMENT.md), crouch and exact GoldSrc collision remain open.

## Remaining parity gaps

The scene is not an exact replacement for the GoldSrc engine. Shield/nightvision, original character hitboxes/animations,
crouching, native key bindings and precise
HUD comparison remain open. Map scale and standing avatar hit regions are inherited
from the prototype. Bevy's surrounding UI and native center cursor can still be
visible. Touch currently uses the explorer's own camera, without the desktop scope
rendering adapter.
Asset provenance is preserved; converting original game assets does not grant
redistribution or publication rights.
