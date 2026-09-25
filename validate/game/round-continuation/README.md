# Round result gameplay check

Captured 2026-09-21 in one isolated muted headless Bevy browser, using the mobile
scene layout at 844×390. [Screenshot](result.png), [measured state](checks.json).
The fixture has an M4/HE, $16000, a 12-second live round and 25-second result to
allow sequential actions. Bots move normally but their attacks are disabled.
Production uses a 120-second live round and five-second result.

Observed during round 8's CT result:

- Player moved about 2.74 m with movement speed set to 5.75 m/s.
- Holding the FIRE icon spent six rounds (30 → 24); release stopped fire.
- Reload restored 30/84 from 24/90, preserving total ammunition.
- Knife and HE selection worked; hold/release launched one HE and used its reserve.
- Bots continued moving. The score stayed 8–0 throughout.
- Round 9 entered freeze at 8–0. Speed became zero; FIRE did not spend ammo.
  The surviving player's rifle retained 30/84.

The test browser and fixture server were closed after capture. This verifies
scene callbacks in desktop Bevy with the mobile layout, not native phone multitouch.
Human damage and duplicate/queued-shot rejection use the production-server tests;
this browser check does not establish human-vs-bot damage or a complete match.

## Reproduce

From the scene repo:

```sh
node validate/prepare-touch-controls.mjs /tmp/cs16-round-review
node validate/prepare-round-continuation.mjs /tmp/cs16-round-review
```

Use a new destination. Install dependencies there with `npm ci`, then run
`npm run start:server -- --port 8034`. Open one isolated headless browser with CDP
and loopback access at the Bevy preview for port 8034:
`https://decentraland.org/bevy-web/?preview=true&realm=http%3A%2F%2F127.0.0.1%3A8034&position=5%2C8&guest=1`.

From the source repo, run:

```sh
node validate/round-continuation.mjs <browser-CDP-websocket> /tmp/cs16-round-capture
```

The checker joins CT if the team menu is open; an already-joined living CT can
also run it. Close the owned browser and stop the fixture server afterward.

Run `npm run validate` for the full gate. The focused server-fire, client-fire,
and mobile-control regressions in `tests/round-continuation.test.mjs` failed on
the previous source (unchanged ammo and missing controls) and passed with this fix.
