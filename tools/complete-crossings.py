"""Completa web/street-objects.json con los pasos de peatones (highway=crossing) de OSM que faltan.

El resto de objetos de la capa no se toca: solo se añaden, al final y ordenados por id de OSM,
los nodos highway=crossing dentro del mundo que no están ya en la capa (a menos de 1 m de uno
existente). Es idempotente. Uso (ver docs/DATOS.md):
  uv run --no-project --with shapely python tools/complete-crossings.py \
    --osm ~/.cache/chiclana-vice/sources/osm-ampliado.xml
"""
import argparse
import json
import math
import xml.etree.ElementTree as E
from pathlib import Path

from shapely.geometry import Point, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description='Añade a street-objects.json los pasos de peatones de OSM que faltan.')
parser.add_argument('--osm', required=True, help='XML de OSM descargado en local')
parser.add_argument('--out', default=str(ROOT / 'web/street-objects.json'))
args = parser.parse_args()

# Misma transformación que tools/rebuild-map.py.
world = json.loads((ROOT / 'web/world.json').read_text())
LON, LAT = world['origin']
SX = 111320 * math.cos(math.radians(LAT))
SZ = 111320
bounds = unary_union([box(x0, z0, x1, z1) for x0, x1, z0, z1 in world['bounds']])
# Etiquetas de OSM que ya conserva la capa en los pasos existentes.
KEEP = ('highway', 'crossing', 'crossing:markings', 'button_operated', 'tactile_paving',
        'traffic_signals:sound', 'traffic_signals:vibration', 'railway', 'name')

objects = json.loads(Path(args.out).read_text())
existing = [o for o in objects if o['tags'].get('highway') == 'crossing']
added = []
root = E.parse(args.osm).getroot()
for node in sorted(root.findall('node'), key=lambda n: int(n.attrib['id'])):
    tags = {t.attrib['k']: t.attrib['v'] for t in node.findall('tag')}
    if tags.get('highway') != 'crossing':
        continue
    x = (float(node.attrib['lon']) - LON) * SX
    z = (LAT - float(node.attrib['lat'])) * SZ
    if not bounds.contains(Point(x, z)):
        continue
    if any(math.hypot(x - o['x'], z - o['z']) <= 1 for o in existing):
        continue
    added.append({'x': round(x, 2), 'z': round(z, 2), 'tags': {k: tags[k] for k in sorted(KEEP) if k in tags}})
objects.extend(added)
Path(args.out).write_text(json.dumps(objects, ensure_ascii=False, separators=(',', ':')))
print(f'{len(existing)} pasos existentes, {len(added)} añadidos, {len(existing) + len(added)} en total')
