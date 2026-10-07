"""Exportación determinista sin dependencias GIS; el original no se publica."""
import argparse
import hashlib
import json
import math
import runpy
import struct
from pathlib import Path

source = runpy.run_path(str(Path(__file__).with_name("terrain-source.py")))
parser = argparse.ArgumentParser()
parser.add_argument("original")
parser.add_argument("--audit", default="source-data/terrain-audit.json")
parser.add_argument("--out", default="/tmp/chiclana-terrain-export")
parser.add_argument("--preview", action="store_true", help="Revisión local provisional; no autoriza publicar")
args = parser.parse_args()
header, values, checksum = source["read_ascii"](args.original)
audit = json.loads(Path(args.audit).read_text())
if Path(args.out).resolve() == Path("web").resolve() and not args.preview and audit.get("decision") != "validado para el juego":
    raise ValueError("Auditoría pendiente: generar solo en /tmp, no activar terreno real")
if audit["sourceSha256"] != checksum:
    raise ValueError("Auditoría de otro original")
city = json.loads(Path("web/world.json").read_text())
lon, lat = city["origin"]
width, height = city["size"]
sx = 111320 * math.cos(math.radians(lat))
columns, rows = math.ceil(width / 10) + 1, math.ceil(height / 10) + 1
dx, dz = width / (columns - 1), height / (rows - 1)
reference = source["sample"](header, values, lon, lat)
quantized = []
for j in range(rows):
    for i in range(columns):
        x, z = -width / 2 + i * dx, -height / 2 + j * dz
        y = source["sample"](header, values, lon + x / sx, lat - z / 111320)
        q = round((y - reference) * 10)
        if not -32768 <= q <= 32767:
            raise ValueError("Altura fuera de Int16: no se satura")
        quantized.append(q)
binary = struct.pack("<" + "h" * len(quantized), *quantized)
manifest = {
    "version": 1, "origin": city["origin"], "size": city["size"],
    "columns": columns, "rows": rows, "step": [dx, dz],
    "bounds": [-width / 2, width / 2, -height / 2, height / 2],
    "encoding": "int16-le", "scale": 0.1, "rowOrder": "north-to-south",
    "diagonal": "nw-se", "file": "terrain.bin",
    "sha256": hashlib.sha256(binary).hexdigest(), "referenceElevation": reference,
    "verticalReference": audit["verticalReference"],
    "source": "IGN / PNOA MDT 5 m, Elevacion4258_5",
    "license": "CC-BY-4.0 compatible IGN terms",
    "attribution": "Obra derivada del MDT de España (5 m) CC-BY 4.0 IGN / PNOA / SCNE (scne.es)",
    "licenseUrl": "https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf",
    "preview": args.preview,
    "sourceUrls": [audit["sourceUrl"]], "sourceSha256": checksum,
    "accessDate": audit["accessDate"], "acquisitionDate": audit["acquisitionDate"],
    "method": "Centros ASCII, remuestreo bilineal a 10 m efectivos; referencia en origen; Int16 0,1 m; dibujo y consultas triangulares NW-SE",
    "limits": "Cuantización no implica precisión 0,1 m; referencia vertical sin confirmar",
}
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)
(out / "terrain.bin").write_bytes(binary)
(out / "terrain.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(f"{columns}×{rows}: {len(binary)} bytes; referencia {reference:.3f} m")
