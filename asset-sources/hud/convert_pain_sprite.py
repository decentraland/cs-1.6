import struct
import zlib
from pathlib import Path


SOURCE = Path(__file__).with_name("640_pain.spr")
TARGET = Path(__file__).parents[2] / "assets" / "ui" / "pain.png"
ATLAS_WIDTH = 352
ATLAS_HEIGHT = 128


def png_chunk(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload))


def main() -> None:
    data = SOURCE.read_bytes()
    ident, version, _, mode, _, _, _, frame_count, _, _ = struct.unpack_from("<4siiifiiifi", data)
    if ident != b"IDSP" or version != 2 or mode != 1 or frame_count != 4:
        raise ValueError("Expected the four-frame additive GoldSrc pain sprite")
    color_count = struct.unpack_from("<H", data, 40)[0]
    palette = [tuple(data[42 + index * 3:45 + index * 3]) for index in range(color_count)]
    offset = 42 + color_count * 3
    atlas = bytearray(ATLAS_WIDTH * ATLAS_HEIGHT * 4)
    atlas_x = 0
    for _ in range(frame_count):
        group, _, _, width, height = struct.unpack_from("<iiiii", data, offset)
        pixels = data[offset + 20:offset + 20 + width * height]
        if group != 0 or len(pixels) != width * height:
            raise ValueError("Invalid single sprite frame")
        for y in range(height):
            for x in range(width):
                color = palette[pixels[y * width + x]]
                intensity = max(color)
                target = ((y * ATLAS_WIDTH) + atlas_x + x) * 4
                atlas[target:target + 4] = bytes((255, 255, 255, intensity))
        atlas_x += width
        offset += 20 + width * height
    if atlas_x != ATLAS_WIDTH or offset != len(data):
        raise ValueError("Unexpected pain sprite dimensions")
    rows = b"".join(b"\0" + atlas[y * ATLAS_WIDTH * 4:(y + 1) * ATLAS_WIDTH * 4] for y in range(ATLAS_HEIGHT))
    png = b"\x89PNG\r\n\x1a\n"
    png += png_chunk(b"IHDR", struct.pack(">IIBBBBB", ATLAS_WIDTH, ATLAS_HEIGHT, 8, 6, 0, 0, 0))
    png += png_chunk(b"IDAT", zlib.compress(rows, 9)) + png_chunk(b"IEND", b"")
    TARGET.write_bytes(png)
    print(f"{SOURCE.name} -> {TARGET.name} ({ATLAS_WIDTH}x{ATLAS_HEIGHT})")


if __name__ == "__main__":
    main()
