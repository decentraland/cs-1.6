"""Offline source audit; run with python3 -B asset-sources/cs16-weapons/shield/test_collision.py."""

import json
import sys
import unittest

from prepare_collision import ROOT, PLAYERS, prepare
sys.path.insert(0, str(PLAYERS))
from player_model import Model
from player_collision import collision_data

SCENE = ROOT.parents[2]


class ShieldCollision(unittest.TestCase):
    def test_prepared_tracks_and_reference_corners_reproduce_from_pinned_sources(self):
        for name in ('arctic', 'urban'):
            with self.subTest(model=name):
                fixture = json.loads((ROOT / 'collision' / (name + '.json')).read_text())
                self.assertEqual(prepare(name), fixture)

    def test_existing_blender_body_collision_remains_equivalent(self):
        for name in ('arctic', 'urban'):
            with self.subTest(model=name):
                original = json.loads((SCENE / 'src' / ('player-' + name + '.json')).read_text())
                model = Model(PLAYERS / (name + '.mdl'))
                model.sequences = [s for s in model.sequences if s['name'] in original['poses']]
                actual = collision_data(model)
                for key in ('parents', 'lower', 'boxes'):
                    self.assertEqual(actual[key], original[key])
                self.assertEqual(set(actual['poses']), set(original['poses']))
                maximum = 0
                for clip, pose in actual['poses'].items():
                    other = original['poses'][clip]
                    self.assertEqual(pose['fps'], other['fps'])
                    self.assertEqual(pose['frames'], other['frames'])
                    self.assertEqual(set(pose['bones']), set(other['bones']))
                    for bone, track in pose['bones'].items():
                        for channel, values in track.items():
                            previous = other['bones'][bone][channel]
                            for frame in range(pose['frames']):
                                a = values[min(frame, len(values) - 1)]
                                b = previous[min(frame, len(previous) - 1)]
                                error = max(abs(x - y) for x, y in zip(a, b))
                                if channel == 'q':
                                    error = min(error, max(abs(x + y) for x, y in zip(a, b)))
                                maximum = max(maximum, error)
                self.assertLess(maximum, 0.0000003)

    def test_shield_is_an_explicit_export_option(self):
        model = Model(PLAYERS / 'urban.mdl')
        model.sequences = [s for s in model.sequences if s['name'] in ('idle1', 'ref_aim_shielded')]
        standard, shield = collision_data(model), collision_data(model, include_shield=True)
        self.assertEqual(standard['boxes'], [box for box in shield['boxes'] if box['group'] != 8])
        self.assertEqual(standard['poses'], shield['poses'])
        self.assertEqual(len(shield['boxes']), len(standard['boxes']) + 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
