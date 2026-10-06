"""Pruebas de herramientas sin originales ni dependencias geoespaciales."""
from pathlib import Path
import runpy
import unittest

directed_road = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'tools/osm-direction.py'))['directed_road']


class DirectionTests(unittest.TestCase):
    def test_explicit_and_implied_directions(self):
        points = [(0, 0), (1, 0), (2, 1)]
        for value in ('yes', '1', 'true'):
            self.assertEqual(directed_road(points, {'oneway': value}), (points, True))
        self.assertEqual(directed_road(points, {'oneway': '-1'}), (list(reversed(points)), True))
        self.assertEqual(points[0], (0, 0), 'input is preserved')
        self.assertEqual(directed_road(points, {'junction': 'roundabout'}), (points, True))
        self.assertEqual(directed_road(points, {'highway': 'motorway'}), (points, True))
        for value in ('no', '0', 'false', 'reversible', 'alternating'):
            self.assertEqual(directed_road(points, {'oneway': value, 'junction': 'roundabout'}), (points, False))
        self.assertEqual(directed_road(points, {}), (points, False))


if __name__ == '__main__':
    unittest.main()
