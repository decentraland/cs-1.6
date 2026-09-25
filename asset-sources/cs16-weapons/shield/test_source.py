"""Source-data checks; run with python3 -B asset-sources/cs16-weapons/shield/test_source.py."""

from pathlib import Path
import hashlib
import json
import sys
import unittest

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
from goldsrc import Model


class ShieldSources(unittest.TestCase):
    def test_pinned_source_files(self):
        manifest = json.loads((ROOT / 'sources.json').read_text())
        self.assertEqual(len(manifest), 24)
        for item in manifest:
            relative = item['path'].removeprefix('server/cstrike/')
            self.assertEqual(item['source'], 'https://raw.githubusercontent.com/u3games/CS-Server/'
                             '6ad155c7a610a85cfd443fcace2c97f2afcb2866/' + item['path'])
            data = (ROOT / 'source' / relative).read_bytes()
            self.assertEqual(len(data), item['bytes'], relative)
            self.assertEqual(hashlib.sha256(data).hexdigest(), item['sha256'], relative)

    def test_alternate_geometry_requires_an_explicit_choice(self):
        for path in (ROOT / 'source/models/shield').glob('v_*.mdl'):
            if path.stem == 'v_shield_knife':
                continue
            with self.subTest(model=path.name), self.assertRaisesRegex(AssertionError, 'explicitly'):
                Model(path)

    def test_shell_and_glass_select_different_geometry_but_keep_the_same_animation(self):
        for path in (ROOT / 'source/models/shield').glob('v_*.mdl'):
            if path.stem == 'v_shield_knife':
                continue
            with self.subTest(model=path.name):
                shell, glass = Model(path, {2: 0}), Model(path, {2: 1})
                self.assertEqual(shell.meshes[-1]['name'], 'shield_ref_shieldonly')
                self.assertEqual(glass.meshes[-1]['name'], 'shield_glass')
                self.assertNotEqual(shell.meshes[-1]['faces'], glass.meshes[-1]['faces'])
                self.assertEqual(shell.meshes[:-1], glass.meshes[:-1])
                self.assertEqual(shell.bones, glass.bones)
                self.assertEqual(shell.sequences, glass.sequences)
                self.assertEqual(shell.textures, glass.textures)

    def test_invalid_variant_choices_are_rejected(self):
        path = ROOT / 'source/models/shield/v_shield_usp.mdl'
        for choice in ({2: -1}, {2: 2}, {2: True}, {2: 0, 3: 0}, {-1: 0}, {'2': 0}):
            with self.subTest(choice=choice), self.assertRaises(AssertionError):
                Model(path, choice)

    def test_all_model_reports_reproduce(self):
        reports = json.loads((ROOT / 'model-audit.json').read_text())
        self.assertEqual(len(reports), 28)
        self.assertEqual(len({item['path'] for item in reports}), 20)
        for report in reports:
            with self.subTest(model=report['path'], groups=report['bodygroups']):
                choices = {group['index']: group['selected'] for group in report['bodygroups']}
                model = Model(ROOT / 'source' / report['path'], choices)
                self.assertEqual(model.bodygroups, report['bodygroups'])
                self.assertEqual(len(model.bones), report['bones'])
                self.assertEqual(len(model.textures), report['textures'])
                self.assertEqual(sum(len(mesh['faces']) for mesh in model.meshes), report['triangles'])
                self.assertEqual([dict(name=s['name'], frames=s['frames'], fps=s['fps'])
                                  for s in model.sequences], report['sequences'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
