# Buy-menu ammo fill

Checked 2026-09-21 in one isolated, muted headless Bevy browser using the
[mobile-layout fixture](../touch-controls/README.md). The fixture starts with
$16000, pauses bots and extends buy/round time; purchase logic is production code.

Real pointer clicks bought M4A1, then PRIMARY AMMO and SECONDARY AMMO:

- M4 reserve 0 → 90 cost $180; its loaded 30 rounds were unchanged.
- USP reserve 24 → 100 cost $175; its loaded 12 rounds were unchanged.
- Another tap on full primary reserves spent nothing and kept the menu open.
- Slot/silencer actions and 1280×720, 844×390, 390×844 layouts also passed.

[Quoted prices](ammo-price.png), [full reserves](ammo-filled.png),
[results](checks.json), [final HUD state](ammo-filled.json).

Run `node validate/prepare-touch-controls.mjs /tmp/cs16-ammo-review`, link or install
its dependencies, and start `npm run start:server -- --port 8034` there. Connect
one isolated headless Bevy preview with loopback permission held open, then run
`node validate/touch-controls.mjs <browser-CDP-websocket> /tmp/cs16-ammo-evidence`
from the original scene. Start on the team menu; the harness joins CT itself.
Close the owned browser/server afterward. Reusing an isolated browser profile
may show a welcome-back screen; clearing only that profile's site storage and
reloading recovered this run. Native mobile multitouch is not established by
this Bevy check.

`node --experimental-strip-types --test tests/ammo-menu.test.mjs` covers all 24
guns, limited funds, final partial packs, shared reserves, rejected purchases and
production UI quotes. Four of five cases failed before the fix. The full scene
gate passed 336 tests, asset checks, bundling and typecheck.

Behavior follows the [pinned CS command handler](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/client.cpp#L2894):
menu ammo choices fill affordable reserve packs; individual ammo commands buy one.
