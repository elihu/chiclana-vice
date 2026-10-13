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


if __name__ == '__main__':
    unittest.main()
