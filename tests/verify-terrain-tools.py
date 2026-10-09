"""Verifica centros ASCII, NoData y exportación determinista sin GIS."""
import hashlib
import json
import runpy
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = runpy.run_path(str(ROOT / "tools/terrain-source.py"))


class TerrainTools(unittest.TestCase):
    def test_ascii_centres_and_multipart(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "original"
            path.write_text("--wcs\nContent-Type: application/asc\n\nncols 2\nnrows 2\nxllcorner 0\nyllcorner 0\ndx 1\ndy 1\n10 20\n30 40\n--wcs--\n")
            header, values, checksum = source["read_ascii"](path)
            self.assertEqual(source["sample"](header, values, .5, 1.5), 10)
            self.assertEqual(source["sample"](header, values, .5, .5), 30)
            self.assertEqual(source["sample"](header, values, 1, 1), 25)
            self.assertEqual(checksum, hashlib.sha256(path.read_bytes()).hexdigest())
            with self.assertRaises(ValueError):
                source["sample"](header, values, 3, 3)
            path.write_text("ncols 2\nnrows 2\nxllcorner 0\nyllcorner 0\ndx 1\ndy 1\nNODATA_value -9999\n10 20\n30 -9999\n")
            with self.assertRaises(ValueError):
                source["read_ascii"](path)

    def test_native_tiles(self):
        def tile(path, x0, y0, rows):
            path.write_text(f"ncols 2\nnrows {len(rows)}\nxllcorner {x0}\nyllcorner {y0}\ncellsize 5\n"
                            + "".join(" ".join(map(str, r)) + "\n" for r in rows))

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            # Centros x = 0, 5 e y = 5 (fila norte), 0; la segunda tesela solapa la columna x = 5.
            tile(root / "a.asc", -2.5, -2.5, [[10, 20], [30, 40]])
            tile(root / "b.asc", 2.5, -2.5, [[20, 50], [40, 60]])
            mosaic, combined = source["read_tiles"](root)
            self.assertEqual(len(mosaic["cells"]), 6)
            self.assertEqual(source["sample_cells"](mosaic, 0, 5), 10)
            self.assertEqual(source["sample_cells"](mosaic, 2.5, 2.5), 25)
            self.assertEqual(source["sample_cells"](mosaic, 7.5, 0), 50)
            with self.assertRaises(ValueError):
                source["sample_cells"](mosaic, 12, 0)
            self.assertEqual(combined, source["read_tiles"](root)[1])
            tile(root / "b.asc", 2.5, -2.5, [[21, 50], [40, 60]])
            with self.assertRaises(ValueError):
                source["read_tiles"](root)
            tile(root / "b.asc", 3.5, -2.5, [[20, 50], [40, 60]])
            with self.assertRaises(ValueError):
                source["read_tiles"](root)

    def test_export_is_reproducible(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            original = root / "source.asc"
            original.write_text("ncols 4\nnrows 4\nxllcorner -6.18\nyllcorner 36.38\ndx .02\ndy .02\n" + "1 2 3 4\n" * 4)
            _, _, checksum = source["read_ascii"](original)
            audit = root / "audit.json"
            audit.write_text(json.dumps({"sourceSha256": checksum, "verticalReference": "sintética", "sourceUrl": "fixture", "accessDate": "2000-01-01", "acquisitionDate": "sintética"}))
            for name in ["a", "b"]:
                subprocess.run([sys.executable, str(ROOT / "tools/export-terrain.py"), str(original), "--audit", str(audit), "--out", str(root / name)], cwd=ROOT, check=True, capture_output=True)
            manifest = json.loads((root / "a" / "terrain.json").read_text())
            self.assertEqual(manifest["step"], [10, 10])
            bounds = manifest["bounds"]
            self.assertTrue(all(v % 10 == 0 for v in bounds))
            rectangles = json.loads((ROOT / "web/world.json").read_text())["bounds"]
            for x0, x1, z0, z1 in rectangles:
                self.assertLessEqual(bounds[0], x0)
                self.assertGreaterEqual(bounds[1], x1)
                self.assertLessEqual(bounds[2], z0)
                self.assertGreaterEqual(bounds[3], z1)
            for name in ["terrain.json", "terrain.bin"]:
                self.assertEqual((root / "a" / name).read_bytes(), (root / "b" / name).read_bytes())

    def test_export_covers_shifted_rectangles(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "web").mkdir()
            rectangles = [[13, 23, -17, -7], [47, 61, 21, 36]]
            (root / "web/world.json").write_text(json.dumps({"origin": [-6.1485, 36.4195], "bounds": rectangles}))
            original = root / "source.asc"
            original.write_text("ncols 4\nnrows 4\nxllcorner -6.18\nyllcorner 36.38\ndx .02\ndy .02\n" + "1 2 3 4\n" * 4)
            _, _, checksum = source["read_ascii"](original)
            audit = root / "audit.json"
            audit.write_text(json.dumps({"sourceSha256": checksum, "verticalReference": "sintética", "sourceUrl": "fixture", "accessDate": "2000-01-01", "acquisitionDate": "sintética"}))
            subprocess.run([sys.executable, str(ROOT / "tools/export-terrain.py"), str(original), "--audit", str(audit), "--out", str(root / "out")], cwd=root, check=True, capture_output=True)
            manifest = json.loads((root / "out/terrain.json").read_text())
            self.assertEqual(manifest["bounds"], [10, 70, -20, 40])
            self.assertEqual(manifest["size"], [48, 53])
            self.assertEqual([manifest["columns"], manifest["rows"]], [7, 7])


if __name__ == "__main__":
    unittest.main()
