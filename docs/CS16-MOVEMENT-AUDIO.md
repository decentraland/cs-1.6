# Movement audio

The scene uses 33 original CS/Half-Life mono footstep WAVs. Players and bots emit
surface-dependent footsteps on Dust2; Shift/Ctrl walking is silent at the configured
weapon speeds. The sounds are preloaded and use one body-sound emitter per actor.
Local sounds follow the camera; other players and bots use world positions.

## Bevy audio setting

In **Settings → Audio**, set **Avatar Volume to 0** and leave **Scene Volume** on.
The September 15, 2026 Bevy web build exposes both sliders. Avatar volume controls
Bevy's own footsteps, jump/land and emote sounds; Scene volume controls this
scene's original CS sounds, including guns and footsteps. The scene does not
change the user's global audio settings. With Avatar volume enabled, native
avatar sounds can overlap the CS clips and walking can still sound audible.

The SDK maintainer confirmed on September 15 that SDK7 has no per-scene API
for suppressing those native avatar sounds independently of scene audio. All automated browsers were muted; the tests verify sound scheduling
and decoded buffers, not a listening comparison or perceived loudness.

## Source rules

Reference: [ReGameDLL_CS `pm_shared.cpp`](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/pm_shared/pm_shared.cpp),
`PM_UpdateStepSound`, `PM_PlayStepSound`, `PM_Jump`, and `PM_CheckFalling`.

- The running-step threshold is strictly above 150 HU/s (3.75 m/s at this scene's
  scale). A slow-speed check sets a 400 ms timer; audible dry-ground steps set
  a 300 ms timer. Frame scheduling can extend these intervals.
- Concrete, metal, grate, tile, slosh and snow use volume 0.5; dirt uses 0.55 and
  ventilation surfaces use 0.7. The BSP's original material lookup chooses the
  family. Other types, including wood, use concrete as in the source.
- Left steps randomly use files 2/4, right steps 1/3. Tile has the source's 20%
  chance of using a fifth clip.
- A running takeoff uses the previous ground material at volume 1, including
  exactly 150 HU/s. Stationary/slow takeoff is silent. Landing above 290 HU/s
  plays at 0.85; above 580 HU/s plays at 1. Normal flat jumps are usually silent
  on landing. These are sound thresholds, not the separate fall-damage formula.

Original file URLs, hashes and PCM metadata are in
[`asset-sources/movement/sounds.json`](../asset-sources/movement/sounds.json).
The files come from the same pinned original-game archive as the weapon audio;
asset provenance does not grant redistribution rights.

## Runtime adaptation and limits

`src/footstep-rules.ts` contains the sound rules and batched-position sampler.
`src/footsteps.ts` reads the real local Bevy velocity when available through the
existing pinned upstream protocol package's `AvatarMovementInfo`. Other clients
fall back to sampled displacement. No movement component is written by this
system. The same protobuf schema helper is shared with the existing Bevy scope
camera bridge; SDK/runtime versions remain pinned.

Remote human positions come from server-owned `PlayerPose`; bots use their synced
transforms. Clients derive presentation from these positions, so no client sends
arbitrary sound URLs, targets or locations. Delayed network positions can delay
or alter remote footstep timing; clip variation is selected locally. Unchanged
samples retain their elapsed interval, and teleport/stale samples reset history.
Death, round changes, spectator entry and hidden scenes clear sound emitters.
Local walking speed is capped to its configured gun speed to reject sample spikes.

Ground contact uses a downward original-BSP trace with a 12 cm tolerance around
the avatar's feet. Jump takeoff is inferred from upward motion leaving that
surface; landing strength uses measured downward velocity. These adaptations
are not GoldSrc movement prediction. [Desktop CS acceleration, friction, gravity and air control](CS16-MOVEMENT.md)
are now implemented through Bevy movement components. Crouch hulls, ladder/water
movement and exact GoldSrc collision remain open.
[Landing camera punch and authoritative fall damage](CS16-FALLING.md) are now
implemented with documented network and movement limits. Bot hearing is separate work. Spatial falloff and stereo panning
still use the explorer's audio renderer rather than GoldSrc's mixer.

## Validation

Run `npm run validate` for source-rule regressions, all original audio hashes,
asset checks and build/typecheck. See
[`validate/game/movement/README.md`](../validate/game/movement/README.md) for the
headless browser fixture, keyboard checks and recorded evidence.
