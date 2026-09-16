# Bot movement and hit-response review

Captured 2026-09-15 in muted headless Brave 151.0.7922.169 with WebGPU, the hosted
official Bevy client and the scene's pinned SDK. The production server owns bot
movement and damage. The screenshot shows the synchronized AvatarShape and held
weapon; the diagnostics record actual server displacement and velocity.

## Reproduce

From the scene repository:

```sh
npm run validate
node validate/prepare-bot-movement.mjs /tmp/cs16-bot-review
cd /tmp/cs16-bot-review
npm install
npm start -- --web --port 8011
```

Open a fresh muted headless Chromium guest with WebGPU at:

```text
https://decentraland.org/bevy-web/?preview=true&realm=http%3A%2F%2F127.0.0.1%3A8011&position=5%2C8&guest=1
```

Grant the isolated test browser's origin its loopback permission. From the scene
repository, pass the browser's CDP websocket to the runner:

```sh
node validate/bot-movement.mjs "$CDP_WEBSOCKET" /tmp/cs16-bot-evidence
```

The controlled fixture has an isolated room, $16000, extended round/buy time and
a starting M4A1. Bot 0 cycles hold/run/hold/walk/hold on key 4; those mode changes
reset its health and motor. Other bots stay parked and none fire. USP/M4A1 shots
use real input and the production hit/damage path. The short diagnostic sample
buffer captures impulses between slower renderer snapshots.

For normal combat, close the owned browser and stop that test server, then use a
new fixture directory:

```sh
node validate/prepare-bot-round.mjs /tmp/cs16-bot-round-review
cd /tmp/cs16-bot-round-review
npm install
npm start -- --web --port 8011
```

Open a fresh guest at the same preview URL. From the scene repository:

```sh
node validate/bot-round.mjs "$CDP_WEBSOCKET" /tmp/cs16-bot-round-evidence
```

This second fixture retains normal AI/combat and adds read-only diagnostics to
the isolated movement fixture ($16000, starting AWP, extended rounds/buy time).
The runner teleports the reviewer near a bot to stage an encounter. That teleport
does not establish player movement correctness. Do not hot-reload either active
test browser after changing fixture source; close owned resources afterward.

## Recorded results

- `browser.json`: AK-equipped bot accelerates to 5.525 m/s and walks at 2.873 m/s
  (52%). A real USP hit lowers its health to 73 and slows its actual motion, then
  the modifier recovers to 1. An M4A1 hit lowers health to 69 and pushes it about
  0.194 m away. Later USP hits kill it; its position and zero velocity stay fixed.
- `hit-bot.png` / `dead-bot.png`: visible live bot, held/dropped AK, original M4A1
  and USP viewmodels, and the death result. Character animation remains a
  placeholder; these are not original-client visual-parity captures.
- `round.json`: normal bots move and shoot; player health reaches zero, the bot
  kill total increases from 3 to 4, Terrorists win round 2, and round 3 starts
  with full player/bot health, zero bot velocity and modifier 1.
- `validation.txt`: 227 tests pass, followed by asset validation, bundle and
  typecheck. `source.json` binds the evidence to source/fixture hashes.
- `browser-errors.txt`: browser-reported errors after the controlled review;
  `round-browser-errors.txt` covers the normal round. Server guest-profile fetch
  warnings are separate from these browser error records.

Fixtures make the encounter repeatable; their health resets and starting loadouts
are not evidence of unmodified match balance. Headless capture does not verify
audio by listening. Bots remain grounded and use sampled standing-body clearance
against Dust2's BSP. See [implementation and limits](../../../docs/CS16-BOT-MOVEMENT.md).
