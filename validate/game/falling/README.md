# Fall damage browser evidence

Captured September 15, 2026 in muted headless Brave (Chromium 151), using the
official Bevy web preview and SDK/runtime `7.27.1-33533530571.commit-451d001`.
The isolated realm used port 8011; the user's port 8000 preview was preserved.

- `browser.json`: actual keyboard movement off the test platforms. The low drop
  kept 100 health. Each higher drop dealt 30 damage from the validated native
  impact speed (about 16.16 m/s): 100 → 70 → 40 → 10 → 0. Armor stayed at 100,
  the helmet remained equipped and money stayed at $15000 before round rewards.
  The fatal fall added one death and no kills. Respawn restored 100 health and
  did not trigger false fall damage. Camera-roll samples and original splat
  AudioSource scheduling are included.
- `no-reports.json`: the same gameplay checks with outgoing landing reports
  disabled. Server-observed motion still caused damage and a fatal fall. This
  fallback has approximate velocity and does not promise the same integer damage
  as the native-report path.
- `fall-hurt.png` and `fall-death.png`: normal-report screenshots. The official
  preview overlay/minimap are visible; these are gameplay captures, not HUD
  fidelity reference images.
- `source.json`: production/fixture hashes and fixture changes.
- `validation.txt`: installed scene gate, **201 tests passed**, original assets,
  bundle and typecheck.

The fixture also sent a bogus 40 m/s landing report on flat ground. It caused no
damage. Both final browser passes reported no page exceptions. Tests were muted;
audio scheduling is observed, not a listening comparison. Touch camera offsets,
identical CS drop-height physics and adverse-network parity were not verified.

## Reproduce

From the scene repository:

```sh
node validate/prepare-falling.mjs /tmp/cs16-falling-review
cd /tmp/cs16-falling-review
npm install
npm start -- --web --port 8011
```

Open a muted headless Chromium with WebGPU at:

`https://decentraland.org/bevy-web/?preview=true&realm=http%3A%2F%2F127.0.0.1%3A8011&position=5%2C8&guest=1`

Grant the isolated origin loopback access when Chromium requests it. Keep the
permission/CDP connection alive. From the source repository:

```sh
node validate/falling.mjs "$CDP_WEBSOCKET" /tmp/cs16-falling-evidence cs16-falling-review
```

For fallback coverage, close that browser/server and create a fresh fixture:

```sh
node validate/prepare-falling.mjs /tmp/cs16-falling-no-reports no-reports
# Start this fixture on 8011 and open a fresh muted browser, then:
node validate/falling.mjs "$CDP_WEBSOCKET" /tmp/cs16-falling-no-reports-evidence cs16-falling-review no-reports
```

The fixture inherits the arsenal review's $16000 starting balance, AWP, extended
round/buy time and parked bots. It adds two small takeoff platforms at y=14 and
24, tiny diagnostic TextShapes and one forged grounded landing report. The test
buys real Kevlar+Helmet through the UI and walks off each platform using real
input. Teleports position the player on platforms; they do not supply damage or
health. Damage, camera, deaths, inventory drops and rounds run production code.
The no-reports variant additionally suppresses the client landing message.

An initial y=46 platform landed above the playable BSP instead of on Dust2's
walkable floor; that setup was removed. Fatal falls are tested by repeating the
reachable high drop until health is exhausted. A separate first-pass timing
spike was fixed and preserved as a unit regression.

Close owned browsers and test servers after validation.
