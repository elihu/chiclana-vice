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
from shapely import contains_xy, intersects_xy, prepare
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent


def pixel_to_game(i, j, u, v, index):
    # Misma rejilla y orientación que tile_box/request de aerial-tiles.py.
    step = index['levels']['hi'][1]
    return (index['tile'] * i - index['margin'] + step * (u + .5),
            index['tile'] * j - index['margin'] + step * (v + .5))


def luminance(rgb):
    return rgb @ np.array([.2126, .7152, .0722])


def shadow_scores(rgb, buildings, step):
    """Oscuridad exterior al desplazar las huellas; ángulos en x,z (sur positivo)."""
    dark = luminance(rgb) < 65
    scores = []
    for angle in range(0, 360, 15):
        a = math.radians(angle)
        samples = []
        for metres in (2, 4, 6, 8):
            shifted = ndi.shift(buildings.astype(np.uint8),
                                (round(math.sin(a) * metres / step),
                                 round(math.cos(a) * metres / step)), order=0, mode='constant') > 0
            outside = shifted & ~buildings
            samples.append((int((outside & dark).sum()), int(outside.sum())))
        scores.append(np.sum(samples, axis=0))
    return np.array(scores)


def filter_crown(rgb, part, u, v, step, direction, buildings=None):
    lum = luminance(rgb)
    area = float(part.sum() * step**2)
    # Desviación en ventanas de 1,25 m: evita confundir franjas del césped con follaje.
    mean = ndi.uniform_filter(lum, size=5)
    variance = np.maximum(0, ndi.uniform_filter(lum * lum, size=5) - mean * mean)
    interior = ndi.binary_erosion(part, iterations=2)
    texture = float(np.median(np.sqrt(variance)[interior if interior.any() else part]))
    if area < 6:
        return 'área', dict(area=area, texture=texture)
    if texture < 5:
        return 'textura', dict(area=area, texture=texture)
    radius = math.sqrt(area / math.pi) / step
    yy, xx = np.indices(part.shape)
    dx, dy = xx - u, yy - v
    along = dx * direction[0] + dy * direction[1]
    across = abs(dx * direction[1] - dy * direction[0])
    sector = (along >= .8 * radius) & (along <= 2.5 * radius) & (across <= .8 * radius) & ~part
    if buildings is not None:
        sector &= ~buildings
    dark = sector & (lum < min(65, float(lum[part].mean()) * .65))
    labels, _ = ndi.label(dark)
    sizes = np.bincount(labels.ravel())[1:]
    shadow = float(sizes.max() * step**2) if sizes.size else 0.
    reason = 'sombra' if shadow < max(.5, area * .08) else None
    return reason, dict(area=area, texture=texture, shadow=shadow)


