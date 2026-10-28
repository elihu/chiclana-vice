"""Añade etiquetas de las vías ya publicadas; conserva geometría, anchura y circulación."""
import argparse
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument('--osm', required=True)
parser.add_argument('--previous-osm', help='Instantánea derivada antes de enriquecer etiquetas; solo para migración de metadatos')
parser.add_argument('--previous-world', help='Manifiesto anterior de esa misma instantánea')
args = parser.parse_args()
tags = {}
for way in ET.parse(args.osm).getroot().findall('way'):
    tags[way.attrib['id']] = {t.attrib['k']: t.attrib['v'] for t in way.findall('tag')}
path = Path('web/osm-world.json')
previous_osm = Path(args.previous_osm).read_bytes() if args.previous_osm else path.read_bytes()
previous_world = Path(args.previous_world).read_bytes() if args.previous_world else Path('web/world.json').read_bytes()
data = json.loads(path.read_text())
for road in data['roads']:
    source = tags.get(road['id'], {})
    for field in ('junction', 'tunnel', 'layer'):
        road.pop(field, None)
    if source.get('junction') == 'roundabout':
        road['junction'] = 'roundabout'
    if source.get('tunnel') == 'yes':
        road['tunnel'] = True
    if 'layer' in source:
        try:
            road['layer'] = int(source['layer'])
        except ValueError:
            pass
path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
manifest_path = Path('web/world.json')
manifest = json.loads(manifest_path.read_text())
manifest['checksums']['osm'] = hashlib.sha256(path.read_bytes()).hexdigest()
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + '\n')
print('Semántica OSM:', {field: sum(field in r for r in data['roads']) for field in ('junction', 'tunnel', 'layer')})

# Las etiquetas nuevas no intervienen en el detector de copas. Renovar exclusivamente
# su procedencia cuando se demuestra que geometría y límites permanecen idénticos.
def without_semantics(payload):
    result = json.loads(json.dumps(payload))
    for road in result['roads']:
        for field in ('junction', 'tunnel', 'layer'):
            road.pop(field, None)
    return result
if without_semantics(json.loads(previous_osm)) != without_semantics(data):
    raise ValueError('La geometría ha cambiado: regenerar candidatos y revisar copas')
def without_osm_checksum(payload):
    result = json.loads(json.dumps(payload))
    result['checksums'].pop('osm', None)
    return result
if without_osm_checksum(json.loads(previous_world)) != without_osm_checksum(manifest):
    raise ValueError('El mundo ha cambiado: regenerar candidatos y revisar copas')
candidate_path = Path('source-data/tree-candidates.json')
review_path = Path('source-data/tree-review.json')
if candidate_path.exists() and review_path.exists():
    candidate_bytes = candidate_path.read_bytes()
    candidates = json.loads(candidate_bytes)
    review = json.loads(review_path.read_text())
    inputs = candidates['provenance']['inputs']
    for file, previous in [('web/osm-world.json', previous_osm), ('web/world.json', previous_world)]:
        old = hashlib.sha256(previous).hexdigest()
        new = hashlib.sha256(Path(file).read_bytes()).hexdigest()
        if inputs[file] not in (old, new):
            raise ValueError('Procedencia de copas desfasada: ' + file)
        inputs[file] = new
    if review['candidatesSha256'] != hashlib.sha256(candidate_bytes).hexdigest():
        raise ValueError('La revisión de copas no corresponde a la instantánea')
    candidate_path.write_text(json.dumps(candidates, ensure_ascii=False, indent=2) + '\n')
    review['candidatesSha256'] = hashlib.sha256(candidate_path.read_bytes()).hexdigest()
    review_path.write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n')
    print('Procedencia de copas renovada sin cambiar candidatos, identificadores ni decisiones')
