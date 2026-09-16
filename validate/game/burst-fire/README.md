# Burst-fire regression — September 15, 2026

Before: holding the Glock trigger for 1.25 seconds produced only three rounds,
with 100 ms gaps. After: the same hold produced nine rounds across three bursts.
Glock semi-auto produced one round per hold, including after switching back from
burst mode. All predicted requests were accepted and matched magazine consumption.

FAMAS held fire produced nine rounds. The server scheduled 50/100 ms follow-up
gaps and 550 ms burst cycles. A 75 ms tap still completed all three rounds,
including a continuation requested after release.

Glock server arrival gaps were 0–36 ms within a burst: messages can arrive in
the same server tick. These traces demonstrate the trigger/deadline rules,
not identical GoldSrc user-command timing or a visual-parity comparison.

Evidence: [before](before.json), [after](browser.json), [source manifest](source.json),
[Glock capture](glock-burst.png), [FAMAS capture](famas-burst.png).
The corrected rule tests failed on the prior source; their output is in
[before-tests.txt](before-tests.txt). The final installed gate is in
[validation.txt](validation.txt). No browser errors were reported.

## Reproduce

Run `node validate/prepare-burst-fire.mjs /tmp/cs16-burst-review` in the scene,
install its dependencies, then run `npm run start:server -- --port 8011` inside
that isolated directory. It uses a distinct multiplayer identity, parked bots,
an initial FAMAS, extended buying and read-only shot/state diagnostics. Weapon
capacities, reserves and firing rules are unchanged.

Open one isolated muted headless Bevy session against that realm with the
approved loopback permission. Run:

```sh
node validate/burst-fire.mjs <browser-CDP-websocket> /tmp/cs16-burst-evidence
```

Use `--baseline` only with the prior source to demonstrate the one-burst failure.
Close the owned browser and server afterward. Do not use plain `npm start -- --web`.
