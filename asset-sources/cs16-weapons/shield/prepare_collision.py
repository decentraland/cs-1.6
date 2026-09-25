"""Prepare shield collision fixtures; this does not export or enable a visible model."""

import argparse
import hashlib
import itertools
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
PLAYERS = ROOT.parents[1] / 'players'
sys.path.insert(0, str(PLAYERS))
from player_model import Model
from player_collision import GAITS, collision_data, gait_bones


def source_corners(model, upper, lower, upper_frame, lower_frame):
    sequences = {sequence['name']: sequence for sequence in reversed(model.sequences)}
    legs = set(gait_bones(model))
    count, offset = model.unpack('2i', 156)
    box = next(model.unpack('2i6f', offset + index * 32) for index in range(count)
               if model.unpack('i', offset + index * 32 + 4)[0] == 8)
    bone, _, *bounds = box
    chain = []
    while bone >= 0:
        sequence, frame = (lower, lower_frame) if bone in legs else (upper, upper_frame)
        chain.append(model.pose(sequences[sequence], frame, bone))
        bone = model.bones[bone]['parent']
    corners = []
    # Independent Euler transforms in source units, not the exported quaternion tracks.
    for corner in itertools.product(*[(bounds[i], bounds[i + 3]) for i in range(3)]):
        x, y, z = corner
        for px, py, pz, rx, ry, rz in chain:
            y, z = y * math.cos(rx) - z * math.sin(rx), y * math.sin(rx) + z * math.cos(rx)
            x, z = x * math.cos(ry) + z * math.sin(ry), -x * math.sin(ry) + z * math.cos(ry)
            x, y = x * math.cos(rz) - y * math.sin(rz), x * math.sin(rz) + y * math.cos(rz)
            x, y, z = x + px, y + py, z + pz
        corners.append([round(value, 9) for value in (-y * .025, z * .025 + .9, x * .025)])
    return corners


def prepare(name):
    manifest = json.loads((PLAYERS / 'sources.json').read_text())
    source = next(item for item in manifest if item['name'] == name)
    model = Model(PLAYERS / (name + '.mdl'))
    assert hashlib.sha256(model.data).hexdigest() == source['sha256']
    assert len(model.data) == source['bytes']
    unique = {}
    for sequence in model.sequences:
        if sequence['name'] in GAITS or 'shield' in sequence['name']:
            unique.setdefault(sequence['name'], sequence)
    model.sequences = list(unique.values())
    cases = []
    for sequence in model.sequences:
        upper = sequence['name']
        if 'shield' not in upper:
            continue
        lower = 'crouch_idle' if upper.startswith('crouch_') else 'idle1'
        for frame in sorted({0, sequence['frames'] // 2, sequence['frames'] - 1}):
            cases.append({'upper': upper, 'lower': lower, 'upperFrame': frame, 'lowerFrame': 0,
                          'corners': source_corners(model, upper, lower, frame, 0)})
    for gait in ('walk', 'run', 'crouchrun', 'jump'):
        for frame in sorted({0, unique[gait]['frames'] // 2, unique[gait]['frames'] - 1}):
            upper = 'crouch_aim_shielded' if gait == 'crouchrun' else 'ref_aim_shielded'
            cases.append({'upper': upper, 'lower': gait, 'upperFrame': 0, 'lowerFrame': frame,
                          'corners': source_corners(model, upper, gait, 0, frame)})
    return {'source': source, 'collision': collision_data(model, include_shield=True), 'cases': cases}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'collision')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if not args.check:
        args.output_dir.mkdir(parents=True, exist_ok=True)
    for name in ('arctic', 'urban'):
        result = prepare(name)
        path = args.output_dir / (name + '.json')
        if args.check:
            assert json.loads(path.read_text()) == result, str(path)
        else:
            path.write_text(json.dumps(result, separators=(',', ':')) + '\n')
        print(name, len(result['collision']['boxes']), 'boxes,', len(result['collision']['poses']),
              'poses,', len(result['cases']), 'source-corner checks')


if __name__ == '__main__':
    main()
