"""Sample source BSP contents directly to provide independent trace fixtures."""
import hashlib
import json
import math
from pathlib import Path
import random
import re
import struct
import sys


def sample(source, output):
    data = Path(source).read_bytes()
    assert struct.unpack_from('<i', data)[0] == 30
    lumps = [struct.unpack_from('<2i', data, 4 + 8 * i) for i in range(15)]
    def records(lump, fmt):
        offset, length = lumps[lump]
        size = struct.calcsize(fmt)
        return [struct.unpack_from(fmt, data, at) for at in range(offset, offset + length, size)]
    offset, length = lumps[0]
    entities = [dict(re.findall(r'"([^"\n]+)"\s*"([^"\n]*)"', block))
                for block in re.findall(r'\{([^}]+)\}', data[offset:offset + length].decode('latin1'))]
    ids = sorted({0} | {int(e['model'][1:]) for e in entities
                       if e.get('classname') in ['func_wall', 'func_breakable', 'func_door', 'func_door_rotating']
                       and e.get('model', '').startswith('*')})
    models, clips, planes = records(14, '<9f7i'), records(9, '<i2h'), records(1, '<4fi')
    roots = [models[index][12] for index in ids]

    def solid(point):
        x, y, z = (63.5575 - point['x']) * 37.5, (112.4084 - point['z']) * 37.5, (point['y'] - 10.026) * 37.5
        for root in roots:
            node = root
            while node >= 0:
                plane, front, back = clips[node]
                nx, ny, nz, distance, _ = planes[plane]
                node = front if nx * x + ny * y + nz * z >= distance else back
            if node == -2:
                return True
        return False

    def check(origin, direction, limit):
        if solid(origin):
            return None
        def at(distance):
            return {axis: origin[axis] + direction[axis] * distance for axis in ['x', 'y', 'z']}
        previous = 0
        for step in range(1, 513):
            distance = limit * step / 512
            if solid(at(distance)):
                low, high = previous, distance
                for _ in range(32):
                    middle = (low + high) / 2
                    if solid(at(middle)):
                        high = middle
                    else:
                        low = middle
                return high
            previous = distance
        return limit

    rng = random.Random(1603)
    samples = []
    hits = misses = 0
    for _ in range(5000):
        origin = {'x': rng.uniform(20, 120), 'y': rng.choice([8.746, 11.626, 14.1]), 'z': rng.uniform(25, 120)}
        angle = rng.uniform(0, math.tau)
        direction = {'x': math.cos(angle), 'y': 0, 'z': math.sin(angle)}
        limit = rng.choice([0.8, 1.2, 2.4])
        distance = check(origin, direction, limit)
        if distance is None:
            continue
        hit = distance < limit
        if (hit and hits >= 12) or (not hit and misses >= 12):
            continue
        samples.append({'origin': origin, 'direction': direction, 'limit': limit, 'distance': distance})
        hits += int(hit)
        misses += int(not hit)
        if hits == misses == 12:
            break
    assert hits == misses == 12, (hits, misses)
    result = {'sourceSha256': hashlib.sha256(data).hexdigest(), 'hull': 3, 'steps': 512, 'bisections': 32, 'samples': samples}
    Path(output).write_text(json.dumps(result, indent=2) + '\n')
    print(f'Sampled {hits} contacts and {misses} clear segments from original BSP contents.')


if __name__ == '__main__':
    sample(*sys.argv[1:])
