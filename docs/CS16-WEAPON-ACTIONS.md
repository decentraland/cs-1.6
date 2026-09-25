# Weapon action deadlines

Primary fire, alternate fire and player draw/reload locks are separate clocks in
CS 1.6. The scene previously calculated both firing and alternate readiness from
the latest bullet time plus the current mode's fire rate. This delayed actions
after changing modes or completing a burst.

The pinned reference is ReGameDLL_CS
`b0889847fe6d03898be88acc9e366660efb40ab5`, original compatibility branches:

- [AUG secondary and primary attacks](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_aug.cpp#L164):
  zoom sets only the secondary deadline; a shot replaces both attack deadlines.
- [FAMAS primary attack](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_famas.cpp#L183)
  and [Glock primary attack](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_glock18.cpp#L239):
  the first shot establishes the 0.55/0.5-second burst cycle.
- [FireRemaining](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapons.cpp#L813)
  does not reset those attack deadlines.
- [ItemPostFrame](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapons.cpp#L1059)
  checks secondary and primary readiness independently.

## Resulting behavior

AUG zoom at 10.000 followed by a scoped shot at 10.010 now allows the next zoom
after the shot cycle ends at 10.145; the preceding 10.300 zoom deadline no longer
survives that shot. Switching AUG/SG552 to zoom or FAMAS to burst after a ready
shot does not retroactively extend the preceding shot's primary cooldown.

A FAMAS burst starting at 10.000 with continuations at 10.050 and 10.150 permits
reload or a mode change after 10.550. It previously waited until 10.700. Glock
has the same correction with its 0.5-second cycle and update-driven continuations.
The source's draw, reload, silencer, life, match and C4 restrictions still apply.

`Weapon.nextPrimaryAt` captures each primary attack's deadline. Continuations
spend magazine ammunition and update shot feedback without moving that deadline.
`alternateAt` follows its own action/shot updates. Client prediction captures the
interval used for the previous primary request rather than reading a subsequently
changed mode's interval; desktop and touch use the same path. Automatic reload
and bolt re-scope also read the captured primary deadline.

## Verification

```sh
node --experimental-strip-types --test tests/weapon-action-deadlines.test.mjs
npm run validate
```

Six of seven new cases failed before the fix. The regression invokes production
server firing, alternate and reload handlers, plus desktop/touch client firing
and held reload. It covers scoped rifles, both burst guns, empty final bursts,
mode changes and action guards. Other selected regressions retain all eight shots
from the recorded M4 input trace, all 24 short-tap firearm paths, silencer locks
and AWP bolt re-scope. The full gate passes 428 tests, asset checks and SDK
build/typecheck. [Before/after logs](../validate/game/weapon-action-deadlines/README.md).

The handler harness controls clock and transport and supplies an ECS adapter; it
is not a live browser or native phone check. No explorer was launched for this
step. Native multitouch and mobile scope magnification remain separate gaps.

Attack deadlines now survive selection and gun pickups, with explicit AWP/Scout
draw resets. See [weapon timer persistence](CS16-SWITCH-TIMERS.md) for the
silencer/knife switching correction and its regressions.
