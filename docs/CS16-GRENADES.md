# CS 1.6 grenades

HE, flashbang and smoke are server-owned inventory items with original view/held/thrown models. Buy them under **Equipment**, then use **Shift+3** to cycle Flash → HE → Smoke. Hold the left mouse button to pull the pin and release it to throw. They cannot be dropped with the firearm-drop key.

| Grenade | Price | Maximum carried | Equipped speed |
| --- | ---: | ---: | ---: |
| HE | $300 | 1 | 6.25 m/s |
| Flashbang | $200 | 2 | 6.25 m/s |
| Smoke | $300 | 1 | 6.25 m/s |

Purchases use the existing team buy zones, buy period, live-player checks and replay protection. Spending fails without enough money or inventory space. Buying a grenade preserves the higher-weight equipped firearm or C4. Remaining grenades survive a round if the player survives. Death discards unprimed grenades; an active grenade held with fire pressed drops with a fresh fuse. C4 deaths now also drop the victim's best firearm.

## Gameplay source

Rules were checked against the original compatibility branches of [ReGameDLL_CS b0889847](https://github.com/rehlds/ReGameDLL_CS/tree/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls), particularly `wpn_shared/wpn_*grenade.cpp`, `wpn_flashbang.cpp`, `ggrenade.cpp`, `combat.cpp`, `basemonster.cpp`, `player.cpp` and `weapontype.h`.

- Pulling the pin waits at least 0.5 seconds before release. Holding indefinitely does **not** cook the grenade. Switching weapons cancels the pin action. Throwing starts the 1.5-second fuse; the source's 0.1-second think/detonate scheduling makes the visible explosion occur slightly later. Smoke waits to touch ground before activating.
- The throw uses corrected camera pitch, source velocity capped at 750 units/s, a 16-unit eye offset and inherited player velocity. Gravity is 440 units/s² for HE and 400 for flash/smoke; friction is 0.7/0.8. The scene's existing calibration is 0.025 m per source unit. Floor/wall bounces use the original Dust2 point hull and fixed 100 Hz steps based on [ReHLDS SV_Physics_Bounce](https://github.com/rehlds/ReHLDS/blob/6266cd23faee4a6e9cf3974f9605b2cadd86f0a4/rehlds/engine/sv_phys.cpp).
- HE starts at 100 damage and falls linearly to zero at 350 units (8.75 m). CS 1.6 HE damage passes walls. It damages its owner, uses grenade armor rules, and does not damage other teammates with this scene's friendly-fire setting. Damage, armor, deaths and kill credit are authoritative.
- A flash covers 1,500 units (37.5 m), with forward and reverse visibility traces. Facing the source uses alpha 255, fade `strength × 3`, hold `strength / 1.5`; facing away uses alpha 200, fade `strength × 1.75`, hold `strength / 3.5`. Strength falls linearly from 4 to 0 with distance. Stronger active flashes are retained when effects overlap. Bot blindness uses `fade × 0.33`, as in the source; the human whiteout includes the full hold/fade.
- Flashbangs retire to another weapon after a throw even when a second flash remains. Exhausted HE/smoke also retire. Selection follows source weapon weights and excludes the item being retired.
- Smoke blocks bot sight through a 115-unit sphere when more than 70% of that radius is crossed. The source's endpoint cases are preserved. The canister emits for 21.1 seconds, bot visibility blocking lingers four more seconds, and visible smoke lasts up to 30 seconds. New rounds remove projectiles, clouds and whiteouts.

## Models and effects

The three `fixed_v_*.mdl` files are from the approved [GameBanana pack](https://gamebanana.com/mods/227246). Each viewmodel has 844 triangles, source textures, its original rig and idle/pin/throw/deploy clips. Original `p_` models add 52 triangles each; animated `w_` models add 40 each with seven roll/toss/idle clips. Blender conversion preserves original palette pixels and frame timing. View animation and pin-pull audio begin locally; server acknowledgments do not replay the predicted animation.

Pinned original models, sounds, HUD definitions and sprites come from [CS-Server 6ad155c7](https://github.com/u3games/CS-Server/tree/6ad155c7a610a85cfd443fcace2c97f2afcb2866/server). Their 31 URLs/hashes are recorded in `asset-sources/cs16-weapons/grenades/sources.json`. HE uses `fexplo`/`eexplo` fireballs and `steam1` aftermath; smoke uses `gas_puff_01` and four animated black-smoke sprites. All bounce/explosion sounds are positional.

The smoke presentation follows [cs16-client 9c891b8e](https://github.com/Velaron/cs16-client/blob/9c891b8ebeb5ff0b84e00af769c2f5e35a0280be/cl_dll/events/event_createsmoke.cpp), an open client reconstruction, rather than a claim of pixel-exact Valve-client rendering. Twenty large cloud sprites use the source positions, scale and slow drift. Their planes share the camera axes (`VP_PARALLEL`); per-position SDK billboards produced intersecting triangular seams inside the smoke, so these sprites copy the camera rotation directly. Alpha stays full for 15 seconds, then decreases by 18/255 per second until removal at 30 seconds. `convert_sprites.py` preserves alpha-indexed sprite pixels and converts additive sprite pixels to an alpha-blended approximation.

## Verification and limits

Run `npm run validate`. `tests/grenades.test.mjs` covers prices/caps, selection weights, no cooking, flash retirement, pitch/speed/inherited velocity, floor settling, HE falloff, facing/stacked flash rules, smoke geometry/timings and death inventory. `validate/grenade-assets.mjs` checks all three projectile rigs/clips, nine sprite atlases against every original palette pixel, and 31 original source hashes. Existing model validation covers the three new view/held models too.

The browser fixture and captures are in [grenade evidence](../validate/game/grenades/README.md). The fixture raises starting funds, provides an AWP, pauses bots and extends the buy/round periods. It preserves purchase deductions and grenade mechanics. Those controlled checks do not establish full match or moving-bot parity.

Remaining differences: SDK avatar standing boxes replace GoldSrc character collision; water physics are not modeled; position samples approximate inherited player velocity; pinned grenades fall without reproducing GoldSrc's accidental use of body-angle numbers as death-throw velocity. Smoke wind/secondary wisps and explosion aftermath are approximations. SDK materials expose alpha blending, not GoldSrc's additive blend mode; dynamic explosion lights, scorch decals and sparks are not included. Flashing does not cover Bevy's surrounding browser UI. Bots react to grenades but do not buy or throw them yet. Native grenade-slot keys remain unavailable in the current SDK integration.
