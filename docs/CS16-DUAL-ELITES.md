# Dual Elites firing hands

The Elites previously fired both bullets from the eye center and chose animations
from magazine parity and random variants. They now alternate the stored left/right
hand, using the original five-unit horizontal muzzle offset (0.125 m at the
scene's weapon scale). That can change whether a shot catches an exposed head or
nearby cover. The offset follows aim yaw plus the pre-shot recoil yaw.

## Source behavior

[Deploy and ELITEFire](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_elite.cpp)
set the left-hand flag on an even-clip deployment, leave it unchanged on an odd
clip, and toggle it only after a live shot consumes ammunition. Reload does not
reset this flag. For example, fire the left pistol once from 30 rounds and reload:
the next shot is right. Holstering and drawing the now-even magazine selects left.

The scene represents that flag as Elite `Weapon.mode`: 1 means left fires next,
0 means right. It is internal weapon state, not a user-selectable alternate mode.
The existing stored-item and dropped-weapon mode fields carry it between owners
and weapon selections. Bot combat also preserves it in inventory. Other firearms'
mode meanings stay the same.

The pinned [client firing event](https://github.com/Velaron/cs16-client/blob/2d125db28d2c043fd0730c9970066d845574dbb0/cl_dll/events/event_elite.cpp)
selects variants 1/2/3/4/5 from elapsed-shot thresholds below 0.2, 0.2, 0.3, 0.4 and
0.5 seconds, respectively. Only zero remaining rounds selects the last-shot clip.
The scene uses the firing hand for that clip and the original `idle_leftempty`
pose when one round remains. Local animation timing uses the time between local
predicted shots; a rejected prediction can still have played an animation.

## Prediction and validation

Each client claims its eye position. The server validates it through the existing
movement history and applies the hand offset once; sending the offset muzzle as
the eye would have applied it twice. Local impact prediction uses that same offset.
The accepted-shot event identifies the hand that fired, while the weapon component
stores the next hand. A small prediction ledger handles either arrival order,
rejected shots, old replies, weapon switches and rounds.

[Reproducible checks and logs](../validate/game/elite-hands/README.md) include six
initial before-fix failures, 49 focused passing checks and the 503-test full gate
with assets/build/typecheck. The tests exercise production desktop/touch firing,
server handlers, real SDK binary messages and camera/Animator components. A Room
test intentionally withholds weapon replication for three shots, including the
zero/right mode, and checks the server and predicted origins agree within float32
transport precision.

Restart the preview server and refresh its clients together after this change so
they share the Elite mode semantics. To playtest, join T, buy Dual Elites and ammo,
tap at different rates, then fire once from a full magazine and reload. The next
shot should use the other pistol. Switching to the knife and back with a full
magazine selects left again. Emptying the clip should play the last-shot animation
only on the final round.

No browser, native client or original CS engine was launched for this correction.
Component tests establish selected clips and ray origins, not a rendered or audible
comparison. Native phone FIRE remains unverified. Third-person attack-pose parity,
model mirroring, exact GoldSrc command timing and the existing map/weapon scale
mismatch remain separate limits. The sources above are pinned reconstructions;
no live original-engine equivalence is claimed.
