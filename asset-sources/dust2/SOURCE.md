# Dust2 gameplay coordinates

`spawns.json` contains the 40 spawn entities extracted from the original GoldSrc
BSP (version 30), entity lump. Reference mirror pinned to
[u3games/CS-Server at 6ad155c7](https://github.com/u3games/CS-Server/blob/6ad155c7a610a85cfd443fcace2c97f2afcb2866/server/cstrike/maps/de_dust2.bsp).
This reference does not grant a new license for the original game assets.
The BSP itself is not shipped by this change.

`info_player_start` is CT; `info_player_deathmatch` is T. The GLB mesh-local
coordinates are `(BSP x, -BSP z, BSP y)`: 12,398 of its 12,408 vertex entries
match BSP vertices exactly. Its root scale is 1/75; scene scale is 2.
World coordinates are `(63.5575 - x*2/75, 10.026 + z*2/75,
112.4084 - y*2/75)`. Convert GoldSrc yaw with
`atan2(-cos(yaw), -sin(yaw))`. Spawn feet snap to the exported map's floor plus
8 cm; BSP origins represent player hull centers, not feet.

Blender MCP checked the existing imported map without changing its scene:
all 40 origins have a floor within 3 m; upward probes at the center and four
25 cm offsets found 1.85 m standing clearance. This is geometry evidence;
Bevy spawn/collision and full-map route validation are separate checks.

`bomb-sites.json` records the original `func_bomb_target` model bounds and
oriented face planes: `*42` targets A and has six planes; `*16` targets B and
has seven, including its diagonal clipped corner. Runtime planting checks the
standing hull against those transformed planes. Geometry tests verify supported
plant positions and reject the clipped B corner.

Buy zones: `buy-zones.json` records original BSP `func_buyzone` models *29 (CT)
and *30 (T), with convex planes converted by the same map transform. Production
queries include the standing avatar hull. Tests cover all 40 original spawns,
opposing-team rejection, and both bomb sites being outside buy zones.

`build_navigation.py` builds `src/navigation.json` from the exported collision
triangles using floor sampling and standing-clearance ray tests. This is newly
generated scene navigation, not a recovered Valve NAV file. Source geometry has
reversed winding in DCL coordinates, so negative Y normals identify upward
walkable faces. Multi-level cells remain separate; edges require neighboring
cells, step-height clearance and lateral body probes. Only the largest connected
walking component is retained, excluding disconnected roofs and props. The graph
records its collision-source SHA-256, checked by `validate/assets.mjs`.
