"""Capa de usos de los bajos: web/ground-floors.json (Catastro INSPIRE BU + OSM).

No modifica buildings.json. Uso (ver docs/DATOS.md):
  uv run --no-project --with pyproj --with shapely python tools/export-ground-floors.py \
    --catastro ~/.cache/chiclana-vice/sources/catastro-chiclana.zip \
    --osm ~/.cache/chiclana-vice/sources/osm-ampliado.xml
"""
import argparse
import hashlib
import json
import math
import xml.etree.ElementTree as E
import zipfile
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import Point, Polygon, box
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description='Usos de los bajos desde Catastro y OSM (originales locales, nunca a Git).')
parser.add_argument('--catastro', required=True, help='ZIP original de Catastro, fuera del repositorio')
parser.add_argument('--osm', required=True, help='XML de OSM descargado en local')
parser.add_argument('--out', default=str(ROOT / 'web/ground-floors.json'))
args = parser.parse_args()

# Misma transformación que tools/rebuild-map.py: origen de web/world.json, metros locales
# con SX = 111320·cos(lat), SZ = 111320, x hacia el este y z hacia el sur.
world = json.loads((ROOT / 'web/world.json').read_text())
LON, LAT = world['origin']
SX = 111320 * math.cos(math.radians(LAT))
SZ = 111320
RECTS = world['bounds']
bounds = unary_union([box(x0, z0, x1, z1) for x0, x1, z0, z1 in RECTS])
FX0, FZ0, FX1, FZ1 = bounds.bounds
tr = Transformer.from_crs(25829, 4326, always_xy=True)
MARGIN = 150


def proj(lon, lat):
    return ((lon - LON) * SX, (LAT - lat) * SZ)


def local(xs, ys, z=None):
    lon, lat = tr.transform(xs, ys)
    try:
        return [(v - LON) * SX for v in lon], [(LAT - v) * SZ for v in lat]
    except TypeError:
        return proj(lon, lat)


def js_number(v):
    """Como JSON.stringify de JavaScript: 2.0 se escribe 2."""
    return int(v) if float(v).is_integer() else v


def footprint_sha(points):
    text = json.dumps([[js_number(a), js_number(b)] for a, b in points], separators=(',', ':'))
    return hashlib.sha256(text.encode()).hexdigest()


# 1. Edificios catastrales (A.ES.SDGC.BU.11015.building.gml), en streaming.
ns = {'g': 'http://www.opengis.net/gml/3.2', 'b': 'http://inspire.jrc.ec.europa.eu/schemas/bu-ext2d/2.0'}


def number(e, tag):
    text = e.findtext('b:' + tag, '', ns).strip()
    return int(text) if text.isdigit() else 0


catastro = []
with zipfile.ZipFile(args.catastro).open('A.ES.SDGC.BU.11015.building.gml') as source:
    for _, e in E.iterparse(source, events=['end']):
        if e.tag != '{' + ns['b'] + '}Building':
            continue
        polys = []
        for patch in e.findall('.//g:PolygonPatch', ns):
            rings = []
            for elem in [patch.find('g:exterior', ns), *patch.findall('g:interior', ns)]:
                pos = None if elem is None else elem.find('.//g:posList', ns)
                if pos is not None:
                    v = list(map(float, pos.text.split()))
                    rings.append(list(zip(v[::2], v[1::2])))
            if not rings:
                continue
            x, z = proj(*tr.transform(*rings[0][0]))
            if not (FX0 - MARGIN < x < FX1 + MARGIN and FZ0 - MARGIN < z < FZ1 + MARGIN):
                continue
            poly = transform(local, Polygon(rings[0], rings[1:]))
            polys.append(poly if poly.is_valid else poly.buffer(0))
        if polys:
            catastro.append({
                'geom': unary_union(polys),
                'use': (e.findtext('b:currentUse', '', ns) or '').strip(),
                'units': number(e, 'numberOfBuildingUnits'),
                'dwellings': number(e, 'numberOfDwellings'),
            })
        e.clear()
tree = STRtree([c['geom'] for c in catastro])

