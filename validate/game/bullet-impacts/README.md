# Original bullet-hole feedback

One isolated muted headless Bevy browser exercised the production touch FIRE
callbacks with `UiInputBinding` disabled. The fixture froze bots and supplied
$16,000 with a one-hour buy/round window; it did not change shots or damage.

- M3: clip **8 → 7**, nine visible surface decals after server confirmation.
  The same nine entities remained after the prediction timeout.
- M4A1: clip **30 → 29**, an additional wall decal while the shotgun holes persisted.
- Captures show the original transparent textures on the Dust2 wall, without
  the former floating gray spheres.

See [M3 capture](m3-wall.png), [M4A1 capture](m4-wall.png), [checks](checks.json)
and their matching JSON snapshots for actual materials, normals and positions.
Ricochet asset selection is tested in code; the browser was muted, so the capture
does not establish perceptual sound parity. Native phone input is unverified.

## Repeat

From the scene repository, create a new review folder:

```sh
node validate/prepare-touch-controls.mjs /private/tmp/cs16-impact-review-new --no-native-bindings
cd /private/tmp/cs16-impact-review-new
npm ci
npm run start:server -- --port 8034
```

Use one isolated muted headless browser at 1280×720, grant its loopback-network
permission for `https://decentraland.org`, and enter as a guest at:

```text
https://decentraland.org/bevy-web/?preview=true&realm=http%3A%2F%2F127.0.0.1%3A8034&position=5%2C8
```

From the original repository, run the driver against that browser's CDP websocket
and write captures outside the served fixture:

```sh
node validate/bullet-impacts.mjs "$CS16_REVIEW_CDP" /private/tmp/cs16-impact-captures
```

The driver buys through the menu, fires using the icon, checks the clip and decal
counts, then saves screenshots. It uses the default CT camera heading; no desktop
pointer capture is needed. Close the owned browser and port-8034 server afterward.
Do not modify the served fixture while testing: the preview watcher restarts the
match for content changes. Teleport slightly above a floor to avoid placing the
native capsule inside its collision surface.

`tests/bullet-impacts.test.mjs` separately verifies immediate prediction, normal
alignment, source ricochet rules, correction without sound replay, rejection,
timeout, round cleanup, pool reuse and all nine impacts through SDK Room.
See [behavior, sources and remaining rendering limits](../../../docs/CS16-BULLET-IMPACTS.md).

Full production gate: `npm run validate` passed all **447 tests**, asset integrity
and SDK bundling/typecheck. No native phone client was launched.
