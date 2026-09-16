from pathlib import Path
import hashlib
import json
import math
import struct
import zlib

ROOT = Path(__file__).resolve().parents[3]
SOURCE = Path(__file__).with_name('sprites')
OUTPUT = ROOT / 'assets' / 'ui'

def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

def convert(path):
    data = path.read_bytes()
    ident, version, sprite_type, mode, radius, _, _, count, beam, sync = struct.unpack_from('<4siiifiiifi', data)
    assert ident == b'IDSP' and version == 2 and mode in [1, 2]
    colors = struct.unpack_from('<H', data, 40)[0]
    palette = [data[42 + i * 3:45 + i * 3] for i in range(colors)]
    offset = 42 + colors * 3
    frames = []
    for _ in range(count):
        group, x, y, width, height = struct.unpack_from('<5i', data, offset)
        assert group == 0
        pixels = data[offset + 20:offset + 20 + width * height]
        assert len(pixels) == width * height
        frames.append((x, y, width, height, pixels))
        offset += 20 + width * height
    assert offset == len(data)
    columns = math.ceil(math.sqrt(count))
    tile_width = max(f[2] for f in frames) + 2
    tile_height = max(f[3] for f in frames) + 2
    width, height = columns * tile_width, math.ceil(count / columns) * tile_height
    atlas = bytearray(width * height * 4)
    rectangles = []
    for frame, (ox, oy, fw, fh, pixels) in enumerate(frames):
        x, y = (frame % columns) * tile_width + 1, (frame // columns) * tile_height + 1
        rectangles.append({'x': x, 'y': y, 'width': fw, 'height': fh, 'origin': [ox, oy]})
        for row in range(fh):
            for col in range(fw):
                index = pixels[row * fw + col]
                if mode == 2:
                    rgba = (*palette[-1], index)
                else:
                    rgb = palette[index]
                    alpha = max(rgb)
                    rgba = (*(round(channel * 255 / alpha) if alpha else 0 for channel in rgb), alpha)
                at = ((y + row) * width + x + col) * 4
                atlas[at:at + 4] = bytes(rgba)
    rows = b''.join(b'\0' + atlas[y * width * 4:(y + 1) * width * 4] for y in range(height))
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')
    output = OUTPUT / ('grenade-' + path.stem + '.png')
    output.write_bytes(png)
    return {'src': str(output.relative_to(ROOT)), 'width': width, 'height': height, 'frames': rectangles, 'mode': mode, 'sourceSha256': hashlib.sha256(data).hexdigest(), 'sha256': hashlib.sha256(png).hexdigest()}

if __name__ == '__main__':
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = {p.stem: convert(p) for p in sorted(SOURCE.glob('*.spr'))}
    Path(__file__).with_name('sprites.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (ROOT / 'src' / 'grenade-sprites.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('Converted', len(manifest), 'original sprite atlases')
