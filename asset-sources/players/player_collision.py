"""Decode neutral-blend player hitboxes without requiring a Blender process."""

import math

GAITS = {'idle1', 'walk', 'run', 'crouch_idle', 'crouchrun', 'jump'}
DEATHS = {'death1', 'death2', 'death3', 'head', 'gutshot', 'left', 'back', 'right', 'forward', 'crouch_die'}


def gait_bones(model):
    selected = []
    copy = True
    for index, bone in enumerate(model.bones):
        if bone['name'] == 'Bip01 Spine':
            copy = False
        elif bone['parent'] >= 0 and model.bones[bone['parent']]['name'] == 'Bip01 Pelvis':
            copy = True
        if copy:
            selected.append(index)
    return selected


def quaternion(angles):
    sx, sy, sz = [math.sin(value / 2) for value in angles]
    cx, cy, cz = [math.cos(value / 2) for value in angles]
    return [sx * cy * cz - cx * sy * sz, cx * sy * cz + sx * cy * sz,
            cx * cy * sz - sx * sy * cz, cx * cy * cz + sx * sy * sz]


def compact(values):
    values = [[round(value, 7) for value in frame] for frame in values]
    return values[:1] if all(frame == values[0] for frame in values) else values


def collision_data(model, include_shield=False):
    count, offset = model.unpack('2i', 156)
    boxes = []
    for index in range(count):
        bone, group, *bounds = model.unpack('2i6f', offset + index * 32)
        if group not in range(1, 9 if include_shield else 8):
            continue
        boxes.append({'bone': bone, 'group': group,
                      'center': [(bounds[j] + bounds[j + 3]) * .0125 for j in range(3)],
                      'half': [(bounds[j + 3] - bounds[j]) * .0125 for j in range(3)]})
    wanted = {box['bone'] for box in boxes}
    for index in list(wanted):
        while model.bones[index]['parent'] >= 0:
            index = model.bones[index]['parent']
            wanted.add(index)
    lower = set(gait_bones(model))
    poses = {}
    for sequence in model.sequences:
        name = sequence['name']
        if name in DEATHS or name in poses:
            continue
        tracks = {}
        for index in sorted(wanted):
            if (index in lower) != (name in GAITS):
                continue
            frames = [model.pose(sequence, frame, index) for frame in range(sequence['frames'])]
            positions = compact([[value * .025 for value in frame[:3]] for frame in frames])
            rotations = []
            for frame in frames:
                q = quaternion(frame[3:])
                if rotations and sum(a * b for a, b in zip(q, rotations[-1])) < 0:
                    q = [-value for value in q]
                rotations.append(q)
            tracks[str(index)] = {'p': positions, 'q': compact(rotations)}
        poses[name] = {'fps': sequence['fps'], 'frames': sequence['frames'], 'bones': tracks}
    return {'parents': [bone['parent'] for bone in model.bones], 'lower': sorted(lower),
            'boxes': boxes, 'poses': poses}
