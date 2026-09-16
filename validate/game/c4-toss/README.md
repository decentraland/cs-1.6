# C4 toss and pickup review

Muted headless Brave 151 on the official Bevy web preview, September 15, 2026.
The scene uses the approved original C4/backpack models. No Unity client was run.

## Reproduce

1. Run `npm run validate` in the scene.
2. Create a fresh fixture: `node validate/prepare-c4-toss.mjs /tmp/cs16-c4-toss-review`.
3. Install the fixture dependencies, then run `npm start -- --web --port 8011` there.
4. Open the official Bevy preview against `http://127.0.0.1:8011`, position `5,8`,
   in an isolated muted headless WebGPU browser. Grant its loopback permission.
5. Run `node validate/c4-toss.mjs <browser-CDP-websocket> <evidence-directory>`.

The fixture grants $16000 and an AWP, parks the opposing bots, extends the round
and freeze timer, and exposes motion in tiny read-only diagnostic TextShapes.
Drop physics, damage, pickup and round transitions use production code. The
runner uses real key input; console teleports stage positions. Its first drop
starts below the original BSP sky. Teleporting above that boundary places a
point-hull item in solid space despite the exported mesh showing open air.

`browser.json` records an airborne freeze-time C4 toss, no pickup before settling,
T pickup during freeze, upward gun toss when looking down, a real fatal fall with
C4, continued flight after the round ends, and removal/reassignment next round.
The fatal-fall staging starts above the BSP sky; the death-triggered item spawn
occurs only after the player lands inside playable space. No midair pickup or
synthetic health change is used.

`full/browser.json` records the existing full C4 regression rerun on a fresh
`prepare-c4.mjs` fixture with the production three-second freeze. Reproduce with
`node validate/c4.mjs <CDP> <evidence-directory> <agent-browser-session>`.
It covers original model load, equip speed, early/late plant cancellation,
keypad audio scheduling, holster cancellation, landed backpack pickup, completed
three-second plant, best-weapon retirement, LED flash, 45-second fuse, explosion
and the next round. [Landed backpack](full/c4-backpack.png) and
[planted C4](full/c4-planted.png) show the original models in Bevy.

The unit suite also checks source-sized pickup bounds, other-floor/CT/dead-player
rejection, former-owner immediate pickup after landing, invalid directions,
body-pitch conversion, clipped spawn, wall slide and BSP floor settling.
Source hashes are in `source.json`; the installed scene gate is in `validation.txt`.
Browser runtime errors and native warnings are recorded in `browser-errors.txt`.

## Limits

This verifies the scene rules and visible models; it is not a side-by-side
GoldSrc client timing comparison. Fixed 120 Hz substeps and BSP point traces
approximate original engine cadence. Native player collision, crouched origins,
animated character body/death orientation and back-mounted carrier backpacks
remain unfinished. Muted checks establish sound scheduling, not audible parity.
