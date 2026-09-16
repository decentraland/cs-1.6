# Shooting and finite-ammo regression — 2026-09-15

The preview requested `@dcl-regenesislabs/bevy-headless-server@latest` but actually
ran cached `0.1.0-32423386171.commit-d18de13`. Its server saw the player's
`PlayerIdentityData` but no `Transform`: a real mouse shot advanced `lastShotId`
while `lastFiredShotId` and ammunition stayed unchanged. Shot rejection happened
before hit tracing. Also reproduced with cached `84ae1f6`.

Using explicit `0.1.0-34588802161.commit-3926f33` connected its Pulse scene listener,
restored server-observed player positions and accepted the same real mouse input.
The scene's start scripts now select that exact build; existing running previews
need a restart. No client position fallback or relaxed server validation was added.

`result.json` records an isolated muted headless Brave session against hosted Bevy
web and the pinned authority. It proves:

- Source Arctic bot: health 100 → 0, alive false, from actual mouse shots. The
  first unscoped AWP shot missed; the second, after aiming again, killed it.
- USP: starts 12/24, consumes each round on the server, reloads to 12/12 and
  12/0, then stays 0/0 after an additional click. Exactly 36 USP shots accepted.
- Client prediction and server traces now evaluate synchronized source body poses.
  This test checks a standing bot; moving-pose timing is not a latency test.

The fixture gives an AWP and $16000, freezes bots and extends round time. It uses
production shooting, ammo, hitboxes and death handling; no scripted damage.
`aim.png` captures the initial missed shot's view, not proof of aiming at the bot.

## Reproduce

From the scene checkout, create a fresh disposable fixture, then install its dependencies:

```sh
node validate/prepare-combat-recovery.mjs /tmp/cs16-combat-review
cd /tmp/cs16-combat-review
npm install
DCL_SERVER_PACKAGE=@dcl-regenesislabs/bevy-headless-server@0.1.0-34588802161.commit-3926f33 npm run start:server -- --port 8011
```

Open one isolated muted headless browser at
`https://decentraland.org/bevy-web/?preview=true&realm=http%3A%2F%2F127.0.0.1%3A8011&position=5%2C8&guest=1`,
allow localhost in that test browser, and from the original checkout run:

```sh
node validate/combat-recovery.mjs <browser-CDP-websocket> /tmp/cs16-combat-evidence
```

For the failing-before comparison, run the old authority `d18de13` with the source
recorded in `before-source.json`; the browser logs show no accepted shots. The
patched client additionally shows “Waiting for player position...” and suppresses
local gun/knife effects when a position is unavailable. A stale match connection
also suppresses those effects after the existing eight-second detection window.


`reconnect.json` records a separate real-input check: the owned test authority
was paused until the match became stale, a click reached the scene without
sending a shot or spending ammo, and the connection recovered after resuming it.
Repeat only against a disposable authority you own (never a shared match):

```sh
node validate/combat-connection.mjs <browser-CDP-websocket> <test-authority-PID> /tmp/reconnect.json
```

`npm run validate`: 273 tests passed, asset integrity passed, bundle and TypeScript
passed. `source.json` records the production source used by the passing fixture;
fixture exceptions are listed above. This does not certify all moving poses,
other explorer builds or public deployment infrastructure.
