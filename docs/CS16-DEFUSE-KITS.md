# Defusal kits

CTs can buy a kit for $200 or recover one from a fallen CT for free. It enables
a five-second defuse; without one, defusing takes ten seconds. Kits have no
weapon slot and do not switch the equipped gun. A living CT who already has a
kit leaves another ground kit untouched. Terrorists, spectators and dead players
cannot collect them.

The server removes the dead owner's kit before spawning `w_thighpack`. This
runs through the shared death path for gun/knife damage, grenades, C4 and falls;
bot death has the same equipment behavior. Kits use the source `CItem` behavior:
immediate placement on the floor within 256 GoldSrc units below the standing
body center, zero rotation, no inherited throwing velocity, and a 32×32×16-unit
touch box. At the existing scale, one source unit is 0.025 m. There is no manual
kit-drop binding or owner delay. The stock compatibility path has no five-minute
kit expiry; unclaimed items clear on round/match reset. Surviving humans and bots
keep their kits.

Pickup uses the original `items/kevlar.wav` on the player's reusable voice
channel, replacing a preceding voice there. The local player also sees the
original English pickup notice and green defuser icon from `640hud7.spr`:
rectangle `(32,148,32,32)`, RGB `(0,160,0)`, at x=5 and y=screenHeight/2−37.
Purchase shows the same icon; death removes it. The scene scales this geometry
only below 640 pixels, consistently with the existing HUD.

## Models and source rules

The original 80-triangle model becomes a 6,600-byte GLB through the connected
Blender MCP. A Blender reimport compares all triangles and winding against the
source rest pose, with zero measured vertex error. The asset gate compares every
embedded palette pixel and hashes both the model and pickup WAV. The converted
kit measures about 0.287×0.088×0.492 m (DCL x/y/z), with its original origin.

Sources:

- Pinned [ReGameDLL CS](https://github.com/rehlds/ReGameDLL_CS/tree/b0889847fe6d03898be88acc9e366660efb40ab5):
  `items.cpp` (`CItem::Spawn`, `ItemTouch`, `CItemThighPack::MyTouch`), `player.cpp`
  (`Killed`, `GiveNamedItem`, `GiveDefuser`, `RemoveDefuser`), and
  `multiplay_gamerules.cpp` (round cleanup). Compatibility behavior is used;
  the separate FIXES-only `SpawnDefuser` lifetime is not applied.
- [Original model and sound hashes](../asset-sources/cs16-weapons/defuse-kit-sources.json),
  using the same pinned CS-Server mirror as the approved weapon integration.
- [HUD atlas provenance](../asset-sources/hud/SOURCE.md). Status-icon positioning
  follows Valve's [HUD implementation](https://github.com/ValveSoftware/halflife/blob/master/cl_dll/status_icons.cpp),
  also present in the scene's pinned reconstructed
  [CS client](https://github.com/Velaron/cs16-client/blob/2d125db28d2c043fd0730c9970066d845574dbb0/cl_dll/status_icons.cpp).
  The English wording comes from that pinned CS-Server mirror's
  `resource/cstrike_english.txt`, `Cstrike_TitlesTXT_Got_defuser`.

Run `npm run validate`; browser fixtures and commands are documented in
[the kit evidence](../validate/game/defuse-kits/README.md).

## Remaining differences

Floor placement uses the scene's original BSP point tracer, not GoldSrc's item
collision hull. Edge/ledge and solid-sky cases can differ, as can pickup overlap
with the native standing avatar. Water, moving brush entities and original
character body-mounted kit visuals are not reproduced. Bots pick up overlapping
kits; deliberate kit-seeking tactics and bot purchasing remain unfinished.

The green icon uses the source single-icon position. Full status-icon ordering
with buy-zone/C4 icons is not yet implemented. Pickup text uses the scene's
existing notification panel and timing; a complete HUD_PRINTCENTER layout
comparison remains open. SDK alpha blending differs from GoldSrc additive
rendering, and the hosted Bevy client overlays its own UI. Muted browser checks
verify the sound component and file, not audible spatial attenuation parity.
