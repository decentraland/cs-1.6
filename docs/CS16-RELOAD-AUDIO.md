# Weapon reload sounds

Other players previously heard no magazine-reload cue. Accepted manual,
automatic and bot reloads now play the original generic cue for nearby listeners.
This covers 22 magazine-fed guns. The reloader retains its existing model-timed
sounds; rejected or duplicate requests do not play another cue.

## Reference and implementation

ReGameDLL's `DefaultReload` calls `ReloadSound` after checking ammunition.
It excludes the reloader and dormant players, checks three-dimensional distance
against 512 source units and sends a byte volume falling linearly with distance.
The scene uses its current weapon scale, 0.025 m/unit, giving a 12.8 m limit.
No wall-occlusion check is added. See the pinned
[server source](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapons.cpp#L1522)
and [distance constant](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapons.h#L34).

A firsthand client.dll inspection posted by Immortal_BLG on June 15, 2010,
reports that the handler chooses the generic clip and applies the received byte
as volume divided by 255. It receives no sound position. This is reported binary
inspection, not a live original-client test.
[Handler inspection](https://forums.alliedmods.net/archive/index.php/t-116393-p-2.html).

`reload-audio.ts` privately sends the cue only to connected human listeners in
range. Human origins come from server avatar transforms; bots provide their
server position directly. The client rejects stale-round or invalid-volume cues
and uses the existing camera-parented sound pool, avoiding extra positional
attenuation. SDK Room admits only authoritative messages.

`assets/sounds/weapons/reload.wav` is the already-installed byte-identical
`generic_reload.wav` from the approved pinned source; no new media was downloaded.
[Existing manifest](../asset-sources/cs16-weapons/stock-media.json).

## Verification and limits

Run `node --experimental-strip-types --test tests/reload-audio.test.mjs`, then
`npm run validate`. The eight new cases cover all 22 guns, rejection/duplication,
auto reload, bot position, binary SDK delivery and actual SDK AudioSource state.
The full gate passed 511 tests, assets, build and typecheck.
[Before/after evidence](../validate/game/reload-audio/README.md).

For an audible playtest, refresh the scene server and both clients. Stand 6.4 m
apart, fire one rifle round, then reload: only the other client should receive the
roughly half-volume generic cue. Repeat past 12.8 m and with a full magazine:
neither should produce that cue. The reloader should retain its normal animation
sounds. Repeat beside an empty-magazine bot.

M3/XM1014 shell reloads are excluded from the generic magazine cue. The follow-up
below implements the separate XM1014 path. Runtime listening, native phone input,
network delay, avatar sample age and the map/weapon scale mismatch remain limits.


## XM1014 shell-loading sounds — 2026-09-22

XM1014 previously reloaded silently: its viewmodel has no insert-sound event,
and its server shell sound was missing. It now plays one of the two original
`reload1.wav` / `reload3.wav` clips as each shell-loading animation starts, after
the 0.55-second opening stage and before the 0.3-second insertion completes.
The server chooses the shared variant and integer pitch (85–116), and emits from
the authoritative player/bot position. The owner hears it at the camera; other
players hear positional audio. Weapon sound channels replace the previous shell
variant instead of overlapping the longer clip. Ten pairs of reusable sources
bound allocation and keep different reloaders independent.

[XM1014 Reload](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_xm1014.cpp#L184)
passes those two clips to
[DefaultShotgunReload](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/weapons.cpp#L1576),
which emits on the item channel at normal volume/attenuation with randomized
pitch. M3 passes neither clip; it retains its original viewmodel insert event
and does not receive an invented extra remote sound.

The approved asset source supplies the clips from `server/valve/sound/weapons`
at commit `6ad155c7a610a85cfd443fcace2c97f2afcb2866`. They are byte-identical mono
22,050 Hz WAVs, totaling 18,378 bytes, listed in `stock-media.json` and checked by
the normal asset gate.

`finishReload` reports an insertion only when it advances to that stage. Human
weapon updates, reload advancement during shooting, and both bot update paths
use the same callback. Repeated updates cannot duplicate sounds; holstering and
death stop future insertions. A delayed update reports at most the current
insertion instead of replaying completed stages as a burst of sounds.

Run:

```sh
node --experimental-strip-types --test tests/shell-reload-audio.test.mjs tests/reload-audio.test.mjs tests/weapon-reload-parity.test.mjs
npm run validate
```

Five of seven new cases fail on the preceding scene source. All 22 focused tests
pass after the fix. SDK Room tests cover owner/other playback, binary position
values, authority, round and payload guards. Actual SDK AudioSource tests check
clips, pitch, positioning, replacement and bounded allocation.
[Evidence and full gate](../validate/game/shell-reload-audio/README.md).

For an audible check, refresh server and clients, fire three XM1014 rounds, then
reload. The owner and a nearby listener should hear three separate loading cues;
repeat while cancelling with the knife before insertion and while firing during
reload. M3 should keep its own existing insert sound. No browser/native client
or original CS executable ran for this step. Explorer distance attenuation and
network timing are not proven identical to GoldSrc's mixer/PAS delivery.
