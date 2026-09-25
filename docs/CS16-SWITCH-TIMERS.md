# Weapon timers across selection and pickups

Switching to the knife and back used to replace the remaining M4A1/USP silencer
lock with the shorter draw delay. Knife attacks also lost their cooldown when
reselected. Attack deadlines now stay with the item through selection, inventory
storage and gun drops/pickups. Bots retain the same gun deadlines.

## Source behavior

Reference: ReGameDLL_CS `b0889847fe6d03898be88acc9e366660efb40ab5`,
original compatibility branches.

- [DefaultDeploy and Holster](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapons.cpp#L1492)
  apply the player draw lock and cancel magazine reload without clearing the
  item's primary/secondary deadlines.
- [M4A1 secondary attack](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_m4a1.cpp#L78)
  sets a two-second silencer lock;
  [USP](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_usp.cpp#L89)
  uses three seconds in the original branch.
- [AWP deploy](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_awp.cpp#L61)
  and [Scout deploy](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_scout.cpp#L57)
  explicitly replace primary deadlines with 1.45/1.25-second draw locks and
  secondary deadlines with one second. The other 22 firearms retain item timers.
- [Knife deploy](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_knife.cpp#L80)
  does not reset its attack timers.
- [DefaultShotgunReload](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapons.cpp#L1576)
  starts both attack locks as well as the player lock; the scene now records
  those 0.55-second deadlines too.

## Synchronization

Gun inventory entries and dropped guns store `timing`; the knife uses
`PlayerInventory.knifeTiming`. `Weapon.deployedTimers` is a fixed snapshot for
one weapon revision. Desktop and touch prediction read that draw snapshot,
so delayed ongoing shot updates cannot lengthen the local automatic-fire cycle.
New items and new lives start without an old item's action lock. Holstering a
magazine reload still cancels it and preserves the unfilled magazine.

These optional maps contain required doubles so zero deadlines and fractional
epoch seconds survive the installed SDK's serialization. **Refresh the server
and all clients together** after this component-schema change.

## Verification

```sh
node --experimental-strip-types --test tests/switch-timers.test.mjs tests/weapon-action-deadlines.test.mjs tests/bot-loadout.test.mjs
npm run validate
```

Nine of eleven new regressions fail against the prior scene source. All 24
focused cases pass after the fix. The full gate result and before/after logs
are recorded in [the evidence directory](../validate/game/switch-timers/README.md).

For a manual check, start changing the M4A1 silencer, immediately select knife
then M4A1, and hold FIRE. Firing must wait until the original two-second lock
expires and the draw finishes. Repeat with USP's three-second lock. A contact
knife stab followed by a rapid pistol/knife switch must retain its 1.1-second
attack delay. Reloading a partly empty magazine, switching away and returning
should still cancel that reload.

The tests execute production handlers and client input with controlled time and
an ECS adapter, plus the real SDK serializer. No browser, native client or
original CS executable ran for this step. Native phone FIRE, live clock skew,
original-client comparison, grenade/C4 item lifetime, shotgun special-reload
holster quirks and exact GoldSrc cadence compensation remain separate gaps.
