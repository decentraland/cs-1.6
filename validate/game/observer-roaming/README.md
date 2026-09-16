# Neutral spectator roaming

Neutral desktop spectators can select chase or Free Look with Space. WASD moves
the camera along its look/right vectors; Shift scales movement commands to 52%.
Click/Shift-click in Free Look jumps to the next/previous eligible player's eye
position. When no eligible target exists, neutral spectators automatically roam;
their preferred mode returns when a target appears. Team observers remain in
restricted chase. Selecting SPECTATE before a match now starts the camera and
requests pointer capture; Escape opens the menu even in the empty lobby.

The movement follows the base `PM_SpectatorMove` friction/acceleration order:
400-unit axis commands, 500-unit wish-speed cap, acceleration 5, friction 4×1.5,
stop speed 75 and the scene's 0.025 m/unit scale. It retains the original early
return when no speed can be added, including stopping translation on release.
Menus and long frame stalls explicitly reset velocity. This is camera-only
noclip movement; it does not move a player's collider or grant gameplay actions.

Sources: [pinned ReGameDLL movement](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/pm_shared/pm_shared.cpp),
[observer mode controls/restrictions](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/observer.cpp),
[ReHLDS spectator speed default](https://github.com/rehlds/ReHLDS/blob/master/rehlds/engine/sv_main.cpp),
and [Valve movement command defaults](https://github.com/ValveSoftware/halflife/blob/master/cl_dll/input.cpp).
This does not include the ReGameDLL-added acceleration boost. Space currently
cycles the two implemented modes; original in-eye/map modes and their complete
cycle remain open. SDK inputs require Shift-click for previous target instead
of the original secondary attack. The existing touch camera limitation remains;
these controls are offered only on desktop.

Run `node --experimental-strip-types --test tests/observer-roaming.test.mjs tests/spectator.test.mjs`
for mode restrictions, target fallback/preference, acceleration/friction, diagonal
capping, pitched flight, slowdown, menu pause and frame-stall handling. The full
scene gate is `npm run validate`.

For the browser reproduction, run
`node validate/prepare-observer-roaming.mjs /tmp/cs16-roaming-review` with a new
directory, install its pinned dependencies and start it with
`npm run start:server -- --port 8011`. Open one isolated muted headless Bevy browser
against this realm with loopback access enabled, then run
`node validate/observer-roaming.mjs <CDP-websocket> <evidence-directory>` here.
Close both owned test resources afterward. Do not use plain `npm start -- --web`.

The fixture inherits the earlier arsenal/hit setup: stationary rifle bots,
extended live/result windows, an AWP/$16000 loadout for round spawns and a
deterministic server-confirmed lethal hit on E. Production camera, spectator,
menu and input files are unchanged; only setup and read-only diagnostics differ.
`source.json` identifies the production source, `browser.json` records actual
observations, and `validation.txt` records the installed full gate.

The 2026-09-15 browser attempt is incomplete. It reached the neutral Free Look
state in an empty lobby but exposed a missing spectator-start message, leaving
the cursor unlocked. That server message now also fires in lobby/result phases.
After reloading, the same browser twice timed out while enabling DevTools focus;
its browser-level target remained live. The owned browser and server were closed
to limit resource use. No successful rendered-flight/menu/mode-switch claim is
made for this build. A fixture diagnostic Entity type error was also corrected
and typechecked separately. The creator still needs the short manual check in
`docs/MVP-PLAYTEST.md`, including switching to Spectate during the death transition.
