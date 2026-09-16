# Falling and landing feedback

Falls now damage health on the authoritative server. Armor and helmets are
preserved, fatal falls use the existing death/spectator transition and round
elimination, and world deaths add one death without changing the victim's kills
or granting kill money. Equipped weapons and C4 drop through the same death path
as combat kills.

## Original rules

Pinned reference: [ReGameDLL_CS](https://github.com/rehlds/ReGameDLL_CS/tree/b0889847fe6d03898be88acc9e366660efb40ab5),
`player.h`, `CHalfLifeMultiplay::FlPlayerFallDamage`, `CBasePlayer::TakeDamage`,
`CBasePlayer::PostThink`, `PlayerKilled`, and `PM_CheckFalling`.

At the scene's scale of 0.025 metres per HU, the safe speed is 12.5 m/s
(500 HU/s). The raw damage is:

```text
max(0, (impactSpeedHU - 500) × (100 / 600) × 1.25)
```

Health damage is truncated to an integer after that calculation, as in the
original `TakeDamage` path. The armor calculation is bypassed. A 600 HU/s impact
removes 20 health; 740 HU/s removes 50; 980 HU/s removes 100.

The body-splat sound uses the source's strict `rawDamage > health` condition.
Nonfatal falls use one of the three original flesh-hit voice sounds; fatal falls
use one of the four original death voice sounds. The separate body-splat clip
can overlap the death voice. The original mono WAVs, URLs and hashes are in
`asset-sources/player-falling/sounds.json`. They share the weapon archive's
provenance; this is not a redistribution license.

A loud landing immediately sets the local camera roll to
`impactSpeedHU × 0.013` degrees and uses the existing punch decay. A damaging
landing clears recoil pitch while retaining spray state and yaw; older shot
confirmations replay the pitch reset in order. The server clears authoritative
pitch too. A late damage response does not replay the predicted camera effect.
The live native camera on touch still cannot apply scene camera offsets.

## Authority and movement observations

The server samples actual player transforms, checks contact against the original
Dust2 BSP and requires a continuous descent before accepting a landing. Velocity
uses two observed movement intervals, retaining elapsed time through unchanged
network frames. Respawn, round changes, death, disconnects, stale observations
and teleport-sized discontinuities clear that history.

The local client reports its observed impact speed. A report only refines an
existing server-observed landing when its position is within 1 m, its arrival
is within 0.6 seconds and its speed is within 2 m/s of the server estimate.
Reports are fenced by round and increasing sequence; a report on flat ground
cannot create a fall. The server waits at most 250 ms for a matching report,
then uses its own estimate. Withholding the report does not disable damage.

These tolerances accommodate the separate movement and gameplay message
channels. They do not make client-driven locomotion cheat-proof: an altered
client can still influence its networked motion and a report within tolerance.
The no-report estimate is approximate, particularly near the damage threshold.
No health amount, damage target or kill outcome comes from the landing report.

[Desktop movement](CS16-MOVEMENT.md) now supplies CS gravity, acceleration and
friction through Bevy's real velocity component; other clients keep native movement.
The renderer still determines collider behavior. Earlier browser captures used
native gravity and retain their historical results. Identical ledge heights are
not proven to produce exactly the same fall as GoldSrc. The fixed Dust2 BSP is the ground authority; arbitrary platforms,
water/ladder movement, out-of-map geometry and custom physics are not covered.
Bots currently follow grounded navigation routes rather than airborne player
physics. The HUD's world-death entry still uses the existing text kill feed.

## Validation

`npm run validate` covers fall thresholds, truncation, splat boundaries, network
sampling, teleport/stale resets, report bounds, pitch prediction, assets and the
complete scene build/typecheck. The uneven-arrival regression reproduces the
velocity spike found in the first browser pass.

[Headless browser evidence and reproduction](../validate/game/falling/README.md)
cover actual walking off platforms, safe/damaging/fatal falls, unchanged armor,
camera roll, world-death statistics, money, splat audio scheduling and respawn.
A second run disables landing reports to exercise the server fallback. Browsers
were muted; no listening comparison is claimed.
