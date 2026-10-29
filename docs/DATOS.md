# Reproducir los datos del juego

Qué contiene cada capa y de dónde sale: [MAP_SOURCES.md](MAP_SOURCES.md). Licencias:
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). Este documento solo describe cómo
regenerar los datos.

## Capas

El navegador carga `web/world.json`, un manifiesto que referencia las capas
`buildings.json` (Catastro) y `osm-world.json` (OSM) con sus checksums. Sus límites se describen
con `bounds`, una lista no vacía de
rectángulos `[x0, x1, z0, z1]` finitos y de área positiva; hoy contiene uno,
`[-820, 671.835, -1120, 650]`, la caja que envolvía el centro, Santa Ana y el norte
(Puente VII Centenario y ferial). La pertenencia se consulta sobre la unión,
mientras que mapa y cobertura del terreno usan la caja envolvente. `prepare-world.mjs`
genera este formato y admite también entradas antiguas con `size`; el cargador
conserva esa compatibilidad para copias locales. Carga además la
ortofoto por teselas de `aerial/` (índice y vista general al arrancar, teselas alrededor
del jugador), `facade-profiles.json` (paleta y política de alturas propias,
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
(formato en [KIT-FACHADAS.md](KIT-FACHADAS.md)).

Orden al editarlos:

```fish
node tests/verify-design.mjs        # valida la estructura de los archivos editados
node tools/export-provenance.mjs    # recalcula los SHA-256 de data-sources.json
npm test                            # comprobaciones cruzadas con las capas de base
```

(`npm test` antes de `export-provenance` falla solo por el checksum desfasado.) Un cambio de
aspecto no idéntico va en un commit `feat` propio; ver las condiciones en
[PLAN-MODULAR.md](historico/PLAN-MODULAR.md#111-decisiones-tras-la-parada-de-24-6102026).

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

### Variación estable de edificios

Cada parte de `buildings.json` lleva `paletteIndex`, un índice ya resuelto de
`city-design.json.buildings.palette`. El navegador solo lee ese entero; no calcula
identidades ni muestras aleatorias de color al cargar los edificios.

`tools/prepare-world.mjs` resuelve los índices con `tools/building-variation.mjs`.
Su entrada de compatibilidad es `source-data/building-variation.json`:
`version: 1` y `paletteAssignments` (identidad SHA-256 → índice de paleta). Este catálogo
no se publica. Conserva las asignaciones iniciales y no se recalcula al añadir fachadas
ni al reconstruir el mapa. En `city-design.json.buildings.variation` queda solo `seed`,
un entero sin signo de 32 bits para los contornos sin asignación.

La identidad normaliza el inicio y orientación de cada anillo y el orden de los patios;
no usa índice de parte, plantas, altura ni detalle. Un contorno modificado recibe otra
identidad; las asignaciones antiguas pueden conservarse para recuperar un diseño
anterior. Para consultar una identidad desde Node, importar `buildingIdentity` de
`tools/building-variation.mjs` y pasar una parte con `p` y `holes`.

Después de cambiar la paleta, la semilla o el catálogo:

```sh
node tools/prepare-world.mjs
node tools/export-provenance.mjs
npm test
```

Cuando solo cambia la apariencia y se conservan exactamente el origen y los demás
campos de las partes, el generador actualiza el checksum de edificio en las capas de
alturas, su auditoría y el catálogo de frentes que apuntaban a la versión anterior.
Si cambia la geometría, no renueva esas referencias: se deben regenerar los derivados
por el procedimiento habitual. Contornos, patios, plantas, alturas y relieve no se
modifican al resolver los índices.

`randomSeed` fija por separado el inicio de la secuencia de vegetación y actores.
La migración desde `main b007ac5` conserva 7.683 muestras de paleta y fija esa semilla
a `2165021796`, el estado que antes quedaba tras consumirlas desde `7631`.
`tests/verify-building-variation.mjs` compara los 11.771 índices contra la referencia
capturada en `60c3e7a` y ampliada con el mapa del 29/10/2026 (los 7.692 edificios
anteriores conservan su índice) (`source-data/building-variation-baseline.json`), exige conservar
la semilla del entorno y ejecuta una sonda aislada de vegetación y 600 pasos de actores.
La referencia no se regenera automáticamente: solo se actualiza si se adopta
deliberadamente otro mapa, diseño de colores o comportamiento del juego.

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
uv run --no-project --with pyproj==3.8.0 --with shapely==2.2.0 python tools/rebuild-map.py --catastro ~/.cache/chiclana-vice/sources/catastro-chiclana.zip --osm ~/.cache/chiclana-vice/sources/osm-ampliado.xml
```

Las versiones van fijadas porque de ellas depende la geometría exacta. Con estos
originales (Catastro del 4/10/2026, el ZIP del municipio entero, y OSM del 8/10/2026) y
estas versiones se reproducen las capas publicadas. Recorta con la unión de los
rectángulos de `world.json.bounds`, o los de `--bounds` (JSON) si se indican; los bordes
compartidos no cortan vías ni edificios. Cada área lleva su ID de OSM. Lee las partes de edificio sin extraer el ZIP, conserva las plantas y transforma los
contornos a coordenadas de juego. Escribe `rebuilt-city.json` en la raíz (ignorado por
Git); no sustituye el mapa. Revisarlo y, si se adopta deliberadamente:

```fish
node tools/prepare-world.mjs rebuilt-city.json
```

Sin argumento, `prepare-world.mjs` vuelve a escribir las capas actuales y recalcula sus
checksums; no las regenera desde originales.

## 2. Alturas IGN (opcional)

Descarga solo un recorte WCS pequeño de la zona (nunca el mosaico nacional) a una caché
fuera del repositorio, por defecto `~/.cache/chiclana-vice/ign`:

```fish
uv run --no-project --with rasterio==1.5.2 --with pyproj==3.8.0 --with shapely==2.1.2 --with numpy python tools/audit-ign-heights.py --download --overlay web/height-samples.json
```

Escribe la auditoría completa en `source-data/height-audit-ign.json` y las entradas
aceptadas en el overlay. Los filtros de aceptación proceden de `source-data/height-policy.json` y quedan en el
campo `acceptance` del overlay; no relajarlos para obtener más alturas. Detalle de las
partes aceptadas: [ALTURAS_PILOTO.md](ALTURAS_PILOTO.md).

El script escribe el campo `attribution` del overlay (CC BY 4.0) y `verify-world`
comprueba que llega igual a `data-sources.json`.

El overlay enlaza los edificios por índice y por la huella de `buildings.json`: tras
cualquier reconstrucción hay que volver a ejecutarlo (sin `--download` si el recorte
sigue en la caché). Si se descarga de nuevo y su SHA-256 coincide con `sourceSha256`,
se conserva la fecha de consulta original en el archivo `.access-date` de la caché.
Las versiones van fijadas a las registradas en el campo `versions` del overlay.

## 3. Catálogo de frentes

```fish
node tools/export-facades.mjs
```

Actualiza directamente `web/frontages.json` a partir de las capas y del juego; no hay
una segunda copia.

La política común de alturas se publica en los perfiles con
`node tools/export-height-policy.mjs`; la consumen también los conversores Python.

## 4. Ortofoto por teselas (opcional)

```sh
uv run --no-project --with pillow python tools/aerial-tiles.py
```

Después, el paso 5.

El generador lee `world.json.bounds` y usa su unión para seleccionar la rejilla de
255 m anclada al origen. Guarda respuestas originales del WMS y GetFeatureInfo en
`~/.cache/chiclana-vice/pnoa/`, identificadas por SHA-256 de la URL completa; descarga
solo las ausentes, con un máximo de dos peticiones simultáneas. Ante respuestas 5xx
o errores de red hace hasta tres reintentos, con esperas de 2, 4 y 8 segundos;
los demás errores HTTP se propagan sin reintento. No añade dependencias
al proyecto. Si falla una consulta, se puede repetir el comando usando la caché.

El vuelo esperado es la constante `FLIGHT` del generador (hoy `2025-07`) y la caché va en
una subcarpeta por vuelo (`~/.cache/chiclana-vice/pnoa/2025-07/`): el WMS sirve el mosaico
vigente con la misma URL, y al cambiar de vuelo no deben reutilizarse imágenes antiguas.
Antes de escribir datos comprueba que todos los centros declaran ese vuelo y
que cada par de teselas vecinas se alinea en su franja común (41 m, 164 píxeles a
0,25 m). Busca el máximo de correlación normalizada de luminancia en ±2 píxeles y
estima el pico subpíxel mediante parábolas por eje. Exige desplazamiento menor de
0,25 píxeles y diferencia absoluta media menor o igual a 20 sobre 255; un píxel de
desplazamiento se rechaza. No depende de otra ortofoto, así que sirve para teselas
nuevas fuera del área actual. Son comprobaciones de coincidencia de imágenes, no de
precisión topográfica. El informe queda en `/tmp/chiclana-aerial-alignment.json`.

`web/aerial/index.json` declara rejilla, margen, resoluciones, coordenadas de teselas,
recuadro y dimensiones de la vista general, fecha de vuelo, fecha de consulta,
servicio y SHA-256 de cada JPEG. `hi/` conserva los JPEG WMS de 1184 × 1184 sin
recompresión (296 m de lado con margen de 20,5 m); `lo/` deriva 592 × 592 con Lanczos
y JPEG calidad 82. `general.jpg` cubre la caja envolvente a aproximadamente 1 m/píxel,
con dimensiones redondeadas hacia arriba y máximo de 2048 por lado.

`verify-world` comprueba cobertura, inventario de archivos, SHA-256 y dimensiones JPEG.
Con la caché completa, regenerar da los mismos bytes.

## 5. Procedencia y comprobación (siempre)

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

## 6. Terreno

`mdt-tiles.py` descarga a la caché las teselas nativas del MDT05 (UTM 30N, 500 m) que
faltan para cubrir `world.bounds`; ampliar el mapa solo añade teselas. `audit-terrain.py`
lee esas teselas (o un ASCII WCS antiguo), comprueba que se alinean con la rejilla
nativa y que coinciden donde se solapan; `export-terrain.py` genera la rejilla Int16 y
el manifiesto deterministas. Ambos fijan pyproj 3.8.0 para la conversión a UTM. El paso es exactamente 10 m y `bounds` se redondea hacia fuera a
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

## 7. Candidatos de copas (G5.1, sin publicar)

```sh
UV_CACHE_DIR=/tmp/g5-arboles/uv-cache uv run --no-project --with numpy --with pillow --with scipy --with shapely --with rasterio --with pyproj python tools/detect-tree-crowns.py
node tools/export-provenance.mjs
npm run check
UV_CACHE_DIR=/tmp/g5-arboles/uv-cache uv run --no-project --with numpy --with pillow --with scipy --with shapely --with rasterio --with pyproj python tests/verify-tree-tools.py
```

Genera `source-data/tree-candidates.json`, nunca `web/vegetation.json`. Conserva SHA-256
por entrada, versiones Python, fecha del vuelo y parámetros; no descarga imágenes.
`--output ruta` permite comparaciones fuera del repositorio; `--opening 2` reproduce
la apertura de G5.0. `--audit-dir /tmp/g5-arboles/filtro` escribe por tesela
centros de la segmentación anterior, área, textura, sombra y primer motivo de
descarte (`área`, `textura`, `sombra`); incluye márgenes y puntos fuera del mundo.
El radio equivale a la superficie segmentada, no a una medida
de altura. `score` es el ExG medio, no una probabilidad de que sea un árbol.

Combinación IGN (13/10/2026): añade `--download` la primera vez para obtener
`~/.cache/chiclana-vice/ign/chiclana-ign-mdsn-v025-first.tif` y su `.access-date`.
Sin el flag reutiliza la caché y falla si falta. Solo admite GeoTIFF georreferenciado
EPSG:3042 de 2,5 m, hasta 10 MB y 1.000 × 1.000 celdas, cubriendo el mundo con margen.
El recorte se solicita con GetCoverage desde los límites actuales más 20 m; nunca
se guarda en Git. Se necesitan también `--with rasterio --with pyproj`.

Conserva `(pieza amplia y máximo IGN ≥ 3 m) o filtro de imagen`, y guarda `ign`
(en metros, `null` sin muestras válidas) y `source` (`ign`, `imagen`, `ambos`).
La ventana elegida es centro ±1 celda; comparación y límites temporales en
[MAP_SOURCES.md](MAP_SOURCES.md#candidatos-de-copas-en-revisión-g51).
`--audit-dir /tmp/g5-arboles/combinado` guarda medidas y motivos de imagen de
cada pieza; `source: null` identifica descartes evaluados dentro del núcleo y mundo.
Tras regenerar, actualiza `candidatesSha256` de `source-data/tree-review.json`
solo si la revisión está vacía; con decisiones existentes se requiere revisión
explícita porque cambian los candidatos. Las pruebas sintéticas cubren además
máximo, nodata, bordes, vecino lejano, unión de filtros y proyección de la consulta.
Las 16 pruebas sintéticas pasan con rasterio y pyproj; la salida combinada se
reproduce byte a byte con el mismo recorte y versiones. Se comprobaron además IDs
únicos, separación global de 3 m, coherencia de `source`, recuentos y SHA de revisión.
Las comparaciones y tablas siguientes corresponden exclusivamente al filtro de
imagen anterior, no al resultado combinado.

Calibración histórica del filtro de imagen tras la revisión del usuario (13/10/2026): las imágenes
`/tmp/g5-arboles/filtro/{tesela}-antes.jpg` conservan los anillos originales;
`{tesela}-despues.jpg` muestran verde = conservado y rojo = descartado, con motivo.
Los JSON `*-audit.json` permiten consultar las medidas. No se incorporan imágenes
ni datos de revisión ficticios al repositorio. Se preparó el detector experimental
y las comparaciones en `/tmp` antes de sustituir el script del repositorio.

Se inspeccionaron `-1_-2` (campo de fútbol y alineación sur del río), `-1_1`
(pistas del complejo deportivo), `-2_1` (parque y jardineras), `2_0` (plaza de
pavimento geométrico de tonos verdosos y pistas), `1_0` (bordes del río) y `0_-1`
(palmeras de la Alameda). Los rectángulos se expresan en píxeles de las imágenes
originales de 1184 × 1184, con origen arriba a la izquierda; no son reglas del filtro.

El campo, recorte `[930,270,1150,450]` de `-1_-2`, tiene desviación local mediana
4,17/255 y ExG mediano 0,279. El pavimento, recorte `[310,470,420,560]` de `2_0`,
tiene ExG mediano 0,030: ya queda fuera del umbral en su interior, aunque los bordes
vegetales requieren revisión. En las jardineras `[675,160,780,230]` de `-2_1`
se ven piezas de 3,12–5,94 m² eliminadas por el nuevo mínimo y otras de 7,25–19,31 m²
que todavía pasan. No se afirma que toda vegetación de ese recorte sea arbusto.

Para cuantificar pérdidas se marcaron dos muestras pequeñas de seis copas visibles
cada una; no es un censo de las teselas completas. Centros aproximados `(u,v)`:

- Calle, `-1_-2`: `(226,652)`, `(265,667)`, `(309,683)`, `(345,703)`, `(386,709)`, `(436,743)`.
- Parque, `-2_1`: `(537,268)`, `(577,266)`, `(626,266)`, `(661,264)`, `(693,261)`, `(718,263)`.

Se considera localizada una copa cuando un centro de candidato queda a una distancia
≤ max(8, min(4r, 16)) píxeles del punto marcado. Se publican aquí los puntos y el
criterio para evitar confundir número de candidatos con número de árboles reales.
En calle se localizan 6/6 antes y 6/6 después; en parque 3/6 antes y 2/6 después:
se pierde **una copa real adicional** de las nueve localizadas inicialmente; tres
copas de parque ya faltaban. Los puntos de muestra están numerados en
`/tmp/g5-arboles/filtro/muestra-{calle,parque}-{antes,despues}.jpg` y guardados en
`muestras-reales.json`. Esto no cuantifica las pérdidas en toda la extensión, donde
la inspección de los anillos muestra más copas reales rechazadas por sombra.

| Categoría | Antes | Después |
| --------- | ----: | ------: |
| Parque    | 1.357 |     526 |
| Plaza     |    99 |      32 |
| Calle     |   881 |     273 |
| Otro      | 1.866 |     474 |
| Total     | 4.203 |   1.305 |

| Tesela inspeccionada | Antes | Después |
| -------------------- | ----: | ------: |
| `-1_-2`              |   178 |      59 |
| `-1_1`               |   229 |      51 |
| `-2_1`               |   524 |     225 |
| `1_0`                |   181 |      33 |
| `2_0`                |   147 |      54 |
| `0_-1`               |    31 |       5 |

En el interior del campo `[930,270,1150,450]` desaparecen los cuatro candidatos; en la pista verde de `2_0`,
recorte `[50,740,170,850]`, pasan de 14 a 0.
En el recorte de jardineras `[675,160,780,230]` bajan de 7 a 3: no basta para separar
arbustos grandes de árboles. La plaza de pavimento geométrico de `2_0` sirve de
control negativo: su interior ya queda excluido por color; un punto del borde
`[280,490,400,680]` pasa de 1 a 0. No se atribuye al filtro una mejora sobre un
pavimento que el detector anterior ya rechazaba. Las superficies deportivas lisas
se eliminan por textura, pero las copas densas y palmeras siguen dando pérdidas.
La revisión `source-data/tree-review.json` permanece vacía; solo se actualiza su SHA.

Las pruebas sintéticas de `tests/verify-tree-tools.py` cubren coordenadas, segmentación,
exclusiones, separación, área pequeña, superficies lisas, textura, dirección de sombra,
sombra ausente, sombra sobre edificio y oscuridad desconectada. Se ejecutan aparte
con el comando `uv` anterior: `package.json` solo encadena verificadores Node;
las otras pruebas Python (`verify-tools.py`, `verify-terrain-tools.py`) también son
manuales y no hay precedente de NumPy/SciPy en `npm test`. No se fuerza su instalación
ni se modifica la CI. `npm run check` sigue siendo obligatorio además de estas pruebas.

## 8. Revisión de copas (G5.2, archivo de autor)

1. Sirve `web/` como se indica en DESARROLLO y abre `http://localhost:8080/?debug`.
   Pulsa «Revisar copas»; carga `source-data/tree-candidates.json` en «Candidatos
   locales» y después `source-data/tree-review.json` en «Revisión existente».
   El selector permite abrir archivos fuera de la carpeta servida; no hay que copiarlos
   a `web/`. Usa la vista aérea para comparar los anillos con la ortofoto.
2. Amarillo = pendiente, verde = centro dentro de una zona aceptada, rojo = exclusión
   individual (prevalece sobre cualquier zona). Los rectángulos aceptados llevan borde
   cian. Los radios y centros son estimados; los anillos se dibujan sobre el terreno y
   visibles a través de edificios para facilitar la revisión.
3. Para aceptar una zona, escribe un nombre único y `x0, x1, z0, z1`, en metros,
   y pulsa «Aceptar rectángulo». «Rellenar rectángulo del piloto» coloca
   `zones.frontagePilot` de `city-design.json` en esos campos: **no lo acepta**.
   Revisa esa zona antes de aceptarla. Puedes quitar una zona con el selector y
   «Quitar zona seleccionada». Los límites del rectángulo están incluidos.
4. Toca cerca del centro de un anillo (si hay varios se elige el más cercano) y pulsa
   «Excluir / restaurar candidato». El identificador y estado aparecen en el panel.
   Un arrastre de cámara no selecciona candidatos.
5. «Descargar tree-review.json» guarda el borrador. Sustituye con esa descarga
   `source-data/tree-review.json` y ejecuta `npm run check`. El navegador **no escribe
   en el repositorio**: hasta descargar, los cambios solo están en memoria; cargar
   candidatos de nuevo reinicia el borrador. Para continuar, vuelve a cargar candidatos
   y la revisión guardada. No hay guardado automático ni persistencia local oculta.

El archivo de autor lleva `version: 1`, `candidatesSha256` (SHA-256 de los bytes UTF-8
exactos del archivo de candidatos), `acceptedZones: [{ id, rect }]` y
`excludedCandidates: [id]`. `tests/verify-design.mjs` valida la instantánea, zonas
finitas de área positiva, identificadores únicos y exclusiones conocidas. Si se
regeneran candidatos y cambia el SHA, hay que revisar una nueva instantánea: no se
trasladan decisiones silenciosamente. La revisión inicial estaba vacía; el usuario acepta toda la instantánea
en G5.3 (13/10/2026), incluida la zona del piloto.

Comprobaciones G5.1–G5.2: regeneración byte a byte idéntica, pruebas Python sintéticas
(coordenadas, brillo, exclusión y separación de copas), `npm run check` antes de cada
commit y flujo de revisión en Chrome sin interfaz con SwiftShader (carga de los dos
archivos, rectángulo del piloto, selección, exclusión/restauración, visibilidad y
JSON descargado). La aceptación del piloto usada en esa prueba no se conserva en el
archivo de autor. No se ha revisado manualmente todo el arbolado ni se ha probado
GPU física o móvil; la medición de presupuesto de G5.3 se documenta aparte.

## Copas publicadas (G5.3)

`source-data/tree-review.json` acepta zonas rectangulares (`id`, `rect` con
`[x0, x1, z0, z1]`) y permite excluir candidatos por ID en `excludedCandidates`.
La revisión debe corresponder al SHA-256 de `tree-candidates.json`; una exclusión
prevalece sobre cualquier zona. La zona `todo-el-mundo` cubre la caja de todos los
límites actuales, sin exclusiones, por decisión del usuario del 13/10/2026.

```sh
node tools/export-vegetation.mjs
node tools/export-provenance.mjs
npm test
```

El generador publica `web/vegetation.json` con centros y radios redondeados a
0,01 m, sin puntuaciones ni campos de revisión. Conserva fuente y atribución.
Tras regenerar candidatos, revisa de nuevo y actualiza la huella de la revisión;
no reutilices exclusiones sobre otra instantánea sin comprobar sus IDs.

## 9. Usos de los bajos (F2b)

```sh
uv run --no-project --with pyproj --with shapely python tools/export-ground-floors.py --catastro ~/.cache/chiclana-vice/sources/catastro-chiclana.zip --osm ~/.cache/chiclana-vice/sources/osm-ampliado.xml
node tools/export-provenance.mjs
npm test
```

Publica `web/ground-floors.json` sin tocar `buildings.json`. Se regenera cada vez que cambia
`buildings.json` (guarda su SHA-256 y `tests/verify-ground-floors.mjs` lo comprueba). Formato:

- `uses`: valores de `currentUse` que aparecen, ordenados.
- `parts`: una tupla `[índice en uses, units, dwellings]` por parte de `buildings.json`, en
  su mismo orden (`parts[k]` es `buildings[k]`, sin índice ni huella por parte: basta
  `buildingsSha256`); `units` es `numberOfBuildingUnits` y `dwellings`
  `numberOfDwellings`. `null` si la parte no encaja con ningún edificio catastral.
- `shops`: puntos `[x, z, tipo, nombre]` de OSM en metros locales, dentro de `bounds`, con la
  marca como quinto elemento si OSM la indica; `tipo` es `shop:*`, `office:*`, `craft:*` o
  `amenity:*` (hostelería, banca, farmacia, sanidad…) y `nombre` el `name` de OSM o `null`.
- `zoneKinds` (`["industrial", "retail"]`) y `zones`: un entero por parte, 0 sin indicio y
  `n > 0` para `zoneKinds[n - 1]`, del edificio de OSM (`building=industrial|warehouse|retail`)
  o, si no hay, del área `landuse=industrial|retail` que contiene el centroide de la parte.
- `fuel`: gasolineras (`amenity=fuel`) dentro de `bounds`, `{x, z, name, brand, outline}`;
  `outline` es el contorno si OSM la dibuja como área, o `null`.
- Más `version`, `origin`, `buildingsSha256`, `source`, `license`, `attribution` y `limits`.

El juego la carga como `world.groundFloors` (opcional): `uses`, `parts` y `shops` deciden la
clase y el tipo de los bajos, `zones` la de los edificios (naves, grandes superficies y bodegas)
y los nombres de `shops` los rótulos de los comercios. Con `fuel` se busca la parte del Catastro
que es la marquesina de cada gasolinera (`js/world/fuel.js`).

## 10. Vías y paradas del tranvía

```sh
uv run --no-project --with shapely python tools/export-tram.py --osm ~/.cache/chiclana-vice/sources/osm-ampliado.xml
node tools/export-provenance.mjs
npm test
```

Publica `web/tram.json` (ODbL, como `osm-world.json`) solo con lo que cae dentro de
`world.json:bounds`; `tests/verify-tram.mjs` comprueba formato, atribución y límites. Formato:

- `tracks`: `{id, bridge, gauge, p}`, eje de cada vía (`railway=tram`) en metros locales,
  recortado al mundo (un recorte con varias partes añade el sufijo `.n` al `id`); `gauge` en
  metros.
- `platforms`: `{id, bridge, shelter, p}`, contorno del andén (`railway=platform`).
- `stops`: `{id, name, x, z, platform}`, paradas (`railway=tram_stop`) con el andén más
  cercano a menos de 40 m.
- `crossings`: `{id, kind, x, z}`; `level` (`tram_level_crossing`) o `pedestrian`
  (`tram_crossing`).
- Más `version`, `origin`, `source`, `license`, `attribution` y `limits`.

El juego la carga como `world.tram` (opcional; sin ella no hay tranvía).

## 11. Pasos de peatones que faltan

`street-objects.json` no tiene generador propio. `tools/complete-crossings.py` añade a esa
capa, sin tocar el resto, los nodos `highway=crossing` de OSM dentro del mundo que aún no
estén (a menos de 1 m de uno existente); es idempotente.

```sh
uv run --no-project --with shapely python tools/complete-crossings.py --osm ~/.cache/chiclana-vice/sources/osm-ampliado.xml
node tools/export-provenance.mjs
npm test
```

## 12. Semántica de las vías ya publicadas

```sh
uv run --no-project python tools/export-road-semantics.py --osm ~/.cache/chiclana-vice/sources/osm-ampliado.xml
node tools/export-provenance.mjs
npm test
```

Añade `junction: "roundabout"`, `tunnel: true` y `layer` cuando existen en el OSM local,
por el identificador de cada vía de `osm-world.json`, sin volver a recortar edificios ni
regenerar los ejes. Actualiza el checksum OSM de `world.json`; es idempotente. Si se vuelve
a generar todo el mapa, ejecutar este paso después de `prepare-world.mjs`.

`map-corrections.json` admite también `area.remove`, con `area: {index, expectFirst}` y
`expectKind`. Retira el área solo en memoria después de comprobar el índice, el primer
vértice y el tipo. La cubeta de la Alameda usa esa operación por petición del usuario;
no se borra de la capa OSM publicada. Si se retira una cubeta, quitar también su anclaje
correspondiente de `city-design.json.terrainSurfaces.water.features`.

El conversor comprueba que solo cambian etiquetas y checksums antes de renovar los hashes
de entrada de `tree-candidates.json` y la huella de su revisión. No cambia candidatos,
identificadores ni decisiones. Una diferencia de geometría obliga a regenerar y revisar
las copas; `--previous-osm` y `--previous-world` permiten aportar las instantáneas derivadas
anteriores para una migración inicial de metadatos. No son originales OSM ni Catastro.
