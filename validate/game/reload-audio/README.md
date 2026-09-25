# Remote reload audio — 2026-09-22

Before this change, accepted magazine reloads produced no cue for another player.
The initial six tests recorded **five failures**, covering all magazine-fed guns,
automatic reloads, bot reload notification and private SDK delivery. The guard
case passed. [Before log](before-tests.log).

The final eight reload tests include two added checks for the actual SDK audio
component and bot-origin delivery without avatar identity. They pass in the
**39-test focused run** alongside held reload, empty trigger, reload parity and
Dual Elites. [After log](after-tests.log). The before log predates those two cases.

The mobile input suite separately passed **26 tests**, including production FIRE
callbacks without native binding events, press/release handoff, short taps and
weapon-context cancellation. [Mobile log](mobile-regressions.log). These are scene
integration tests; the reporting phone/build remains unverified.

The authoritative scene's required `npm run validate` passed **511 tests**, asset
integrity, bundle and typecheck. [Full gate](full-gate.log). No browser, preview
server, native Explorer or original CS client was launched for this pass.

```sh
node --experimental-strip-types --test tests/reload-audio.test.mjs \
  tests/held-reload.test.mjs tests/weapon-reload-parity.test.mjs \
  tests/empty-trigger.test.mjs tests/elite-hands.test.mjs
npm run validate
```

The tests use production server/client handlers and the installed SDK Room wire
format. Other tests verify actual AudioSource and Transform values, not audible
playback. The bot-combat test uses the real reload callback and explicit bot
position; it does not run a full navigation simulation.

See [behavior, manual reproduction and limits](../../../docs/CS16-RELOAD-AUDIO.md).
[Reference hashes](references.json) identify the server source and existing
approved sound. M3/XM1014 remote shell cues and native mobile runtime verification
remain open. Refresh both server and clients after installing scene changes.
