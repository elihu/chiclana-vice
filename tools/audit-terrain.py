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
parser.add_argument("original")
parser.add_argument("--date", required=True)
parser.add_argument("--url", required=True)
parser.add_argument("--out", default="source-data/terrain-audit.json")
parser.add_argument("--capabilities", default="/tmp/chiclana-mdt-capabilities.xml")
parser.add_argument("--description", default="/tmp/chiclana-mdt-description.xml")
parser.add_argument("--headers", default="/tmp/chiclana-mdt-headers.txt")
args = parser.parse_args()
header, values, checksum = source["read_ascii"](args.original)
ordered = sorted(values)
columns, rows = int(header["ncols"]), int(header["nrows"])
city = json.loads(Path("web/world.json").read_text())
sx = 111320 * math.cos(math.radians(city["origin"][1]))
dx, dy = header["dx"] * sx, header["dy"] * 111320
slopes = []
for j in range(rows):
    for i in range(columns):
        k = j * columns + i
        if i + 1 < columns:
            slopes.append(abs(values[k + 1] - values[k]) / dx)
        if j + 1 < rows:
            slopes.append(abs(values[k + columns] - values[k]) / dy)
result = {
    "version": 1, "accessDate": args.date, "sourceUrl": args.url,
    "sourceSha256": checksum, "header": header, "samples": len(values),
    "nodata": 0, "range": [min(values), max(values)],
    "percentiles": {str(p): ordered[round((len(ordered) - 1) * p / 100)] for p in [5, 50, 95]},
    "maximumNeighbourSlope": max(slopes), "resolutionMetres": [dx, dy],
    "crs": "EPSG:4326 según DescribeCoverage; orden Lat,Long; ASCII x=longitud",
    "acquisitionDate": "sin confirmar",
    "verticalReference": "sin confirmar para este recorte",
    "metadataWarning": "DescribeCoverage publica unidades W.m-2.Sr-1 impropias del MDT: no utilizarlas como evidencia vertical.",
    "decision": "no activar hasta revisar perfiles transitables y referencia vertical",
}
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
