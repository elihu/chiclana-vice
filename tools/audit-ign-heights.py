"""Audit independent IGN roof estimates; originals stay in an external cache.

uv run --no-project --with rasterio --with pyproj --with shapely python \
    tools/audit-ign-heights.py --download --overlay web/height-samples.json

Downloads only a ~1.4 km2 WCS clip, not the national raster. The IGN service
currently exposes FIRST coverage (2008–2015), not the REDIAM 2020–21 campaign.
"""
import argparse
from collections import Counter
from datetime import date
import hashlib
import json
import math
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

import numpy as np
import pyproj
import rasterio
from rasterio.features import geometry_mask
from rasterio.windows import Window, from_bounds, transform as window_transform
import shapely
from shapely.geometry import Point, Polygon, mapping

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--download', action='store_true')
parser.add_argument('--raster-dir', default='/tmp/chiclana-ign')
parser.add_argument('--output', default='source-data/height-audit-ign.json')
parser.add_argument('--overlay', help='Optional runtime overlay, without audit rows')
parser.add_argument('--bounds', nargs=4, type=float, default=[-410, 110, -270, 125])
args = parser.parse_args()
policy = json.loads(Path('source-data/height-policy.json').read_text())
acceptance = policy['acceptance']
endpoint = 'https://wcs-mds.idee.es/mds'
url = endpoint + '?' + urlencode([
    ('service', 'WCS'), ('version', '2.0.1'), ('request', 'GetCoverage'),
    ('coverageid', 'mdsn_e025'), ('subset', 'x(217012,218391)'),
    ('subset', 'y(4034565,4035608)'), ('format', 'image/tiff')])
cache = Path(args.raster_dir)
path = cache / 'chiclana-ign-mdsn-e025-first.tif'
if args.download:
    cache.mkdir(parents=True, exist_ok=True)
    with urlopen(url, timeout=60) as response:
        data = response.read(10_000_001)
    if len(data) > 10_000_000 or data[:4] not in (b'II*\x00', b'MM\x00*'):
        raise ValueError('Expected a small GeoTIFF clip, not an error or full mosaic')
    path.write_bytes(data)
    path.with_suffix('.access-date').write_text(date.today().isoformat())

