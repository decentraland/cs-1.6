# Glock and FAMAS burst fire

The Glock's burst mode repeats while the trigger stays down, at a 0.5-second
burst cycle. Switching back to semi-auto restores one shot per press and the
0.15-second cooldown. FAMAS burst mode repeats at a 0.55-second cycle.

The reference is ReGameDLL_CS `b0889847fe6d03898be88acc9e366660efb40ab5`, using
the original compatibility paths. In
[GLOCK18Fire](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_glock18.cpp),
only the semi-auto path increments the press latch. In
[ItemPostFrame / FireRemaining](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapons.cpp),
the Glock continuation checks whether its timestamp is nonzero, without waiting
for that timestamp. FAMAS checks its deadline: 50 ms for the second bullet,
then 100 ms for the third. Both weapons finish the pending burst after release,
stopping early when the magazine empties.

## Scene implementation

The Glock viewmodel uses `shoot3` for semi-auto (one slide cycle), `shoot`/`shoot2`
for burst (three cycles), and `shoot_empty` for the final round. The clip names
were previously mapped backwards. `tests/weapon-fire-animation.test.mjs` checks
the selected clips against slide motion in the shipped GLB; both mode tests fail
with the old mapping. The burst animation starts once, on the first bullet.

`modeStats` supplies the shared mode-dependent trigger rule to the client and
server. `BurstState` tracks remaining rounds, the continuation interval and the
next burst deadline. Client updates send one bullet request at a time; the server
checks the burst index and revision, consumes ammunition and resolves each hit.
Glock continuations use their arrival time rather than being backdated to the
first bullet's timestamp. FAMAS uses the existing scheduled-shot path. Extra
bullets retain the burst spread and do not repeat the first bullet's accuracy
or recoil update; FAMAS continuation damage remains 30.
The first bullet also establishes the primary/alternate deadlines. Continuations
no longer extend the reload or mode-switch wait, on the server or predicted
desktop/touch input. See [action timing](CS16-WEAPON-ACTIONS.md).

This is command/update-dependent behavior. Bevy scene frames, server ticks and
message batching are not GoldSrc user commands. The rule matches the reference;
identical timing at every original client frame rate is not established.

## Validation

Run `npm run validate` for the rule tests, asset checks, build and typecheck.
The corrected Glock timing and mode tests fail on the prior implementation.
The [headless regression](../validate/game/burst-fire/README.md) exercises real
mouse/keyboard input and compares predicted requests with server-accepted rounds.
Its separate match uses parked bots, extended buying and an initial FAMAS; live
combat balance is outside that fixture's coverage.

## Ammunition accounting

Burst continuations consume magazine rounds, without an additional reserve debit.
The compatibility `FireRemaining` path decrements cached `ammo_9mm` /
`ammo_556nato` fields. These are copies made by
[TabulateAmmo / AmmoInventory](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/player.cpp#L8829),
not the `m_rgAmmo` inventory used by reloads. The earlier note calling those
cached decrements an unmatched reserve debit was incorrect; the scene's
magazine-only burst consumption remains unchanged.
