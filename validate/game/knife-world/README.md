# Knife contact with world edges

A nearby Dust2 edge could miss both knife attacks because map collision used only
a thin ray. Knives now try that line first, then the original BSP head hull and
standing actor boxes. A world-hull contact is refined with the source doubled
center ray, followed by the eight corner rays if the center misses. Prediction
and the authoritative server share the trace for feedback and cooldowns.

## Reproduce

From the scene root:

```sh
node --experimental-strip-types --test tests/knife.test.mjs tests/knife-contact.test.mjs tests/knife-feedback.test.mjs tests/knife-rewind.test.mjs tests/knife-world.test.mjs
npm run validate
```

[Before](before-tests.log): five of the six initial world-contact cases fail.
[After](after-tests.log): all 35 focused tests pass. The seventh world-contact
case adds independent source samples after that before-run. Tests cover an
analytic edge, a player behind an edge, direct-head-line priority, extended
center-ray refinement, a real Dust2 edge and the production server handler.
The server test verifies `knife_hitwall1`, no target damage, rejection at 0.36 s
and acceptance at 0.4 s after the wall strike. [Full gate](full-gate.log):
492 tests, asset integrity, build and typecheck pass.

For the map regression, the eye is `(90, 11.626, 54.2)` and the direction is
`(sqrt(0.5), 0, sqrt(0.5))`. The 1.2-metre point line misses; the original head
hull contacts at 0.860407531 m. [Nearby edge measurements](edge-cases.json) record
three additional origins. These are computed geometry results, not screenshots.

## Source and integrity

The [manifest](../../../asset-sources/dust2/knife-hull-source.json) pins the approved
original BSP, exporter, sampler, fixture and generated data by SHA-256. The BSP is
the same revision already used for firearm collision. Hull 3 contains 913 planes,
2,909 nodes and the 11 static world/brush models selected by that collision path.
The generated module is 80,156 bytes. [Export report](export-report.json).

The attack order and refinement follow
[ReGameDLL's knife implementation](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_knife.cpp)
and [ReHLDS hull tracing](https://github.com/rehlds/ReHLDS/blob/550f2d62f13f4ebeb029c1d9d1c212133202611d/rehlds/engine/world.cpp).
Direct anatomical hits keep priority; fallback actor contacts retain generic body
damage from the [previous source audit](../knife-contact/README.md).

Given a copy of the exact BSP URL/hash in the manifest, regenerate into temporary
files without replacing the checked-in assets:

```sh
python3 asset-sources/dust2/export_knife_hull.py /path/to/de_dust2.bsp /tmp/cs16-knife-hull.ts
python3 asset-sources/dust2/sample_knife_hull.py /path/to/de_dust2.bsp /tmp/cs16-knife-hull.json
cmp /tmp/cs16-knife-hull.ts src/dust2-knife-hull.ts
cmp /tmp/cs16-knife-hull.json tests/fixtures/knife-hull.json
```

The independent sampler classifies points through the raw source clipnodes,
steps each segment 512 times and bisects the first solid transition. All 12 hit
and 12 clear segments agree with the runtime within 0.000001 m. Finite sampling
can miss solids thinner than one step (at most 4.7 mm here); this is a useful
cross-check, not an exhaustive original-engine comparison. The asset gate checks
hashes, counts, normalized planes, valid references, reachability and cycles.

## Limits

Brushes remain in their exported static state; moving doors and destroyed brushes
are not simulated. The map uses 2/75 m per source unit while weapon distances and
refinement corners use 0.025. The shared BSP tracer uses exact plane intersections;
GoldSrc epsilon, start-solid and backoff details are not reproduced exactly.
Crouched actor bounds, knife decals, material sound layering and the older binary's
long-held-input cadence correction remain open.

No browser, native client or original CS engine was launched for this change.
Production-handler checks do not prove rendered feedback or native multitouch.
Mobile FIRE still needs a device trace: the read-only current Godot/SDK input audit
found no additional confirmed scene defect and does not resolve that report.
