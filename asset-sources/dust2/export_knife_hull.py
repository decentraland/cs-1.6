"""Extract Dust2's original head hull in the rendered map's coordinate space."""
import hashlib
import json
from pathlib import Path
import re
import struct
import sys


def export(source, output):
    data = Path(source).read_bytes()
    assert struct.unpack_from('<i', data)[0] == 30
    lumps = [struct.unpack_from('<2i', data, 4 + 8 * i) for i in range(15)]

    def records(lump, fmt):
        offset, length = lumps[lump]
        size = struct.calcsize(fmt)
        assert length % size == 0
        return [struct.unpack_from(fmt, data, at) for at in range(offset, offset + length, size)]

    offset, length = lumps[0]
    entities = [dict(re.findall(r'"([^"\n]+)"\s*"([^"\n]*)"', block))
                for block in re.findall(r'\{([^}]+)\}', data[offset:offset + length].decode('latin1'))]
    model_ids = sorted({0} | {int(e['model'][1:]) for e in entities
                             if e.get('classname') in ['func_wall', 'func_breakable', 'func_door', 'func_door_rotating']
                             and e.get('model', '').startswith('*')})
    models = records(14, '<9f7i')
    clips = records(9, '<i2h')
    roots = [models[index][12] for index in model_ids]
    used = set()
    pending = list(roots)
    while pending:
        index = pending.pop()
        if index < 0 or index in used:
            continue
        assert index < len(clips)
        used.add(index)
        pending.extend(clips[index][1:])
    indices = sorted(used)
    node_ids = {original: index for index, original in enumerate(indices)}
    plane_indices = sorted({clips[index][0] for index in indices})
    plane_ids = {original: index for index, original in enumerate(plane_indices)}
    raw_planes = records(1, '<4fi')
    planes = []
    for index in plane_indices:
        x, y, z, distance, _ = raw_planes[index]
        normal = [-x, z, -y]
        planes.append([*normal, round(distance * 2 / 75 + normal[0] * 63.5575
                                      + normal[1] * 10.026 + normal[2] * 112.4084, 8)])
    def child(index):
        return node_ids[index] if index >= 0 else -2 if index == -2 else -1
    result = {
        'sourceSha256': hashlib.sha256(data).hexdigest(),
        'planes': planes,
        'nodes': [[plane_ids[clips[index][0]], child(clips[index][1]), child(clips[index][2])]
                  for index in indices],
        'roots': [child(root) for root in roots],
        'vertices': [],
        'surfaces': []
    }
    text = "import type { SolidMap } from './solid-trace'\nexport const DUST2_KNIFE_HULL: SolidMap = "
    text += json.dumps(result, separators=(',', ':')) + '\n'
    Path(output).write_text(text)
    print(json.dumps({'hull': 3, 'models': model_ids, 'planes': len(planes), 'nodes': len(indices),
                      'sourceSha256': result['sourceSha256'], 'generatedSha256': hashlib.sha256(text.encode()).hexdigest()}))


if __name__ == '__main__':
    export(*sys.argv[1:])
