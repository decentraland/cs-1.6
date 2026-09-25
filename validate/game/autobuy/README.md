# Auto-buy verification — 2026-09-22

`npm run validate`: **410 tests passed**, asset integrity passed, build and
typecheck passed. Eight new integration cases fail before the implementation.

The tests use production economy/inventory/weapon adapters, installed SDK ECS
components, and SDK Room messages. They cover both teams, default prices, rifle
fallback thresholds, pistol-round equipment order, armor fallback/repair, carried
primaries, shared MP5/Glock ammunition, rebuy snapshots and replay rejection.

## Headless menu check

One isolated muted headless Brave browser with stock hosted Bevy; the mobile
fixture uses $16000, paused bots, long round/buy times and disabled UiInputBinding
so scene callbacks handle the controls. This is not a native phone test.

- At 844×390, AUTO BUY and REBUY precede category rows and remain visible without
  scrolling. Selecting AUTO BUY does not spend money.
- The cart buys the CT default loadout: M4A1, ammo, kit and armor, costing $4655.
  Observed HUD: $11345, 100 armor, 30/90 ammunition. Kit ownership and secondary
  reserve are asserted in the production-adapter tests.
- Repeating the purchase spends nothing and shows a result notice.
- At 320×568, the actual AUTO BUY row remains selectable and the fixed cart stays
  in bounds. Category rows scroll beneath it. Screenshots were visually reviewed.

The first portrait attempt exposed a test selector bug: it found the selected-item
caption instead of the clickable row and opened the SMG submenu. The harness now
requires a PointerEvents parent and checks that AUTO BUY remains selected in the
root menu. Only the portrait step was rerun in the same browser; checks.json records
the correction. The rebuy harness uses the same corrected row-target predicate.

Reproduce with a fresh isolated fixture:

```sh
node validate/prepare-touch-controls.mjs /tmp/cs16-autobuy-review --no-native-bindings
# Install dependencies in that fixture, then run npm run start:server -- --port 8034.
# Connect one isolated muted headless browser with the approved loopback permission.
node validate/autobuy.mjs <browser-CDP-websocket> validate/game/autobuy
```

Native phone input/multitouch and desktop button rendering remain unverified.
The browser check covers CT full-funds purchasing; other budgets and teams use
the integration tests. The owned browser and fixture server were closed afterward.
