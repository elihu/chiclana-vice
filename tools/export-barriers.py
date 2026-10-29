"""Capa de vallas y muros: web/barriers.json (barrier=* de OSM dentro del mundo).

No modifica ninguna otra capa. Uso (ver docs/DATOS.md):
  uv run --no-project --with shapely python tools/export-barriers.py \
    --osm ~/.cache/chiclana-vice/sources/osm-ampliado.xml
"""
import argparse
import json
import math
import xml.etree.ElementTree as E
from pathlib import Path

from shapely.geometry import LineString, Point, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description='Vallas, muros y setos desde OSM (descarga local, nunca a Git).')
parser.add_argument('--osm', required=True, help='XML de OSM descargado en local')
parser.add_argument('--out', default=str(ROOT / 'web/barriers.json'))
args = parser.parse_args()

# Misma transformación que tools/rebuild-map.py: origen de web/world.json, metros locales
# con SX = 111320·cos(lat), SZ = 111320, x hacia el este y z hacia el sur.
world = json.loads((ROOT / 'web/world.json').read_text())
LON, LAT = world['origin']
SX = 111320 * math.cos(math.radians(LAT))
SZ = 111320
bounds = unary_union([box(x0, z0, x1, z1) for x0, x1, z0, z1 in world['bounds']])
KINDS = ['wall', 'fence', 'hedge', 'city_wall', 'retaining_wall']


def proj(lon, lat):
    return ((lon - LON) * SX, (LAT - lat) * SZ)


def rounded(points):
    return [[round(x, 2), round(z, 2)] for x, z in points]


def tags_of(element):
    return {t.attrib['k']: t.attrib['v'] for t in element.findall('tag')}


root = E.parse(args.osm).getroot()
nodes = {n.attrib['id']: proj(float(n.attrib['lon']), float(n.attrib['lat'])) for n in root.findall('node')}

# 1. Vías barrier=* de los tipos conocidos, recortadas al mundo. Un trazo que sale y vuelve a
# entrar da varias partes (sufijo .n). Los contornos cerrados (un seto alrededor de un parque)
# se guardan como línea con el primer punto repetido al final.
lines = []
for way in sorted(root.findall('way'), key=lambda w: int(w.attrib['id'])):
    tags = tags_of(way)
    points = [nodes[n.attrib['ref']] for n in way.findall('nd') if n.attrib['ref'] in nodes]
    if tags.get('barrier') not in KINDS or len(points) < 2:
        continue
    clipped = LineString(points).intersection(bounds)
    if clipped.geom_type == 'LineString':
        parts = [clipped]
    else:
        parts = [g for g in getattr(clipped, 'geoms', []) if g.geom_type == 'LineString']
    parts = [g for g in parts if g.length >= 0.5]
    for part, line in enumerate(parts):
        lines.append({
            'id': way.attrib['id'] + ('' if len(parts) == 1 else '.' + str(part)),
            'kind': tags['barrier'],
            'p': rounded(line.coords),
        })

# 2. Puertas (barrier=gate) dentro del mundo: dejan un hueco en el trazo.
gates = []
for node in sorted(root.findall('node'), key=lambda n: int(n.attrib['id'])):
    if tags_of(node).get('barrier') != 'gate':
        continue
    x, z = nodes[node.attrib['id']]
    if bounds.contains(Point(x, z)):
        gates.append([round(x, 2), round(z, 2)])

layer = {
    'version': 1,
    'origin': [LON, LAT],
    'source': 'OpenStreetMap (barrier=wall, fence, hedge, city_wall, retaining_wall y gate), descarga local 2026',
    'license': 'OpenStreetMap ODbL 1.0; see THIRD_PARTY_NOTICES.md',
    'attribution': '© OpenStreetMap contributors',
    'limits': 'Solo las vallas y muros cartografiados en OSM dentro de los límites del mundo; faltan muchos. OSM no indica altura ni material: el aspecto es una aproximación del juego.',
    'format': {
        'lines': '{id, kind, p}: eje de la valla en metros locales (como buildings.json), recortado al mundo; id = vía de OSM (con sufijo .n si el recorte da varias partes); kind = valor de barrier.',
        'gates': '[x, z] de cada puerta (barrier=gate) dentro del mundo.',
    },
    'lines': lines,
    'gates': gates,
}
Path(args.out).write_text(json.dumps(layer, ensure_ascii=False, separators=(',', ':')) + '\n')
print(json.dumps({
    'lines': len(lines),
    'meters': {k: round(sum(LineString(l['p']).length for l in lines if l['kind'] == k)) for k in KINDS},
    'gates': len(gates),
}, ensure_ascii=False))
