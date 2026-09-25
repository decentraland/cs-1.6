# Shield renderer inspection

The original Linux CS client from the approved source mirror was inspected on
2026-09-22 without executing it. [renderer-source.json](renderer-source.json)
pins the URL, byte count, SHA-256 and symbol ranges. The binary stays outside the
repository and scene assets.

## Established observations

- `CBasePlayerWeapon::SendWeaponAnim` at `0xc0f10` sets the third argument of
  `HUD_SendWeaponAnim` to zero (`xor ecx,ecx` at `0xc0f38`, followed by the
  argument write at `0xc0f3a`). That argument is the viewmodel body selection.
- `HUD_SendWeaponAnim` at `0xf8fc0` forwards it to the engine animation callback.
  This supports explicitly selecting bodygroup 0 for the initial conversion.
- The hardware renderer loops over model body parts and delegates selection and
  drawing to the engine studio API. This inspection does not establish every
  engine rendering pass or the final window appearance.
- In the approved USP shield model, bodygroup 2 variant 0 contains the 394-triangle
  shield/left-hand mesh. Variant 1 replaces that mesh with a two-triangle glass
  plane; the right hand and pistol remain present in both variants. Combining two
  complete imports would duplicate the right hand and pistol.
- `shield_glass.bmp` has texture flags 0 in the eight two-variant viewmodels.
  There is no alpha-mask flag from which to recover a glass opacity.

The initial Blender review should use `{2: 0}` on the eight split viewmodels and
the sole bodygroup on the knife. Inspect the separate glass geometry if needed,
without duplicating shared geometry or assigning an unverified opacity. Final
appearance still needs comparison with the original game; this audit does not
claim the glass variant is never rendered.

## Reproduce

Download the file at the URL in `renderer-source.json` to a temporary directory,
check its SHA-256, then inspect these ranges with LLVM `objdump`:

```sh
shasum -a 256 /path/to/client.so
objdump --syms --demangle /path/to/client.so
objdump --disassemble --demangle --start-address=0xc0f10 --stop-address=0xc0f54 /path/to/client.so
objdump --disassemble --demangle --start-address=0xf8fc0 --stop-address=0xf9000 /path/to/client.so
objdump --disassemble --demangle --start-address=0x11be00 --stop-address=0x11bf59 /path/to/client.so
```

The existing `test_source.py` verifies the pinned models and the distinction
between shell and glass variants. Blender export/reimport, texture appearance,
animation alignment and live shield gameplay remain unverified.
