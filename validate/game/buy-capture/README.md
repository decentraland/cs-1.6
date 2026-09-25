# Buy-menu cursor regression

A spawn/resync captured the pointer while BUY remained open. The cursor system
only guarded the team menu, and its release omitted the camera entity required
by Unity. The shared guard now covers both menus and writes both request paths.

## Automated proof

```sh
node --experimental-strip-types --test tests/buy-capture.test.mjs tests/mobile-buy-selection.test.mjs tests/mobile-controls.test.mjs tests/touch-equipment.test.mjs tests/round-continuation.test.mjs
npm run validate
```

[Before](before-tests.log): three of six new cases fail against the previous
production client. [After](after-tests.log): all 32 focused checks pass.
[Full gate](full-gate.log): 476 tests, asset checks, build and typecheck pass.
The fixture exposes the already-registered client systems in both versions; it
runs the production spawn handler, cursor system and shooting guard. It covers
BUY/team capture, same-round resync, new-round spawn, held-close suppression,
normal spawn capture, Escape and the touch early return.

## Rendered proof

One isolated, muted Brave headless Bevy preview received a real server resync while
BUY was open. Spawn-message count increased from one to two; BUY stayed visible,
the camera component was unlocked and the browser reported no pointer lock.
Real clicks then opened RIFLES and purchased M4A1: money $16000 → $12900,
magazine 12 (USP) → 30 (M4A1). See [recorded state](browser.json),
[checker output](browser.log) and [capture](purchase-after-resync.png).

The first attempt timed out at Bevy's guest screen before reaching the scene.
The checker now selects EXPLORE AS GUEST automatically; the successful retry used
the same isolated browser. That browser and its port-8034 server were closed;
ports 9347 and 8034 were confirmed free afterward. The creator preview was untouched.

Reproduce:

1. From the scene root, run
   `node validate/prepare-buy-capture.mjs /tmp/cs16-menu-review` with a new path.
2. In that fixture, run `npm ci --ignore-scripts`, then
   `npm run start:server -- --port 8034`.
3. Start a separate Chromium/Brave with `--headless=new --mute-audio
   --enable-unsafe-webgpu --remote-debugging-port=9347
   --user-data-dir=/tmp/cs16-menu-browser about:blank`. Use a new profile.
4. Read `webSocketDebuggerUrl` from `http://127.0.0.1:9347/json/version`. From the
   original scene root, run
   `node validate/buy-capture.mjs <owned-browser-websocket> /tmp/cs16-menu-evidence`.
   The checker grants this isolated browser the required localhost permission.
5. Close the owned browser/server afterward.

The fixture pauses bots, grants $16000 and extends buy/round time. Space with BUY
open requests a resync through the real room handler; the review marker records
state without changing production gameplay. The browser run verifies same-round
resync; the new-round case is covered by the scene integration test. Unity and
native phone rendering were not launched. The screenshot shows an existing desktop
purchase-notice overlap with the money panel; that remains separate UI work.