manifest = json.loads(Path('web/world.json').read_text())
buildings_path = Path('web') / manifest['files']['buildings']
osm = json.loads((Path('web') / manifest['files']['osm']).read_text())
raw = buildings_path.read_bytes()
city = {'origin': manifest['origin'], 'buildings': json.loads(raw)['buildings'], 'landmarks': osm['landmarks']}
sx = 111320 * math.cos(math.radians(city['origin'][1]))
protected = [Polygon(p['outline']) for p in city['landmarks'] if len(p.get('outline', [])) > 2]
rows, entries = [], []
with rasterio.open(path) as raster:
    if raster.crs is None or raster.width > 1000 or raster.height > 1000:
        raise ValueError('Cache is not the expected georeferenced local clip')
    values = raster.read(1, masked=True).filled(-9999).astype('float32')
    tr = pyproj.Transformer.from_crs(4326, raster.crs, always_xy=True)
    def utm(ring):
        return [tr.transform(city['origin'][0] + x / sx, city['origin'][1] - z / 111320) for x, z in ring]
    for index, building in enumerate(city['buildings']):
        xs, zs = zip(*building['p'])
        cx, cz = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2
        xmin, xmax, zmin, zmax = args.bounds
        if not (xmin < cx < xmax and zmin < cz < zmax):
            continue
        report = {'index': index, 'center': [round(cx, 2), round(cz, 2)],
                  'floors': building['floors'], 'old': building['h'],
                  'accepted': False, 'reasons': []}
        rows.append(report)
        poly = Polygon(utm(building['p']), [utm(h) for h in building['holes']]).buffer(-1)
        if poly.is_empty or poly.area < 12:
            report['reasons'] = ['insufficient-interior-area']
            continue
        win = from_bounds(*poly.bounds, raster.transform)
        col, row = math.floor(win.col_off), math.floor(win.row_off)
        right, bottom = math.ceil(win.col_off + win.width), math.ceil(win.row_off + win.height)
        col, row, right, bottom = max(0, col), max(0, row), min(raster.width, right), min(raster.height, bottom)
        if right <= col or bottom <= row:
            report['reasons'] = ['outside-raster-clip']
            continue
        window = Window(col, row, right-col, bottom-row)
        tile = values[row:bottom, col:right]
        mask = geometry_mask([mapping(poly)], out_shape=tile.shape,
                             transform=window_transform(window, raster.transform), invert=True)
        sampled = tile[mask]
        valid = sampled[np.isfinite(sampled) & (sampled > 2) & (sampled < 40)]
        coverage = len(valid)/len(sampled) if len(sampled) else 0
        report.update(samples=len(valid), interiorPixels=len(sampled), coverage=round(coverage, 3))
        if len(valid) < acceptance['minimumSamples']:
            report['reasons'] = ['insufficient-valid-samples']
            continue
        q10, median, q80, q90 = map(float, np.percentile(valid, [10, 50, 80, 90]))
        special = any(p.covers(Point(cx, cz)) for p in protected)
        checks = {'protected-landmark': special, 'low-coverage': coverage < acceptance['minimumCoverage'],
                  'heterogeneous-roof': q90-q10 > acceptance['maximumP90P10Spread'],
                  'floor-height-conflict': not acceptance['heightPerFloorRange'][0] <= q80/building['floors'] <= acceptance['heightPerFloorRange'][1],
                  'small-correction': abs(q80-building['h']) < acceptance['absoluteCorrectionRange'][0],
                  'large-correction': abs(q80-building['h']) > acceptance['absoluteCorrectionRange'][1]}
        report.update(p10=round(q10, 2), median=round(median, 2), p80=round(q80, 2),
                      p90=round(q90, 2), protected=special,
                      reasons=[reason for reason, failed in checks.items() if failed])
        report['accepted'] = not report['reasons']
        if report['accepted']:
            entries.append({'index': index, 'p0': building['p'][0], 'vertices': len(building['p']),
                            'floors': building['floors'], 'old': building['h'], 'height': round(q80, 1),
                            'samples': len(valid), 'coverage': report['coverage'], 'spread': round(q90-q10, 2)})
    output = {'version': 1, 'origin': city['origin'], 'buildingCount': len(city['buildings']),
              'buildingsSha256': hashlib.sha256(raw).hexdigest(),
              'source': 'IGN / PNOA-LiDAR first coverage, normalized building heights MDSnE2.5',
              'pilotBounds': args.bounds, 'sourceUrls': {'MDSnE': url},
              'sourceSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
              'accessDate': path.with_suffix('.access-date').read_text().strip() if path.with_suffix('.access-date').exists() else None,
              'sourcePeriod': '2008–2015; local flight date not confirmed',
              'license': 'CC BY 4.0 scne.es',
              'licenseUrl': 'https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf',
              'capabilitiesUrl': endpoint+'?service=WCS&request=GetCapabilities',
              'rasterCrs': str(raster.crs), 'rasterResolution': list(raster.res),
              'rasterValueResolutionMetres': 1,
              'method': 'P80 of normalized building-class heights at pixel centres in cadastral footprint eroded 1m; no terrain subtraction',
              'acceptance': acceptance,
              'limits': 'First-coverage roof estimates with integer-metre values and approximately 2.5m pixels; Older campaign; not eave heights, architectural survey or equivalent to newer measurements. Landmarks excluded; conservative pilot only.',
              'versions': {'rasterio': rasterio.__version__, 'pyproj': pyproj.__version__, 'shapely': shapely.__version__},
              'entries': entries,
              'attribution': 'Obra derivada de PNOA-LiDAR MDSnE2,5 2008–2015 CC-BY 4.0 scne.es',
              'audit': rows}
for destination, payload in [(args.output, output), (args.overlay, {k:v for k,v in output.items() if k != 'audit'})]:
    if destination:
        Path(destination).parent.mkdir(parents=True, exist_ok=True)
        Path(destination).write_text(json.dumps(payload, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({'audited': len(rows), 'sampled': sum(r.get('samples', 0) >= acceptance['minimumSamples'] for r in rows),
                  'accepted': len(entries), 'rejections': dict(Counter(reason for r in rows for reason in r['reasons'])),
                  'output': args.output, 'overlay': args.overlay, 'examples': entries[:5]}, ensure_ascii=False))
