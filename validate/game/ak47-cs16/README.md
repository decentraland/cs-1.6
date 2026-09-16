# AK viewmodel in headless Bevy

Captured 2026-09-15 01:31 UTC (2026-09-14 in Argentina), using the official
Bevy web preview, headless Brave/Chromium 151, and SDK
`7.27.1-33533530571.commit-451d001`. The browser was muted at 1280 x 639.
It connected to the user's existing scene server on port 8000; this run did not
start another SDK server or change the economy, bots, or scene source.

The selected AK was already available in this preview session. These checks
cover the viewmodel; they do not establish correct starting inventory or buying.

## Observed result

[The recorded assertions](result.json) passed:

- The new camera-attached AK loaded all six source clips; the old rifle was hidden.
- Held fire selected all three shooting variants and consumed ammunition.
- Reload selected the source reload clip, transferred 13 rounds from reserve
  (`17/83` to `30/70`), and returned to idle.
- Selecting the Glock hid the AK. Selecting primary restored it, played draw,
  and returned to idle.

The unedited browser captures show the actual skinned poses:

- [Idle](idle.png)
- [Held fire](firing.png)
- [Reload](reloading.png)
- [Restored after switching](restored.png)

The burst includes screenshot-capture time, so its 13-round total is not a
fire-cadence measurement. Full frame-by-frame animation fidelity, extreme camera
angles, wall/near-plane clipping and parcel-boundary behavior still need checks.
Bevy's surrounding interface and preview statistics are visible in these captures.
A later reload with `hud=0` stalled; it is not part of the passing check. The
test browser was closed afterwards; the existing scene server was left running.

## Repeat manually

1. Start the scene with `npm start -- --web`, or use the existing server.
2. Open
   `https://decentraland.org/bevy-web/?preview=true&realm=http%3A%2F%2F127.0.0.1%3A8000&position=5%2C8&guest=1`.
3. Join Terrorists, obtain an AK plus reserve ammo, and equip primary with **1**.
4. Close the buy menu and capture the pointer. Hold left mouse, release, then
   press **F**. Check the moving hands/magazine and the HUD's ammo transfer.
5. Press **2**, then **1**. Check that the AK disappears for the pistol, draws
   when selected again, and settles back to idle.

Headless Chromium requires loopback permission for `https://decentraland.org`
to reach the preview. This run used only `loopback-network` in an isolated test
browser, with the user's approval. A CDP `Browser.setPermission` override lasts
only while the connection that set it remains open; keep that connection alive
through loading and validation, then close the owned browser when finished.
