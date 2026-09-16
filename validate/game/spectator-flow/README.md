# Spectator flow

One isolated muted headless Brave/hosted Bevy run on 2026-09-15 passed:

- Server-confirmed death, body view, then living-bot chase.
- Local health, armor, ammo and money hidden in chase, with the timer retained.
- Escape opens the menu; Resume recaptures without changing target.
- A subsequent click cycles forward, Shift-click reverses, and neither fires.

`browser.json` records the assertions and observed HUD/target. `chase.png`,
`menu.png` and `resumed.png` show the rendered states. Both owned browser and
port 8011 server were closed. The creator's port 8000 preview was preserved.

Reproduce with `node validate/prepare-spectator-flow.mjs /tmp/cs16-observer-review`
using a new directory, install its pinned dependencies, then run
`npm run start:server -- --port 8011` there. Use one isolated muted headless Bevy
browser against that realm with loopback access enabled, then run
`node validate/spectator-flow.mjs <CDP-websocket> <evidence-directory>` from this
project. Close both test resources afterward. Never use plain `npm start -- --web`
in automation: it opens the creator's normal browser.

The fixture inherits arsenal/hit-review setup: AWP, $16000, stationary rifle
bots without shopping, extended live/result windows, deterministic lethal server
damage on E and read-only diagnostics. Spectator rules, controls and HUD files
are byte-identical to production; hashes are in `source.json`. Mixed human/bot
neutral selection, eligibility, cooldowns and capture edge cases have rule tests,
not additional multi-client browser coverage in this run.

Reference: [pinned ReGameDLL observer code](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/observer.cpp)
provides target health updates, team filtering and a 0.25-second target-switch
limit. Cursor recapture is an SDK adaptation. This does not add first-person,
roaming/map modes, the original observer menu or character death animations.
