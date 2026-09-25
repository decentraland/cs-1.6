# Original tactical shield source preparation

These are source assets for the unfinished shield implementation. No shield is
available in the playable scene yet, and no shield GLBs have been exported or
validated in Blender during this step.

`sources.json` records 24 files from the same approved, pinned CS-Server mirror as
the existing arsenal: nine first-person weapon variants, nine held variants,
standalone held/dropped shields, the buy-panel resource/image, and two HUD sprite
definitions. Sources total 4,260,650 bytes. The parent directory is excluded from
scene deployment by `.dclignore`; this preparation adds no runtime download.
The existing [source provenance](../SOURCE.md) applies.

Eight viewmodels have a third bodygroup with two variants: `shield_ref_shieldonly`
and `shield_glass`. Importing both as if they were ordinary mesh parts would make
an undocumented rendering choice. `goldsrc.Model(path, bodygroups={2: 0})` selects
the shell; `{2: 1}` selects the glass variant. The parser still rejects ambiguous
models when no selection is given. `convert_blender.import_weapon` accepts the
same argument and records the selected groups in its output report. The knife
has one bodygroup and needs no selection. Existing single-variant weapon imports
retain their previous behavior.

`model-audit.json` records both alternatives: 28 parsed model/variant records for
20 MDL files, including bones, triangles, source clip names, frame counts and FPS.
All source animation channels decode. First-person shell models range from 910
to 1,219 triangles, held variants from 158 to 218, and the dropped shield is 118.
These are source triangle counts before Blender's degenerate-face handling.

Run the offline source checks from the scene directory:

```sh
python3 -B asset-sources/cs16-weapons/shield/test_source.py
```

The variant-selection test fails with the previous parser, which rejects every
explicit second argument. The tests also verify source bytes/hashes, unchanged
weapon/hand geometry across shield choices, identical rigs/animation channels,
invalid selections and reproducible audit records. They do not establish the
final shield/glass rendering, exported bounds, collision or gameplay behavior.

Before runtime integration, resolve how the original client composites glass,
export and visually inspect through the approved Blender path, check the source
shield hitbox/pose, and implement the [gameplay requirements](../../../../docs/CS16-SHIELD.md).

The [original-client renderer inspection](RENDERING.md) now records the predicted
bodygroup-zero animation path and separates those findings from the still
unverified engine glass rendering. It provides the initial Blender selection
without inventing transparency or importing the right hand and pistol twice.

## Animated collision fixtures

`prepare_collision.py` reads the pinned Arctic/Urban player MDLs from
`../../players`, using the same collision decoder as the Blender exporter. It
explicitly retains shield hitgroup 8 and the original shield animation families.
The generated `collision/*.json` files are test data and are not imported by the
scene. They include independent Euler-transformed corner references.

```sh
python3 -B asset-sources/cs16-weapons/shield/prepare_collision.py --check
python3 -B asset-sources/cs16-weapons/shield/test_collision.py
node --experimental-strip-types --test tests/shield-collision.test.mjs
```

Omit `--check` to regenerate the fixtures, or use `--output-dir /path/to/output`.
These checks exercise partial cover and historical poses; they do not export
GLBs or enable shield gameplay. See [integration status](../../../docs/CS16-SHIELD.md).
