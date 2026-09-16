# Original Dual Elites: two hand attachments

The original `p_elite.mdl` contains two 104-triangle pistols bound under separate
hand bones. Previously both were baked relative to the right hand, leaving the
second pistol about two metres from that anchor. The corrected export assigns
each source face to its original hand, and the scene creates left/right
`AvatarAttach` roots. The combined topology stays at 208 triangles.

The models use identity local transforms and scale 1 at the corresponding hand
anchor. Exported Y-up dimensions are approximately 0.075 × 0.169 × 0.261 m for
the right pistol and 0.055 × 0.188 × 0.250 m for the left. Their complete local
bounds stay within 0.3 m of each hand. During the browser encounter the avatar
stands/moves around (21–24, 10.425, 60), well inside the scene's 0–192 m X/Z bounds.
These are dynamic avatar attachments, not new static parcel objects.

## Reproduce the model audit

Through the connected Blender MCP, add `asset-sources/cs16-weapons` to Python's
module path and run, with absolute source/output directories:

```python
from export_world import export_world
from validate_dual import validate_dual
export_world('elite', source_directory, output_directory)
result = validate_dual(source_directory, output_directory)
```

Both functions create separate Blender scenes and restore the previously active
scene. Source models and existing user objects are preserved. The validator
re-imports both GLBs and checks every triangle against the original bone-relative
geometry and winding. No face may be omitted or assigned to both hands.

Run `npm run validate` in the scene. Its model gate also checks 104 triangles per
pistol, the distinct hand anchors, bounded local geometry, embedded textures,
original source hashes, and every palette/indexed pixel in both exported images.
The old combined model fails the per-hand triangle and bounds checks.

## Reproduce the browser check

From the scene repository:

```sh
node validate/prepare-dual-hands.mjs /tmp/cs16-dual-review
cd /tmp/cs16-dual-review
npm install
npm start -- --web --port 8011
```

Open a fresh muted headless WebGPU Chromium guest at:

```text
https://decentraland.org/bevy-web/?preview=true&realm=http%3A%2F%2F127.0.0.1%3A8011&position=5%2C8&guest=1
```

Allow loopback access in that isolated browser. From the scene repository:

```sh
node validate/dual-hands.mjs "$CDP_WEBSOCKET" /tmp/cs16-dual-evidence
```

The fixture inherits the isolated arsenal room: $16000, starting AWP, extended
round/buy time and bots with firing/navigation paused. Bot 0 is placed nearby
with Elites; key 4 cycles AK, walking Elites, knife, Elites and despawn. The walk
is a fixture-controlled synchronized Transform, not a bot navigation test. Real
AWP input and production damage kill the bot. Despawn uses the production bot
cleanup and client held-weapon system. Close owned browsers/servers afterward.

## Evidence and limits

Captured 2026-09-15 with Blender 5.2 MCP and muted headless Brave 151.0.7922.169,
WebGPU, the official hosted Bevy client and the pinned scene SDK.

- `blender.json`: all 208 source faces covered exactly once; maximum re-imported
  triangle error is zero for both exports; complete world-space Blender bounds
  and GLB hashes are included.
- `browser.json`: both models load on distinct left/right anchors, a walking
  avatar retains both, AK/knife switches hide both, a real AWP kill hides both,
  and despawn removes every cached model and hand attachment.
- `two-hands.png`, `walking.png`, `death.png`: native Bevy screenshots.
- `source.json`, `validation.txt`, `browser-errors.txt`: source hashes, the full
  scene gate and browser error record.

Bevy snapshots retain some renderer-owned loading/Transform records after entity
removal. Cleanup asserts that scene-owned model/attachment components are gone;
it does not require all renderer metadata to disappear. The review verifies
AvatarShape attachments; it does not establish an original CS character rig,
closed-finger grip, aiming/reload animations or exact third-person firing poses.
First-person and dropped Elite models are unchanged. Headless capture is not an
audio listening test. See [remaining arsenal gaps](../../../docs/CS16-ARSENAL.md).
