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


def read_tiles(directory):
    """Teselas ASCII de la rejilla nativa UTM del MDT05: se unen por celda y, donde se
    solapan, deben coincidir exactamente. Devuelve el mosaico y una huella conjunta."""
    files = sorted(Path(directory).glob("*.asc"))
    if not files:
        raise ValueError("Sin teselas del MDT")
    cells, tiles, step = {}, {}, None
    for path in files:
        header, values, checksum = read_ascii(path)
        size = header.get("cellsize")
        if size is None or "dx" in header or "dy" in header:
            raise ValueError("Tesela sin celda cuadrada")
        step = step or size
        if size != step:
            raise ValueError("Teselas con pasos distintos")
        columns, rows = int(header["ncols"]), int(header["nrows"])
        # Centros: la fila 0 es la norte.
        first_x = (header["xllcorner"] + size / 2) / size
        first_y = (header["yllcorner"] + rows * size - size / 2) / size
        if abs(first_x - round(first_x)) > 1e-6 or abs(first_y - round(first_y)) > 1e-6:
            raise ValueError("Tesela no alineada a la rejilla nativa")
        column0, row0 = round(first_x), round(first_y)
        for j in range(rows):
            for i in range(columns):
                key, value = (column0 + i, row0 - j), values[j * columns + i]
                if cells.setdefault(key, value) != value:
                    raise ValueError("Teselas solapadas con valores distintos")
        tiles[path.name] = checksum
    combined = hashlib.sha256("\n".join(f"{name} {sha}" for name, sha in sorted(tiles.items())).encode()).hexdigest()
    return {"step": step, "cells": cells, "tiles": tiles}, combined


def sample_cells(mosaic, x, y):
    """Bilineal entre los cuatro centros nativos que rodean (x, y); no extrapola."""
    u, v = x / mosaic["step"], y / mosaic["step"]
    i, j = math.floor(u), math.floor(v)
    fu, fv = u - i, v - j
    total = 0
    # Solo se leen las celdas con peso: un punto sobre el borde no exige la vecina.
    for di, wu in [(0, 1 - fu), (1, fu)]:
        for dj, wv in [(0, 1 - fv), (1, fv)]:
            if wu * wv:
                if (i + di, j + dj) not in mosaic["cells"]:
                    raise ValueError("Recorte insuficiente para cubrir el mundo")
                total += mosaic["cells"][i + di, j + dj] * wu * wv
    return total
