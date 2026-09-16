# First action after delayed cursor capture

September 15, 2026, muted headless Brave 151 on the official Bevy web preview.
Scene SDK/runtime: `7.27.1-33533530571.commit-451d001`.

The previous gate required a new mouse-up event after capture. If a menu click
was released before its capture arrived, that event was already gone:
E could not start defusing, and the first deliberate shot only armed the gate.
The fix accepts the SDK's stored released button state. It continues suppressing
a held click used to capture the cursor or close the menu.

## Reproduction

1. `node validate/prepare-input-capture.mjs /tmp/cs16-input-review`.
2. Install the fixture dependencies and run `npm start -- --web --port 8011` there.
3. Open the official Bevy preview in an isolated muted headless WebGPU browser,
   realm `http://127.0.0.1:8011`, position `5,8`, with loopback permission.
4. `node validate/input-capture.mjs <CDP-websocket> <output-directory>`.

The fixture parks bots, grants $16000/AWP, extends round/buy time and places the
T carrier at A. Only the first buy-menu capture request is delayed by 800 ms to
reproduce mouse-up preceding capture. Later requests use normal timing. Tiny
read-only TextShapes expose existing input and game state. Gun cadence, actual
browser capture, menu actions, damage and C4 rules use production code. Console teleports stage the encounters.

To reproduce the old behavior in the isolated fixture only, change the release
assignment in `client.ts` back to
`captureReleased = inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_UP)`.
Then run the same browser script with `--baseline` in a fresh preview session.

`before.json` proves capture was active while the SDK mouse state was released,
yet readiness stayed false. The held E input could not defuse, and a real first
click spent no ammunition. `browser.json` checks the corrected behavior:

- The first E starts a ten-second defuse without a priming click; releasing cancels.
- The first deliberate AWP shot consumes one round.
- Held world-recapture and buy-menu close clicks consume no ammunition.
- Releasing those clicks arms the next shot.
- A complete defuse and next round retain ammunition without an unsolicited shot.
- A pistol still fires one shot per press, including after holding the button;
  separate presses allow 150 ms for the released state to reach the scene.

The fixture changes capture scheduling only. It does not set readiness, forge
input events inside the scene, or change server acceptance rules. The before/after
fixture sources differ only in the release-state assignment.
`source.json` pins the tested source/dependencies; `validation.txt` is the installed
scene gate. Browser/runtime warnings are retained in `browser-errors.txt`.

## Limits

An earlier spawn-only reproduction also showed the bug, but automatic spawn
capture was unreliable: one headless run reported Chromium
`NotAllowedError: A user gesture is required to request Pointer Lock`; others
remained uncaptured. The final before/after check therefore uses a fresh menu
gesture and delayed capture. It does not claim to fix automatic capture requests
that the browser rejects.

This fixes a missed *scene-frame* release event when the SDK already knows the
button is released. It does not establish recovery when the explorer loses the
physical release entirely. Touch/mobile skips this desktop capture gate and has
not been device-tested by this check. No Unity/native Explorer was started.
