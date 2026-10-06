# Reproducir los datos del juego

Qué contiene cada capa y de dónde sale: [MAP_SOURCES.md](MAP_SOURCES.md). Licencias:
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). Este documento solo describe cómo
regenerar los datos.

## Capas

El navegador carga `web/world.json`, un manifiesto que referencia las capas
`buildings.json` (Catastro) y `osm-world.json` (OSM) con sus checksums. Carga además la
ortofoto `aerial.jpg`, `facade-profiles.json` (parámetros de fachadas propios,
obligatorio) y `height-samples.json` (alturas IGN; si falta, el juego usa la altura por
plantas). `web/data-sources.json` registra fuente, condiciones y SHA-256 de
cada archivo de datos publicado.

Las recetas de geometría siguen en `web/game3d.js`: separar parámetros en JSON no equivale
a hornear la escena.

## Reglas

- Los originales (ZIP/GML de Catastro, extracto OSM, recortes ráster IGN) se descargan a
  una carpeta fuera del repositorio y nunca se añaden a Git. Conservar URL, fecha,
  licencia y checksum, nunca credenciales.
- Python siempre con `uv`.
- Cualquier generador va seguido de `node tools/export-provenance.mjs` y de `npm test`.
  `export-provenance` copia el catálogo de frentes, `LICENSE` y `THIRD_PARTY_NOTICES.md` a
  `web/` y recalcula los checksums de `data-sources.json`; sin él, `verify-world` falla.

## 1. Contornos y vías (opcional)

Solo si hay que reconstruir el mapa desde originales descargados con las URL de
[MAP_SOURCES.md](MAP_SOURCES.md):

```fish
uv run --no-project --with pyproj --with shapely python tools/rebuild-map.py --catastro /ruta/local/catastro.zip --osm /ruta/local/osm.xml
```

Lee las partes de edificio sin extraer el ZIP, conserva las plantas y transforma los
contornos a coordenadas de juego. Escribe `rebuilt-city.json` en la raíz (ignorado por
Git); no sustituye el mapa. Revisarlo y, si se adopta deliberadamente:

```fish
node tools/prepare-world.mjs rebuilt-city.json
```

Sin argumento, `prepare-world.mjs` vuelve a escribir las capas actuales y recalcula sus
checksums; no las regenera desde originales.

## 2. Alturas IGN (opcional)

Descarga solo un recorte WCS pequeño de la zona (nunca el mosaico nacional) a una caché
fuera del repositorio, por defecto `/tmp/chiclana-ign`:

```fish
uv run --no-project --with rasterio --with pyproj --with shapely python tools/audit-ign-heights.py --download --overlay web/height-samples.json
```

Escribe la auditoría completa en `source-data/height-audit-ign.json` y las entradas
aceptadas en el overlay. Los filtros de aceptación están en el propio script y en el
campo `acceptance` del overlay; no relajarlos para obtener más alturas. Detalle de las
partes aceptadas: [ALTURAS_PILOTO.md](ALTURAS_PILOTO.md).

TODO(integración): el script aún no escribe el campo `attribution` del overlay (auditoría
N1). Hasta que se corrija, comprobar `git diff web/height-samples.json` y restaurar la
atribución antes de seguir.

## 3. Catálogo de frentes

```fish
node tools/export-facades.mjs
```

Actualiza `source-data/facade-catalog.json` a partir de las capas y del juego.

## 4. Procedencia y comprobación (siempre)

```fish
node tools/export-provenance.mjs
npm test
```

`verify-world` comprueba los checksums de capas y procedencia, las alturas base, que el
overlay y el catálogo apuntan a la instantánea actual de edificios, que las copias de
`web/` coinciden y que las licencias están incluidas. No compara la geometría con una
instantánea fija anterior (auditoría N2). TODO(integración): actualizar cuando se fusione
la huella geométrica fija de las pruebas.

Las comprobaciones en CPU no acreditan el render en GPU ni el comportamiento en móvil:
probar el juego en un navegador.
