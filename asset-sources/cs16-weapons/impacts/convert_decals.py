from pathlib import Path
import hashlib
import json
import struct
import zlib

ROOT = Path(__file__).resolve().parents[3]
NAMES = [f'{{shot{i}' for i in range(1, 6)]


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))


def convert():
    source = Path(__file__).with_name('decals.wad').read_bytes()
    ident, count, directory = struct.unpack_from('<4sii', source)
    assert ident == b'WAD3' and 0 < count < 4096
    images = {}
    for index in range(count):
        offset, size, _, kind, compression, _, name = struct.unpack_from('<iiiBBH16s', source, directory + index * 32)
        name = name.split(b'\0')[0].decode('ascii')
        if name not in NAMES:
            continue
        assert kind == 67 and compression == 0
        data = source[offset:offset + size]
        _, width, height, *mips = struct.unpack_from('<16s6I', data)
        palette_offset = mips[3] + width * height // 64
        assert struct.unpack_from('<H', data, palette_offset)[0] == 256
        palette = data[palette_offset + 2:palette_offset + 770]
        assert len(palette) == 768 and palette[-3:] != bytes([0, 0, 255])
        pixels = data[mips[0]:mips[0] + width * height]
        assert len(pixels) == width * height
        images[name] = (width, height, palette[-3:], pixels)
    assert set(images) == set(NAMES)
    width, height = sum(images[name][0] + 2 for name in NAMES), max(images[name][1] for name in NAMES) + 2
    rgba = bytearray(width * height * 4)
    frames, left = [], 1
    for name in NAMES:
        w, h, color, pixels = images[name]
        frames.append({'name': name, 'x': left, 'y': 1, 'width': w, 'height': h})
        for y in range(h):
            for x in range(w):
                at = ((y + 1) * width + left + x) * 4
                rgba[at:at + 4] = color + bytes([pixels[y * w + x]])
        left += w + 2
    rows = b''.join(b'\0' + rgba[y * width * 4:(y + 1) * width * 4] for y in range(height))
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>2I5B', width, height, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')
    dest = ROOT / 'assets/ui/bullet-decals.png'
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(png)
    manifest = {'src': 'assets/ui/bullet-decals.png', 'width': width, 'height': height, 'frames': frames,
                'sourceSha256': hashlib.sha256(source).hexdigest(), 'sha256': hashlib.sha256(png).hexdigest()}
    output = ROOT / 'src/bullet-decals.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(manifest, indent=2) + '\n')
    Path(__file__).with_name('atlas.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    convert()
