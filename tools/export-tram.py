"""Capa del tranvía: web/tram.json (vías, paradas, andenes y cruces de OSM dentro del mundo).

No modifica ninguna otra capa. Uso (ver docs/DATOS.md):
  uv run --no-project --with shapely python tools/export-tram.py \
    --osm ~/.cache/chiclana-vice/sources/osm-ampliado.xml
"""
import argparse
import json
import math
import xml.etree.ElementTree as E
from pathlib import Path

from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description='Vías, paradas y cruces del tranvía desde OSM (descarga local, nunca a Git).')
parser.add_argument('--osm', required=True, help='XML de OSM descargado en local')
parser.add_argument('--out', default=str(ROOT / 'web/tram.json'))
args = parser.parse_args()

# Misma transformación que tools/rebuild-map.py: origen de web/world.json, metros locales
# con SX = 111320·cos(lat), SZ = 111320, x hacia el este y z hacia el sur.
world = json.loads((ROOT / 'web/world.json').read_text())
LON, LAT = world['origin']
SX = 111320 * math.cos(math.radians(LAT))
SZ = 111320
bounds = unary_union([box(x0, z0, x1, z1) for x0, x1, z0, z1 in world['bounds']])
DEFAULT_GAUGE = 1.435


def proj(lon, lat):
    return ((lon - LON) * SX, (LAT - lat) * SZ)


def rounded(points):
    return [[round(x, 2), round(z, 2)] for x, z in points]


def tags_of(element):
    return {t.attrib['k']: t.attrib['v'] for t in element.findall('tag')}


root = E.parse(args.osm).getroot()
nodes = {n.attrib['id']: proj(float(n.attrib['lon']), float(n.attrib['lat'])) for n in root.findall('node')}

# 1. Vías (railway=tram) recortadas al mundo. Un tramo que sale y vuelve a entrar da varias partes.
tracks = []
platforms = []
for way in sorted(root.findall('way'), key=lambda w: int(w.attrib['id'])):
    tags = tags_of(way)
    points = [nodes[n.attrib['ref']] for n in way.findall('nd') if n.attrib['ref'] in nodes]
    if tags.get('railway') == 'tram' and len(points) >= 2:
        clipped = LineString(points).intersection(bounds)
        parts = [clipped] if clipped.geom_type == 'LineString' else [g for g in getattr(clipped, 'geoms', []) if g.geom_type == 'LineString']
        for part, line in enumerate(g for g in parts if g.length >= 0.5):
            tracks.append({
                'id': way.attrib['id'] + ('' if len(parts) == 1 else '.' + str(part)),
                'bridge': tags.get('bridge') == 'yes',
                'gauge': round(int(tags['gauge']) / 1000, 3) if tags.get('gauge', '').isdigit() else DEFAULT_GAUGE,
                'p': rounded(line.coords),
            })
    elif tags.get('railway') == 'platform' and len(points) >= 4 and points[0] == points[-1]:
        polygon = Polygon(points)
        if bounds.contains(polygon.centroid):
            platforms.append({
                'id': way.attrib['id'],
                'bridge': tags.get('bridge') == 'yes',
                'shelter': tags.get('shelter') == 'yes' or tags.get('covered') == 'yes',
                'p': rounded(points[:-1]),
            })

# 2. Paradas (railway=tram_stop) y cruces dentro del mundo.
stops, crossings = [], []
for node in sorted(root.findall('node'), key=lambda n: int(n.attrib['id'])):
    tags = tags_of(node)
    kind = tags.get('railway')
    if kind not in ('tram_stop', 'tram_level_crossing', 'tram_crossing'):
        continue
    x, z = nodes[node.attrib['id']]
    if not bounds.contains(Point(x, z)):
        continue
    if kind == 'tram_stop':
        owner = min(platforms, key=lambda p: Polygon(p['p']).distance(Point(x, z)), default=None)
        near = owner is not None and Polygon(owner['p']).distance(Point(x, z)) < 40
        stops.append({
            'id': node.attrib['id'],
            'name': tags.get('name', ''),
            'x': round(x, 2),
            'z': round(z, 2),
            'platform': owner['id'] if near else None,
        })
    else:
        crossings.append({
            'id': node.attrib['id'],
            'kind': 'level' if kind == 'tram_level_crossing' else 'pedestrian',
            'x': round(x, 2),
            'z': round(z, 2),
        })

layer = {
    'version': 1,
    'origin': [LON, LAT],
    'source': 'OpenStreetMap (railway=tram, tram_stop, platform, tram_level_crossing, tram_crossing), descarga local 2026',
    'license': 'OpenStreetMap ODbL 1.0; see THIRD_PARTY_NOTICES.md',
    'attribution': '© OpenStreetMap contributors',
    'limits': 'Solo lo que cae dentro de los límites del mundo; el resto de la línea queda fuera del mapa. Trazado de un solo eje por vía (OSM no separa los dos sentidos); aproximación visual, sin tranvía en marcha.',
    'format': {
        'tracks': '{id, bridge, gauge, p}: eje de la vía en metros locales (como buildings.json), recortado al mundo; id = vía de OSM (con sufijo .n si el recorte da varias partes); gauge en metros.',
        'platforms': '{id, bridge, shelter, p}: contorno del andén (polígono sin repetir el primer punto); shelter si OSM indica marquesina o cubierto.',
        'stops': '{id, name, x, z, platform}: parada en el eje de la vía; platform = id del andén más cercano a menos de 40 m, o null.',
        'crossings': '{id, kind, x, z}: kind = level (cruce a nivel con calzada) o pedestrian (paso peatonal sobre la vía).',
    },
    'tracks': tracks,
    'platforms': platforms,
    'stops': stops,
    'crossings': crossings,
}
Path(args.out).write_text(json.dumps(layer, ensure_ascii=False, separators=(',', ':')) + '\n')
meters = sum(LineString(t['p']).length for t in tracks)
print(json.dumps({
    'tracks': len(tracks), 'meters': round(meters, 1), 'bridgeTracks': sum(t['bridge'] for t in tracks),
    'platforms': len(platforms), 'stops': len(stops),
    'crossings': {k: sum(c['kind'] == k for c in crossings) for k in ('level', 'pedestrian')},
}, ensure_ascii=False))
