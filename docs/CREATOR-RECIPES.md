# SDK7 action-game recipes

Practical lessons from building an authoritative multiplayer scene in
Decentraland. These patterns also apply to racing, arena combat, minigames and
interactive NPCs. Each recipe links to an implementation and a way to check it.

Reviewed on **2026-09-14** against this working tree. The scene pins both
`@dcl/sdk` and `@dcl/js-runtime` to
`7.27.1-33533530571.commit-451d001`. Browser observations below were recorded in
stock Bevy web; the evidence does not establish compatibility with every
explorer or with later scene changes. See the evidence table before reusing a
browser script. This guide is a documentation extraction, not a new runtime
certification.

## 1. Separate authoritative rules from local presentation

The server decides damage, ammunition, inventory, round eligibility and scores.
The client can immediately animate a requested action. That distinction lets a
game feel responsive while the server retains the final decision.

| Concern | Owner | What crosses the network |
| --- | --- | --- |
| Fire, use, buy, join | Client requests; server validates | Typed intent and action identity |
| Health, ammo, money, round | Server | Synchronized component state |
| Accepted/rejected action | Server | Result correlated to the request |
| Muzzle animation, crosshair, local sound | Client | Usually nothing |
| Bot motion and damage | Server | Bot state and presentation transforms |

Define components and `registerMessages()` schemas during module loading, using
static imports. Branch setup through `isServer()`. Install
`validateBeforeChange()` validators and call `syncEntity()` in the server
branch. Read the sender from `context.from`; a payload's claimed address does
not establish identity. Identify players by normalized addresses across peers;
entity handles are local.

Give repeatable actions a sequence number and invalidate them across equipment
or round changes. Reject duplicates, stale requests, invalid vectors and actions
from dead or ineligible players. Validate queued actions again when they execute.
Keep the rule functions independent of rendering so these cases are testable.
Use a schema that preserves your clock's range and precision: this scene uses
`Schemas.Double` for epoch seconds and deadlines, instead of 32-bit floats.

