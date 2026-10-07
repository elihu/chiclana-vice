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
            for name in ["terrain.json", "terrain.bin"]:
                self.assertEqual((root / "a" / name).read_bytes(), (root / "b" / name).read_bytes())


if __name__ == "__main__":
    unittest.main()
