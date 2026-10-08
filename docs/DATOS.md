# Reproducir los datos del juego

Qué contiene cada capa y de dónde sale: [MAP_SOURCES.md](MAP_SOURCES.md). Licencias:
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). Este documento solo describe cómo
regenerar los datos.

## Capas

El navegador carga `web/world.json`, un manifiesto que referencia las capas
`buildings.json` (Catastro) y `osm-world.json` (OSM) con sus checksums. Sus límites se describen
con `bounds`, una lista no vacía de
rectángulos `[x0, x1, z0, z1]` finitos y de área positiva; hoy contiene solo
`[-671.835, 671.835, -500.94, 500.94]`. La pertenencia se consulta sobre la unión,
mientras que mapa y cobertura del terreno usan la caja envolvente. `prepare-world.mjs`
genera este formato y admite también entradas antiguas con `size`; el cargador
conserva esa compatibilidad para copias locales. Carga además la
ortofoto `aerial.jpg`, `facade-profiles.json` (paleta y política de alturas propias,
obligatorio), `facade-designs.json` (recetas y composiciones de fachada, obligatorio),
`city-design.json` (zonas, reglas de calle, mobiliario, pavimentos, vegetación y edificios
genéricos, obligatorio), `map-corrections.json` (correcciones manuales sobre la base,
obligatorio, hoy vacío) y `height-samples.json` (alturas IGN; si falta, el juego usa la
altura por plantas). `web/data-sources.json` registra fuente, condiciones y SHA-256 de
cada archivo de datos publicado.

Las recetas de geometría de fachada están en `web/facade-designs.json` y las ejecuta el
compositor (`web/js/world/facade-composer.js`) con las piezas del kit
(`web/js/world/facade-kit.js`): describir la geometría en JSON no equivale a hornear la
escena.

## Diseños y correcciones (a mano)

Cuatro archivos de `web/` no los genera ninguna herramienta: `facade-designs.json`,
`city-design.json`, `map-corrections.json` y `facade-profiles.json` (este último solo con
la paleta de fachadas, `facadeCellSize` y la política de alturas, que sí escribe
`export-height-policy.mjs`). Cada uno lleva un `$schema` hacia `schemas/` para que el
editor ofrezca ayuda; el validador de `web/js/world/design-validate.js` es la referencia
(formato en [plan-modular/KIT-FACHADAS.md](plan-modular/KIT-FACHADAS.md)).

Orden al editarlos:

```fish
node tests/verify-design.mjs        # valida la estructura de los archivos editados
node tools/export-provenance.mjs    # recalcula los SHA-256 de data-sources.json
npm test                            # comprobaciones cruzadas con las capas de base
```

