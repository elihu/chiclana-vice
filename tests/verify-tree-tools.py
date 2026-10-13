"""Contratos sintéticos de detección; no validan árboles reales."""
import importlib.util
from pathlib import Path
import unittest

import numpy as np

spec = importlib.util.spec_from_file_location('crowns', Path(__file__).resolve().parents[1] / 'tools/detect-tree-crowns.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CrownsTest(unittest.TestCase):
    def test_coordinates(self):
        index = dict(tile=255, margin=20.5, levels=dict(hi=[1184, .25]))
        self.assertEqual(module.pixel_to_game(0, 0, 0, 0, index), (-20.375, -20.375))
        self.assertEqual(module.pixel_to_game(-1, 2, 82, 82, index), (-254.875, 510.125))

    def test_exclusion_and_small_crown(self):
        rgb = np.full((70, 70, 3), 100., dtype=float)
        yy, xx = np.indices((70, 70))
        mask = (xx - 20)**2 + (yy - 20)**2 <= 6**2
        rgb[mask] = [60, 120, 60]
        blocked = np.zeros((70, 70), dtype=bool)
        found = module.crowns(rgb, blocked, .25)
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0][:2], (20, 20))
        blocked[mask] = True
        self.assertEqual(module.crowns(rgb, blocked, .25), [])
        rgb[mask] = [10, 30, 10]
        self.assertEqual(module.crowns(rgb, ~blocked, .25), [])

    def test_separation(self):
        rgb = np.full((90, 90, 3), 100., dtype=float)
        yy, xx = np.indices((90, 90))
        mask = ((xx - 30)**2 + (yy - 40)**2 < 12**2) | ((xx - 48)**2 + (yy - 40)**2 < 12**2)
        rgb[mask] = [60, 120, 60]
        found = module.crowns(rgb, np.zeros(mask.shape, dtype=bool), .25)
        self.assertEqual(len(found), 2)
        self.assertGreaterEqual(np.hypot(found[0][0] - found[1][0], found[0][1] - found[1][1]) * .25, 3)


    def fixture(self, radius=8):
        yy, xx = np.indices((90, 90))
        part = (xx - 40)**2 + (yy - 40)**2 <= radius**2
        rgb = np.full((90, 90, 3), 160., dtype=float)
        variation = ((xx + yy) % 2) * 40
        rgb[part] = np.column_stack((60 + variation[part], 100 + variation[part], 60 + variation[part]))
        rgb[35:46, 49:59] = 30
        return rgb, part

    def test_textured_crown_with_directional_shadow(self):
        rgb, part = self.fixture()
        reason, metrics = module.filter_crown(rgb, part, 40, 40, .25, (1, 0))
        self.assertIsNone(reason)
        self.assertGreater(metrics['texture'], 5)
        self.assertGreaterEqual(metrics['shadow'], metrics['area'] * .08)

    def test_filters_in_segmentation(self):
        rgb, part = self.fixture()
        blocked = np.zeros(part.shape, dtype=bool)
        self.assertTrue(module.crowns(rgb, blocked, .25, direction=(1, 0)))
        self.assertEqual(module.crowns(rgb, blocked, .25, direction=(-1, 0)), [])

    def test_smooth_large_surface_and_split(self):
        for radius in (8, 25):
            rgb, part = self.fixture(radius)
            rgb[part] = [60, 120, 60]
            self.assertEqual(module.filter_crown(rgb, part, 40, 40, .25, (1, 0))[0], 'textura')

    def test_small_shrub(self):
        rgb, part = self.fixture(5)
        self.assertEqual(module.filter_crown(rgb, part, 40, 40, .25, (1, 0))[0], 'área')

    def test_shadow_wrong_side_absent_or_building(self):
        rgb, part = self.fixture()
        self.assertEqual(module.filter_crown(rgb, part, 40, 40, .25, (-1, 0))[0], 'sombra')
        buildings = np.zeros(part.shape, dtype=bool)
        buildings[35:46, 49:59] = True
        self.assertEqual(module.filter_crown(rgb, part, 40, 40, .25, (1, 0), buildings)[0], 'sombra')
        rgb[35:46, 49:59] = 160
        self.assertEqual(module.filter_crown(rgb, part, 40, 40, .25, (1, 0))[0], 'sombra')

    def test_disconnected_dark_pixels_are_not_shadow(self):
        rgb, part = self.fixture()
        rgb[35:46, 49:59] = 160
        rgb[35:46:2, 49:59:2] = 30
        self.assertEqual(module.filter_crown(rgb, part, 40, 40, .25, (1, 0))[0], 'sombra')

    def test_shadow_estimation_from_building(self):
        rgb = np.full((60, 60, 3), 180.)
        buildings = np.zeros((60, 60), dtype=bool)
        buildings[20:40, 20:40] = True
        rgb[20:40, 40:48] = 30
        scores = module.shadow_scores(rgb, buildings, 1)
        fractions = scores[:, 0] / np.maximum(scores[:, 1], 1)
        self.assertEqual(int(np.argmax(fractions)) * 15, 0)


if __name__ == '__main__':
    unittest.main()
