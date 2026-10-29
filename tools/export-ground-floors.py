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
parts, points, unmatched = [], [], 0  # parts[k] corresponde a buildings[k]; None si no encaja
for index, b in enumerate(buildings):
    poly = Polygon(b['p'], b.get('holes') or [])
    if not poly.is_valid:
        poly = poly.buffer(0)
    point = poly.centroid
    if not poly.contains(point):
        point = poly.representative_point()
    points.append(point)
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
            parts.append(None)
            continue
        hits = [best]
    c = catastro[hits[0]]
    parts.append([c['use'], c['units'], c['dwellings']])
uses = sorted({p[0] for p in parts if p})
parts = [None if p is None else [uses.index(p[0]), p[1], p[2]] for p in parts]

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


def shop_entry(x, y, kind, t):
    # [x, z, tipo, nombre] y la marca solo si OSM la indica.
    entry = [round(x, 2), round(y, 2), kind, t.get('name')]
    if t.get('brand'):
        entry.append(t['brand'])
    return entry


def outline(points):
    return [[round(x, 2), round(y, 2)] for x, y in points]


# Indicios de zona: áreas industriales o comerciales de OSM (landuse) y edificios que OSM
# etiqueta como nave, almacén o comercio. Vías cerradas; las relaciones no se leen.
ZONE_KINDS = ['industrial', 'retail']
LANDUSE = {'industrial': 'industrial', 'retail': 'retail'}
BUILDING = {'industrial': 'industrial', 'warehouse': 'industrial', 'retail': 'retail'}
shops, fuel, zone_areas, building_areas = [], [], [], []
for n in r.findall('node'):
    t = {v.attrib['k']: v.attrib['v'] for v in n.findall('tag')}
    kind = kind_of(t)
    p = nodes[n.attrib['id']]
    if kind and bounds.contains(Point(p)):
        shops.append(shop_entry(*p, kind, t))
    if t.get('amenity') == 'fuel' and bounds.contains(Point(p)):
        fuel.append({'x': round(p[0], 2), 'z': round(p[1], 2), 'name': t.get('name'),
                     'brand': t.get('brand'), 'outline': None})
for w in r.findall('way'):
    t = {v.attrib['k']: v.attrib['v'] for v in w.findall('tag')}
    kind = kind_of(t)
    pts = [nodes[k.attrib['ref']] for k in w.findall('nd') if k.attrib['ref'] in nodes]
    if len(pts) <= 3 or pts[0] != pts[-1]:
        continue
    poly = Polygon(pts)
    if not poly.is_valid:
        poly = poly.buffer(0)
    c = poly.centroid
    if kind and bounds.contains(c):
        shops.append(shop_entry(c.x, c.y, kind, t))
    if t.get('amenity') == 'fuel' and bounds.contains(c):
        fuel.append({'x': round(c.x, 2), 'z': round(c.y, 2), 'name': t.get('name'),
                     'brand': t.get('brand'), 'outline': outline(pts)})
    if t.get('landuse') in LANDUSE:
        zone_areas.append((poly, ZONE_KINDS.index(LANDUSE[t['landuse']]) + 1))
    if t.get('building') in BUILDING:
        building_areas.append((poly, ZONE_KINDS.index(BUILDING[t['building']]) + 1))
shops.sort(key=lambda s: (s[0], s[1], s[2]))
fuel.sort(key=lambda f: (f['x'], f['z']))


def zone_codes(areas):
    tree = STRtree([a[0] for a in areas])
    return [next((areas[i][1] for i in sorted(tree.query(point)) if areas[i][0].contains(point)), 0)
            for point in points]


# El indicio del edificio de OSM prevalece sobre el de la zona.
by_zone, by_building = zone_codes(zone_areas), zone_codes(building_areas)
zones = [b or z for z, b in zip(by_zone, by_building)]

layer = {
    'version': 1,
    'origin': [LON, LAT],
    'buildingsSha256': hashlib.sha256((ROOT / 'web/buildings.json').read_bytes()).hexdigest(),
    'source': 'D.G. del Catastro INSPIRE BU (currentUse, numberOfBuildingUnits, numberOfDwellings) y OpenStreetMap (shop, amenity, office, craft), descarga local 2026',
    'license': 'Catastro INSPIRE terms; OpenStreetMap ODbL 1.0; see THIRD_PARTY_NOTICES.md',
    'attribution': 'D.G. del Catastro; © OpenStreetMap contributors',
    'limits': 'Indicios, no certeza: más inmuebles que viviendas sugiere local, garaje o trastero; 4 o más viviendas, bloque de pisos. Cada parte toma los datos del edificio catastral que contiene su centroide; los comercios de OSM son puntos aproximados y no están vinculados a una parte.',
    'format': {
        'uses': 'Valores de currentUse de Catastro que aparecen, ordenados.',
        'parts': '[índice en uses, numberOfBuildingUnits, numberOfDwellings] por cada parte de buildings.json, en su mismo orden (parts[k] es buildings[k]); null si la parte no encaja con ningún edificio catastral.',
        'shops': '[x, z, tipo, nombre] en metros locales (como buildings.json), más la marca como quinto elemento si OSM la indica; tipo = clave:valor de OSM (shop:*, office:*, craft:*, amenity:*); nombre = name de OSM o null.',
        'zoneKinds': 'Indicios de zona posibles.',
        'zones': 'Un entero por parte de buildings.json: 0 sin indicio; n > 0 es zoneKinds[n - 1]. Sale del edificio de OSM (building=industrial|warehouse|retail) o, si no hay, del área (landuse=industrial|retail) que contiene el centroide de la parte.',
        'fuel': 'Gasolineras (amenity=fuel) dentro del mundo: {x, z, name, brand, outline}; outline es el contorno si OSM la dibuja como área, o null.',
    },
    'uses': uses,
    'parts': parts,
    'shops': shops,
    'zoneKinds': ZONE_KINDS,
    'zones': zones,
    'fuel': fuel,
}
Path(args.out).write_text(json.dumps(layer, ensure_ascii=False, separators=(',', ':')) + '\n')
by_use = {}
matched = [p for p in parts if p]
for p in matched:
    by_use[uses[p[0]]] = by_use.get(uses[p[0]], 0) + 1
print(json.dumps({
    'buildings': len(buildings), 'parts': len(matched), 'unmatched': unmatched, 'byUse': by_use,
    'blocks': sum(1 for p in matched if p[2] >= 4),
    'residentialMoreUnits': sum(1 for p in matched if uses[p[0]] == '1_residential' and p[1] > p[2]),
    'shops': len(shops),
    'shopsNamed': sum(1 for s in shops if s[3]),
    'shopsBranded': sum(1 for s in shops if len(s) > 4),
    'zones': {kind: sum(1 for z in zones if z == i + 1) for i, kind in enumerate(ZONE_KINDS)},
    'zonesFromBuilding': sum(1 for b in by_building if b),
    'fuel': [f['name'] for f in fuel],
}, ensure_ascii=False))
