"""Descarga el MDT05 en su rejilla nativa (EPSG:25830, 5 m) por teselas fijas.

uv run --no-project --with pyproj==3.8.0 python tools/mdt-tiles.py

Las teselas miden 500 m y sus bordes caen entre centros nativos, así que el servidor
devuelve las celdas originales sin remuestrear: la misma petición da los mismos bytes y
dos teselas vecinas coinciden donde se tocan. Solo se descargan las que faltan para
cubrir la rejilla del relieve (world.json.bounds redondeado a 10 m) con 20 m de margen.
Los originales quedan en la caché, nunca en Git.
"""

import argparse
import datetime
import hashlib
import json
import math
from pathlib import Path
import time
import urllib.error
import urllib.request

from pyproj import Transformer

SERVICE = "https://servicios.idee.es/wcs-inspire/mdt"
COVERAGE = "Elevacion25830_5"
TILE, STEP, MARGIN = 500, 5, 20

parser = argparse.ArgumentParser()
parser.add_argument("--cache", default=str(Path.home() / ".cache/chiclana-vice/mdt/utm"))
args = parser.parse_args()
cache = Path(args.cache)


def fetch(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=120) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if not 500 <= error.code < 600 or attempt == 3:
                raise
        except (urllib.error.URLError, OSError):
            if attempt == 3:
                raise
        time.sleep(2 ** (attempt + 1))


world = json.loads(Path("web/world.json").read_text())
lon0, lat0 = world["origin"]
sx = 111320 * math.cos(math.radians(lat0))
rectangles = world["bounds"]
box = [math.floor(min(r[0] for r in rectangles) / 10) * 10 - MARGIN,
       math.ceil(max(r[1] for r in rectangles) / 10) * 10 + MARGIN,
       math.floor(min(r[2] for r in rectangles) / 10) * 10 - MARGIN,
       math.ceil(max(r[3] for r in rectangles) / 10) * 10 + MARGIN]
to_utm = Transformer.from_crs(4326, 25830, always_xy=True)
# Borde densificado: en UTM los lados del recuadro local no son rectos.
edge = [(box[0] + (box[1] - box[0]) * t / 50, z) for t in range(51) for z in box[2:]]
edge += [(x, box[2] + (box[3] - box[2]) * t / 50) for t in range(51) for x in box[:2]]
points = [to_utm.transform(lon0 + x / sx, lat0 - z / 111320) for x, z in edge]
columns = range(math.floor(min(p[0] for p in points) / TILE), math.floor(max(p[0] for p in points) / TILE) + 1)
rows = range(math.floor(min(p[1] for p in points) / TILE), math.floor(max(p[1] for p in points) / TILE) + 1)

cache.mkdir(parents=True, exist_ok=True)
index_path = cache / "index.json"
index = json.loads(index_path.read_text()) if index_path.exists() else {}
added = 0
for i in columns:
    for j in rows:
        name = f"{i}_{j}.asc"
        if (cache / name).exists():
            continue
        # Bordes a medio paso de los centros: celdas nativas completas.
        x0, y0 = i * TILE - STEP / 2, j * TILE - STEP / 2
        url = (f"{SERVICE}?service=WCS&version=2.0.1&request=GetCoverage&coverageId={COVERAGE}"
               f"&subset=x({x0},{x0 + TILE})&subset=y({y0},{y0 + TILE})&format=application/asc")
        data = fetch(url)
        if b"ncols        100" not in data or b"cellsize     5.0" not in data:
            raise ValueError(f"Respuesta inesperada para {name}")
        (cache / name).write_bytes(data)
        index[name] = {"url": url, "accessDate": datetime.date.today().isoformat(),
                       "sha256": hashlib.sha256(data).hexdigest()}
        added += 1
        print(f"Descargada {name}", flush=True)
for name, extra in [("capabilities.xml", "GetCapabilities"),
                    ("description.xml", f"DescribeCoverage&coverageId={COVERAGE}")]:
    if not (cache / name).exists():
        (cache / name).write_bytes(fetch(f"{SERVICE}?service=WCS&version=2.0.1&request={extra}"))
index_path.write_text(json.dumps(index, indent=2, sort_keys=True) + "\n")
print(f"{len(columns) * len(rows)} teselas necesarias ({len(columns)} × {len(rows)}); {added} nuevas")
