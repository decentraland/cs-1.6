# CS 1.6 AK-47 viewmodel

Source: [Pack Default Weapon Fixed](https://gamebanana.com/mods/227246),
archive [pack_default_weapons_fixed_2017.rar](https://gamebanana.com/dl/195345).
The page credits Valve and IvanGamerSom3. Its description identifies model and
arm-position fixes while retaining the default aesthetic and animations.

The archive's `v_ak47.mdl` is retained as `fixed_v_ak47.mdl` here.
Archive MD5: `73a0a12c5db239cf0df745cd03475de1`.
MDL SHA-256: `3d0fb45adeb43b78208cccebf13c7ed5041c78e3cb2c9b6a061dbe4b639c1cf7`.

The [listed license](https://gamebanana.com/mods/license/227246) is
CC BY-NC-ND 4.0. Its reuse checklist asks for permission for redistribution
and use of parts in another project, and disallows commercial use. This local
review asset has not been cleared for publication; keeping provenance does not
grant redistribution rights to the mod or its underlying Valve assets.

## Conversion

`goldsrc.py` reads the embedded GoldSrc MDL v10 geometry, indexed textures,
rigid bone weights and run-length encoded bone animations. The format follows
[Valve's studio header](https://github.com/ValveSoftware/halflife/blob/master/engine/studio.h).
Only embedded, unblended sequences and single-model bodygroups are supported.

`convert_blender.py` builds the rig, meshes and actions in Blender; Blender's
glTF exporter writes the GLB. `prepare.py` mirrors the view for a right-handed
weapon and copies the result to `assets/scene/weapons/ak47-view.glb`. Run it
through Blender MCP with `runpy.run_path('/absolute/path/to/prepare.py')`.
The current conversion used Blender 5.2.1 LTS. It preserves 1,050 triangles,
42 bones, 11 textures and six clips, including all three shooting variants.
It does not include firing sounds or third-person models.

Source frame timing is retained: idle 16/30 s, draw 1 s, reload 90/37 s,
and each shooting clip 0.8 s. Keyframes start at time zero. The scene returns
to idle after draw or firing; the server still decides when a reload finishes.
Successive automatic shots choose a different shooting clip so CRDT does not
suppress an identical animation reset.

## Placement and validation

The source is scaled by 0.025 m per GoldSrc unit. The evaluated idle bounds,
including hands and the rig transform, are recorded in `conversion.json`:
dimensions approximately 0.260 × 0.219 × 0.780 m. This is a camera-relative
viewmodel: the scene uses position `(0,0,0)`, identity rotation and unit scale
under `engine.CameraEntity`, with both collision masks zero. The old rifle's
offset and scale are not reused.

Bevy rotates imported glTF roots by 180 degrees around Y and converts scene Z
to its internal coordinate system. With that mapping, idle camera-relative SDK
bounds are approximately `[-0.0574,-0.2835,-0.0906]` to
`[0.2024,-0.0643,0.6891]`. The box is relative to the live camera, so it must be
rotated and translated by the actual camera pose for a parcel-boundary audit.
Headless Bevy rendered the AK and hands, loaded all six source clips, and passed
held-fire, reload/ammo transfer, and pistol-to-AK switching checks. See the
[runtime evidence](../../validate/game/ak47-cs16/README.md). Full animation fidelity,
extreme viewing angles, wall/near-plane clipping and boundary behavior remain
unverified. No live client is required for the offline asset check.

The preview copy's $16,000 starting balance and disabled bot loop are test
fixtures only; the playable scene keeps its normal economy and bots. Other
weapons and third-person AKs still use their existing placeholders.
