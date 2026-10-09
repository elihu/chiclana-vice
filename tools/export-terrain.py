"""Exportación determinista; el original no se publica.

Con un directorio de teselas nativas (tools/mdt-tiles.py) necesita pyproj fijado:
uv run --no-project --with pyproj==3.8.0 python tools/export-terrain.py DIRECTORIO …
"""
import argparse
import hashlib
import json
import math
import runpy
import struct
from pathlib import Path

source = runpy.run_path(str(Path(__file__).with_name("terrain-source.py")))
parser = argparse.ArgumentParser()
parser.add_argument("original", help="ASCII EPSG:4326 o directorio de teselas nativas EPSG:25830")
parser.add_argument("--audit", default="source-data/terrain-audit.json")
parser.add_argument("--out", default="/tmp/chiclana-terrain-export")
parser.add_argument("--preview", action="store_true", help="Revisión local provisional; no autoriza publicar")
args = parser.parse_args()
tiles = None
if Path(args.original).is_dir():
    from pyproj import Transformer

    mosaic, checksum = source["read_tiles"](args.original)
    tiles = mosaic["tiles"]
    to_utm = Transformer.from_crs(4326, 25830, always_xy=True)

    def elevation(longitude, latitude):
        return source["sample_cells"](mosaic, *to_utm.transform(longitude, latitude))
else:
    header, values, checksum = source["read_ascii"](args.original)

    def elevation(longitude, latitude):
        return source["sample"](header, values, longitude, latitude)
audit = json.loads(Path(args.audit).read_text())
if Path(args.out).resolve() == Path("web").resolve() and not args.preview and audit.get("decision") != "validado para el juego":
    raise ValueError("Auditoría pendiente: generar solo en /tmp, no activar terreno real")
if audit["sourceSha256"] != checksum:
    raise ValueError("Auditoría de otro original")
city = json.loads(Path("web/world.json").read_text())
lon, lat = city["origin"]
rectangles = city["bounds"]
box = [min(r[0] for r in rectangles), max(r[1] for r in rectangles),
       min(r[2] for r in rectangles), max(r[3] for r in rectangles)]
width, height = box[1] - box[0], box[3] - box[2]
sx = 111320 * math.cos(math.radians(lat))
bounds = [math.floor(box[0] / 10) * 10, math.ceil(box[1] / 10) * 10,
          math.floor(box[2] / 10) * 10, math.ceil(box[3] / 10) * 10]
columns, rows = (bounds[1] - bounds[0]) // 10 + 1, (bounds[3] - bounds[2]) // 10 + 1
dx, dz = 10, 10
# sample rechaza coordenadas fuera de los centros del original; no extrapola.
for x in bounds[:2]:
    for z in bounds[2:]:
        elevation(lon + x / sx, lat - z / 111320)
reference = elevation(lon, lat)
quantized = []
for j in range(rows):
    for i in range(columns):
        x, z = bounds[0] + i * dx, bounds[2] + j * dz
        y = elevation(lon + x / sx, lat - z / 111320)
        q = round((y - reference) * 10)
        if not -32768 <= q <= 32767:
            raise ValueError("Altura fuera de Int16: no se satura")
        quantized.append(q)
binary = struct.pack("<" + "h" * len(quantized), *quantized)
manifest = {
    "version": 1, "origin": city["origin"], "size": [width, height],
    "columns": columns, "rows": rows, "step": [dx, dz],
    "bounds": bounds,
    "encoding": "int16-le", "scale": 0.1, "rowOrder": "north-to-south",
    "diagonal": "nw-se", "file": "terrain.bin",
    "sha256": hashlib.sha256(binary).hexdigest(), "referenceElevation": reference,
    "verticalReference": audit["verticalReference"],
    "source": "IGN / PNOA MDT 5 m, " + ("Elevacion25830_5 (rejilla nativa por teselas)" if tiles else "Elevacion4258_5"),
    "license": "CC-BY-4.0 compatible IGN terms",
    "attribution": "Obra derivada del MDT de España (5 m) CC-BY 4.0 IGN / PNOA / SCNE (scne.es)",
    "licenseUrl": "https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf",
    "preview": args.preview,
    "sourceUrls": audit.get("sourceUrls", [audit["sourceUrl"]]), "sourceSha256": checksum,
    "accessDate": audit["accessDate"], "acquisitionDate": audit["acquisitionDate"],
    "method": ("Centros nativos UTM 30N de 5 m (pyproj), " if tiles else "Centros ASCII, ") + "remuestreo bilineal a 10 m exactos, rejilla anclada al origen; referencia en origen; Int16 0,1 m; dibujo y consultas triangulares NW-SE",
    "limits": "Cuantización no implica precisión 0,1 m; referencia vertical sin confirmar",
}
if tiles:
    manifest["sourceTiles"] = tiles
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)
(out / "terrain.bin").write_bytes(binary)
(out / "terrain.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(f"{columns}×{rows}: {len(binary)} bytes; referencia {reference:.3f} m")
