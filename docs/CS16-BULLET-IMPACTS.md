# Bullet surface feedback

Every traced surface contact now carries its face normal, texture and material.
The client predicts the complete shot: all 9 M3 or 6 XM1014 pellets, or the
weapon's penetration contacts. Each solid non-sky contact draws an original
bullet-hole texture immediately. Confirmation moves or removes the predicted
holes without replaying their sounds. Human and bot shots use the same renderer.
Actor damage still comes from `combatImpact`; a wall hole never confirms a kill.

The pool holds at most 256 collider-free planes. Confirmed holes last until
replaced or a new round; unconfirmed predictions expire after two seconds.
Generation tokens keep late responses from modifying a reused slot. Plane
normals follow the actual collision face with a 2 mm offset to avoid z-fighting.

## Original media and reference

The five 16×16 `{shot1`–`{shot5` decals come from the approved CS asset collection's
[cstrike/decals.wad](https://github.com/u3games/CS-Server/blob/6ad155c7a610a85cfd443fcace2c97f2afcb2866/server/cstrike/decals.wad).
Their palette indices are opacity, and palette entry 255 supplies their color;
this follows the renderer's [gradient-decal conversion](https://github.com/FWGS/xash3d-fwgs/blob/68bbe94dd91911ec327e29f548e341fd07ae9b12/engine/common/imagelib/img_utils.c).
The atlas preserves every source pixel, with a one-pixel transparent gutter.
`asset-sources/cs16-weapons/impacts/convert_decals.py` rebuilds it using Python's
standard library. Source URLs, byte sizes and SHA-256s cover the WAD and all eight
original ricochet WAVs in `sources.json` beside it.

Ricochet selection follows
[`EV_HLDM_GunshotDecalTrace`](https://github.com/Velaron/cs16-client/blob/9c891b8ebeb5ff0b84e00af769c2f5e35a0280be/cl_dll/events/ev_cs16.cpp):
roll 0–32767, play only below 16383; metal/vent selects one of two metal sounds,
other surfaces select among `ric1`–`ric5` and `ric_conc-1`. Confirmation does not
emit a second ricochet for a predicted shot. Bevy supplies spatial attenuation;
the scene does not reproduce GoldSrc's audio mixer.

## Verification and limits

`tests/bullet-impacts.test.mjs` covers actual Dust2 pellet faces, all six plane
orientations using the SDK's own components, actor/sky exclusions, source sound
selection, immediate prediction, reconciliation, expiry, bounded entity reuse,
round cleanup and a nine-pellet event crossing SDK Room.
`validate/bullet-impact-assets.mjs` checks every decoded pixel against the WAD and
all media hashes. Run `npm run validate` for the complete gate.

[Headless preview reproduction and captures](../validate/game/bullet-impacts/README.md)
exercise the direct FIRE icon with native bindings disabled. They do not verify
native phone touch delivery or native renderer behavior.

These are textured planes, without GoldSrc's BSP polygon clipping. A decal can
overhang a brush edge; penetration exit holes, breakable-glass/bulletproof decal
variants, bullet dust and sparks remain gaps. Existing actor blood/armor effects
are still temporary procedural particles. None of these visual effects changes
ballistics or damage.
