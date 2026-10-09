"""Audita un recorte descargado; no publica originales ni inventa metadatos."""
import argparse
import json
import math
import runpy
import hashlib
import xml.etree.ElementTree as ET
from pathlib import Path

source = runpy.run_path(str(Path(__file__).with_name("terrain-source.py")))
parser = argparse.ArgumentParser()
parser.add_argument("original", nargs="?", help="ASCII EPSG:4326 o directorio de teselas nativas de tools/mdt-tiles.py")
parser.add_argument("--date")
parser.add_argument("--url")
parser.add_argument("--out", default="source-data/terrain-audit.json")
# Registra la decisión sobre una auditoría existente sin rehacerla: conserva su evidencia.
parser.add_argument("--decision", help="Texto de la decisión; con --decision-date y --decision-note")
parser.add_argument("--decision-date")
parser.add_argument("--decision-note")
# Originales en la caché persistente fuera del repositorio (tools/AGENTS.md).
cache = Path.home() / ".cache/chiclana-vice/mdt"
parser.add_argument("--capabilities", default=str(cache / "capabilities.xml"))
parser.add_argument("--description", default=str(cache / "description.xml"))
parser.add_argument("--headers", default=str(cache / "headers.txt"))
args = parser.parse_args()
if args.decision:
    if not args.decision_date or not args.decision_note:
        parser.error("--decision requiere --decision-date y --decision-note")
    result = json.loads(Path(args.out).read_text())
    result["decision"] = args.decision
    result["decisionDate"] = args.decision_date
    result["decisionNote"] = args.decision_note
    Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    raise SystemExit(0)
if not args.original or not args.date or not args.url:
    parser.error("se requieren original, --date y --url")
tiles = None
if Path(args.original).is_dir():
    mosaic, checksum = source["read_tiles"](args.original)
    tiles, cells, step = mosaic["tiles"], mosaic["cells"], mosaic["step"]
    values = list(cells.values())
    header = {"cellsize": step, "tiles": len(tiles), "cells": len(cells)}
    dx = dy = step
    slopes = [abs(cells[i + di, j + dj] - v) / step
              for (i, j), v in cells.items() for di, dj in [(1, 0), (0, 1)] if (i + di, j + dj) in cells]
    crs = "EPSG:25830 (UTM 30N), rejilla nativa de 5 m: centros en múltiplos de 5 m, sin remuestreo"
else:
    header, values, checksum = source["read_ascii"](args.original)
    columns, rows = int(header["ncols"]), int(header["nrows"])
    city = json.loads(Path("web/world.json").read_text())
    sx = 111320 * math.cos(math.radians(city["origin"][1]))
    # El servicio devuelve dx/dy o, con algunos recuadros, una sola cellsize.
    dx = header.get("dx", header.get("cellsize")) * sx
    dy = header.get("dy", header.get("cellsize")) * 111320
    slopes = []
    for j in range(rows):
        for i in range(columns):
            k = j * columns + i
            if i + 1 < columns:
                slopes.append(abs(values[k + 1] - values[k]) / dx)
            if j + 1 < rows:
                slopes.append(abs(values[k + columns] - values[k]) / dy)
    crs = "EPSG:4326 según DescribeCoverage; orden Lat,Long; ASCII x=longitud"
ordered = sorted(values)
result = {
    "version": 1, "accessDate": args.date, "sourceUrl": args.url,
    "sourceSha256": checksum, "header": header, "samples": len(values),
    "nodata": 0, "range": [min(values), max(values)],
    "percentiles": {str(p): ordered[round((len(ordered) - 1) * p / 100)] for p in [5, 50, 95]},
    "maximumNeighbourSlope": max(slopes), "resolutionMetres": [dx, dy],
    "crs": crs,
    "acquisitionDate": "sin confirmar",
    "verticalReference": "sin confirmar para este recorte",
    "metadataWarning": "DescribeCoverage publica unidades W.m-2.Sr-1 impropias del MDT: no utilizarlas como evidencia vertical.",
    "decision": "no activar hasta revisar perfiles transitables y referencia vertical",
}
if tiles:
    result["sourceTiles"] = tiles
    index = json.loads((Path(args.original) / "index.json").read_text())
    result["sourceUrls"] = [index[name]["url"] for name in sorted(tiles)]
evidence = {}
for key, name in [("capabilities", args.capabilities), ("description", args.description)]:
    path = Path(name)
    if path.exists():
        evidence[key + "Sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
if Path(args.description).exists():
    root = ET.parse(args.description).getroot()
    envelope = root.find(".//{http://www.opengis.net/gml/3.2}Envelope")
    unit = root.find(".//{http://www.opengis.net/swe/2.0}uom")
    evidence["envelope"] = envelope.attrib if envelope is not None else None
    evidence["declaredUnit"] = unit.attrib if unit is not None else None
    evidence["offsetVectors"] = [p.text.strip() for p in root.findall(".//{http://www.opengis.net/gml/3.2}offsetVector")]
if Path(args.headers).exists():
    evidence["headers"] = {}
    for line in Path(args.headers).read_text().splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        if key.lower() in {"content-type", "content-length", "last-modified", "etag", "date"}:
            evidence["headers"][key.lower()] = value.strip()
result["serviceEvidence"] = evidence
Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(result, ensure_ascii=False))
