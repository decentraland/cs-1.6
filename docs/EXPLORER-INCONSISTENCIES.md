# Explorer and hosted-server inconsistencies

Differences between Bevy (web), Unity (desktop), Godot (mobile) and the hosted
multiplayer server observed while running this scene, with the evidence gathered
on 2026-09-15 and the scene-side workaround (if any). Each entry is written so it
can be pasted into an explorer or infra issue.

## 1. Hosted multiplayer server never receives Bevy web avatar transforms

- **Where:** `boedo.dcl.eth` on `https://multiplayer-server.decentraland.org`, client `https://decentraland.org/bevy-web/?realm=boedo.dcl.eth`.
- **Symptom:** after joining a team the HUD stays on "Waiting for player position..." for the whole round; the human cannot shoot and bots never hit them. Kill feed, bomb and bot movement keep syncing, so the server is alive.
- **Cause:** the scene server samples `Transform` on the `PlayerIdentityData` entity of each human (`src/server.ts`, `samplePlayerMotion`). On the hosted server that entity has no `Transform` for Bevy web clients, so `PlayerPose.valid` stays false. A Unity client on the same world is sampled fine (bots damage it, `[SERVER] Damage confirmed` in `npm run server-logs`).
- **Repro:** fresh guest in headless Chromium, `?preview=true&realm=boedo.dcl.eth&guest=1`, click CT. `Enemies left: 3` and `Prepare to fight!` appear, then `Waiting for player position...` for 60 s+. The same bundle against the locally pinned `bevy-headless-server@0.1.0-34588802161.commit-3926f33` validates the pose in under a second.
- **Workaround:** none in scene code; the scene must not trust client-reported positions. Needs the hosted server engine checked against the pinned headless build. Godot mobile is expected to hit the same wall (unverified).

## 2. Unity replays every non-looping synced Animator clip forever

- **Where:** Unity `AnimatorFinishWritebackSystem`.
- **Symptom:** killed bots replayed their death animation endlessly.
- **Cause:** when a non-looping clip ends Unity PUTs the `Animator` back to the scene with `playing: false`. The scene synced a server-owned `Animator`, so the server rejected that write, sent a correction with `playing: true`, and Unity restarted the finished clip. Sampled through the Unity MCP: `playing` flipped false/true every ~5 s. Bevy never writes back.
- **Workaround (done):** bots sync only `BotBodyPose`; each client builds a local `Animator` (`src/bot-animation.ts`).
- **Report:** renderer write-backs on server-owned components should either be marked renderer-originated or not be forwarded to the authoritative server by the SDK sync layer.

## 3. Unity keeps playing clips removed from the Animator state list

- **Where:** Unity `LegacyAnimationPlayerSystem.SetAnimationState`.
- **Symptom:** after the death clip, the corpse stood up in the aiming pose ("I kill it but it is still aiming").
- **Cause:** replacing `Animator.states` with only the death clip leaves the previous `ref_aim_*`/`idle1` clips enabled in Unity; Bevy stops anything not listed.
- **Workaround (done):** `src/bot-animation.ts` keeps every clip ever used on the entity in the list with `playing: false`.

## 4. No `GltfNode` bone attachment outside Bevy

- **Where:** Unity and Godot; `GltfNode`/`GltfNodeState` are Bevy protocol extensions (`src/bevy-gltf-node.ts`).
- **Symptom:** bots carried no weapons on Unity (only Bevy showed guns in hand).
- **Workaround (done):** `src/world-weapons.ts` waits for the body `GltfContainerLoadingState` to finish and, if no `GltfNodeState` appears within 1 s, pins the gun at a fixed right-hand offset. It does not follow the animation.
- **Report:** a cross-engine way to attach entities to GLTF nodes/bones.

## 5. Unity honours `PointerLock` only on the camera entity

- **Where:** Unity `UpdatePointerLockSystem` reads `PBPointerLock` from the camera entity only; Bevy reacts to any changed `PointerLock` component.
- **Symptom:** the buy menu could not be closed on Unity (its close path requested the lock on a throwaway entity), and menu clicks never recaptured the cursor.
- **Workaround (done):** `capturePointer()` and `closeBuyMenu()` also write `PointerLock` on `engine.CameraEntity`. Needs a manual Unity check: click `0 CANCEL` in the buy menu and the cursor must lock.

## 5b. Unity delivers a row click to the frame behind it as well (unverified order)

