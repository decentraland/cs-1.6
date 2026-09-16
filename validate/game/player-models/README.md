# Player model validation

The live Blender MCP imported the pinned original Arctic and Urban MDLs, checked sampled bone matrices against the decoded source (maximum error 0.00000716), exported self-contained GLBs and re-imported the final files for renders. `standing.png`, `collapse.png` and `dead.png` show the exported meshes and original headshot death poses in Blender; they are not browser gameplay evidence.

The headless browser fixture uses stationary bots and a supplied AWP. All three original bodies loaded, each hand-node link reached READY, and the corrected world-weapon rotation was visually checked. The initial `browser/standing.png` records the misaligned weapon before the correction; `browser/corrected.png` is the corrected attachment. The attempted mouse-input check did not fire or reduce ammunition, so `browser/death.json` is an unsuccessful attempt, not proof of hit registration. No extended firing investigation was performed.

`browser-final/` records the final fixture and its explicit scripted lethal hit through the normal server `hurtBot` path, ten seconds into live play. This checks death presentation separately from input. `browser-final/corpse-side.png` shows the settled body and dropped AK; its JSON records the dead flag and original `head` clip. The fixture remains isolated on a different multiplayer ID; it does not alter the creator's scene or match format.

`npm run validate`: 273 tests pass, including independent torso/gait transitions, fire restart, reload timing, source death selection, all gun/model pose combinations, oriented hitboxes and dead-target removal; source/GLB hash, triangle, skin, channel-mask and hand-path checks pass; SDK build/typecheck passes.

Remaining manual checks: normal bot movement and firing presentation, actual human shots against moving model hitboxes, CT body rendering in Bevy, packet-delay behavior and remote-human interactions. Stock CS aim blending and physical corpse throws are outside this increment. Reproduction: [body documentation](../../../docs/CS16-PLAYER-MODELS.md).

The owned headless browser and port-8011 fixture server were closed after this check. The creator preview on port 8000 was preserved. Automatic approval review rejected deletion of the intermediate Blender scenes as destructive, so they remain alongside the final models.
