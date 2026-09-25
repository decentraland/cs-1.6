# Mobile icon controls — 2026-09-21

One isolated, muted headless Bevy browser; forced mobile layout. Native
`UiInputBinding` was disabled in the fixture to reproduce clients where the
scene receives UI callbacks but no bound action events. This is not a native
Godot/device multitouch test.

- Bought M4A1: $16000 → $12900, loaded clip stayed 30 through the menu taps.
- Held the FIRE icon for 650 ms: authoritative magazine 30 → 22.
- Released FIRE and waited: magazine remained 22.
- Tapped walk, released and waited: jog speed stayed 2.99 m/s.
- Tapped again: run speed returned to 5.75 m/s.
- Recorded 844×390 landscape and 390×844 portrait. Preview statistics were
  dismissed before the final screenshots; gameplay state was unchanged.
- `npm run validate`: 350 tests passed, assets verified, build/typecheck passed.
- Closed the owned browser and isolated port-8034 server afterward.

[Running](landscape-running.png) · [Walking](landscape-walking.png) · [Portrait](portrait.png)

Reproduce with `validate/prepare-touch-controls.mjs --no-native-bindings` and
`validate/mobile-controls.mjs`; full commands are in
[the touch-control guide](../../../docs/CS16-TOUCH-CONTROLS.md).
The unit regression in `tests/mobile-controls.test.mjs` reports **0 shots instead
of 3** with the old FIRE button and passes with the direct callback path.
