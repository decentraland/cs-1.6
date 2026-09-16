# Hit response in muted headless Bevy

`browser.json` records a run against the official `https://decentraland.org/bevy-web/` build with the isolated scene on port 8011. The browser is muted and headless, with the approved localhost permission. No Unity client is involved.

The fixture parks bots, extends the round/buy window and grants review money/AWP, inherited from `prepare-arsenal.mjs`. E applies ten deterministic incoming shots through production `fireGunShot`, `damageBatches` and `applyPlayerDamage`, resetting only the test victim's health/armor between cases. F places existing bots at visible test positions for real mouse shots. Tiny diagnostic TextShapes expose state; these fixture hooks are not installed in the playable scene.

From 100 health: AK chest/arm →65, stomach →57, leg →74; armored stomach →67. Glock head →16 without armor, →56 with helmet and →18 when that hit exhausts one armor point. The six-pellet XM1014 stomach blast leaves 33 health through armor. The fatal AK headshot kills and the next round restores the player. Health HUD digits are decoded and compared, not inferred from a screenshot. Arm/leg/protected-hit camera offsets remain zero.

A real USP mouse click damages a visible bot; a subsequent headshot kills it. The trace, resulting health, clip state, original positional pain/death AudioSources and screenshot are captured. Bots are repositioned outside their old pose history in this fixture, so the server rejects the client target-position claim and successfully falls back to its current authoritative trace.

Original flesh, helmet, Kevlar, headshot and death sounds are verified at the WebAudio buffer start: frame count, channel count, sample rate, and PCM samples from both the start and middle of the pinned WAV. Middle samples distinguish clips whose initial samples are silence. Each window permits a small independent gain correction because Bevy applies slightly different gains to output chunks. The final comparison was rerun on the same captured buffers, as recorded in `browser.json`. One local voice emitter is reused across consecutive hits; bot emitters are positional. The browser is muted throughout.

## Repeat

From the scene root:

```sh
node validate/prepare-hit-response.mjs /path/to/new-hit-fixture
cd /path/to/new-hit-fixture
npm install
npm start -- --web --port 8011
```

Open the official preview in an isolated muted headless Brave/Chromium session with WebGPU enabled and loopback permission for `https://decentraland.org`. Preview URL:

```text
https://decentraland.org/bevy-web/?preview=true&realm=http%3A%2F%2F127.0.0.1%3A8011&position=5%2C8&guest=1
```

Then, from the production scene root:

```sh
node validate/hit-response.mjs ws://127.0.0.1:PORT/devtools/browser/ID validate/game/hits
```

Use a fresh browser and review server on repeats; diagnostic markers intentionally persist through the test round. Stop the owned browser/server when finished. `source.json` records production/fixture source hashes and differences. `validation.txt` is the installed scene's gate output. This fixture does not prove unmodified bot AI, multiplayer latency, original character hitbox alignment or hit-induced movement slowdown.
