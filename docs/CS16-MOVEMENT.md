# CS movement in Bevy

The desktop scene now drives Bevy's real player velocity with CS movement rules.
WASD accelerates to the equipped weapon's speed; releasing it applies friction,
and opposite input counter-strafes. Shift/Ctrl walking stays at 52% speed even on
diagonals. The controller also applies gravity, jump fatigue, air acceleration
and server-confirmed bullet flinch. Touch and clients without the Bevy movement
components retain the existing `AvatarLocomotionSettings` path.

## Rules and sources

At the scene's existing scale, one Half-Life unit is 0.025 metres.
[ReGameDLL movement](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/pm_shared/pm_shared.cpp)
and the [CS multiplayer defaults](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/multiplay_gamerules.cpp)
provide these values:

| Setting | Value |
| --- | --- |
| Ground / air acceleration | 5 / 10 |
| Ground friction / stop speed | 4 / 75 HU/s |
| Gravity | 800 HU/s² (20 m/s²) |
| Standing jump height | 45 HU (1.125 m) |
| Air wish-speed projection cap | 30 HU/s |
| Step height | 18 HU (0.45 m) |

Holding jump cannot automatically jump again after landing. Repeated jumps use
the source stamina penalty and bunny speed limiter. Ground friction doubles near
an edge. These formulas live in `cs-movement-rules.ts`; the engine adapter lives
in `cs-movement.ts` and `movement-ground.ts`.

[Player damage / PreThink](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/player.cpp)
define flinch. Small flinch starts the velocity modifier at 0.5. Eligible large
flinch starts it at 0.65 and adds 170 HU/s away from the attacker, unless the
victim already moves at 300 HU/s or faster. Legs use small flinch. Grounded
commands recover the modifier by 0.01 and multiply actual velocity; recovery
pauses in the air. Gun choice comes from the server's confirmed damage event.
Fatal hits, falls and blast damage do not add this bullet response.

## Engine adaptation

The pinned `@dcl/bevy-protocol` codec exposes `AvatarMovement` (1501) and
`AvatarMovementInfo` (1500). The official Bevy web client accepts this component
from an ordinary scene. No engine modification, dependency upgrade or player
teleport is used by the controller. See upstream
[the movement protocol](https://github.com/decentraland/bevy-explorer/blob/0cfd373d94b707dbd37da33fe60d62be92b74dfc/crates/dcl_component/src/proto/decentraland/sdk/components/avatar_movement.proto)
and [collision processing](https://github.com/decentraland/bevy-explorer/blob/0cfd373d94b707dbd37da33fe60d62be92b74dfc/crates/user_input/src/avatar_movement.rs).
Those Bevy sources were inspected in the local checkout; behavior was verified
in the hosted official browser build.

The scene submits velocity every frame and reads the renderer's actual collision
response. Two continuous native physics rays find the floor and the next surface.
A hit plane accounts for the capsule radius and the one-frame ray delay, keeping
walking stable on Dust2's slopes and on SDK boxes. A bounded lift climbs small
steps through Bevy's collision solver; walls and low ceilings still block it.
Jumping cancels the lift. Freeze, death, hidden scenes, teleports and round changes
clear movement state; deleting the override lets the native controller resume.

## Limits

This is not complete GoldSrc physics parity. Bevy retains its capsule collider,
collision/slide solver and update cadence. The stair lift is an adaptation rather
than GoldSrc's up/forward/down hull sweep. Per-command stamina and flinch therefore
also depend on client frame rate. The headless review ran near 60 frames per second;
it is not a side-by-side original-client timing comparison.

Crouch hulls, ladders, water, surf/steep-slope behavior, moving-platform momentum
and exhaustive Dust2 route coverage remain unverified or unimplemented.
[Bots now receive the same grounded velocity rules and flinches](CS16-BOT-MOVEMENT.md),
with server-owned position and approximate collision clipping. Bot airborne physics
and original tactics remain open. Movement
remains client-driven; authoritative health/weapon validation does not make player
position cheat-proof. Fall damage still validates landings against the fixed Dust2
BSP. The new gravity changes damage from the same ledge compared with earlier
native-gravity captures; see [fall rules](CS16-FALLING.md).

## Validation

Run `npm run validate`. The new tests cover acceleration, friction, counter-strafe,
diagonal walking, air control, jump/stamina, both flinches, slope support, step
limits and jump cancellation during a lift. Reproducible muted headless browser
checks and their recorded traces are in
[`validate/game/movement-control`](../validate/game/movement-control/README.md).
