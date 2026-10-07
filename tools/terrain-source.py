"""Lectura del ASCII WCS; originales y caché siempre fuera del repositorio."""
import hashlib
import math
import re
from pathlib import Path


def read_ascii(path):
    raw = Path(path).read_bytes()
    start = re.search(rb"(?m)^ncols\s", raw)
    if not start:
        raise ValueError("Respuesta sin rejilla ASCII")
    body = raw[start.start():]
    boundary = re.search(rb"(?m)^--", body)
    if boundary:
        body = body[:boundary.start()]
    lines = body.decode("ascii").splitlines()
    header = {}
    while lines and re.match(r"^[a-zA-Z]", lines[0].strip()):
        key, value = lines.pop(0).split()[:2]
        header[key.lower()] = float(value)
    columns, rows = int(header["ncols"]), int(header["nrows"])
    if columns < 2 or rows < 2 or columns != header["ncols"] or rows != header["nrows"]:
        raise ValueError("Dimensiones ASCII inválidas")
    for key in ["xllcorner", "yllcorner"]:
        if key not in header or not math.isfinite(header[key]):
            raise ValueError("Origen ASCII inválido")
    for value in [header.get("dx", header.get("cellsize")), header.get("dy", header.get("cellsize"))]:
        if value is None or not math.isfinite(value) or value <= 0:
            raise ValueError("Paso ASCII inválido")
    values = []
    for line in lines:
        if line.startswith("--"):
            break
        values.extend(float(v) for v in line.split())
    if len(values) != columns * rows:
        raise ValueError("Tamaño ASCII incorrecto")
    nodata = header.get("nodata_value")
    if any(not math.isfinite(v) or v == nodata or abs(v) > 10000 for v in values):
        raise ValueError("NoData o alturas inválidas: no se rellenan como cero")
    return header, values, hashlib.sha256(raw).hexdigest()


def sample(header, values, longitude, latitude):
    columns, rows = int(header["ncols"]), int(header["nrows"])
    dx = header.get("dx", header.get("cellsize"))
    dy = header.get("dy", header.get("cellsize"))
    x = (longitude - header["xllcorner"]) / dx - 0.5
    z = rows - 0.5 - (latitude - header["yllcorner"]) / dy
    if not (0 <= x <= columns - 1 and 0 <= z <= rows - 1):
        raise ValueError("Recorte insuficiente para cubrir el mundo")
    i, j = min(int(x), columns - 2), min(int(z), rows - 2)
    u, v = x - i, z - j
    a, b = values[j * columns + i:j * columns + i + 2]
    c, d = values[(j + 1) * columns + i:(j + 1) * columns + i + 2]
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
