# Knife feedback regression

The old client always selected the missed-stab animation, used slash audio for
all local attacks, and gave observers no knife sound. Delayed replies could replay
hit cues, and a previous-round request could damage a new round's target.

Run from the scene root:

```sh
node --experimental-strip-types --test tests/knife-feedback.test.mjs tests/knife.test.mjs tests/short-press.test.mjs tests/round-continuation.test.mjs tests/touch-equipment.test.mjs tests/weapon-view-zoom.test.mjs tests/mobile-controls.test.mjs tests/native-input.test.mjs
npm run validate
```

[Before](before-tests.log): seven of eight new cases fail against the previous
runtime. The pure sound-selection helper was present in the fixture for both runs;
the old runtime did not import it, and that one passing case is not a reproduction.
The shared test adapter captured pitch for both versions.
[After](after-tests.log): all 50 focused cases pass.
[Full gate](full-gate.log): 461 tests, asset integrity, bundling and type checking
passed. Changed code also passes Prettier and `git diff --check`.

The regressions drive production input/client/server code and the installed SDK
Room, Animator and AudioSource. They cover local contact and miss traces against
actual Dust2 collision, stab cooldowns, slash order, server-confirmed flesh cues,
observer audio, duplicate/late replies, previous-round requests and pooled pitch
reset. Mobile tests include native-free UI FIRE, quick taps, release, input-source
handoff and equipment changes. These are scene integration tests, not a mobile
renderer or touchscreen simulation.

Manual check in an existing preview: refresh the server and clients to the same
build, select knife, stab clear space, then a nearby wall and player. Contact
should use the stab-hit clip; wall and flesh sounds should differ. Switch to a gun
before a delayed reply: the old knife animation must not replay. A second client
should hear accepted knife attacks. Hold/release touch FIRE with a rifle to verify
the native device path separately.

No browser or native Explorer was launched for this change. Live knife latency,
phone input and an original-game audiovisual comparison remain open; see
[implementation limits](../../../docs/CS16-KNIFE-FEEDBACK.md).
