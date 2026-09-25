# Weapon accuracy across switching and pickups

The scene previously drew every weapon with fresh accuracy, a zero last-shot
clock and a reset recoil direction. It now keeps those values with each inventory
item, including bot loadouts and dropped guns. A newly bought copy starts fresh;
a pickup retains the dropped weapon's history. Player camera punch stays with
the player and clears on respawn.

## CS reference

The pinned ReGameDLL compatibility paths apply different assignments on deploy.
Rifles such as AK/M4 reset accuracy and shot count. MP5/MAC-10/UMP45 reset accuracy
but keep the counter. SG550 does not assign accuracy on deploy or reload.
Last-fire time (`m_flLastFire`) and lateral direction are retained. The shared
`DefaultDeploy` resets a different cadence field (`m_flLastFireTime`) and the
shot-decay clock. [Weapon implementations](https://github.com/rehlds/ReGameDLL_CS/tree/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared),
[shared deploy](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapons.cpp#L1492).

SG550's 0.9 initialization belongs to `REGAMEDLL_FIXES`; the original path leaves
it zero. Its shot uses the preceding accuracy before updating it. Thus an unused
SG550's first two standing scoped shots use 0.05 spread, followed by 0.013125 at
0.25-second cadence. An accuracy of 0.7375 survives switching away and back.
[SG550 source](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_sg550.cpp).

The zero initial value is inferred from the absence of an accuracy assignment
in the inspected original server's Spawn/Deploy and the engine's zeroed private
allocation. This is static evidence; the original engine was not executed.
[Allocator](https://github.com/rehlds/ReHLDS/blob/550f2d62f13f4ebeb029c1d9d1c212133202611d/rehlds/engine/pr_edict.cpp#L494),
[binary/source hashes and assignment matrix](../validate/game/weapon-state/source-audit.json).

## Implementation

Stored accuracy contains the counter, accuracy value, last-fire time and lateral
direction. It excludes camera punch and held input. `deployGunAccuracy` combines
the selected item with current player punch/input and applies that gun's resets.
Humans save it alongside ammunition; bots save it on fallback, death and round
transition. DroppedWeapon transports the same item data to its next owner.

`Weapon.deployedAccuracy` is a fixed snapshot for the current draw. The client
consumes it once when the weapon revision changes, including during replay of
late shot responses. Later ammunition updates cannot overwrite predicted history.
SDK optional maps use required fields to preserve zero and false; timestamps use
doubles to retain fractions of a second at current epoch values.

**Refresh server and clients together:** the custom component schemas changed.
An older live preview must reconnect to the rebuilt scene.

## Verification

```sh
node --experimental-strip-types --test tests/weapon-item-state.test.mjs tests/weapon-switch-recoil.test.mjs
npm run validate
```

Ten new cases fail before the fix. They cover all deploy assignments, SG550's
first shots, production shooting/selection/equipment adapters, bot handoffs,
camera prediction/reconciliation and actual SDK serialization. The focused set
passes 55 tests; the full gate passes 521, assets, bundle and typecheck.
[Recorded evidence](../validate/game/weapon-state/README.md).

For a playtest, buy SG550, zoom and fire twice. Select pistol or knife, return to
SG550 and zoom again. The first returning shot should retain its prior accuracy;
subsequent shots recover based on elapsed shot time. Dropping and retrieving it
must conserve magazine ammunition and retain that history.

This pass did not launch a browser or native client. Native phone FIRE, audible/
visual original-client comparison and clock-offset effects in live transport
remain separate verification or parity gaps. Item primary/secondary timer
persistence is covered by the subsequent [switching fix](CS16-SWITCH-TIMERS.md).
This implements item accuracy history, not complete GoldSrc weapon state.
