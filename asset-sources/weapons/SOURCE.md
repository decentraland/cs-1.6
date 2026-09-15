# Weapon sound sources

Every file in `assets/sounds/weapons/` is generated locally by `generate_sounds.py`
(standard library only, deterministic). They are placeholders shaped like the
original cues (rifle vs pistol report, magazine clicks, knife whoosh and hit) and
use no Counter-Strike or third-party audio. Regenerate with:

```sh
python3 asset-sources/weapons/generate_sounds.py
```
