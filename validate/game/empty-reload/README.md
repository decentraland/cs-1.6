# Empty-trigger reload behavior

September 15, 2026; muted headless Brave 151 on official hosted Bevy
`0.1.0-33122661692.commit-0cfd373`, SDK/runtime
`7.27.1-33533530571.commit-451d001`.

The old server started automatic reloading as soon as any gun was empty, even
with fire held. The corrected server observes the authenticated trigger state.
Magazine-fed guns stay empty until release; M3 and XM1014 retain their distinct
empty-trigger reload path. Starting and finishing a reload still use the original
weapon-specific timing, magazine size and caliber pool.

## Source

[ReGameDLL_CS b0889847 ItemPostFrame](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapons.cpp#L1115)
starts generic empty-weapon reloading in the no-attack-buttons branch.
[M3 PrimaryAttack](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_m3.cpp#L77)
and [XM1014 PrimaryAttack](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_xm1014.cpp#L75)
call Reload themselves when empty. This pass follows the compatibility path
without REGAMEDLL_FIXES; it does not claim every empty-fire cooldown or secondary
button priority is identical to the original command loop.

## Reproduce

1. Run `node validate/prepare-empty-reload.mjs /tmp/cs16-empty-review`.
2. Install dependencies there and use `npm run start:server -- --port 8011`.
   This disables default-browser and native-client auto-launch.
3. Connect one isolated muted headless WebGPU browser to the official preview,
   realm `http://127.0.0.1:8011`, position `5,8`, with localhost access allowed.
4. Run `node validate/empty-reload.mjs <CDP-websocket> <output-directory>`.

The fixture parks bots, extends round/buy time, grants $16000 and an M4A1, and
caps the magazine at three rounds only when a gun is equipped. It preserves
production magazine capacity, reserve pools, reload logic/timing, trigger input,
weapon selection and buy actions. Tiny read-only TextShapes expose game state.
No test input is forged inside the scene.

For the old-code reproduction, use the pre-fix `weaponSystem` automatic-reload
condition in an isolated fixture, then run the browser script with `--baseline`.
`before.json` shows reserve consumed while fire stayed held. `browser.json` checks:

- M4A1 and USP remain empty, retain reserve and produce no extra shot while fire
  stays held longer than their entire reload duration.
- Release starts one ordinary reload, restoring the full magazine and conserving
  reserve, with no unsolicited shot.
- M3 and XM1014 start reloading while held and can fire a newly inserted shell.

The rule tests cover all 24 gun profiles, dead/loaded/out-of-reserve/in-progress
states and reload conservation. `source.json` pins tested source/dependencies;
`validation.txt` records the installed gate. Browser warnings are retained in
`browser-errors.txt`. Screenshots complement the authoritative ammo/input checks;
they do not alone prove the timing. All tests are muted and desktop-only.
