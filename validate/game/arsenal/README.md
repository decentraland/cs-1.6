# Arsenal browser review

Recorded 2026-09-15 in an isolated, muted, headless Brave browser running the official
[Bevy web client](https://decentraland.org/bevy-web/). No Unity client or engine fork was used.

All 24 firearms loaded their original GLB in-world, consumed authoritative ammunition,
played a source firing animation, and reloaded. Both shotgun shell reloads completed.
USP/M4 silencers selected the silenced firing clips. Glock/FAMAS bursts fired three
bullets after releasing the mouse. The knife played slash and stab animations.

- [CT weapons: 18 firearms and knife](team-2-weapons.json)
- [T-exclusive weapons: 6 firearms and knife](team-1-weapons.json)
- [AWP zoom and bolt cycle](scope.json)
- Screenshots: [AK](ak47-view.png), [M4A1](m4a1-view.png), [USP](usp-view.png),
  [Deagle](deagle-view.png), [knife](knife-view.png), [AWP](awp-idle.png),
  [40-degree scope](awp-scope-40.png), [10-degree scope](awp-scope-10.png).

The fixture uses a unique multiplayer room, $16000, a starting AWP, paused bots,
a one-hour round, and buys enabled throughout the round with funds restored after
purchases. It exercises production weapon code, but does not validate match balance
or money deductions; the normal scene retains its $800 start and normal buy restrictions.
The browser was muted, so audio validation covers original file hashes and animation
sound timing data, not an audible comparison. Bevy's native UI remains visible.

## Reproduce

From the scene repo, create a separate fixture:

```sh
node validate/prepare-arsenal.mjs /tmp/cs16-arsenal-ct
cd /tmp/cs16-arsenal-ct
npm install
npm start -- --web --port 8011
```

Open the URL below in an isolated headless browser with WebGPU enabled and audio muted.
Allow the Decentraland origin to access the local preview in that test browser.

```text
https://decentraland.org/bevy-web/?preview=true&realm=http%3A%2F%2F127.0.0.1%3A8011&position=5%2C8&guest=1
```

With `agent-browser`, use session `cs16-arsenal-review`, explicitly select
`--executable-path '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'`,
and pass `--args '--enable-unsafe-webgpu,--mute-audio'`. The default Chrome for
Testing 150 stalled at WebGPU startup in this environment; Brave 151 completed
these checks. Start on `about:blank`, grant `loopback-network` to the Decentraland
origin through CDP `Browser.setPermission`, then navigate to the preview. Keep
the permission CDP connection open throughout the run. Obtain its browser WebSocket using
`agent-browser --session cs16-arsenal-review get cdp-url`. Wait for the team menu,
then, from the original repo:

```sh
node validate/arsenal.mjs <browser-CDP-websocket> 2 /tmp/cs16-evidence cs16-arsenal-review
```

Create a second fresh fixture/browser for the T run, or close the first browser/server
before reusing their port/session. Pass `1` instead of `2`. Do not join the team manually;
the harness joins and buys through the scene UI. After an interrupted run, append
`--resume` with the same evidence directory to skip completed weapons.

For scopes, equip an unscoped AWP, buy ammunition, close the buy menu and capture the
mouse. Run `node validate/arsenal-scope.mjs <browser-CDP-websocket> /tmp/cs16-evidence cs16-arsenal-review`.
It checks actual TextureCamera FOV at 40/10 degrees, then firing, bolt unscope and
automatic return to the scope. Compare its three captures to see real magnification.

Stop the test browser and fixture server when finished. Keep the normal scene server
separate from these review overrides.

Close the preview before editing a scoped scene. Live reload while a texture
camera was active triggered an upstream Bevy directional-light panic; restarting
the isolated browser recovered. Normal scoped weapon switching has a separate
[regression check](../penetration/README.md).
