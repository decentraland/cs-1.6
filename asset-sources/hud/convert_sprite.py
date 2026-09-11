import argparse, struct, zlib
from pathlib import Path


def convert(source, target, colored=False):
    data = source.read_bytes()
    ident, version, _, mode, _, _, _, frames, _, _ = struct.unpack_from('<4siiifiiifi', data)
    if ident != b'IDSP' or version != 2 or mode != 1 or frames != 1:
        raise ValueError('Expected one additive GoldSrc v2 sprite frame')
    count = struct.unpack_from('<H', data, 40)[0]
    palette = [tuple(data[42+i*3:45+i*3]) for i in range(count)]
    if not colored and any(r != g or g != b for r,g,b in palette):
        raise ValueError('Expected a monochrome HUD sprite')
    offset = 42 + count * 3
    group, _, _, width, height = struct.unpack_from('<iiiii', data, offset)
    pixels = data[offset+20:]
    if group != 0 or len(pixels) != width * height:
        raise ValueError('Invalid sprite frame size')
    def additive_pixel(color):
        intensity = max(color)
        return (*[round(channel * 255 / intensity) if intensity else 0 for channel in color], intensity)
    rgba = bytes(channel for index in pixels for channel in additive_pixel(palette[index]))
    rows = b''.join(b'\0' + rgba[y*width*4:(y+1)*width*4] for y in range(height))
    def chunk(kind, payload):
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind+payload))
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB',width,height,8,6,0,0,0))
    png += chunk(b'IDAT', zlib.compress(rows,9)) + chunk(b'IEND', b'')
    target.write_bytes(png)
    print(source.name, width, height, '->', target.name, len(png), 'bytes')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('target', type=Path)
    parser.add_argument('--colored', action='store_true')
    args = parser.parse_args()
    convert(args.source,args.target,args.colored)