- **Symptom:** once pointer lock worked on Unity, clicking a buy category closed the menu: the row's `onMouseDown` and the frame's backdrop `onMouseDown` both fired. Bevy only delivers the topmost handler.
- **Workaround (done):** `src/menu-ui.tsx` defers the backdrop close by 120 ms and drops it when a button was pressed in that window. The buy menu is now an explicit toggle (HUD BUY button on every platform, `0 CANCEL`/backdrop to close); Esc only frees the cursor.

## 6. Unity does not restart an AudioSource that is still playing

- **Where:** Unity `UpdateAudioSourceSystem` (see unity-explorer #9903): a re-sent `currentTime: 0` while the clip is playing is not a seek, so `AudioSource.playSound` on the same entity waits for the clip to end.
- **Symptom:** gun sounds lag behind rapid fire on Unity; Bevy restarts the clip every shot.
- **Workaround (done):** `src/weapon-sounds.ts` alternates two sources per local sound and stops the other one, like CS's weapon channel.

## 7. Own nametag visible on Unity while the own avatar is hidden

- **Symptom:** the local avatar is hidden by a client-only `AvatarModifierArea` (hide avatars), but Unity still drew the local nametag.
- **Workaround (done):** the self area now also sets `AMT_HIDE_NAMETAGS`. Bevy behaviour with the extra modifier still needs a look.

## 8. Godot mobile: no team picker on a fresh start (unverified)

- Reported by the creator on prod; not reproduced (no device). The scene auto-reseats a returning address (`rejoinPlayer`), so a player who already played with the same wallet is put back on their team without a picker while a round is live. If the picker is missing on a never-seen wallet, it is a Godot UI issue. Also expected: issue 1 once seated.

## 9. Unity `PrimaryPointerInfo` uses a bottom-left origin

- Tracked as decentraland/unity-explorer#10073; `src/platform.ts` flips Y on desktop. Remove the flip when fixed.

## 10. sdk-commands does not respawn a dead multiplayer server

- `@dcl/sdk-commands` `multiplayer-server.js` spawns the engine once and only logs "Multiplayer Server exited with code N". A preview keeps serving the scene without any authoritative server; the client shows "Reconnecting to the match..." forever. Restart the preview.

## 11. Unity MCP limits

- With a scene `VirtualCamera` active, `set_camera_mode`/`set_camera_pose` are refused and there is no key/mouse tool, so scene UI (team/buy menus) and shooting cannot be driven from the MCP; the copy under test needs scene-side hooks (auto-join, timed kill).

## 12. No right mouse button for scenes (feature request)

- `InputAction` has no secondary pointer value. Bevy binds the right button to its own `CameraLock` system action, Unity to `RightPointer` (avatar interaction) and camera lock/unlock; neither forwards it. CS secondary fire (AWP zoom, silencer, burst, knife stab) therefore lives on E (`IA_PRIMARY`) for guns and F for the knife. Users of Bevy can rebind the right button to `IaPrimary` in the explorer settings; the scene cannot. Ask the protocol for an `IA_POINTER_SECONDARY` (right click / long press on touch).

## 13. Godot phone session reaches the explorer with no identity (cause not yet identified)

- **Symptom (phone, 2026-09-15):** default avatar, nametag "Loading#...", Multiplayer Debug `Adapter: [waiting_identity]`, no room, 0 peers, and the login screen never appears. `waiting_identity` means `player_identity.try_get_address()` is empty (`lib/src/comms/communication_manager.rs`).
- **Effect on the scene:** `getUserData` answers without a `userId`, `@dcl/sdk/network` throws "Couldn't fetch profile data" and the scene stops updating (entity count 0, no UI). Reproduced on the desktop build with `--skip-lobby`, which enters the explorer without creating any account. The preview deep link and `--guest-profile` paths do create a disposable account (`lobby.gd`), so they are not the phone's path.
- **Next step:** stream the phone's boot log with the unified debug channel (`cargo run -- debug-hub` on the Mac, phone opens `decentraland://open?scene-inspector=ws://<mac-ip>:9231`) and read the `[Startup]`/`[DEEPLINK]`/auth lines to see which branch of `lobby.gd` skipped the account screen.

## Earlier, already tracked

- Bevy `AvatarAttach` needs a retry when the avatar loads after the component (bevy-explorer#1255).
- Hosted Bevy preview predates `VirtualCamera.fov` (bevy-explorer#1268).
