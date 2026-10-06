"""Sentido de circulación según las etiquetas OSM, sin mover la cartografía."""


def directed_road(points, tags):
    value = str(tags.get('oneway', '')).strip().lower()
    if value == '-1':
        return list(reversed(points)), True
    if value in ('yes', '1', 'true'):
        return points, True
    if value in ('no', '0', 'false'):
        return points, False
    if value:
        # Valores reversibles/alternos requieren tiempo real; no inventar un sentido.
        return points, False
    return points, tags.get('junction') == 'roundabout' or tags.get('highway') == 'motorway'
