# CS 1.6 HUD sprite source

The HUD atlas preserves the bitmap digits and icons in `640hud7.spr`.
The sprite and coordinate tables were obtained from the CS-Server mirror at
revision `6ad155c7a610a85cfd443fcace2c97f2afcb2866`:

- [Sprite](https://github.com/u3games/CS-Server/blob/6ad155c7a610a85cfd443fcace2c97f2afcb2866/server/cstrike/sprites/640hud7.spr)
- [HUD rectangles](https://github.com/u3games/CS-Server/blob/6ad155c7a610a85cfd443fcace2c97f2afcb2866/server/cstrike/sprites/hud.txt)
- [AK icon selection](https://github.com/u3games/CS-Server/blob/6ad155c7a610a85cfd443fcace2c97f2afcb2866/server/cstrike/sprites/weapon_ak47.txt)
- [Pain compass](https://github.com/u3games/CS-Server/blob/6ad155c7a610a85cfd443fcace2c97f2afcb2866/server/valve/sprites/640_pain.spr)

These are original Valve game assets. The mirror does not establish a
redistribution license; no Creative Commons or project-code license is asserted
for them. Provenance and distribution rights are separate questions.

Layout reference: the client HUD implementations for health, armor, ammo, money,
and the round timer in [cs16-client](https://github.com/Velaron/cs16-client/tree/2d125db28d2c043fd0730c9970066d845574dbb0/cl_dll).
No C++ implementation was copied into the scene. Official visual references are
available on the [Counter-Strike Steam page](https://store.steampowered.com/app/10/CounterStrike/).

## Rebuild

From the repository root, with Python 3:

```sh
python3 asset-sources/hud/convert_sprite.py asset-sources/hud/640hud7.spr assets/ui/hud.png
python3 asset-sources/hud/convert_pain_sprite.py
```

The converter reads the single-frame, additive, indexed GoldSrc v2 sprite and
writes white RGBA pixels with palette intensity as alpha. Rendering applies
amber tint and point filtering. This preserves bitmap coverage, but SDK UI
alpha blending differs from GoldSrc additive blending. Current opacity, warning
blink timing, and fade behavior still need visual calibration.

## Source SHA-256

- `640hud7.spr`: `cf8ee32657eddad86b23dd1ef3c71221fc7901f0e3cb3c2a5a52ce845e18c092`
- `hud.txt`: `50b24f3579c9dd173c411105d1379388f24043a5d392f3c6415a42c1c81a0767`
- `weapon_ak47.txt`: `5dfd93c788f0d0edb2a773ce750b0373f22d3ac75df1eb8400e7a3ec07f623da`
- `640_pain.spr`: `4c0ed05634761c92f9f9c98f70d0a6686929cc2771f5727233205c41246b7529`

The pain converter places the source's four front/right/rear/left frames into a
352×128 atlas without resampling. The UI preserves the source frame dimensions
and placement formulas from Valve's `CHudHealth::DrawPain`.

## Radar

`radar640.spr` comes from the same pinned CS-Server mirror and remains an
original Valve asset. Its palette is green, unlike the monochrome HUD atlas.

```sh
python3 asset-sources/hud/convert_sprite.py --colored asset-sources/hud/radar640.spr assets/ui/radar.png
```

Conversion preserves the palette hue and maps intensity to alpha; it does not
reproduce additive compositing. The radar uses source tint (25,75,25). Position
scale (32 map units/pixel), 128-unit height threshold, teammate filters, and
T-only half-second bomb flashing were checked against `cl_dll/hud/radar.cpp`
in cs16-client at the revision linked above. This is a reconstructed client
reference, not Valve's original client source. No C++ code was copied.

Radar source SHA-256: `bbeeda2977d17f7a2d950362f4a9f2711e23d36d2e4fc3642b8006ad61bb1fa1`.

## Death notices

`640hud1.spr`, `640hud2.spr` and `640hud16.spr` use the same pinned CS-Server
revision above. The 30 `d_` entries in the existing `hud.txt` supply all icon
rectangles. Source hashes are recorded in `death-icons.json`; the scene maps
MP5 to `mp5navy`, C4/HE to `grenade`, and unknown/world causes to `skull`.

Rebuild from the repository root:

```sh
python3 asset-sources/hud/generate_death_icons.py
npx prettier --write src/death-icons.ts
node validate/kill-feed-assets.mjs
```

The asset check compares every output pixel's coverage to the original indexed
palette and every rectangle to `hud.txt`. The conversion is the existing additive
SPR-to-RGBA adaptation, with orange icon tint in the UI. Original-asset provenance
and redistribution limitations described above apply to these sprites too.

Behavior reference: [cs16-client death.cpp at 9c891b8](https://github.com/Velaron/cs16-client/blob/9c891b8ebeb5ff0b84e00af769c2f5e35a0280be/cl_dll/death.cpp).
It is a reconstructed client reference, not Valve's original CS client source.
The feed uses four notices, six-second lifetimes, chronological insertion,
right alignment, headshot icons and an observer-specific vertical offset.
Headshot classification follows the final lethal hit group from
[ReGameDLL player code](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/player.cpp).
No C++ implementation was copied. The existing bitmap font and alpha blending
remain adaptations; larger font tiers increase row spacing to avoid overlap.
