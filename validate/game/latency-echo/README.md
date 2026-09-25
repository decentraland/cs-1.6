# Latency echo integration proof

2026-09-22, SDK 7.27.1-33533530571.commit-451d001.

The old client callback checked `context.from`. SDK Room invokes authenticated
client callbacks with the payload alone, so every server probe was ignored.
`before-tests.log` records two failures: no echo through the installed SDK Room.

`tests/latency-echo.test.mjs` uses the installed Room, binary event codec, scene
message schemas and production client/server handlers. At simulated 400 ms RTT,
the echo enables 300 ms rewind, moving a 6 m/s target back 1.8 m for a confirmed
headshot. Peer-origin probes and unsynchronized-client replies remain blocked.

```sh
node --experimental-strip-types --test tests/latency-echo.test.mjs
```

A fresh muted headless Bevy preview used the mobile fixture with native action
bindings disabled. Its real server shot diagnostics recorded **296–297 ms RTT**
and **248 ms rewind delay** instead of `pending`/zero. This single-client check
proves live probe/echo transport, not moving-target avatar rendering or latency
symmetry. Seven shots consumed M4 ammo 30 → 23 and release stopped firing. See
`shots.log`, `runtime.log` and `fire-checks.json`.

To repeat the live transport check, create an isolated fixture:

```sh
node validate/prepare-touch-controls.mjs /tmp/cs16-latency-review --no-native-bindings
```

Copy the current source unchanged into that fixture via the preparation script,
install its dependencies and run `npm run start:server -- --port 8034`. Open one
muted isolated headless Bevy browser with loopback access. Run from the repository:

```sh
node validate/mobile-controls.mjs <browser-CDP-websocket> /tmp/cs16-latency-evidence
```

Verify `[SHOT]` lines in the fixture's server output show numeric `humanRtt` and
positive `humanDelay`; close the owned browser and fixture server afterward.
The fixture has its own multiplayer identity, $16000, paused bots and extended
round/buy times. The production game keeps its normal values. Both owned ports
were closed after this check.
