# Regenerar el mapa desde descargas locales

El juego no necesita este conversor ni los originales para ejecutarse.
Descargar Catastro INSPIRE BU (municipio 11015) y extracto OSM desde MAP_SOURCES.md
fuera del repositorio público. No añadir el ZIP/GML Catastro a Git: su licencia
permite productos transformados, no redistribuir el original.

```fish
uv run --no-project --with pyproj --with shapely python extras/rebuild-map.py --catastro /ruta/local/catastro.zip --osm /ruta/local/osm.xml
```

Lee BuildingPart sin extraer los 240 MB del ZIP, conserva plantas y transforma
recortando/simplificando contornos a coordenadas de juego. Escribe rebuilt-city.json,
no sustituye automáticamente el mapa. Revisar y usar tools/prepare-world.mjs para
una actualización deliberada. Alturas IGN: tools/audit-ign-heights.py.
Fachadas: parámetros en web/facade-profiles.json y recetas en web/game3d.js.
Fuentes, permisos y aproximaciones en THIRD_PARTY_NOTICES.md.
