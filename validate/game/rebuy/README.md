# Rebuy verification — 2026-09-22

Production change: server-owned saved purchases with the original rebuy priority;
mobile select/cart and a separate desktop REBUY button.

`npm run validate`: **402 tests passed**, asset integrity passed, build/typecheck
passed. Eight new production economy/UI integration cases fail before the change.
The Room case uses the installed SDK binary protocol and authenticated sender.

## Short browser run

One isolated muted headless Brave browser, stock hosted Bevy web client, fixture
on port 8034 with forced mobile UI and native UI bindings disabled. Fixture money
is $16000, round/buy time is 3600 seconds, and bots are paused. Production economy,
reload, shooting and UI implementations are otherwise unchanged.

- Bought M4A1 and primary ammo: $12720, 30/90.
- Held FIRE: seven rounds consumed. Reload: 30/83.
- Selected REBUY: no charge. Pressed cart: 30/90, $12660 ($60 paid).
- Pressed cart again: no further charge, already-equipped notice.
- Resized to 390×844, selected REBUY and used the cart, then closed back to play.
- Visually reviewed landscape and portrait screenshots; the selected row, fixed
  cart and result message are visible.

Run with an isolated review fixture:

```sh
node validate/prepare-touch-controls.mjs /tmp/cs16-rebuy-review --no-native-bindings
# Install dependencies in that fixture, then run its npm run start:server -- --port 8034.
# Connect one isolated muted headless browser with the approved loopback permission.
node validate/rebuy.mjs <browser-CDP-websocket> validate/game/rebuy
```

`checks.json` contains the observed money/ammo values. This browser check uses
mouse events on the scene's mobile UI: **native phone input and multitouch remain
unverified**. Round/death restoration, partial funds, equipment ordering and replay
rejection were checked with production server adapters and installed SDK components,
not a two-player live match. Desktop REBUY routing/layout was code-reviewed only.

The owned browser and fixture server were closed after the check.
