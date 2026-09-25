# Knife damage and actor contact audit

The previous scene awarded 20 base damage to first/paused slashes and traced
fallback contacts against expanded anatomical regions. A stab from 0.5 m above
a nearby target could therefore kill as a headshot even though the direct line
missed the head. Ordinary slashes now deal 15 base damage, and fallback player-box
contacts use generic body damage. Direct lines still retain anatomical multipliers;
stabs remain 65 base damage with the existing armor ratio and rear multiplier.

## Reference evidence

[ReGameDLL Swing](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_knife.cpp#L369-L398)
assigns the new primary deadline before its damage predicate.
[GetNextAttackDelay](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapons.cpp#L1755-L1796)
normally returns the current weapon time base plus the interval. The predicate
therefore selects 15, rather than the 20 branch implied by checking the old deadline.

Static disassembly of the original Linux library from the approved CS-Server
mirror corroborates that order. See [source hashes and addresses](source-audit.json),
[excerpts](original-reference.txt) and [the delay routine](original-next-delay.asm).
The store at `0x14f2cf` precedes the predicate at `0x14f355`. Its constant is the
double 0.4 at `0x1d2f58`; the weapon time base is zero in this binary. The ordinary
path reaches the 15.0 argument at `0x14f8d9`. Releasing primary attack resets the
last-fire field at `0x13522d`, so a pause does not create a stronger next slash.
The library was read, never loaded or executed, and is not included here.

This older binary also contains cadence-creep correction. A sufficiently long
stall while attack remains held can select the 20 branch. That timing edge case
is not modeled by the scene's deadline-based knife cooldowns; these results
establish ordinary first/held/released damage, not every historical build/timing.

[SV_HullForStudioModel](https://github.com/rehlds/ReHLDS/blob/550f2d62f13f4ebeb029c1d9d1c212133202611d/rehlds/engine/r_studio.cpp#L734)
uses a simple entity box for nonzero hull extents on ordinary player models.
Both approved player MDLs have model flags zero. The
[entity trace](https://github.com/rehlds/ReHLDS/blob/550f2d62f13f4ebeb029c1d9d1c212133202611d/rehlds/engine/world.cpp#L233)
expands that box by the moving hull; its single-hull path leaves the hit group
generic. The scene maps that to body damage, using standing half-extents
(16, 16, 36) plus head-hull (16, 16, 18), converted to DCL axes at 0.025 m/unit.
The box is independent of victim facing and animation. A direct line has priority
over fallback contacts. Effective contact reach extends beyond the 48/32-unit
line lengths because the boxes have width.

## Reproduce the regression

```sh
node --experimental-strip-types --test tests/knife.test.mjs tests/knife-contact.test.mjs tests/knife-feedback.test.mjs tests/knife-rewind.test.mjs
npm run validate
```

[Before](before-tests.log): five of seven new cases fail. [After](after-tests.log):
28 focused checks pass. They cover damage, reach, direct-line precedence, fallback
hit groups, facing, walls, original feedback and rewind. Production client/server
handlers through actual SDK Room serialization verify desktop/touch fallback
stabs with and without armor, duplicate rejection, cooldowns and scored kills.
This is scene input/transport coverage, not native phone multitouch verification.

[Full gate](full-gate.log): 485 tests, asset checks, build and typecheck pass.
The first run found an existing stomach expectation still based on 20 damage;
that expectation is now 18.75, preserving its 125-percent multiplier assertion.

For independent static inspection, obtain the exact binary URL/hash in
`source-audit.json`, then use LLVM objdump:

```sh
shasum -a 256 /path/to/cs.so
llvm-objdump -d --demangle --start-address=0x14f170 --stop-address=0x14fb40 /path/to/cs.so
llvm-objdump -d --demangle --start-address=0x135f00 --stop-address=0x135fb0 /path/to/cs.so
llvm-objdump -d --demangle --start-address=0x135170 --stop-address=0x135250 /path/to/cs.so
```

On this Mac, `/usr/bin/objdump` is Apple LLVM and accepts these flags. The symbol
and relocation tables identify the delay call and player timer fields. No server
execution is needed for this inspection.

## Remaining scope

World occlusion still uses a line; the original BSP head hull and
`FindHullIntersection`, crouched actor bounds, knife decals and long-stall timing
remain open. The current models and mixed map/weapon scale also limit full parity.
The legacy `validate/knife.mjs` now expects the original GLB and corrected damage
(100 → 85 → 70 → 5 before the finishing stab), but was not rerun. Its old
`validate/game/knife.json` is historical evidence. No browser or native client was
launched for this correction, and no live original-CS comparison is claimed.
