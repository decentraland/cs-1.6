# Knife rewind regression

A human running at 6 m/s moves 1.8 metres during the fixture's 300 ms viewed-state
delay. The old knife handler traces the current position and misses the displayed
contact. It also tests backstabs against the victim's new facing and rejects
legitimate contact when the shooter's movement update trails its attack.

Run from the scene root:

```sh
node --experimental-strip-types --test tests/knife-rewind.test.mjs tests/knife-feedback.test.mjs tests/human-server.test.mjs tests/pellet-claims.test.mjs tests/round-continuation.test.mjs
npm run validate
```

[Before](before-tests.log): seven of nine new cases fail against the previous
production client/server and message schema. [After](after-tests.log): all 40
focused cases pass, including the existing gun/shotgun human-rewind tests.
[Final full gate](full-gate.log): 470 tests, asset checks, bundling and typecheck
passed after correcting an empty-array type inference in the diagnostic fallback.
Changed code passes Prettier and `git diff --check`.
The test helper accepts a practice adapter in both runs; the human tests use the
same production history, latency, origin validation and damage handlers.

The new suite checks:

- Desktop/touch swing and stab intents through the installed SDK Room, preserving
  zero speed and the observed target/origin/time; misses do not invent a target.
- Moving-human damage and kill credit once, without moving live transforms.
- Historical facing for rear and frontal body stabs after the target turns.
- A valid 1.7-metre leading origin and rejection of remote/nonfinite claims.
- Accepted 30 cm smoothing and rejected 70 cm invented target displacement.
- Real Dust2 wall blocking, dead/disconnected/ineligible targets, respawn history,
  no-ping fallback, and friendly blockers without damage.
- Clamped bot view-time routing and historical backstab damage. The practice
  adapter supplies contrasting current/historical targets; this case verifies
  routing, not real bot motion or animation rendering.

The scene follows the command-view principle in
[ReHLDS `SV_RunCmd` / `SV_SetupMove`](https://github.com/rehlds/ReHLDS/blob/master/rehlds/engine/sv_user.cpp).
Timing caps, yaw history and observation/origin allowances are this scene's
adaptation, not proof of exact GoldSrc network behavior.

For a live check, refresh server and clients to the same build, join opposing
teams and select knife. Have one player strafe across stab range while the other
attacks the displayed body. Repeat from behind while the victim turns; then try
a nearby wall and the first attack after respawn. `[KNIFE]` server logs report
human delay/claim, bot view delay, origin acceptance, hit group and backstab.

No browser or native Explorer was launched. Live two-client smoothing, native
phone input and full knife hull/damage parity remain unverified. See
[implementation and limits](../../../docs/CS16-KNIFE-FEEDBACK.md).
