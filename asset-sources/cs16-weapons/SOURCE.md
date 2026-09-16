# CS 1.6 weapon sources

First-person models: [Pack Default Weapon Fixed](https://gamebanana.com/mods/227246),
[archive](https://gamebanana.com/dl/195345), MD5 `73a0a12c5db239cf0df745cd03475de1`.
Credits: Valve and IvanGamerSom3. The page states CC BY-NC-ND 4.0 and asks for
permission for modification/redistribution. The user's approval covers local
integration/review; publication is not cleared by this provenance record.

Original third-person models, firing/animation sounds, scope textures and weapon HUD
rectangles come from the pinned
[CS-Server mirror](https://github.com/u3games/CS-Server/tree/6ad155c7a610a85cfd443fcace2c97f2afcb2866/server/cstrike).
`stock-media.json`, `animation-media.json` and `world-sources.json` record every URL,
SHA-256, destination and byte size. Valve assets are not newly open-licensed here.
The supplied Dust2 model is unchanged.

`goldsrc.py` reads embedded IDST v10 model data. Run `convert_blender.import_weapon`
through the connected Blender MCP, with AXIS set to
`Matrix.Diagonal((-1,1,1,1)) @ Matrix.Rotation(-math.pi/2,4,'Z')` for the viewmodels.
Use a temporary output directory, then copy the GLB to `assets/scene/weapons/<id>-view.glb`.
`repeat_clips.py` adds aliases that share source animation samplers, so repeated
single animations restart through ECS updates. No source pose/keyframe is changed.

FAMAS contains two repeated-index, zero-area triangle-strip faces. They crashed
Blender 5.2's custom-normal setter. The converter excludes those two degenerate
faces while preserving 1,136 visible triangles; conversion/asset checks record it.
All model reports preserve source hashes, texture counts, bounds, frame timing
and maximum evaluated bone-pose error. First-person scale is 0.025 m per source unit.

`export_world.py` exports the original p_ models at their hand anchor, using
the original textures and baked idle pose. Dual Elites are split by their original
hand-bone ancestry into `elite-world.glb` (right) and `elite-left-world.glb` (left),
104 triangles each. Calling `export_world('elite', source_directory, output)`
exports both. `validate_dual.validate_dual(source_directory, output)` through
Blender MCP checks every re-imported triangle against the original model: all 208
faces must occur exactly once, with the original winding and hand-relative pose.
The asset gate also compares both embedded palettes and every source pixel.
They have no animated humanoid rig.
Source .mdl files and tools stay outside scene deployment via `.dclignore`.
`manifest.json` maps runtime viewmodels and all their source clips; timed sound
cues are extracted from each model's event 5004 records by `extract_animation_events.py`.

Mechanics use [ReGameDLL_CS b0889847](https://github.com/rehlds/ReGameDLL_CS/tree/b0889847fe6d03898be88acc9e366660efb40ab5),
original compatibility branches. See `docs/CS16-ARSENAL.md` for behavior and limits.


## Dropped weapons

The 24 `w_*.mdl` models and `items/gunpickup2.wav` come from the same pinned
CS-Server source used for the held guns. `dropped-sources.json` records URLs,
source/output SHA-256 hashes and Blender conversion reports. `export_drop.py`
bakes each original rest pose at 0.025 meters per unit, keeping original palette
textures and UVs. The result has 3,045 triangles across the 24 ground models.
Two degenerate Glock triangles and 3/15 invalid FAMAS/Galil polygons are removed
before assigning UVs and normals. No review cameras or lights are exported.
Run `node validate/dropped-assets.mjs` to check the original palette pixels,
source hashes, geometry budgets and embedded assets. The existing asset rights
and provenance notes also apply to these original ground models.


## Grenades

The same approved GameBanana pack supplies HE, flash and smoke viewmodels. The pinned CS-Server revision above supplies their original held/thrown models, 13 WAV effects, nine sprites and three HUD definitions. `grenades/sources.json` records all 31 source URLs and hashes; `grenades/projectile-reports.json` records the three animated outputs. Projectiles use the existing Blender converter with `AXIS = Matrix.Rotation(-pi/2, 4, 'Z')` (without the viewmodel mirror), then `repeat_clips.py`. All seven original idle/roll/toss animations are preserved. `grenades/convert_sprites.py` rebuilds the nine runtime atlases from their `.spr` sources.

See [grenade rules and source references](../../docs/CS16-GRENADES.md) for effect reconstruction, blend-mode limits and gameplay references. The existing asset rights/provenance notes apply.

## Defusal kit

`w_thighpack.mdl` and `items/kevlar.wav` use the same pinned CS-Server source.
`defuse-kit-sources.json` records their hashes; `dropped-sources.json` also records
the 80-triangle, 6,600-byte GLB. Run `export_drop('thighpack', source, output)`
through Blender MCP, then `validate_drop.validate_drop('thighpack', source, output)`
to compare every reimported triangle and its winding against the original rest
pose. The asset gate checks every embedded palette pixel. The existing local-use
authorization and publication/provenance notes apply.
