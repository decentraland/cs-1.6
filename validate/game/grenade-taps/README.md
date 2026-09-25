# Grenade short-tap regression — 2026-09-22

A press followed by release could arrive between server system updates. The
handler retained only the final `held: false`, so the pin never started, no ammo
was consumed and no projectile was created. Earlier short-tap tests only checked
the client's outgoing `[true, false]` messages.

The server now advances a ready pin pull in the validated press handler. Release
still throws on the normal system update after the 0.5-second minimum. Holding
does not cook the grenade; repeated pressed messages do not reset its timer.

## Reproduction and evidence

```sh
node --test tests/grenade-taps.test.mjs
npm run validate
```

The new fixture runs production grenade, inventory and weapon adapters with
installed SDK ECS components. The integration case uses actual SDK pointer-event
dispatch, the production touch UI/client, SDK Room binary serialization and the
production server handler. It delivers press/release in one batch before the
next server update, then requires one authoritative projectile and one ammo
consumption for HE, flashbang and smoke. It also records the server's call to
`syncEntity`; CRDT transport to a live renderer is not part of this test.

- At 11.000 s the ready press starts the pin; release at 11.016 s is retained.
- Updates before 11.500 s create no projectile; the 11.500 s update creates one.
- An old replayed press cannot cancel that release or add a second throw.
- Flashbang retires to the pistol even with another flash remaining.
- Early released taps cannot queue through weapon draw. A held press starts when
  the weapon becomes ready.
- Death, weapon changes, C4 selection and freeze cancel the pending action.

`before-tests.log`: **3 failed, 2 passed**. `after-tests.log`: **5 passed**.
Full project gate: **415 tests passed**, asset integrity, build and typecheck
passed. The original HE damage/flash/smoke rules are unchanged.

The fixture substitutes an open-world trace and player-position provider; it
verifies input, timing and projectile creation rather than collision or damage.
No browser/native client was launched for this change. Native phone input and
multitouch remain unverified; this proof does not claim to fix every cause of
unresponsive FIRE on an unidentified mobile build.
