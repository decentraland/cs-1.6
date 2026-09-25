# Desktop menu confirmations

The purchase confirmation used to float over the desktop buy menu at 25% of
screen height, covering the money panel. The shared desktop menu frame now puts
its notice below the title and above the controls. Only the topmost open menu
receives it; closing the menu restores an unexpired notice to the HUD. Mobile
keeps its existing footer and the five-second lifetime is unchanged.

## Regression proof

```sh
node --experimental-strip-types --test tests/menu-notices.test.mjs tests/touch-controls.test.mjs tests/mobile-buy-selection.test.mjs tests/buy-capture.test.mjs
npm run validate
```

Both new cases fail against the prior buy/menu components ([before](before-tests.log)).
The 20 focused checks pass afterward ([after](after-tests.log)); the full gate
passes 478 tests, asset checks, bundling and typecheck ([log](full-gate.log)).
The new tests render production buy components at 640×480, 800×450, 1280×720
and 1920×1080. They cover categories and rifles, notice bounds, unchanged button
positions and pointer transparency. Existing mobile and cursor regressions also pass.

## Rendered check

One isolated, muted headless Bevy preview at 1280×720 passed a real resync with
BUY open, then purchased M4A1 for $3100. Exactly one confirmation appeared on
both menu pages, within y=120–162; controls start at y=174. Closing BUY restored
one HUD notice, which then expired. See [state](browser.json), [output](browser.log),
[rifles](purchase-after-resync.png) and [categories](categories-notice.png).
The [prior capture](../buy-capture/purchase-after-resync.png) shows the overlap.

Follow the [isolated browser setup](../buy-capture/README.md#rendered-proof),
using `validate/buy-capture.mjs` and a separate evidence directory. That checker
now also verifies notice placement, HUD restoration and expiry. The fixture
pauses bots and extends buy/round time, but does not change notice lifetime.

The browser/server were closed after the check. Native phone and Unity rendering,
and a rendered team-menu notice, were not exercised. The team menu uses the same
header component. Native Explorer overlays remain visible in the screenshots;
these captures do not establish exact CS 1.6 visual parity.
