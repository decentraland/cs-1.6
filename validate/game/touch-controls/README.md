# Custom controls and buying — 2026-09-21

One isolated, muted Brave 151 headless browser rendered the mobile scene UI in
hosted Bevy. Real pointer clicks joined CT, bought an M4A1 for $3100, confirmed
that tapping the owned item neither closed BUY nor spent money/ammo, selected
knife/primary, and toggled the silencer. BUY/CLOSE worked at 1280×720, 844×390 and
390×844. The check exposed desktop keyboard hints and wrapped labels on phones;
the current captures show the corrected layout.

- [Landscape controls](controls-phone-landscape.png)
- [Portrait controls](controls-phone-portrait.png)
- [Landscape buying](buy-phone-landscape.png)
- [Portrait buying](buy-phone-portrait.png)
- [Checks and limitations](checks.json)

The fixture forces mobile layout, pauses bots, provides $16000 and extends
round/buy time to an hour. The harness hides the hosted browser shell and dismisses
the preview statistics overlay. Native joystick/look controls are not supplied by
Bevy; these captures do **not** prove Godot multitouch, held actions or scope FOV.

## Repeat

From the scene repository:

```sh
node validate/prepare-touch-controls.mjs /tmp/cs16-touch-review-new
cd /tmp/cs16-touch-review-new
npm ci
npm run start:server -- --port 8034
```

Use one isolated headless browser with WebGPU and muted audio. Before navigating,
grant the Decentraland origin `loopback-network` with CDP `Browser.setPermission`
and keep that CDP connection open for the entire test. The permission expires on
disconnect. Open:

```text
https://decentraland.org/bevy-web/?preview=true&realm=http%3A%2F%2F127.0.0.1%3A8034&position=5%2C8&guest=1
```

Choose **EXPLORE AS GUEST** if login is shown. Once SELECT TEAM is visible, run
from the original repository against that browser's CDP WebSocket:

```sh
node validate/touch-controls.mjs <browser-CDP-websocket> /tmp/cs16-touch-proof
```

The harness expects a fresh fixture/player with $16000. It checks the real scene
state after clicks and saves screenshots with UI/HUD summaries. No connection
credentials are included. Close the owned browser and preview server afterward.
The source scene and creator previews remain untouched.

For a manual visual regression, force mobile layout with this fixture, join CT,
and resize to 844×390 or 390×844: keyboard hints must disappear, PRIMARY/GRENADE
must each fit on one line, and FIRE/RELOAD/BUY must remain separate tap targets.
