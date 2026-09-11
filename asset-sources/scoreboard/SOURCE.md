# Classic CS 1.6 scoreboard

Layout and colors use the original resources from the same pinned game mirror
as the HUD sprites:

- [ScoreBoard.res](https://github.com/u3games/CS-Server/blob/6ad155c7a610a85cfd443fcace2c97f2afcb2866/server/cstrike/resource/UI/ScoreBoard.res): 520×340 proportional panel, y=48, 13-unit player rows.
- [ClientScheme.res](https://github.com/u3games/CS-Server/blob/6ad155c7a610a85cfd443fcace2c97f2afcb2866/server/cstrike/resource/ClientScheme.res): Verdana sizes 12/13/14/20/24, amber text, red/blue teams, half-transparent black list, subtle local-row highlight.
- [Visual comparison](https://www.gamingcfg.com/config/config-by-Fermondo-fps-100-no-lag): classic Score/Deaths/Latency columns, player counts, team rules, and right-aligned scores. This server configuration screenshot is a visual reference, not proof that every dimension is stock.
- [Client behavior](https://github.com/Velaron/cs16-client/blob/2d125db28d2c043fd0730c9970066d845574dbb0/cl_dll/hud/scoreboard.cpp): hold-to-show behavior, dead/bomb status, BOT latency label, team counts and score sorting. Its custom legacy draw geometry is not used as a VGUI2 layout source.

The bitmap atlas was rasterized from locally installed Verdana Bold. No TTF is
bundled. It uses the scheme's five resolution tiers plus the 10px fallback and 18px menu-title sizes; small sizes use monochrome alpha,
larger sizes use antialiasing. SDK text only supports generic font families, so
the atlas supplies Verdana shapes. Unsupported characters use native SDK text.
Pillow/FreeType rasterization is not byte-identical to Windows GDI. The panel uses SDK rounded borders; measured human latency and pixel-level
GDI comparison remain fidelity work. This is not a claim of pixel-perfect
reproduction.

Rebuild with an installed Verdana Bold font:

```sh
uv run --with pillow --with fonttools python asset-sources/scoreboard/generate_font.py /path/to/Verdana-Bold.ttf assets/ui/score-font.png src/score-font.json
```

The .res files are original game resources with provenance from the mirror.
The atlas is rendered font output; no project-code license is asserted for the
font itself. Keep provenance distinct from code licensing.

## SHA-256

- `ScoreBoard.res`: `a575140c51a8df820939f59a648d79c984645cec1f8a6d4f563237000175bc7d`
- `ClientScheme.res`: `17b49707872d473493e35702e09b9077f1fe77cfd3192f47fe606476c46a966b`
- `score-font.png`: `f9a4e19b9fd647a395e1635afb034a623cec1fbaa8d024ee5e5ea3d6daec59c6`
- `score-font.json`: `8375e549370d35f1fc66cacfc2106836e58a40039242f2e3a50a83feff511f33`
