# Remote weapon sound regression

A silenced M4A1 or USP previously sounded unsilenced to other players. The client
also chose the gun and position from the latest replicated avatar state: an M4
shot arriving after a switch could sound like a Deagle, and an unloaded avatar
made the shot silent.

Each authoritative shot now includes `fire: { gun, mode, origin }`. Receivers use
that snapshot for sound while retaining the existing impact/recoil behavior.
Bot events carry the same shape; current bot firing uses mode 0. Payloads
omitting the snapshot use available weapon/avatar state, including its mode.
The sender's own acknowledgement never replays its predicted gun sound.

The binary map schema is positional: this fallback does not make old encoded
packets compatible. Server and clients must use the same scene build; refresh
existing previews after the update.

The optional object is deliberate: SDK 7.27's `Schemas.Optional` serializes
scalar `0` as absent. Required `mode` inside the optional map preserves an explicit
unsilenced shot even when the receiver's current weapon is silenced.

## Reproduce

```sh
node --experimental-strip-types --test tests/remote-shot-sound.test.mjs
npm run validate
```

[Before](before-tests.log): all six cases fail, including `m4a1_fire` instead of
`m4a1_silenced_fire`, `deagle_fire` after switching, and no sound without an avatar.
[After](after-tests.log): the six regressions and 13 existing shot/rewind/Room
checks pass. [Full production gate](full-gate.log): **453 tests**, asset integrity
and SDK bundling/typecheck pass. The tests run the production server, production client handlers and
sound selector through the installed SDK's real binary Room codec and dispatch.

The cases cover both silencers, explicit unsilenced mode 0, queued firing context,
all 24 firearms, missing avatar/weapon replication, bot sound mode, own echoes,
wrong rounds, unknown gun names and rejection of events from another client.
ECS positions and delivery timing are controlled fixtures; audio playback is
recorded at the scene call boundary. No browser/native client was launched and
this does not establish perceptual mixing, attenuation or mobile touch behavior.
The scene retains its existing fixed fire clips; additional original random sound
variants and GoldSrc pitch variation are outside this routing fix.

## Sources

The pinned original-client event handlers select silenced/unsilenced sound from
the firing event: [M4A1](https://github.com/Velaron/cs16-client/blob/9c891b8ebeb5ff0b84e00af769c2f5e35a0280be/cl_dll/events/event_m4a1.cpp),
[USP](https://github.com/Velaron/cs16-client/blob/9c891b8ebeb5ff0b84e00af769c2f5e35a0280be/cl_dll/events/event_usp.cpp).
The matching server [USP firing code](https://github.com/rehlds/ReGameDLL_CS/blob/b0889847fe6d03898be88acc9e366660efb40ab5/regamedll/dlls/wpn_shared/wpn_usp.cpp)
sets its silencer bit in `PLAYBACK_EVENT_FULL`. Existing WAV provenance/hashes
remain in [stock-media.json](../../../asset-sources/cs16-weapons/stock-media.json).
