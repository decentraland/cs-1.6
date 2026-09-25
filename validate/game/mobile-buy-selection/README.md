# Mobile purchase and FIRE verification

Captured 2026-09-21 using one muted isolated Brave headless browser and hosted
Bevy. The temporary scene forces mobile layout, starts at $16000, pauses bot
attacks, extends buy/round timers and disables native UI input bindings. It has
its own multiplayer identity. This does not emulate native Godot multitouch.

- Holding FIRE consumed six M4 rounds (30 → 24); release stopped firing with
  native bindings disabled. Walk stayed at 2.99 m/s after release, and another
  tap restored 5.75 m/s. See `fire/checks.json` and `fire-runtime.log`.
- Touching AUG then Scout kept $12900. The cart bought Scout once for $2750,
  leaving $10150. A repeat cart press on the owned Scout spent nothing.
- Reopening the menu cleared selection; the empty cart spent nothing. Captures
  show fixed cart layout at 844×390 and 390×844. See `menu-runtime.log`.
- `before-tests.log` records the failing row-selection regression before the
  change: touching M4A1 immediately sent a purchase.

To reproduce, create a new fixture with:

```sh
node validate/prepare-touch-controls.mjs /tmp/cs16-mobile-review --no-native-bindings
cd /tmp/cs16-mobile-review
npm ci
npm run start:server -- --port 8034
```

Connect one isolated muted headless browser to the Bevy preview with loopback
permission. From the source repository, run these in order against its CDP
websocket (the first joins CT and buys M4A1):

```sh
node validate/mobile-controls.mjs <browser-CDP-websocket> /tmp/cs16-mobile-fire
node validate/mobile-buy-selection.mjs <browser-CDP-websocket> /tmp/cs16-mobile-buy
```

Close the owned browser and fixture server afterward. Device checks remain in
[the touch controls guide](../../../docs/CS16-TOUCH-CONTROLS.md).
