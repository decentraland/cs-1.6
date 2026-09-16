from pathlib import Path
import json
from convert_sprite import convert

root = Path(__file__).resolve().parents[2]
icons = {}
for line in (root / 'asset-sources/hud/hud.txt').read_text().splitlines():
    parts = line.split()
    if len(parts) == 7 and parts[0].startswith('d_') and parts[1] == '640':
        icons[parts[0][2:]] = {'sprite': parts[2], 'rect': list(map(int, parts[3:]))}
for sprite in sorted({icon['sprite'] for icon in icons.values()}):
    convert(root / 'asset-sources/hud' / (sprite + '.spr'), root / 'assets/ui' / ('death-' + sprite + '.png'))
(root / 'src/death-icons.ts').write_text(
    'export interface DeathIcon { sprite: string; rect: readonly [number, number, number, number] }\n'
    'export const DEATH_ICONS: Record<string, DeathIcon> = ' + json.dumps(icons, indent=2) + '\n'
)
