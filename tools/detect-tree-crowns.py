"""Candidatos aproximados PNOA, sin modificar ninguna capa publicada.

uv run --no-project --with numpy --with pillow --with scipy --with shapely python tools/detect-tree-crowns.py
"""
import argparse
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
from shapely import contains_xy, intersects_xy
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent


def pixel_to_game(i, j, u, v, index):
    # Misma rejilla y orientación que tile_box/request de aerial-tiles.py.
    step = index['levels']['hi'][1]
    return (index['tile'] * i - index['margin'] + step * (u + .5),
            index['tile'] * j - index['margin'] + step * (v + .5))


def crowns(rgb, blocked, step, opening=1):
    norm = rgb / np.maximum(rgb.sum(axis=2, keepdims=True), 1)
    exg = 2 * norm[:, :, 1] - norm[:, :, 0] - norm[:, :, 2]
    raw = (exg > .10) & (rgb.mean(axis=2) >= 45) & ~blocked
    mask = ndi.binary_opening(raw, iterations=opening)
    mask = ndi.binary_fill_holes(ndi.binary_closing(mask, iterations=3)) & ~blocked
    labels, _ = ndi.label(mask)
    result = []
    for label, region in enumerate(ndi.find_objects(labels), 1):
        if region is None:
            continue
        component = labels[region] == label
        if component.sum() * step**2 < 3:
            continue
        # Padding evita distancias artificiales en componentes que llenan su caja.
        distance = ndi.distance_transform_edt(np.pad(component, 1))[1:-1, 1:-1]
        peaks = component & (distance == ndi.maximum_filter(distance, size=3))
        yy, xx = np.nonzero(peaks)
        order = sorted(zip(yy, xx), key=lambda p: (-distance[p], p))
        seeds = []
        for y, x in order:
            if all(math.hypot(x - sx, y - sy) * step >= 3 for sy, sx in seeds):
                seeds.append((y, x))
        # Partición por cercanía a los máximos, limitada al componente vegetal.
        # No se interpreta cada máximo como una especie ni como un tronco medido.
        cy, cx = np.nonzero(component)
        nearest = cKDTree(seeds).query(np.column_stack((cy, cx)))[1]
        split = np.zeros(component.shape, dtype=np.int32)
        split[cy, cx] = nearest + 1
        for k, (y, x) in enumerate(seeds, 1):
            part = component & (split == k)
            area = part.sum() * step**2
            if area < 3:
                continue
            result.append((x + region[1].start, y + region[0].start,
                           math.sqrt(area / math.pi), float(exg[region][part].mean())))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'source-data/tree-candidates.json')
    parser.add_argument('--opening', type=int, choices=[1, 2], default=1)
    args = parser.parse_args()
    read = lambda name: json.loads((ROOT / name).read_text())
    index, buildings, osm, world = map(read, ['web/aerial/index.json', 'web/buildings.json',
                                           'web/osm-world.json', 'web/world.json'])
    polygons = [Polygon(b['p'], b.get('holes', [])) for b in buildings['buildings']]
    water = [Polygon(a['p']) for a in osm['areas'] if a['kind'] == 'water']
    roads = [LineString(r['p']).buffer(r['w'] / 2) for r in osm['roads']
             if r['type'] not in ['footway', 'pedestrian', 'path', 'steps', 'cycleway'] and len(r['p']) > 1]
    exclusions = [g if g.is_valid else g.buffer(0) for g in polygons + water + roads]
    parks = unary_union([Polygon(a['p']).buffer(0) for a in osm['areas'] if a['kind'] == 'park'])
    squares = unary_union([Polygon(a['p']).buffer(0) for a in osm['areas'] if a['kind'] == 'square'])
    streets = unary_union(roads).buffer(8)
    bounds = unary_union([box(b[0], b[2], b[1], b[3]) for b in world['bounds']])
    candidates, counts = [], dict(parque=0, plaza=0, calle=0, otro=0)
    step = index['levels']['hi'][1]
    for i, j in index['tiles']:
        tile = f'{i}_{j}'
        rgb = np.asarray(Image.open(ROOT / f'web/aerial/hi/{tile}.jpg').convert('RGB'), dtype=float)
        h, w = rgb.shape[:2]
        x, z = pixel_to_game(i, j, np.arange(w)[None, :], np.arange(h)[:, None], index)
        tile_box = box(float(x.min()), float(z.min()), float(x.max()), float(z.max()))
        geometry = unary_union([g for g in exclusions if g.intersects(tile_box)])
        blocked = intersects_xy(geometry, x, z)
        for u, v, radius, score in crowns(rgb, blocked, step, args.opening):
            cx, cz = pixel_to_game(i, j, u, v, index)
            # Solo el núcleo de la tesela: los márgenes permiten detectar sin duplicar.
            if not (i * index['tile'] <= cx < (i + 1) * index['tile'] and
                    j * index['tile'] <= cz < (j + 1) * index['tile'] and
                    intersects_xy(bounds, cx, cz)):
                continue
            zone = ('parque' if contains_xy(parks, cx, cz) else 'plaza' if contains_xy(squares, cx, cz)
                    else 'calle' if contains_xy(streets, cx, cz) else 'otro')
            counts[zone] += 1
            candidates.append(dict(id=f'{tile}:{u}:{v}', x=round(cx, 3), z=round(cz, 3),
                                   r=round(radius, 3), score=round(score, 4), tile=tile, zone=zone))
        print(tile, len(candidates), flush=True)
    # Deduplicación global de bordes: la separación también rige entre teselas.
    accepted, cells = [], {}
    for candidate in sorted(candidates, key=lambda c: (-c['score'], c['id'])):
        gx, gz = math.floor(candidate['x'] / 3), math.floor(candidate['z'] / 3)
        neighbours = [c for ix in range(gx - 1, gx + 2) for iz in range(gz - 1, gz + 2)
                      for c in cells.get((ix, iz), [])]
        if any(math.hypot(candidate['x'] - c['x'], candidate['z'] - c['z']) < 3 for c in neighbours):
            continue
        accepted.append(candidate)
        cells.setdefault((gx, gz), []).append(candidate)
    candidates = sorted(accepted, key=lambda c: (c['tile'], c['id']))
    counts = {zone: sum(c['zone'] == zone for c in candidates) for zone in counts}
    files = ['web/aerial/index.json', 'web/buildings.json', 'web/osm-world.json', 'web/world.json']
    files += [f'web/aerial/hi/{i}_{j}.jpg' for i, j in index['tiles']]
    provenance = dict(acquisition=index['acquisition'], source=index['source'],
                      height='estimación por radio de copa; sin MDSnV',
                      inputs={f: hashlib.sha256((ROOT / f).read_bytes()).hexdigest() for f in files},
                      versions={p: importlib.metadata.version(p) for p in ['numpy', 'pillow', 'scipy', 'shapely']})
    output = dict(version=1, provenance=provenance,
                  method=dict(exgThreshold=.10, brightnessMin=45, opening=args.opening, closing=3,
                              minimumArea=3, peakSeparation=3, pixelSize=step,
                              radius='sqrt(área segmentada/pi)', score='ExG medio; no probabilidad'),
                  counts=counts, candidates=candidates)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    print('Total:', len(candidates), counts)


if __name__ == '__main__':
    main()
