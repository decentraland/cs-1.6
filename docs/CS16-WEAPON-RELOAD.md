# Weapon recoil, reload and draw parity

The previous implementation recreated an empty accuracy state on every reload.
That removed residual camera punch immediately, erased the last-fire timestamp
and lateral recoil direction, and replaced SG550's current accuracy with 0.9.
Bot reloads also used deploy accuracy, including MAC-10's 0.15 instead of 0.
Scout draw used the common 0.75-second delay instead of its 1.25-second delay.

`reloadGunAccuracy` advances natural punch recovery and changes only the source
weapon's reload fields. Server reload handlers, automatic reloads, bot reloads,
and replayed client prediction use it. The original ammo transfer, shell timing,
reload interruption and server authority remain in effect.

## Source rules

Reference: ReGameDLL_CS commit `b0889847fe6d03898be88acc9e366660efb40ab5`, using
original compatibility paths without `REGAMEDLL_FIXES` or `REGAMEDLL_ADD`.

- [SG550 Reload](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_sg550.cpp)
  does not reset accuracy. Its next shot computes spread from the retained value,
  then updates accuracy from the elapsed time since its last shot.
- [MAC-10 Reload](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_mac10.cpp)
  resets accuracy to 0, while deploy initializes it to 0.15. AUG and FAMAS also
  reload to 0. Other automatic weapons reset to their initial profile accuracy.
- The [weapon reload implementations](https://github.com/rehlds/ReGameDLL_CS/tree/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared)
  do not clear player punch, the last-fire clock or the recoil direction. Pistol
  accuracy and G3SG1 accuracy reset, but SG550, AWP, Scout and shotguns do not
  assign an accuracy value during reload.
- [Scout Deploy](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_scout.cpp)
  uses 1.25 seconds. [AWP Deploy](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_awp.cpp)
  uses 1.45 seconds; the shared default is 0.75 seconds.

## Reproduce

```sh
node --experimental-strip-types --test tests/weapon-reload-parity.test.mjs
npm run validate
```

The seven regressions fail with the previous source and pass after the change.
They exercise all 24 weapons' draw/reset values, residual recoil decay, late
confirmation replay, the real SG550 server message handler and bot reload.

In the SG550 server case, two scoped shots 0.25 seconds apart leave accuracy at
0.7375. After reloading, the next scoped stationary shot must use spread 0.013125,
then recover accuracy to 0.98. The old reset instead produced spread 0.005. Ammo
must finish at 29/88: two rounds loaded from reserve and one fired after reload.

These are offline production-code regressions. They do not establish mobile
camera behavior, rendered animation timing or complete GoldSrc parity. A manual
check can switch to Scout and hold fire during draw, then compare SG550 reload
and XM1014/M249 recoil recovery without opening additional automated clients.

## Held reload input

The client previously sent only `PET_DOWN` for reload. A press during weapon
cooldown was rejected once by the server and never retried while held. The client
now polls the held action and waits for draw, shot and burst readiness before
sending; releasing it cancels that wait. Firing takes priority over reload, as in
[ItemPostFrame](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapons.cpp).
Desktop F and the custom mobile RELOAD button use the same path. Server messages
include round and weapon revision and reject obsolete requests, invalid match
phases, C4 selection and objective use. Duplicate accepted reload requests cannot
restart the timer or grant ammunition.

`tests/held-reload.test.mjs` tests cooldown waits for all 24 guns and runs the
production client/server handlers with SDK adapters. Against the previous code,
the actual-client cooldown/gating checks and stale-request server check fail.
This is a deterministic input/message regression, not a native-touch playtest.

## Switching preserves player recoil

Changing weapon previously replaced both the authoritative accuracy state and
the camera predictor, instantly clearing the player's remaining punch. The
pinned [DefaultDeploy](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapons.cpp#L1492)
changes weapon timers and FOV without clearing `m_pPlayer->pev->punchangle`;
the weapon's own deploy method resets its accuracy fields.

Deployment now carries naturally decayed pitch/yaw into the new weapon state.
This includes a knife/grenade selection and bots drawing a fallback pistol.
Respawning still clears recoil. Client prediction records weapon switches and
the gun used by each shot/reload, so late replies replay the appropriate rules.
Pending shots from a previous deployment do not reserve the new gun's magazine,
including when switching away and back to the same gun. Rejected old shots
remove their predicted punch through the existing correction blend.

Run `node --experimental-strip-types --test tests/weapon-switch-recoil.test.mjs`.
The regressions exercise the production camera, authoritative server and bot
fallback, plus all 24 deploy profiles and cross-weapon confirmation/rejection.
The camera previously dropped about 7.86 degrees of residual kick to zero on a
switch; the server and bot cases also failed their continuity assertions.
These are offline behavioral checks, not new browser captures.

Manual check: fire the XM1014 repeatedly, immediately select the pistol or knife,
and watch the remaining kick settle smoothly through the draw animation. After
dying and respawning, the view must begin with no leftover recoil. This change
does not establish complete GoldSrc weapon-state or animation-timing parity.


## Per-weapon state on draw

The follow-up [weapon-state correction](CS16-WEAPON-STATE.md) replaces the generic
fresh-state draw with each weapon's original assignments. Last-fire time and
lateral recoil direction now belong to the inventory item and survive drop/pickup.
SG550 retains accuracy across selection; MP5, MAC-10 and UMP45 retain their shot
counter. Camera punch remains with the player. The recorded earlier switch checks
prove punch continuity, not these subsequently corrected item-state rules.