def crowns(rgb, blocked, step, opening=1, direction=None, buildings=None, audit=None):
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
            area = float(part.sum() * step**2)
            if area < 3:
                continue
            u, v = x + region[1].start, y + region[0].start
            if direction is not None:
                # Recorte local para que el coste dependa de la copa, no de la tesela.
                pad = math.ceil(3 * math.sqrt(area / math.pi) / step)
                y0, y1 = max(0, min(v-pad, region[0].start)), min(mask.shape[0], max(v+pad+1, region[0].stop))
                x0, x1 = max(0, min(u-pad, region[1].start)), min(mask.shape[1], max(u+pad+1, region[1].stop))
                crop = np.s_[y0:y1, x0:x1]
                local_part = np.zeros((y1-y0, x1-x0), dtype=bool)
                ry, rx = np.nonzero(part)
                ry, rx = ry + region[0].start - y0, rx + region[1].start - x0
                inside = (ry >= 0) & (ry < y1-y0) & (rx >= 0) & (rx < x1-x0)
                local_part[ry[inside], rx[inside]] = True
                reason, metrics = filter_crown(rgb[crop], local_part, u-x0, v-y0, step,
                                               direction, buildings[crop] if buildings is not None else None)
                if audit is not None:
                    audit.append(dict(u=int(u), v=int(v), r=math.sqrt(area/math.pi), reason=reason, **metrics))
                if reason:
                    continue
            result.append((u, v,
                           math.sqrt(area / math.pi), float(exg[region][part].mean())))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'source-data/tree-candidates.json')
    parser.add_argument('--audit-dir', type=Path)
    parser.add_argument('--opening', type=int, choices=[1, 2], default=1)
    args = parser.parse_args()
    read = lambda name: json.loads((ROOT / name).read_text())
    index, buildings, osm, world = map(read, ['web/aerial/index.json', 'web/buildings.json',
                                           'web/osm-world.json', 'web/world.json'])
    polygons = [Polygon(b['p'], b.get('holes', [])).buffer(0) for b in buildings['buildings']]
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
    # Estimación conjunta a 1 m/píxel; todas las teselas pertenecen a la misma pasada.
    evidence = np.zeros((24, 2))
    all_buildings = unary_union(polygons)
    prepare(all_buildings)
    for i, j in index['tiles']:
        rgb = np.asarray(Image.open(ROOT / f'web/aerial/hi/{i}_{j}.jpg').convert('RGB'), dtype=float)[::4, ::4]
        x, z = pixel_to_game(i, j, np.arange(rgb.shape[1])[None, :] * 4,
                             np.arange(rgb.shape[0])[:, None] * 4, index)
        footprint = intersects_xy(all_buildings, x, z)
        evidence += shadow_scores(rgb, footprint, step * 4)
    rates = evidence[:, 0] / np.maximum(evidence[:, 1], 1)
    angle = int(np.argmax(rates)) * 15
    direction = (math.cos(math.radians(angle)), math.sin(math.radians(angle)))
    print('Dirección sombra:', angle, rates.tolist(), flush=True)
    if args.audit_dir:
        args.audit_dir.mkdir(parents=True, exist_ok=True)
    for i, j in index['tiles']:
        tile = f'{i}_{j}'
        rgb = np.asarray(Image.open(ROOT / f'web/aerial/hi/{tile}.jpg').convert('RGB'), dtype=float)
        h, w = rgb.shape[:2]
        x, z = pixel_to_game(i, j, np.arange(w)[None, :], np.arange(h)[:, None], index)
        tile_box = box(float(x.min()), float(z.min()), float(x.max()), float(z.max()))
        geometry = unary_union([g for g in exclusions if g.intersects(tile_box)])
        blocked = intersects_xy(geometry, x, z)
        footprint = intersects_xy(all_buildings, x, z)
        audit = []
        found = crowns(rgb, blocked, step, args.opening, direction, footprint, audit)
        if args.audit_dir:
            (args.audit_dir / f'{tile}-audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2))
        for u, v, radius, score in found:
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
                              minimumArea=6, texture=dict(luminanceWeights=[.2126, .7152, .0722], windowPixels=5, minimumMedianLocalLuminanceStd=5,
                              interiorErosionPixels=2, explanation='mediana interior sin bordes; rechaza superficies lisas también tras partir componentes grandes'),
                              shadow=dict(directionDegrees=angle, directionXZ=direction,
                              estimation='máximo de fracción oscura fuera de huellas de edificios desplazadas 2,4,6,8 m; pasos 15 grados; rejilla 1 m',
                              buildingDarkFractions=rates.tolist(), luminanceMax=65, crownLuminanceRatio=.65,
                              alongRadii=[.8, 2.5], acrossRadius=.8, minimumConnectedArea=.5,
                              minimumCrownAreaRatio=.08, excludeBuildings=True),
                              colourDecision='ExG 0,10 y brillo 45 conservados; sin mínimo de saturación: césped ExG 0,279 y pavimento ExG 0,030; endurecer color pierde copas apagadas',
                              peakSeparation=3, pixelSize=step,
                              radius='sqrt(área segmentada/pi)', score='ExG medio; no probabilidad'),
                  counts=counts, candidates=candidates)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    print('Total:', len(candidates), counts)


if __name__ == '__main__':
    main()
