# Nightvision

Buy nightvision for $1250 from Equipment on either team. Owned goggles disable
repeat purchases. Buying uses the same alive/team/buy-zone/time and money checks
as armor. The server owns purchase and toggle state; the goggles icon sends only
an intent with round and sequence. Toggle cooldown is 0.3 seconds.

Survivors keep goggles into the next round, with the effect switched off. A new
life after death starts without them. Death, spectator admission, stale client
state or match end disables the effect. The current observer camera is chase,
so it does not inherit a target's nightvision; source observer inheritance is
for the still-unimplemented in-eye view.

Mobile uses a goggles icon beside BUY; desktop has a goggles button next to BUY
(release the cursor to click it). Neither control shares a FIRE action or changes
the camera, so the native touch-look path is preserved.

The local presentation uses the reference green overlay (50,225,50,110), plus
one green point light at the player's feet, radius 18.75–20 m at the scene's
0.025 m/HU scale. It is not replicated to other players. The overlay ignores
pointers and sits below the HUD and flashbang fade. Disabling removes the light.
The SDK intensity is 5000 candela: GoldSrc radius lighting has no exact physical
candela equivalent. Native mobile lighting still requires a device check.
While goggles are on, plus/minus icon buttons adjust the overlay alpha by 20,
clamped to 30–220, starting at 110. This follows the pinned client reference's
`nvgadjustup` / `nvgadjustdown` commands. The light's radius and intensity do not
change. Brightness is a local client preference retained across toggles and
respawns, and it sends no server or weapon messages. Buttons disappear when the
effect is off or a menu is open. Mobile places them beside goggles in landscape
and below the top controls in portrait; desktop places them next to goggles.
Exact cross-engine visual parity still requires comparison on each renderer.

Three original mono WAVs (equip, on, off) come from the previously approved
CS-Server source pinned in `asset-sources/nightvision/sounds.json`. Item audio has
its own emitter channel so toggling goggles cannot cut off a pain/death voice.
The new goggles icon ships as editable SVG and a 128×128 transparent PNG.

References:

- [ReGameDLL purchase and toggle rules](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/client.cpp).
- [Player death/spawn handling](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/player.cpp).
- [Client overlay/light defaults](https://github.com/Velaron/cs16-client/blob/2d125db28d2c043fd0730c9970066d845574dbb0/cl_dll/hud/nvg.cpp).

Run `npm run validate`. `tests/nightvision.test.mjs` exercises both teams' money,
duplicates and restrictions; the production server handler's cooldown, replay,
round and life guards; client light reuse/cleanup, brightness bounds/persistence and menu gating; the actual
buy/icon callbacks; and desktop armor quote values ($350/$650/$1000). The old
armor panel fails that last regression. Native device behavior is not established
by these tests.

The 2026-09-21 isolated headless Bevy check passed purchase, duplicate prevention
and on/off rendering. See [screenshots and reproduction](../validate/game/nightvision/README.md).
This uses the mobile scene layout in a desktop renderer; native phone lighting
and simultaneous touch input remain unverified.

The HUD now renders the tint once, below its labels and icons. Earlier nightvision
captures predate removal of a duplicate overlay; their purchase/light checks still
apply, but their stronger tint is not the current presentation.

The brightness regression clicks production mobile and desktop icon handlers,
reads the actual overlay color, checks the reference limits, and verifies no
combat/toggle messages or equipment mutations occur. Safe-area checks include
active brightness buttons beside scope, defuse, C4 and the other mobile controls.

On 2026-09-22, a fresh isolated headless Bevy check verified brightness changes
110 → 130 → 110 through actual pointer clicks, purchase guards, light cleanup,
and portrait/landscape layout. [Captures and reproduction](../validate/game/nightvision-brightness/README.md).