(`npm test` antes de `export-provenance` falla solo por el checksum desfasado.) Un cambio de
aspecto no idéntico va en un commit `feat` propio; ver las condiciones en
[PLAN-MODULAR.md](PLAN-MODULAR.md#111-decisiones-tras-la-parada-de-24-6102026).

- `facade-designs.json`: recetas de fachada y los edificios que las aplican a frentes
  anclados (`front`, `ring`, `landmarkRing`, segmento o `world`). Un anclaje `front` usa un
  ID de `frontages.json` y su `footprintSha256`.
- `city-design.json`: qué calles reciben frentes genéricos (`frontages`), zonas,
  mobiliario fijo, pavimentos, pasos de peatones, línea central, vegetación, señales y
  paleta, colores y alturas mínimas de los edificios genéricos. Los modelos (farola,
  banco, árbol…) y las texturas siguen en el código.
- `map-corrections.json`: ajustes sobre las vías, las áreas y los contornos catastrales,
  aplicados en memoria al cargar. Cada corrección lleva una guarda (`expect`) con el
  valor que debe encontrar; si OSM se regenera y no coincide, el juego y `verify-world`
  fallan con «Corrección fix-NNN no aplicable». No se modifican `osm-world.json` ni
  `buildings.json`. Por derivar de OSM, el archivo es ODbL 1.0.

Ejemplo, desde el modo `?debug` (ver [DESARROLLO.md](DESARROLLO.md#modo-de-depuración-debug)):

1. Abre `http://localhost:8080/?debug`, empieza la partida y toca el punto del mapa.
2. Pulsa «Copiar corrección» y pega el fragmento en `corrections` de
   `web/map-corrections.json`; renumera `id` (`fix-001`, `fix-002`…), ajusta `to` y
   rellena `reason`:

   ```json
   {
     "id": "fix-001",
     "op": "road.movePoint",
     "road": { "id": "141515046", "occurrence": 0 },
     "index": 3,
     "expect": [184.84, -157.36],
     "to": [185.2, -157.0],
     "reason": "la calzada invade la acera",
     "evidence": "ortofoto PNOA 2022-07",
     "date": "2026-10-06"
   }
   ```

3. Ejecuta los tres comandos de arriba. Operaciones: `road.set`, `road.movePoint`,
   `road.insertPoint`, `road.add`, `road.remove`, `area.movePoint` y
   `building.moveVertex`; las guardas de cada una, en KIT-FACHADAS.md (K7). Una corrección
   de `building.moveVertex` cambia el `footprintSha256` de esa parte: regenera
   `frontages.json` en el mismo commit (`node tools/export-facades.mjs`).

«Copiar anclaje» da `{ "front": …, "footprintSha256": … }` para un frente de
`facade-designs.json`; solo es válido si el frente está catalogado en `frontages.json`
(el panel lo indica).

## Reglas

- Los originales (ZIP/GML de Catastro, extracto OSM, recortes ráster IGN) se descargan a
  una carpeta fuera del repositorio y nunca se añaden a Git. Conservar URL, fecha,
  licencia y checksum, nunca credenciales.
- Python siempre con `uv`.
- Cualquier generador va seguido de `node tools/export-provenance.mjs` y de `npm test`.
  `export-provenance` copia `LICENSE` y `THIRD_PARTY_NOTICES.md` a
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
aceptadas en el overlay. Los filtros de aceptación proceden de `source-data/height-policy.json` y quedan en el
campo `acceptance` del overlay; no relajarlos para obtener más alturas. Detalle de las
partes aceptadas: [ALTURAS_PILOTO.md](ALTURAS_PILOTO.md).

El script escribe el campo `attribution` del overlay (CC BY 4.0) y `verify-world`
comprueba que llega igual a `data-sources.json`.

## 3. Catálogo de frentes

```fish
node tools/export-facades.mjs
```

Actualiza directamente `web/frontages.json` a partir de las capas y del juego; no hay
una segunda copia.

La política común de alturas se publica en los perfiles con
`node tools/export-height-policy.mjs`; la consumen también los conversores Python.

## 4. Procedencia y comprobación (siempre)

```fish
node tools/export-provenance.mjs
npm test
```

`verify-world` comprueba los checksums de capas y procedencia, las alturas base, que el
overlay y el catálogo apuntan a la instantánea actual de edificios, que las copias de
`web/` coinciden y que las licencias están incluidas. Además compara una huella fija de
la geografía (origen, límites, contornos, patios, plantas, vías con anchura y sentido,
áreas, monumentos y árboles) con `source-data/geometry-baseline.json`;
un cambio deliberado de geometría actualiza esa huella en su propio commit
(`node tools/export-geometry-baseline.mjs`, solo después de revisar el cambio).

Los casos de conversión de sentidos OSM se comprueban además con
`uv run --no-project python tests/verify-tools.py`.

Las comprobaciones en CPU no acreditan el render en GPU ni el comportamiento en móvil:
probar el juego en un navegador.

## 5. Terreno

`audit-terrain.py` lee el ASCII WCS original, incluidos multipart y centros de píxel;
`export-terrain.py` genera la rejilla Int16 y manifiesto deterministas sin dependencias
GIS nuevas. El paso es exactamente 10 m y `bounds` se redondea hacia fuera a
múltiplos de ese paso desde el origen, sin cambiar `world.bounds`. El original debe
cubrir todos los vértices: se rechaza un recorte insuficiente, sin extrapolación.
El runtime valida cobertura, paso y anclaje; la malla construida subdivide el paso
fuente conservando la esquina del manifiesto. Las funciones de coordenadas viven
en `core/math.js` y se reexportan desde `world/terrain.js` para respetar las capas.
`audit-terrain-surfaces.mjs` revisa pendientes, bases y perfiles sobre las
capas actuales. No se distribuyen los originales.

Los comandos, la copia de revisión y los pendientes están en
[TERRENO_PILOTO.md](TERRENO_PILOTO.md#reproducción). El exportador exige auditoría
validada para activar datos definitivos en `web/`; `--preview` permite solo revisión
provisional. La decisión se registra sobre la auditoría existente, sin rehacerla ni
perder su evidencia de servicio:

```sh
uv run --no-project python tools/audit-terrain.py --decision 'validado para el juego' \
  --decision-date AAAA-MM-DD --decision-note 'quién revisó y qué queda pendiente'
```

`audit-terrain-surfaces.mjs` toma esa decisión para su informe y falla si el terreno
publicado no es provisional y la auditoría no está validada. `export-terrain-metadata.mjs` actualiza los metadatos del manifiesto y
registra una huella independiente, seguida de `export-provenance.mjs`. Este último
admite `--directory` para una copia de revisión fuera del árbol publicado.

Pruebas del exportador: `uv run --no-project python tests/verify-terrain-tools.py`.
Las pruebas JS de contrato, malla y rampa están incluidas en `npm test`.
