# Bevy movement regression

The production movement rules run in a separate scene/room. The fixture uses
$16000, a starting AWP, parked bots, extended rounds and buy time. E/F invoke
server-confirmed one-damage AK/Glock hits on the reviewer. Physics platforms and
stairs exist only in the fixture. WASD, Shift, Space and menu clicks are real CDP
inputs; player velocity and transforms come from Bevy's renderer.

## Reproduce

From the scene repo:

```sh
npm run validate
node validate/prepare-cs-movement.mjs /tmp/cs16-movement-review
cd /tmp/cs16-movement-review
npm install
npm start -- --web --port 8011
```

Open a muted headless WebGPU Chromium session at:

```text
https://decentraland.org/bevy-web/?preview=true&realm=http%3A%2F%2F127.0.0.1%3A8011&position=5%2C8&guest=1
```

Grant that isolated test origin its loopback permission. From the original scene
repo, pass the browser CDP websocket to either runner:

```sh
node validate/cs-movement.mjs "$CDP_WEBSOCKET" /tmp/cs16-movement-evidence
node validate/cs-steps.mjs "$CDP_WEBSOCKET" /tmp/cs16-movement-evidence/steps.json
```

Each runner expects a fresh guest/team lobby; close/reopen the owned test browser
between runs. Do not hot-reload an active scope browser after changing fixture
source. The recorded review used muted headless Brave 151 with WebGPU, the hosted
official Bevy client and the pinned scene SDK. No Unity client was launched.

## Evidence

- `browser.json`: ramp running, release friction, diagonal Shift walking,
  counter-strafing, a standing jump without held-key pogo, small/large flinch,
  native box support and jumping, safe/damaging/fatal falls, then respawn.
- `steps.json`: three 20 cm stairs, a 45 cm step, a 50 cm obstacle, a tall wall
  and a low ceiling. The last three block passage. Fixtures sit above Dust2 to
  isolate these collisions from existing geometry.
- `source.json`: hashes of the production rules and fixture generators.
- `validation.txt`: complete scene validation gate.
- `browser-errors.txt`: browser-reported errors after the successful review.

Native velocity and displacement jointly verify the short rifle impulse: a full
scene snapshot samples too slowly to guarantee capturing its first-frame peak.
Pure tests check the 170 HU/s input impulse separately. Fall events are ordered by
timestamp rather than ECS entity ID, since entity reuse does not preserve event
order. Headless capture is not a listening test or an original-client comparison.
See [movement rules and remaining limits](../../../docs/CS16-MOVEMENT.md).
