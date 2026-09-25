# AUG / SG552 zoom viewmodel visibility

2026-09-22; SDK 7.27.1-33533530571.commit-451d001; official Bevy web preview in
one isolated muted headless Brave browser.

The [pinned CS client view code](https://github.com/Velaron/cs16-client/blob/2d125db28d2c043fd0730c9970066d845574dbb0/cl_dll/view.cpp#L903) hides the viewmodel only at FOV
40 or below. AUG and SG552 use 55 degrees and retain their model. The scene
previously hid every viewmodel whenever zoom differed from 90.

`tests/weapon-view-zoom.test.mjs` drives production `weapon-view.ts` with the
installed SDK Engine, Transform, VisibilityComponent and Animator components.
It covers AUG/SG552 firing visibility, all four sniper scope levels, unzoom,
inactive cached models and death. Two tests failed before the change; see
`before-tests.log`.

Live check:

```sh
node validate/prepare-touch-controls.mjs /tmp/cs16-rifle-zoom --no-native-bindings
# Install dependencies and run npm run start:server -- --port <free-port> there.
# Open only the isolated headless preview, then from the scene repository:
node validate/zoom-viewmodels.mjs <owned-browser-CDP-websocket> <output-directory>
```

The fixture forces touch UI, gives $16,000, extends round/buy time and pauses bot
AI. It retains the native touch camera. Actual icon presses purchased an AUG,
selected zoom, fired with its model still visible, unzoomed, then bought/scoped
an AWP and restored its model on unzoom. `checks.json` records the assertions;
`aug-zoomed.png` and `awp-scoped.png` were visually inspected. The server and
browser were closed after capture. SG552 has production-component regression
coverage, not a separate browser capture here.

This verifies zoom-state visibility and touch-icon routing, not native mobile
multitouch or magnification. Native-camera FOV support remains a separate gap.