# 2. Partes de buildings.json -> edificio catastral que contiene su centroide.
buildings = json.loads((ROOT / 'web/buildings.json').read_text())['buildings']
parts, unmatched = [], 0
for index, b in enumerate(buildings):
    poly = Polygon(b['p'], b.get('holes') or [])
    if not poly.is_valid:
        poly = poly.buffer(0)
    point = poly.centroid
    if not poly.contains(point):
        point = poly.representative_point()
    hits = [i for i in tree.query(point) if catastro[i]['geom'].contains(point)]
    if not hits:
        # Respaldo: el edificio con más solape (la simplificación puede dejar el punto en el borde).
        best, area = None, 0.0
        for i in tree.query(poly):
            a = catastro[i]['geom'].intersection(poly).area
            if a > area:
                best, area = i, a
        if best is None or area < 0.5 * poly.area:
            unmatched += 1
            continue
        hits = [best]
    c = catastro[hits[0]]
    parts.append({'i': index, 'sha256': footprint_sha(b['p']), 'use': c['use'], 'units': c['units'], 'dwellings': c['dwellings']})

# 3. Comercios de OSM dentro del mundo: nodos y centroides de vías cerradas.
AMENITY = {'bar', 'restaurant', 'cafe', 'pub', 'fast_food', 'bank', 'pharmacy', 'ice_cream', 'biergarten', 'food_court', 'marketplace', 'bureau_de_change', 'clinic', 'dentist', 'doctors', 'veterinary', 'cinema', 'theatre', 'nightclub', 'post_office'}
r = E.parse(args.osm).getroot()
nodes = {n.attrib['id']: proj(float(n.attrib['lon']), float(n.attrib['lat'])) for n in r.findall('node')}


def kind_of(t):
    for key in ('shop', 'office', 'craft'):
        if key in t and t[key] != 'no':
            return key + ':' + t[key]
    if t.get('amenity') in AMENITY:
        return 'amenity:' + t['amenity']
    return None


shops = []
for n in r.findall('node'):
    t = {v.attrib['k']: v.attrib['v'] for v in n.findall('tag')}
    kind = kind_of(t)
    p = nodes[n.attrib['id']]
    if kind and bounds.contains(Point(p)):
        shops.append([round(p[0], 2), round(p[1], 2), kind])
for w in r.findall('way'):
    t = {v.attrib['k']: v.attrib['v'] for v in w.findall('tag')}
    kind = kind_of(t)
    pts = [nodes[k.attrib['ref']] for k in w.findall('nd') if k.attrib['ref'] in nodes]
    if kind and len(pts) > 3 and pts[0] == pts[-1]:
        c = Polygon(pts).centroid
        if bounds.contains(c):
            shops.append([round(c.x, 2), round(c.y, 2), kind])
shops.sort(key=lambda s: (s[0], s[1], s[2]))

layer = {
    'version': 1,
    'origin': [LON, LAT],
    'buildingsSha256': hashlib.sha256((ROOT / 'web/buildings.json').read_bytes()).hexdigest(),
    'source': 'D.G. del Catastro INSPIRE BU (currentUse, numberOfBuildingUnits, numberOfDwellings) y OpenStreetMap (shop, amenity, office, craft), descarga local 2026',
    'license': 'Catastro INSPIRE terms; OpenStreetMap ODbL 1.0; see THIRD_PARTY_NOTICES.md',
    'attribution': 'D.G. del Catastro; © OpenStreetMap contributors',
    'limits': 'Indicios, no certeza: más inmuebles que viviendas sugiere local, garaje o trastero; 4 o más viviendas, bloque de pisos. Cada parte toma los datos del edificio catastral que contiene su centroide; los comercios de OSM son puntos aproximados y no están vinculados a una parte.',
    'format': {
        'parts': 'Una entrada por parte de buildings.json que encaja con un edificio catastral: i = índice en buildings.json, sha256 = huella SHA-256 de JSON.stringify(p) de esa parte, use = currentUse de Catastro, units = numberOfBuildingUnits, dwellings = numberOfDwellings.',
        'shops': '[x, z, tipo] en metros locales (como buildings.json); tipo = clave:valor de OSM (shop:*, office:*, craft:*, amenity:*).',
    },
    'parts': parts,
    'shops': shops,
}
Path(args.out).write_text(json.dumps(layer, ensure_ascii=False, separators=(',', ':')) + '\n')
by_use = {}
for p in parts:
    by_use[p['use']] = by_use.get(p['use'], 0) + 1
print(json.dumps({
    'buildings': len(buildings), 'parts': len(parts), 'unmatched': unmatched, 'byUse': by_use,
    'blocks': sum(1 for p in parts if p['dwellings'] >= 4),
    'residentialMoreUnits': sum(1 for p in parts if p['use'] == '1_residential' and p['units'] > p['dwellings']),
    'shops': len(shops),
}, ensure_ascii=False))
