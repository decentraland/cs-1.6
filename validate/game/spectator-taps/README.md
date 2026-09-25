# Spectator quick-tap regression

NEXT/PREVIOUS used to discard a press if its release arrived in the same scene
update. Retaining that press alone made quick PREVIOUS taps cycle forward because
its modifier was already released. Desktop Shift-click could additionally lose
the modifier's down event in the pinned SDK's global input scan.

The scene now consumes the press once, retains the reverse direction for that
update, and collects native trigger edges independently of that SDK scan.
The target cooldown, menu/capture guards and dead-team eligibility still apply.

Run from the scene root:

```sh
node --experimental-strip-types --test tests/spectator-input.test.mjs
npm run validate
```

The six cases invoke production `spectatorSystem`, target selection and camera
handoff with controlled component state. UI events pass through the installed
SDK pointer dispatcher and production touch-button callbacks. Native and desktop
paths use real root `PointerEventsResult` values. The checks cover quick forward
and reverse taps, wrapping without enemy selection, cooldown rejection without
later replay, death/menu/respawn cancellation, held-input release, and the neutral
desktop observer's Space toggle. Five cases fail before the change; the held-input
guard already passes. All six pass afterward.

The focused spectator/observer/native/short-tap suite passes 36 tests, including
all 24 firearms. The full gate passes 545 tests plus assets and SDK build/typecheck.
Logs: [before](before.log), [focused](focused.log), [full gate](validate.log).

This is a scene integration regression with a controlled clock and component
adapter. It does not emulate a native touchscreen renderer or prove Godot camera
support. No explorer was launched for this check. The reporting phone's FIRE
failure still needs the app/build, scene URL and button-feedback observation.
