"""Alias non-looping tracks so ECS changes can restart the same animation."""
import json
import struct
from pathlib import Path


def add_repeat_clips(path):
    path = Path(path)
    data = path.read_bytes()
    assert data[:4] == b'glTF'
    length = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20+length])
    animations = gltf.get('animations', [])
    originals = [clip for clip in animations if not clip['name'].endswith('__repeat')]
    gltf['animations'] = originals + [dict(clip, name=clip['name']+'__repeat') for clip in originals
                                    if not clip['name'].split(' ',1)[-1].startswith('idle')]
    chunk = json.dumps(gltf, separators=(',', ':')).encode()
    chunk += b' ' * (-len(chunk) % 4)
    tail = data[20+length:]
    path.write_bytes(struct.pack('<4sIIII', b'glTF', 2, 20+len(chunk)+len(tail), len(chunk), 0x4e4f534a)+chunk+tail)
    return len(gltf['animations'])
