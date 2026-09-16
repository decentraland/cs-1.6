# Grenade browser review

Run the controlled review with the production grenade code:

```sh
node validate/prepare-grenades.mjs /tmp/cs16-grenade-review
cd /tmp/cs16-grenade-review
npm install
npm start -- --web --port 8011
```

Open `https://decentraland.org/bevy-web/?preview=true&realm=http%3A%2F%2F127.0.0.1%3A8011&position=5%2C8&guest=1` in an isolated, muted headless Chromium browser with WebGPU enabled. Wait until `/about` responds before navigating. Grant loopback-network access only in that test browser; keep its CDP permission connection open. This run uses Brave 151 because the available Chrome-for-Testing 150 build stalled during WebGPU startup.

From the real scene repo, run:

```sh
node validate/grenades.mjs <browser-CDP-websocket> validate/game/grenades <agent-browser-session>
node validate/grenade-combat.mjs <browser-CDP-websocket> validate/game/grenades <agent-browser-session>
```

The test drives actual UI/key/mouse input and reads Bevy's `/crdt_snapshot`. The fixture adds tiny diagnostic TextShapes exposing replicated grenade/player data. It starts with $16000 and an AWP, pauses bots, extends the round to one hour and allows purchases throughout the round. **Purchases still deduct their normal prices.** The fixture has a separate multiplayer identity. No runtime rule is disabled for grenade damage, inventory, fuse, bounce, flashing or smoke.

Checks: $1000 buys two flashes, one HE and one smoke; another $650 buys kevlar. Full-capacity buttons preserve money. Shift+3 cycles Flash → HE → Smoke. Holding a pin for more than two seconds does not spawn or cook a grenade. Releasing starts the source fuse and flash returns to the AWP with one flash remaining. A nearby, faced flash causes the white fade. Smoke creates 20 original cloud sprites and the original canister; it disappears after 30 seconds. A close HE deals self-damage and consumes armor, then selects the firearm. `browser.json` records measured timings, state and results. The subsequent combat check verifies the weaker facing-away flash, a flash blocked by the middle door, HE damage through that door, a primed flash dropped on death, the simultaneous firearm death drop, discarded spare grenades and clean state on the following round; `combat.json` records those results. Smoke planes are asserted to share the camera axes, preventing the per-sprite billboard seams found during review.

Captures: `equipment.png`, `flash-held.png`, `flash-white.png`, `smoke.png`, `he-explosion.png`, `smoke-cleared.png`, `flash-away.png`, `he-through-door.png`, `primed-death.png`. Captures include the stock Bevy preview/sidebar overlay, which the SDK scene does not control.

This review proves the listed controlled behaviors. It does not prove complete GoldSrc rendering, moving-bot tactics, grenade throws by bots, or multi-human match parity. See [rules and limits](../../../docs/CS16-GRENADES.md).
