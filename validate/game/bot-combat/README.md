# Bot AK combat evidence

`rounds.json` records the current production scene through three player kills,
a CT victory, restored health/ammo in the next round, a bot-caused T victory,
and retained 3/1 player stats. Bot scores remain sorted by kills.

`hits.json` records another live unarmored player: 100→65→30→0 health, with
99 and 101 ms between observed damage updates. It also records yellow muzzle
effects, gray bullet-endpoint effects and the named Guerilla/AK-47 kill feed.
The final hit consumed the remaining 30 health; this does not imply a different
weapon damage value. The live trace does not exercise armor or a full reload.
Those rules are covered in `tests/bot-combat.test.mjs`, including finite reserves,
reload duration, disabled dead-bot reloads, shared recoil/spread, map occlusion
and intervening bot hitboxes. The full gate passes 99 tests and build/typecheck.

The old slow body-shot script and a headshot variant lost to the earliest-firing
bot, which they targeted last. The final script prioritizes encounter spawn
order and shortens pauses, keeping production damage and reaction times intact.
The hit observer now waits for the separate kill-feed event after health reaches
zero; those network updates need not arrive in the same frame.

Use an isolated checkout on port 8005 and stock Bevy served on 8123. Open a muted
browser, obtain its CDP URL, and run from the scene repository:

```sh
node validate/game.mjs "$CS_CDP" validate/game/bot-combat/rounds.json --fresh-page
node validate/bot-combat.mjs "$CS_CDP"
```

The first command expects a fresh solo match. The second waits for a healthy
live round, then observes idle-player damage. Close owned browsers and stop the
isolated server after validation. Current muzzle/impact spheres are placeholders;
original animations, sounds, bot aiming tactics and bomb play remain unfinished.
