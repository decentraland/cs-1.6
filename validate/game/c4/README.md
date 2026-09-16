# C4 browser validation

Captured September 15, 2026 with muted headless Brave (Chromium 151), the official
Bevy web preview, SDK 7.27.1-33533530571.commit-451d001 and isolated local realm
port 8011. The user's port 8000 scene and Blender remained running. No Unity
client was launched.

The fixture starts with an AWP, $16000 and stationary bots. The round is extended
so it does not interrupt the check. Tiny TextShapes expose replicated state;
all tested C4 actions, cooldowns, defuses and rendering use production code.
The defuse fixture additionally places the current bot carrier at A. Teleports
stage encounters and are not evidence of GoldSrc movement parity.

`browser.json` records original viewmodel selection, C4's own movement speed,
early/late cancellation, lowering animation, holstering, drop/pickup, planting,
best-weapon retirement, original keypad AudioSource, blink components, Terrorist
use remaining mobile, explosion effects, deaths and the next round. Screenshots
show the held model, keypad animation, lowering, backpack and planted model.
The explosion screenshot is the blast death/round outcome; the player's death
camera looks at a nearby wall. Sprite components are asserted separately.

`defuse.json` records bot-held and planted C4 (with a renderer-finished check), release cancellation, a ten-second
defuse without a kit and a five-second defuse with one, and model removal. Both
rounds award CT; defusing does not trigger the AWP's alternate zoom action.

`validation.txt` records the full gate: 186 tests, original media/model verification,
bundle and typecheck. `source.json` hashes the production source used by these
checks. Reproduce with [the C4 recipe](../../../docs/CS16-C4.md). Published Bevy
may change after these captures.

Audio was muted: the check verifies paths, source bytes and scheduled components,
not perceived playback or attenuation. Decentraland avatars, C4 progress UI,
drop physics, additive blending and native movement still differ from CS 1.6.
