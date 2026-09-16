# Weapon drops and pickups

The review uses an isolated, muted, headless Brave browser with the official Bevy
web client. It exercises production inventory, pickup, damage and round code.
The September 15, 2026 [validation record](validation.json) pins the browser, SDK,
production/fixture source and evidence hashes; [the full gate summary](validation.txt)
records 174 passing tests, asset checks, bundle and typecheck.

The check covers a scoped AWP drop, the original ground model, walking pickup,
reserve preservation, a bot's death drop, a CT taking and firing a Terrorist AK,
purchase replacement, occupied-slot rejection, retaining the AK when buying a
Deagle (then selecting that pistol with 2), human death while holding a knife,
and clearing ground guns at the next round. [Recorded state](browser.json) links
the results to ammunition, health and dropped-weapon metadata. Captures:
[AWP on the ground](awp-on-ground.png), [captured AK](captured-ak47.png),
[human death drop](death-drop.png), [next round](next-round.png).

## Reproduce

From the scene repo:

```sh
node validate/prepare-pickups.mjs /tmp/cs16-pickup-review
cd /tmp/cs16-pickup-review
npm install
npm start -- --web --port 8011
```

Wait for the server's first tick and confirm `curl --fail http://127.0.0.1:8011/about`
succeeds before opening the browser.

Follow the [arsenal browser setup](../arsenal/README.md), using
`cs16-pickup-review` as the session name. Explicitly select Brave, enable WebGPU,
mute audio, and grant loopback access to the Decentraland origin before loading
the preview. Keep the permission CDP connection open. Do not join a team manually.
Then run from the original repository:

```sh
node validate/pickups.mjs <browser-CDP-websocket> /tmp/cs16-pickup-evidence cs16-pickup-review
```

The fixture uses a unique room, $16000, a starting AWP, refunded purchases and a
one-hour round. Bot 0 stands behind the middle door. Bots pause until the player
holds a knife; the final check enables their normal combat to kill the player.
Tiny TextShape fields expose synchronized drop contents and bot health to the
inspector. These test overrides are confined to the temporary fixture. Runtime
money deduction is not covered by this refunded setup; rule tests cover prices
and ammo accounting. Audio is muted; the original pickup sound is hash-checked.

The production source keeps normal starting money, loadouts, buy restrictions,
round length and bot behavior. The check starts from a fresh fixture/browser;
a failed or completed run needs a new fixture before repeating the whole sequence.
Close the test browser and server afterward. Avoid live reload while scoped due
to the current upstream Bevy directional-light texture-camera crash.
