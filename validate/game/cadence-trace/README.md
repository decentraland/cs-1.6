# Short touch FIRE cadence trace

Captured 2026-09-22 using SDK 7.27.1-33533530571.commit-451d001, the official
Bevy web preview and one isolated muted headless Brave browser. The fixture
forced touch layout, disabled native UiInputBinding actions, provided $16,000,
extended the round/buy window and stopped bot AI. The preview and browser were
closed after capture; the creator's preview was left alone.

The real touch FIRE UI was held for 650 ms with an M4A1, then released. All eight
requests (IDs 1–8) reached the server and were accepted: ammunition 30 → 22.
No further shots occurred after release. Walk/run still toggled 2.99 → 5.75 m/s.
See `shots.log` for receipt, scheduled and actual execution timestamps and
`checks.json` for input assertions.

The scheduled first-to-last interval was 612.5 ms (7 × 87.5 ms); actual execution
spanned 638 ms. No missing request recurred. This is a short burst with mouse
input driving the touch UI, not a native-phone, full-magazine, visual spray or
multi-touch proof. It does not explain the missing ID in the previous run.

To reproduce the server timing and rejection diagnostics without a browser:

```sh
node --experimental-strip-types --test tests/server-cadence.test.mjs
```

The test uses production server handlers and replays the recorded arrivals and
execution ticks. It also exercises early requests, an occupied queue and death
before queued execution. `before-tests.log` shows the missing rejection-reason
regression before the logging change; existing ammunition guards already passed.

For a new live trace, prepare an isolated fixture with
`node validate/prepare-touch-controls.mjs /tmp/cs16-touch --no-native-bindings`,
start that fixture with `npm run start:server -- --port <free-port>`, and run
`node validate/mobile-controls.mjs <owned-browser-CDP-websocket> <output-directory>`.
The detailed CADENCE timestamps in this capture came from temporary fixture-only
logging at receipt, deadline calculation and execution. Production logs retain
accepted IDs/ammo and now report rejection reasons; timing rules are unchanged.
