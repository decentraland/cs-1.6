# Mobile menu feedback

Checked 2026-09-21 in one isolated, muted headless Bevy browser. The fixture
forces mobile layout, starts with $16000, pauses bots and extends buy/round time;
production purchasing and weapon-mode handlers remain active.

- [Purchase confirmation](m4a1-owned.png): one message below the item list,
  clear of the buttons. UI snapshot asserts its position below 600 px at 720p.
- [FAMAS in burst mode](famas-burst.png): AUTO returns to full automatic;
  a subsequent real click returned the button to BURST. SEMI never appears.
- [Results](checks.json): gun/ammo purchases, full-reserve taps, slot changes,
  silencer actions, and 1280×720, 844×390, 390×844 layouts passed.

Use `validate/prepare-touch-controls.mjs` and `validate/touch-controls.mjs` as
explained in [the original fixture instructions](../touch-controls/README.md).
Start with a fresh fixture/player on the team menu. Reused browser profiles may
show a welcome screen; clearing only the isolated page's local/session storage
and reloading recovered this run. Close the owned browser and server afterward.

The production UI regression checks footer bounds, scroll separation, stable row
positions, touch wording and both alternate states. Two of eight touch tests
failed before this fix; all eight pass afterward. The complete scene gate passed
337 tests, asset checks, build and typecheck.

This is a forced mobile layout rendered in Bevy, not a native-device multitouch
or mobile camera test. Desktop VGUI presentation remains separate.