References: [messages](../src/index.ts), [server adapters](../src/server.ts),
[component schemas](../src/components.ts), [combat rules](../src/combat-rules.ts).
The official [authoritative-server skill](https://github.com/decentraland/sdk-skills/blob/main/authoritative-server/SKILL.md)
already covers the setup APIs; the reusable addition here is the action lifecycle
and its failure cases.

**Check:** duplicate a request, switch weapons before it arrives, fire while
dead, and join during a round. Each must preserve the server's invariants.
See [combat tests](../tests/combat.test.mjs),
[inventory tests](../tests/inventory.test.mjs) and [team tests](../tests/teams.test.mjs).

**Boundary:** the current scene also accepts bounded client shot context, checked
against recent server observations before tracing again. That experiment is in
[hit-claims.ts](../src/hit-claims.ts). It is not timestamped world rewind, and its
tolerances are not a general anti-cheat guarantee. Do not promote those values
as SDK defaults. Server-observed avatar positions also do not make the scene the
owner of the explorer's movement physics.

## 2. Predict feedback without replaying it on acknowledgement

Waiting for a server result before kicking the camera caused a noticeable second
action after the click. Start the permitted local presentation when input is
processed. Keep the player's intended aim separate from the visual recoil.

Store pending actions with their original local times. When a result arrives,
reconcile at that original time, replay still-pending inputs, and decay the
correction toward the confirmed state. Ignore older or duplicate results.
Rejected actions must release reservations, including predicted ammunition.
Clear prediction at respawn and equipment changes.

This also applies to a sword swing, an interaction highlight, or a racing boost.
For those games, substitute their presentation for recoil and keep the same
request/result discipline.

References: [recoil prediction](../src/recoil-prediction.ts),
[camera adapter](../src/fps-camera.ts), [client input](../src/client.ts).

**Check:** [prediction tests](../tests/recoil-prediction.test.mjs) cover immediate
kick, delayed/reordered acknowledgements, rejection, reload and ammo reservation.
The [400 ms feedback fixture](../validate/prepare-feedback-latency.mjs) modifies
an isolated copy and refuses the playable checkout. It delays shot replies only;
it does not simulate general network latency, jitter or packet loss.

The [2026-09-10 capture](../validate/game/input-feedback.json) observed animation
and kick at the first 116 ms sample, before the confirmed impact at 783 ms.
Those are sampling bounds, not measured input-to-display latency. Local impact
prediction was added later, so that capture describes an earlier implementation.

## 3. Treat menus and pointer capture as one input state machine

A visible menu can still be unclickable if the explorer captures the cursor.
A full-screen decoration can also intercept clicks intended for buttons.

Derive menu visibility and gameplay input permission from the same state. While
a menu is open, stop held fire and release pointer lock; if the explorer
recaptures it, enforce the open-menu state again. Request capture when returning
to play, then observe the actual `PointerLock` state on `engine.CameraEntity`.
A capture request is not evidence that capture succeeded. Avoid multiple
independent systems continually issuing contradictory requests.

A release gate must accept an already-released button. In the installed SDK,
`isPressed` retains the latest button state, while `isTriggered(PET_UP)` lasts
one frame. A delayed automatic capture can arrive after that frame and leave
an event-only gate blocked forever. Suppress a held capture click, then arm
from the stored released state. The [input regression](../validate/game/input-capture/README.md)
reproduces a swallowed first shot and blocked use key before the fix, and tests
held world/menu clicks afterward. This does not establish recovery from an
explorer that loses the physical release event entirely.

Set `pointerFilter: 'none'` on decorative overlays and their decorative children.
Give buttons explicit hit regions. Use `PrimaryPointerInfo` only after checking
its optional fields. Put screen-coordinate conversion in one adapter so button
hover and clicks agree with the UI canvas.

In a combat area, `AvatarModifierArea` with
`AvatarModifierType.AMT_DISABLE_PASSPORTS` prevents avatar profile interactions
from competing with shooting. Bound it to the actual play area.

References: [menu state](../src/menu-state.ts), [client cursor and avatar setup](../src/client.ts),
[noninteractive damage overlay](../src/pain-ui.tsx),
[platform adapter](../src/platform.ts).

**Check:** click empty space while a menu is open, then click a button; release
and recapture during play; open a menu while holding fire; click a player in
the combat area; repeat with the damage overlay visible. Check both pointer
state and the resulting action. A component snapshot alone cannot prove the
passport popup never opened.

**Platform boundary:** the scene has a separate touch input path because its
mobile target does not use desktop pointer lock. It uses the native live camera
and on-screen actions there. Its desktop path uses a `VirtualCamera`. Screen Y
orientation also has a client-specific adapter. These paths need separate
client checks; a successful Bevy test cannot certify mobile or Unity behavior.

## 4. Measure motion over the interval that produced it

Avatar transforms can arrive in batches. Dividing their position change by a
single render frame's `dt` produced false speed spikes. Holding forward and then
adding a sideways key while walking made the crosshair briefly look like running.

Sample horizontal displacement over elapsed sample time. The scene's
[HorizontalMotion](../src/movement-feedback.ts) uses a 100 ms minimum window.
Reset it on teleports and respawns. Keep the visual walking rule separate from
the server's accuracy calculation; smoothing a crosshair must not grant accuracy.

The locomotion API controls speed/jump settings. For this SDK pin it does not
expose acceleration, friction, gravity or crouch collider height. The scene
implements Shift-walk by reading the modifier action and setting walk, jog and
run speeds to the selected speed. Treat that as a speed mapping, not a complete
replacement physics controller.

References: [locomotion](../src/locomotion.ts),
[motion regression tests](../tests/movement-feedback.test.mjs).

**Check:** walk forward → add strafe → remove strafe → run → stop → respawn.
The test reproduces the old per-frame spike and checks that walking stays compact
without erasing firing feedback. Recalibrate sample windows and speed thresholds
for another game instead of copying these values blindly.

## 5. Make damage and NPCs visible from the same gameplay state

An invisible server target can still kill a player. A health number changing
without a sound or direction cue is similarly hard to understand.

The scene syncs each bot's `AvatarShape` and navigation `Transform` from the
server. Combat and presentation refer to that same bot. Its navigation probes
the map floor instead of assuming a fixed spawn height. Bots and humans share
the damage path.

For incoming hits, a server event identifies the victim and attack origin. The
local client projects that origin into its view direction, shows the pain cue,
plays a local impact sound and applies the appropriate presentation. The server
still owns health/death. Death presentation must hand control back correctly
at the next spawn, including hiding/restoring the weapon and clearing held fire.

References: [bots and rounds](../src/practice.ts),
[navigation](../src/bot-navigation.ts), [damage math](../src/damage-feedback.ts),
[spectator selection](../src/spectator-rules.ts).

**Check:** watch a bot move, verify its rendered body follows the target, take a
hit from each direction, die, change spectator target and respawn. Pair movement
samples with screenshots; a transform or `AvatarShape` component alone does not
prove a visible, correctly placed body. See
[damage tests](../tests/damage-feedback.test.mjs),
[navigation tests](../tests/navigation.test.mjs) and the
[historical death capture](../validate/game/death-spectator.json).

**Boundary:** voluntary spectating, missing remote targets and mobile camera
handoff need their own runtime proof. The earlier death-to-bot chase capture
does not establish those features.

## 6. Design recovery as part of multiplayer

A connected room, a live server and a current game snapshot are different
conditions. One-time spawn/result messages can be missed while a client is
suspended. UI that waits forever for one of them leaves the player stuck.

Make durable state sufficient to reconstruct the current phase. Correlate
one-time presentation with a round or revision so retrying cannot grant a
second life or reward. Measure liveness from the local time at which a server
heartbeat changes; do not subtract unsynchronized client/server clocks.

The current scene detects stale active-match updates and asks the server to
re-send state. This is a workaround in [client.ts](../src/client.ts) and
[practice.ts](../src/practice.ts), not proof of complete recovery. A dedicated
heartbeat is a better general recipe than assuming a countdown must always tick;
lobbies and completed matches may legitimately be idle. The official
[server lifecycle guidance](https://github.com/decentraland/sdk-skills/blob/main/authoritative-server/SKILL.md#server-lifecycle)
already describes heartbeat-based readiness.

**Check:** background/resume, disconnect/rejoin during a round, join after the
server has been idle, and restart the preview server. Record whether state,
spawn, camera, UI and input all recover. Historical reconnect evidence does not
verify the newer stale-state workaround.

## 7. Validate the scene people actually play

Use three complementary checks: pure rules, asset/geometry integrity, and a real
explorer interaction. A passing build proves neither clickable UI nor visible
NPCs. A screenshot proves neither a scored kill nor correct wall occlusion.

For this scene, from the repository root:

```sh
npm run validate
```

For browser runs, create a separate physical checkout/copy and a dedicated
browser profile. This project's preview setup shared room identity when two
servers used the same checkout on different ports. Ports alone did not isolate
the match. Keep fixture changes in the isolated copy and write results outside
its watched source tree during the run. Source reloads can invalidate clients.

Suppress SDK client auto-launch with `npm run start:server` (or
`npm start -- --web --no-browser --no-client`). Plain `--web` opens the creator's
default browser even when the automation later opens a separate headless session.

Launch automation-owned browsers muted: headless Chromium can still play audio.
Record the scene URL, checkout, ports and process/session IDs, and close those
owned resources afterwards. Leave the creator's browser and preview alone.

On the Bevy react-web frontend used here, the preview query parameter is
`preview=true`. In the engine page's DevTools console, this project's reader uses:

```js
await window.engine_console_command('/set_scene Counter-Strike')
const snapshot = JSON.parse(await window.engine_console_command('/crdt_snapshot'))
```

Check `/help` on the actual build. These are Bevy console facilities, not SDK7
scene APIs. The reader is [team-client.mjs](../validate/team-client.mjs).
Renderer snapshots in these runs exposed built-in components, but not every
custom synchronized game component by name. Absence there did not prove absence
in the scene runtime. Inspect game state through an explicit diagnostic path and
verify what the player sees separately. Bitmap HUD checks decode visible sprite
UVs using [read-hud.mjs](../validate/read-hud.mjs).

Use real mouse/key events for the behavior under test. Preview teleport commands
can stage an encounter; they do not prove normal traversal or user input.
Record fixture changes and sampling intervals alongside observations.

Geometry deserves the same discipline. A GLB that looked right still had a
collision-export coordinate mismatch. Keep source hashes and transforms, and
test a known wall and floor in renderer coordinates. See
[world tests](../tests/world.test.mjs), [asset checks](../validate/assets.mjs) and
[map source notes](../asset-sources/dust2/SOURCE.md).
Blender/MCP automation can help inspect scale, materials, animation clips and
exports; it does not replace checking the exported result inside the explorer.

## Evidence and current limits

These are recorded observations, not a claim that all scripts pass today.
The unified match and input layout changed after most captures. Several older
scripts still expect the removed practice/start menu; adapt them before reuse.

| Evidence | What it establishes | Limit |
| --- | --- | --- |
| [Input feedback, Sep 10](../validate/game/input-feedback.json) | Early recoil/animation under a 400 ms reply-only fixture; stable walking crosshair | Earlier combat flow; not a latency benchmark |
| [Death and hits, Sep 10](../validate/game/death-spectator.json) | Hurt cue, camera fall, bot chase and target cycling in that run | No voluntary-spectator or mobile proof |
| [Round loop, Sep 12](../validate/game/rounds.json) | Bot kills, win/reset/loss, retained stats and playing weapon AudioSource | No full 5v5, full-match soak or audible-quality proof |
| [Rule tests](../tests/) | Executable checks of isolated rules | Run against the intended revision; no rendering/input proof |

## What to contribute to SDK Skills

Contribute focused examples to the [existing SDK skills](https://github.com/decentraland/sdk-skills),
with a minimal scene and the [recipe template](CREATOR-RECIPE-TEMPLATE.md).
The repository already documents core APIs. The addition should be reproducible
failure cases and tested combinations of those APIs.

| Priority | Proposed contribution | Destination |
| --- | --- | --- |
| 1 | Menu/capture ownership, decorative click-through, combat passport area | `advanced-input`, `build-ui`, `player-avatar` |
| 2 | Immediate action presentation with rejection/reorder reconciliation | `authoritative-server`, `camera-control` |
| 3 | Motion sampling under batched transform updates | `advanced-input` |
| 4 | Bevy browser harness with isolated rooms, evidence and cleanup | A proposed Bevy validation recipe |
| 5 | Server-driven visible NPCs and directional hit feedback | `npcs`, `authoritative-server`, `audio-video` |

Use generic shapes and original assets in minimal examples so creators do not
need the CS map, sprites or weapons. Keep source/license notes and regeneration
instructions with any included asset. Port one recipe at a time and verify it
on the SDK/explorer versions named in its evidence. Newer shot-context handling,
recovery workarounds and unverified camera paths should remain clearly labeled
experiments until they have that proof.
