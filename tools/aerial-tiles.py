"""Genera teselas PNOA; verifica fechas y alineación antes de publicar datos.

uv run --no-project --with pillow python tools/aerial-tiles.py
"""

import concurrent.futures
import datetime
import hashlib
import http.client
import io
import json
import math
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parent.parent
SOURCE = "https://www.ign.es/wms-inspire/pnoa-ma"
CACHE = Path.home() / ".cache/chiclana-vice/pnoa"
LAT, LON = 36.4195, -6.1485
SX, SZ = 111320 * math.cos(math.radians(LAT)), 111320
TILE, MARGIN = 255, 20.5


def request(box, width, height, feature=False):
    x0, x1, z0, z1 = box
    params = dict(SERVICE="WMS", VERSION="1.1.1",
                  REQUEST="GetFeatureInfo" if feature else "GetMap",
                  LAYERS="OI.MosaicElement" if feature else "OI.OrthoimageCoverage",
                  STYLES="", SRS="EPSG:4326", FORMAT="image/jpeg",
                  BBOX=",".join(map(str, (LON + x0 / SX, LAT - z1 / SZ,
                                         LON + x1 / SX, LAT - z0 / SZ))),
                  WIDTH=width, HEIGHT=height)
    if feature:
        params.update(QUERY_LAYERS="OI.MosaicElement", X=width // 2,
                      Y=height // 2, INFO_FORMAT="text/html", FEATURE_COUNT=10)
    url = SOURCE + "?" + urllib.parse.urlencode(params)
    key = hashlib.sha256(url.encode()).hexdigest()
    target = CACHE / (key + (".html" if feature else ".jpg"))
    if not target.exists():
        for attempt in range(4):
            try:
                with urllib.request.urlopen(url, timeout=45) as response:
                    data = response.read()
                break
            except urllib.error.HTTPError as error:
                if not 500 <= error.code < 600 or attempt == 3:
                    raise
            except (urllib.error.URLError, OSError, http.client.HTTPException):
                if attempt == 3:
                    raise
            delay = 2 ** (attempt + 1)
            print(f"Reintento {attempt + 1}/3 en {delay} s: {url}", flush=True)
            time.sleep(delay)
        if not feature:
            with Image.open(io.BytesIO(data)) as image:
                if image.format != "JPEG" or image.size != (width, height):
                    raise ValueError(f"Respuesta WMS incompatible: {url}")
        target.write_bytes(data)
    return target.read_bytes()


def tile_box(tile):
    i, j = tile
    return [TILE * i - MARGIN, TILE * (i + 1) + MARGIN,
            TILE * j - MARGIN, TILE * (j + 1) + MARGIN]


def correlation(a, b):
    # Correlación normalizada de luminancia, sin depender de NumPy.
    ma, mb = ImageStat.Stat(a).mean[0], ImageStat.Stat(b).mean[0]
    va, vb = ImageStat.Stat(a).var[0], ImageStat.Stat(b).var[0]
    mse = ImageStat.Stat(ImageChops.difference(a, b)).sum2[0] / (a.width * a.height)
    return (va + vb + (ma - mb) ** 2 - mse) / (2 * math.sqrt(va * vb))


def strip_alignment(first, second, east):
    # Franja común de dos teselas vecinas: los 2·MARGIN finales de la primera son los
    # iniciales de la segunda (164 píxeles a 0,25 m). Se busca el máximo de
    # correlación en ±2 píxeles y el pico subpíxel por parábolas en cada eje.
    width = round(2 * MARGIN / 0.25)
    with Image.open(io.BytesIO(first)) as a, Image.open(io.BytesIO(second)) as b:
        size = a.width
        a, b = a.convert("L"), b.convert("L")
        if east:
            a = a.crop((size - width, 0, size, size))
            b = b.crop((0, 0, width, size))
        else:
            a = a.crop((0, size - width, size, size))
            b = b.crop((0, 0, size, width))
        w, h = a.size
        inner = a.crop((2, 2, w - 2, h - 2))
        scores = {(dx, dy): correlation(inner, b.crop((2 + dx, 2 + dy, w - 2 + dx, h - 2 + dy)))
                  for dx in range(-2, 3) for dy in range(-2, 3)}
        difference = ImageStat.Stat(ImageChops.difference(inner, b.crop((2, 2, w - 2, h - 2)))).mean[0]
    dx, dy = max(scores, key=scores.get)
    if abs(dx) == 2 or abs(dy) == 2:
        raise ValueError("Pico de correlación fuera del intervalo")

    def peak(axis):
        before = scores[dx - 1, dy] if axis == 0 else scores[dx, dy - 1]
        after = scores[dx + 1, dy] if axis == 0 else scores[dx, dy + 1]
        centre = scores[dx, dy]
        return 0.5 * (before - after) / (before - 2 * centre + after)

    shift = [dx + peak(0), dy + peak(1)]
    result = dict(shift=[round(v, 6) for v in shift], correlation=round(scores[dx, dy], 6),
                  meanAbsoluteDifference=round(difference, 6))
    if math.hypot(*shift) >= 0.25 or difference > 20:
        raise ValueError(f"Alineación incompatible: {result}")
    return result


def main():
    world = json.loads((ROOT / "web/world.json").read_text())
    bounds = world["bounds"]
    general_box = [min(b[0] for b in bounds), max(b[1] for b in bounds),
                   min(b[2] for b in bounds), max(b[3] for b in bounds)]
    tiles = sorted({(i, j) for x0, x1, z0, z1 in bounds
                    for i in range(math.floor(x0 / TILE), math.ceil(x1 / TILE))
                    for j in range(math.floor(z0 / TILE), math.ceil(z1 / TILE))})
    CACHE.mkdir(parents=True, exist_ok=True)
    dates = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        responses = pool.map(lambda t: request(tile_box(t), 1184, 1184, True), tiles)
        for tile, data in zip(tiles, responses):
            found = re.findall(r"\b\d{4}-\d{2}\b", data.decode())
            dates[f"{tile[0]}_{tile[1]}"] = found
            print(f"Fecha {tile}: {found}", flush=True)
            if found != ["2022-07"]:
                raise ValueError(f"Fecha incompatible en {tile}: {found}; se detiene sin publicar")
    images = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        responses = pool.map(lambda t: request(tile_box(t), 1184, 1184), tiles)
        for tile, data in zip(tiles, responses):
            name = f"{tile[0]}_{tile[1]}"
            images[f"hi/{name}.jpg"] = data
            with Image.open(io.BytesIO(data)) as hi:
                output = io.BytesIO()
                hi.convert("RGB").resize((592, 592), Image.Resampling.LANCZOS).save(
                    output, "JPEG", quality=82, optimize=True)
                images[f"lo/{name}.jpg"] = output.getvalue()
    # Alineación entre vecinas: no depende de otra ortofoto y vale para los anexos.
    report = dict(dates=dates, neighbours={})
    for i, j in tiles:
        for east, (ni, nj) in [(True, (i + 1, j)), (False, (i, j + 1))]:
            if (ni, nj) not in tiles:
                continue
            pair = f"{i}_{j}|{ni}_{nj}"
            try:
                result = strip_alignment(images[f"hi/{i}_{j}.jpg"], images[f"hi/{ni}_{nj}.jpg"], east)
            except ValueError as error:
                raise ValueError(f"{pair}: {error}") from None
            report["neighbours"][pair] = result
            print(f"Alineación {pair}: {result}", flush=True)
    width, height = general_box[1] - general_box[0], general_box[3] - general_box[2]
    scale = max(1, width / 2048, height / 2048)
    size = [math.ceil(width / scale), math.ceil(height / scale)]
    images["general.jpg"] = request(general_box, *size)
    index = dict(version=1, tile=TILE, margin=MARGIN,
                 levels=dict(hi=[1184, 0.25], lo=[592, 0.5]), tiles=tiles,
                 general=dict(file="general.jpg", box=general_box, size=size),
                 acquisition="2022-07", consulted=datetime.date.today().isoformat(),
                 source=SOURCE,
                 sha256={name: hashlib.sha256(data).hexdigest() for name, data in images.items()})
    target = ROOT / "web/aerial"
    for name, data in images.items():
        path = target / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    (target / "index.json").write_text(json.dumps(index, indent=2) + "\n")
    Path("/tmp/chiclana-aerial-alignment.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
