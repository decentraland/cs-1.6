# Knife contact feedback

A nearby stab used to play `stab_miss` and a generic slash cue. Walls and players
shared one hit sound, and other clients heard no knife attack. The scene now
predicts the contact animation and cooldown from its local trace, then uses the
authoritative result for player-hit audio and damage.

## Behavior

- Stabs select `stab` on contact and `stab_miss` in clear space. Slashes alternate
  `midslash1` / `midslash2`, resetting on deployment. Stabs do not advance that order.
- Misses choose either original slash sound at pitch 0.94; wall strikes use
  `knife_hitwall1` at pitch 0.98–1.01. These non-damage cues play locally immediately.
- Confirmed player slashes choose one of four flesh clips; confirmed stabs use
  `knife_stab`, both at pitch 1. A predicted player contact stays silent until
  confirmation so it cannot falsely report a hit.
- Deployment plays `knife_deploy1` at volume 0.3. Other clients hear accepted
  attacks at the server's recorded attack origin. Pooled sources reset pitch on
  every playback, including ordinary gunfire.
- Swing primary delays are 0.35 seconds on a miss or 0.4 on contact; their secondary
  delay is 0.5. Stabs lock both actions for 1 second on a miss or 1.1 on contact.
  The local prediction and server use the same helper.

A matching wall/miss acknowledgement does not repeat sound. A differing result
can correct the cue, but never restarts the animation. Each local request carries
its round, weapon revision and attack; expired, duplicate, dead-player and
replaced-weapon replies cannot alter its successor. The server rejects a request
from another round before consuming its sequence.

Health, armor, deaths, scoring and existing damage formulas remain authoritative.
Both touch SLASH/STAB and desktop mouse/F use these handlers. Refresh server and
clients together: SDK Map messages are positional binary schemas, so adding the
round and feedback fields is not compatible with older running scene builds.

## Moving targets

Knife requests now carry the predicted origin, movement speed, observed target
position and drawn server clock. Humans use the existing measured-RTT rewind,
with observations bounded to 35 cm around historical positions and the same
500 ms maximum delay. Bots use the existing one-second position/facing/animation
history at the clamped drawn clock. Missing human RTT uses current eligible
positions; a client-supplied bot clock cannot change human rewind time.

Backstab direction comes from the same historical target as the contact, so a
victim turning after the displayed attack does not change that attack's damage.
Origin validation reuses the gun path's recent movement samples and capped lead
allowance. Implausible origins fall back to the server position; implausible target
observations fall back to the authoritative target snapshot. Rewinding constructs
trace data and never moves the live avatar. Walls, reach, cooldowns, eligibility,
armor, duplicate rejection and per-life history guards still apply.

[Rewind regression and reproduction](../validate/game/knife-rewind/README.md)
cover production client/server and SDK Room, including a human running 1.8 metres
past the drawn contact, a turning victim, a leading shooter origin and respawns.
`[KNIFE]` logs show human delay/claim, bot view delay, origin acceptance, hit group
and backstab result. [Human timing and trust limits](CS16-HUMAN-REWIND.md) apply.
Server and clients must share the updated knife message schema.

## Source and media

The animation, sound and interval reference is
[`CKnife::Deploy`, `Swing` and `Stab` at ReGameDLL_CS b0889847](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_knife.cpp).
The scene uses the non-shield attack branches. Local/server random variants are
independent; this does not reproduce GoldSrc's shared random stream.

[Seven additional original WAVs](../asset-sources/cs16-weapons/knife/sounds.json)
are byte copies from the approved CS-Server revision, with sizes, source URLs and
SHA-256 hashes checked by `validate/knife-feedback-assets.mjs`. Existing
`knife_swing` and `knife_hit` aliases are slash1/hit1 and remain covered by the stock
media manifest. The existing approved knife model already contains the hit clips;
no model conversion is part of this change.

## Verification and limits

[Regression evidence and reproduction](../validate/game/knife-feedback/README.md)
cover the actual SDK Animator/AudioSource components, Room serialization and
production gameplay handlers. No native client or new browser was launched for
this change. Phone multitouch and perceptual animation/audio comparison remain
unverified.

Moving targets can still disagree with prediction outside the timing/observation
bounds or because the renderer's final smoothed avatar pose is unavailable to the
scene. Native-device input and real two-client knife latency still need playtests.
Direct lines use anatomical hit groups; fallback contacts use the standing player
box with generic body damage, matching the engine's ordinary player-hull path.
The [source and original-binary audit](../validate/game/knife-contact/README.md)
also corrects ordinary first/paused slash damage to 15. Its production-handler and
SDK Room tests supersede the earlier damage assumption without changing these
feedback clips or intervals.

World traces now try the point line first, then Dust2's original head hull and
standing actor boxes. A world-hull contact uses the source `FindHullIntersection`
center/corner rays to refine the contact onto an actual surface. Prediction and
the server share this path for wall feedback and contact cooldowns.
[World-contact regressions and source checks](../validate/game/knife-world/README.md)
cover a real Dust2 edge and 24 independently sampled BSP segments.

The map's static brush state and 2/75 scale differ from dynamic GoldSrc brushes
and the scene's 0.025 weapon-unit conversion. Exact GoldSrc plane epsilon,
start-solid/backoff behavior, crouched actor bounds, material strike layering,
attenuation/channel mixing and knife decals remain incomplete. The older binary's
cadence correction under long held-input stalls is not reproduced. These limits
prevent claiming exact knife parity from these tests.
