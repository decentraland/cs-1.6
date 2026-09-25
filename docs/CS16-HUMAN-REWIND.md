# Human hit registration

Human firearm and knife attacks use server-owned position/yaw history plus the shooter's
observed target position when it is plausible. Existing local shot/impact
prediction stays immediate. The server validates the shot and applies damage in
one handler; it does not delay damage for a second validation pass. Confirmed
kills, ammo, armor and weapon damage remain authoritative.

## Timing and observation

The server sends a targeted probe every two seconds. Only its matching echo from
that player counts; clients do not supply a timestamp or a ping value. Recent
minimum RTT (last ten seconds) prevents a single delayed echo from immediately
increasing rewind. Missing/stale RTT falls back to receipt time.

The client probe handler receives only the message payload. SDK Room authenticates
server messages before invoking client callbacks; sender context exists only for
server callbacks. The previous client-side `context.from` check silently discarded
every legitimate probe, so the server never learned RTT. The handler now echoes
through the SDK's normal client-to-server route after synchronization.

The initial human view time is:

```
shot receipt time - min(500 ms, RTT / 2 + 100 ms smoothing allowance)
```

All eligible humans are traced at that time. If the shooter reports a target
position, the server accepts it only within 35 cm of the target's historical
path, at most 100 ms either side of the estimated view time. The search cannot
extend past receipt time or beyond the 500 ms cap. Accepted observations supply
the shot's target position; yaw comes from the closest historical pose. A
rejected observation falls back to the original historical target, rather than
discarding the whole shot. The ray, walls, penetration, nearest target and
head/body/limb damage still determine the outcome. Merely naming a target does
not award a hit, and a headshot is only lethal if weapon damage after range and
armor is enough.

The timing is captured when the shot arrives, even if the existing fire-cadence
queue executes it later. One second of position/yaw history includes space for
that queue. Every shotgun pellet uses the same resolved target snapshot. Bots
continue using their existing `ServerClock`/`seenAt` and animation-aware rewind.
Knife swings and stabs now share human history/observation validation and use the
same bot view clock. Backstabs use the historical contact's yaw. Missing RTT uses
current eligible knife targets, and optional view data omitted by a current-schema
sender falls back to the server origin. This is not wire compatibility with old
builds: both server and clients need the new message schema. Grenade explosions
continue using current targets. See [knife rewind evidence](../validate/game/knife-rewind/README.md).

## Pellets and penetrating hits

Client observation now traces every shotgun pellet and follows each weapon's
penetration rules through the same `traceGunShot` function as server resolution.
It reports the first target receiving nonzero trace damage across those impacts.
Previously, a missed first pellet or a wall before a penetrated target omitted
the observation entirely. Shotgun prediction also uses the per-weapon range
rather than a generic 100-metre ray.

`tests/pellet-claims.test.mjs` reproduces both shotguns hitting with later pellets,
while the first misses. With the server target 30 cm from its displayed position,
all unadjusted pellets miss; the transmitted observation now resolves the
server-owned kill and spends one shell. Duplicate requests remain rejected.
The tests use production client/server code and SDK Room with controlled ECS
and transport adapters. The penetration case uses actual Dust2 middle-door
collision; the range case uses an empty-world adapter.

Only one observed target position is sent per shot. Other humans still use the
RTT-based historical snapshot. The shared trace does not change source damage,
recoil, cadence or the existing observation bounds. It does not validate live
multitouch, phone rendering or the smoothing of a particular explorer build.
[Before/after evidence](../validate/game/pellet-claims/README.md).

## Lifecycle and bounds

History clears on death, bench/spectate, respawn, round/team/entity changes,
disconnect, missing avatar transforms, sample gaps over 250 ms and position
jumps over 3.2 m. A request earlier than a target's first sample cannot be
clamped onto a new life. Current roster eligibility and alive checks still
apply. Rewinding only constructs trace targets; it never moves live avatars.
Disconnects also discard latency probes, and old echoes cannot satisfy a new
session's probe.

Origin validation preserves the running-shooter allowance, including when
movement packets trail firing messages. The movement contribution is capped at
8 m/s (at most five metres total allowance with the existing base tolerance).
Neither an enormous claimed speed nor a teleport-derived server speed can grant
an arbitrary origin. This remains tolerance-based validation, not full
server-authoritative avatar movement.

## Validation and playtest

Run from the scene root:

```
node --experimental-strip-types --test tests/latency-echo.test.mjs tests/human-rewind.test.mjs tests/human-server.test.mjs tests/hit-claims.test.mjs
npm run validate
```

The tests bundle the production server handler, combat rules, hitboxes and
Dust2 collision; an in-memory SDK adapter supplies ticks, player transforms and
message delivery. At 400 ms simulated RTT a human running at 6 m/s is 1.8 m past
the visible aim point when the shot arrives. The previous handler misses; the
new handler confirms the headshot, consumes one round, awards one kill and
rejects a duplicate. Further cases cover queue timing, respawns, eligibility,
friendly blockers, walls, stale/forged observations and small smoothing offsets.
`tests/latency-echo.test.mjs` additionally loads the installed SDK Room,
binary event encoder/decoder and the scene's actual message schemas. It delivers
the production server probe to the production client callback, returns the echo
with server-side sender context, and verifies that the resulting 400 ms RTT
rewinds the moving target 1.8 m and resolves the headshot. It also verifies that
SDK Room drops another player's probe and an unsynchronized client stays silent.
Both new cases fail with the old context guard. The older server tests synthesized
echoes and therefore could not catch the broken client callback.

These are deterministic regressions, not a two-browser latency measurement.

The 2026-09-22 single-client headless Bevy check recorded real measured RTT
296–297 ms and a 248 ms rewind delay. It verifies probe transport, not moving-human
rendering. [Evidence and reproduction](../validate/game/latency-echo/README.md).

For a real playtest, refresh both clients after rebuilding the scene, join
opposing teams and wait for the live round. At A long, have the target strafe
while the shooter taps at the head, then swap roles. Also try stopping, peeking
out of cover, a helmet with a pistol, and the next round after a kill. Check
`[SHOT]` lines in `npm run server-logs`:

- `humanRtt`: measured round-trip milliseconds, or `pending`.
- `humanDelay`: base rewind milliseconds (maximum 500).
- `humanRewind`: largest human displacement for this shot, in metres.
- `humanClaim`: `accepted`, `rejected` or `none` for the observed target position.
- `hit`: resolved hit group; existing `claim` concerns origin/movement validation.

## Reference and limits

[ReHLDS `SV_SetupMove`](https://github.com/rehlds/ReHLDS/blob/master/rehlds/engine/sv_user.cpp)
rewinds other players using latency plus interpolation and excludes dead or
teleported history. This scene follows that principle, but its timing limits and
observation tolerances above are scene choices, not a claim of exact GoldSrc
network parity.

Bevy receives movement into the SDK global CRDT in
`crates/comms/src/global_crdt.rs::apply_foreign_movement`; native avatar rendering
is smoothed separately in
`crates/avatar/src/foreign_dynamics.rs::update_foreign_user_actual_position`.
The scene cannot read that final rendered pose. RTT/2 assumes roughly symmetric
transport, and the fixed 100 ms smoothing allowance and 35 cm observation
threshold need real two-client tuning. Human hitboxes are still the existing
standing avatar proxies, not animation-accurate CS player bones. Very late
shots beyond the cap may miss. Kill confirmation still needs the network round
trip; local prediction cannot make authoritative death instantaneous.
