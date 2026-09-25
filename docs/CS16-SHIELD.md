# Tactical shield: preparation and implementation requirements

Status: original sources and animated collision fixtures are prepared; shield gameplay
is not implemented.
Blender MCP at localhost:9876 was disconnected during this step. The choice
between reopening MCP and using headless Blender is pending; no Blender export
or visual validation is claimed.

## Verified source rules

The reference remains ReGameDLL_CS `b0889847`, original compatibility branches.

- Cost is $2200. Buying drops the existing primary, grants shield ownership and
  charges once. Buying a second shield or pairing it with Dual Elites is rejected.
  [Price](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapontype.h#L133),
  [purchase restrictions and purchase path](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/client.cpp#L1133).
- Alternate fire raises/lowers the shield with a 0.4-second action lock. The
  shared pistol path changes maximum speed from 250 to 180 source units/s
  (6.25 to 4.5 m/s at this scene's scale) and hides the crosshair when raised.
  [ShieldSecondaryFire](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapons.cpp#L699).
- Shield-equipped USP deploy clears its silencer mode; Glock deploy clears burst
  mode. Their alternate action becomes shield control.
  [USP](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_usp.cpp#L69),
  [Glock](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_glock18.cpp#L68).
- A shield hit depends on the shield hitgroup, not just a front-facing test. The
  trace handler zeroes that damage and emits shield impact feedback. Selecting
  C4 bypasses shield protection. The scene's live player export still excludes the
  shield box. Separate source fixtures now preserve its animated pose for integration.
  [TraceAttack / IsHittingShield](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/player.cpp#L654).
- Pickup requires a living non-VIP player with no primary and no Dual Elites.
  The dropper cannot immediately pick it back up for two seconds. Dropping
  cancels reload and clears shield ownership/drawn state; death drops it too.
  [Pickup, ownership and drop](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/player.cpp#L3338).

## Assets and remaining work

The [source preparation](../asset-sources/cs16-weapons/shield/README.md) contains
nine viewmodels (five pistols, knife, three grenades), nine held variants,
standalone held/dropped models and original buy/HUD resources. Explicit source
bodygroup selection now prevents silently discarding or combining the glass.
The [original-client renderer audit](../asset-sources/cs16-weapons/shield/RENDERING.md)
pins the shipped client binary and its predicted bodygroup-zero animation path.
The engine's final glass appearance is still unverified.

Before making the shield purchasable:

1. Resolve original glass rendering; export/inspect the models and animation
   timings in Blender. Validate reimported poses, textures, bounds and winding.
2. Add authoritative ownership, raised state and action deadlines; reconcile
   weapon deploy, death, round survival, buying replacement primaries, drops and
   pickups. Check CT purchase policy separately from either-team pickup.
3. Add view/held model selection, shield impact feedback and source hitbox poses
   to both current and rewound targets. Verify partial cover, exposed limbs,
   lowered/raised poses and C4; never replace this with unconditional frontal immunity.
4. Add desktop/mobile shield alternate controls, crosshair and speed changes.
   Audit knife/grenade-specific alternate timings and the raised-state firing,
   reload and throw restrictions before implementing their authoritative guards.
5. Prove purchase, pistol fire, raise/lower, block/exposed hits, death/drop/pickup
   and next-round survival in production-handler tests and a short in-scene check.

Offline preparation checks: `python3 -B asset-sources/cs16-weapons/shield/test_source.py`.
Five tests cover 24 source hashes and 28 explicit model/variant records. This
source audit is separate from Blender and gameplay validation.

## Collision preparation

`asset-sources/players/player_collision.py` now supplies the collision portion of
the Blender player exporter without requiring Blender to decode source tracks.
Normal exports still exclude hitgroup 8. The shield preparation opts in explicitly
and stores test fixtures outside the scene bundle: 21 boxes, 16 shield clips and
six gaits for each original player. No GLBs or live player JSONs were regenerated.

`posedBodyBoxes` in `src/player-model-rules.ts` composes these same source bones;
`bodyHitRegions` retains only body groups 1–7. The fixture ray tests cover raised
and lowered cover, exposed feet/rear, exact oriented edges, rotated targets and
a historical lowered pose after a later raise. The lowered shield still provides
cover where its box is actually struck. These tests do not grant ownership,
apply shield damage rules, or validate visible alignment in an explorer.

Each model has 52 independently calculated source-Euler corner samples across
shield poses and gaits. All 832 corners agree with SDK quaternion composition
within 0.000005 metres. An offline regression compares the new exporter with the
installed Blender data (maximum coordinate/quaternion component difference
0.0000002); 2,304 current runtime samples matched exactly before/after the
collision-function extraction.

Reproduce from the scene root:

```sh
python3 -B asset-sources/cs16-weapons/shield/prepare_collision.py --check
python3 -B asset-sources/cs16-weapons/shield/test_collision.py
node --experimental-strip-types --test tests/shield-collision.test.mjs
npm run validate
```

The fixtures retain the current neutral animation blend and fixed model-origin
conversion; they do not implement aim-pitch blends or a crouching player hull.
C4 ownership gating and shield state in live rewind snapshots still need their
gameplay adapters. The shared rewind test proves historical pose sampling only.
The full gate passed 421 tests, asset integrity and SDK build/typecheck; three
offline collision-source checks and five shield-source checks also passed. No
browser or Blender process was launched for this step.
