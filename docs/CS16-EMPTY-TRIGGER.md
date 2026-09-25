# Empty trigger behavior

An empty trigger plays the original click immediately, without a firing animation,
recoil or a predicted hit. It obeys draw, reload, match, life, menu and synchronization
gates. The server advances its primary deadline and sends positional audio to
other players; the shooter ignores that echo. No ammunition is consumed.

## Reference rules

References use ReGameDLL_CS `b0889847fe6d03898be88acc9e366660efb40ab5`, original
compatibility branches.

- The 22 magazine-fed weapons use a 0.2-second empty primary cooldown. The
  secondary deadline is unchanged. See the
  [AK](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_ak47.cpp)
  and [Glock](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_glock18.cpp)
  primary paths. Semi-auto pistols require release before another attempt;
  automatic modes repeat while held.
- [PlayEmptySound](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapons.cpp#L1638)
  selects the pistol clip for the six pistols and the rifle clip otherwise, at
  volume 0.8. The base implementation leaves its sound latch armed.
- [M3](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_m3.cpp)
  and [XM1014](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_xm1014.cpp)
  use a one-second primary cooldown and attempt a shell reload. Their sound
  override clears the latch, yielding one click per hold. A newly inserted shell
  still waits for that primary deadline before firing.
- [AWP](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_awp.cpp)
  and [Scout](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_scout.cpp)
  unscope before checking the empty clip and retain the zoom to resume after
  the primary deadline.

## Scene implementation and limits

`src/empty-fire.ts` supplies shared timing, sound selection and server state changes.
The client sends the existing sequenced `playerShoot` intent. The server checks
it through the normal combat path and emits `weaponDryFire` for an accepted empty
attempt, followed by the existing no-bullet rejection response. That response
does not replay local audio or acknowledge a live shot.

The click is predicted locally; empty bolt-rifle scope changes reconcile from
server state. Native phone input, audible distance behavior and rendered timing
under latency have not been checked for this change. Engine update scheduling is
not GoldSrc user-command timing. Underwater behavior is outside this change.

## Verification

```sh
node --experimental-strip-types --test tests/empty-trigger.test.mjs
npm run validate
```

Eight new cases failed before the change. The full gate passes 436 tests, asset
integrity and SDK build/typecheck. Tests cover all 24 guns through production
desktop/touch firing code, primary deadlines, sound selection, blocked inputs,
shotgun reload starts, empty bolt-rifle scope state and SDK Room serialization.
ECS and transport adapters use controlled state and time; this does not establish
native mobile multitouch behavior. No browser or native client was launched.
[Before/after evidence](../validate/game/empty-trigger/README.md).
