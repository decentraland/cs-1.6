"""Read the embedded PC GoldSrc MDL v10 data used by the stock CS weapons."""

from pathlib import Path
import struct


class Model:
    def __init__(self, path):
        self.path = Path(path)
        self.data = self.path.read_bytes()
        assert self.data[:4] == b'IDST' and self.unpack('i', 4)[0] == 10
        assert self.unpack('i', 72)[0] == len(self.data)
        self.bones = []
        count, offset = self.unpack('2i', 140)
        for i in range(count):
            at = offset + 112 * i
            self.bones.append(dict(name=self.string(at, 32), parent=self.unpack('i', at + 32)[0],
                                   values=self.unpack('6f', at + 64), scales=self.unpack('6f', at + 88)))
        self.textures = []
        count, offset = self.unpack('2i', 180)
        for i in range(count):
            at = offset + 80 * i
            flags, width, height, pixels = self.unpack('4i', at + 64)
            indices = self.data[pixels:pixels + width * height]
            palette = self.data[pixels + width * height:pixels + width * height + 768]
            assert len(indices) == width * height and len(palette) == 768
            self.textures.append(dict(name=self.string(at, 64), flags=flags, width=width, height=height,
                                      indices=indices, palette=palette))
        skin_count, families, skin_offset = self.unpack('3i', 192)
        assert families >= 1
        skins = self.unpack(f'{skin_count}h', skin_offset)
        self.meshes = []
        count, offset = self.unpack('2i', 204)
        for i in range(count):
            at = offset + i * 76
            models, base, model_offset = self.unpack('3i', at + 64)
            assert models == 1, 'Choose bodygroup variants explicitly before adding another model'
            at = model_offset
            mesh_count, mesh_offset, vertex_count, vertex_bones, vertices, normal_count, normal_bones, normals = self.unpack('8i', at + 72)
            points = [self.unpack('3f', vertices + j * 12) for j in range(vertex_count)]
            vectors = [self.unpack('3f', normals + j * 12) for j in range(normal_count)]
            weights = list(self.data[vertex_bones:vertex_bones + vertex_count])
            normal_weights = list(self.data[normal_bones:normal_bones + normal_count])
            faces, materials = [], []
            for j in range(mesh_count):
                triangles, commands, skin = self.unpack('3i', mesh_offset + j * 20)
                first_face = len(faces)
                while True:
                    size = self.unpack('h', commands)[0]
                    commands += 2
                    if size == 0:
                        break
                    strip = [self.unpack('2H2h', commands + k * 8) for k in range(abs(size))]
                    commands += abs(size) * 8
                    for k in range(abs(size) - 2):
                        indices = (0, k + 2, k + 1) if size < 0 else (k, k + 2 - (k % 2), k + 1 + (k % 2))
                        faces.append(tuple(strip[n] for n in indices))
                        materials.append(skins[skin])
                assert len(faces) - first_face == triangles
            self.meshes.append(dict(name=self.string(at, 64), points=points, normals=vectors,
                                    weights=weights, normal_weights=normal_weights, faces=faces, materials=materials))
        self.sequences = []
        count, offset = self.unpack('2i', 164)
        for i in range(count):
            at = offset + i * 176
            fps, flags = self.unpack('fi', at + 32)
            frames = self.unpack('i', at + 56)[0]
            blends, animation = self.unpack('2i', at + 120)
            group = self.unpack('i', at + 156)[0]
            assert group == 0 and blends == 1, 'Only embedded, unblended weapon sequences are supported'
            channels = []
            for bone in range(len(self.bones)):
                address = animation + bone * 12
                channels.append([self.channel(address + delta, frames) if delta else [0] * frames
                                 for delta in self.unpack('6H', address)])
            self.sequences.append(dict(name=self.string(at, 32), fps=fps, frames=frames, flags=flags, channels=channels))

    def unpack(self, fmt, at):
        assert at >= 0
        return struct.unpack_from('<' + fmt, self.data, at)

    def string(self, at, size):
        return self.data[at:at + size].split(b'\0')[0].decode('latin1')

    def channel(self, at, frames):
        values = []
        while len(values) < frames:
            valid, total = self.unpack('2B', at)
            assert 0 < valid <= total
            run = self.unpack(f'{valid}h', at + 2)
            values.extend(run)
            values.extend([run[-1]] * (total - valid))
            at += (valid + 1) * 2
        return values[:frames]

    def pose(self, sequence, frame, bone):
        record = self.bones[bone]
        return [value + scale * channel[frame] for value, scale, channel in
                zip(record['values'], record['scales'], sequence['channels'][bone])]
