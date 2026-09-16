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

`modeStats` supplies the shared mode-dependent trigger rule to the client and
server. `BurstState` tracks remaining rounds, the continuation interval and the
next burst deadline. Client updates send one bullet request at a time; the server
checks the burst index and revision, consumes ammunition and resolves each hit.
Glock continuations use their arrival time rather than being backdated to the
first bullet's timestamp. FAMAS uses the existing scheduled-shot path. Extra
bullets retain the burst spread and do not repeat the first bullet's accuracy
or recoil update; FAMAS continuation damage remains 30.

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
