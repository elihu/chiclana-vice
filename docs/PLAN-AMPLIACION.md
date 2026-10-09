# Plan: ortofoto por teselas y ampliación del mapa

Fecha: 8/10/2026. Desarrolla [ESTUDIO-AMPLIACION.md](ESTUDIO-AMPLIACION.md). Las
referencias de línea de las fases pendientes son de `main` en `37e751b`, con las fases 0
a 3 ya integradas.

Lee antes `AGENTS.md`, `docs/DESARROLLO.md`, `docs/DATOS.md`, `docs/MAP_SOURCES.md`,
`tools/AGENTS.md`, [SUPERFICIES_TERRENO.md](SUPERFICIES_TERRENO.md) y
[TERRENO_PILOTO.md](TERRENO_PILOTO.md).

## Cómo ejecutar este plan

- **Una fase = una rama** en el repositorio principal, como indican `AGENTS.md` y
  [GIT_WORKFLOW.md](GIT_WORKFLOW.md): desde `main` limpio, `git switch -c` con el nombre
  de la fase. Sin worktrees ni `stash`; si el árbol no está limpio u otra rama está en
  curso, preguntar. Un commit por paso. Sin push, merge ni rebase: la integración la pide
  el usuario.
- **Refactors**: antes de cambiar código, generar referencias fuera del repositorio con
  `node tools/scene-fingerprint.mjs --out /tmp/…`, con relieve y sin él (apartando
  temporalmente `web/terrain.json` y `web/terrain.bin` y restaurándolos). Al terminar,
  `--compare` debe dar huella idéntica en ambos casos.
- Cada paso indica archivos, cambios, verificación y commit. Si una verificación falla y
  no se puede resolver dentro del paso, parar y entregar el diagnóstico.
- `npm run check` pasa en el último commit de cada fase. Las referencias de línea son
  orientativas; contrastarlas con el árbol al empezar.
- Los pasos marcados **«revisión del usuario»** no se cierran sin su prueba en navegador.
- No se afirma rendimiento de GPU ni de móvil sin medirlo en un dispositivo.

## Decisiones

- **D1. Rejilla común de 255 m** anclada en el origen: la tesela `(i, j)` cubre
  `x ∈ [255·i, 255·(i+1))` y `z ∈ [255·j, 255·(j+1))`. Equivale a tres celdas de 85 m
  de `buildBuildings` (`web/js/world/buildings.js:35`), así que cada grupo de edificios
  pertenece a una sola tesela. La misma rejilla servirá para cargar edificios por zonas.
- **D2. Ortofoto PNOA a 0,25 m/píxel**, la resolución real del vuelo de 2022-07. Cada
  tesela de escritorio cubre 255 m más un margen de 20,5 m por lado (296 m), en
  1184 × 1184 píxeles; la de móvil y modo ligero, en 592 × 592 (0,5 m/píxel). Así el
  interior de la tesela empieza en un píxel entero (82 y 41) y los lados son múltiplos
  de 16, el bloque de JPEG.
- **D3. Vista general siempre cargada**: una imagen de todo el mapa a ~1 m/píxel
  (máximo 2048 × 2048). Hace de fondo mientras llegan las teselas, se usa en el mapa (M)
  y sirve de respaldo si una tesela falla. Sustituye a `aerial.jpg` y `aerial-2048.jpg`.
- **D4. UV de mundo**: el suelo y los tejados conservan las UV de mundo. Cada tesela es
  una textura con `offset` y `repeat` que lleva esas UV a su recuadro.
- **D5. Tejados que sobresalen** de su tesela: con la regla de reparto de
  `buildBuildings` (celda de 85 m por el centro del recuadro) y 20,5 m de margen, solo 6
  de 7.448 partes se salen, con un exceso máximo de 20,1 m (medido el 8/10/2026; la
  cifra anterior de 525 no correspondía a esa regla). Esas partes van a un grupo aparte
  que usa siempre la vista general. La herramienta lo comprueba.
- **D6. Carga por radio** con presupuesto: se cargan las teselas a menos de R del
  jugador (300 m en escritorio, 220 m en móvil), con el centro adelantado
  velocidad × 2 s en la dirección de marcha. Máximo 12 teselas en escritorio y 9 en
  móvil; se libera la más lejana con `dispose()`. Como mucho, dos descargas a la vez.
- **D7. Límites como rectángulos**: `world.json` pasa de `size` a `bounds`, una lista de
  rectángulos `[x0, x1, z0, z1]`. El primero es el actual (±671,835 por ±500,94). El
  origen y las coordenadas actuales se conservan.
- **D8. Anexos de la primera ampliación**: Santa Ana `[-420, -60, 500.94, 650]` y norte
  (Puente VII Centenario y ferial) `[-820, -380, -1120, -500.94]`. Se pueden recortar
  tras revisar la ortofoto.
- **D9. Terreno troceado por teselas**: la malla del relieve se construye por teselas D1
  sobre toda la rejilla del terreno (la caja envolvente de `bounds` redondeada a 10 m),
  con los vértices de borde compartidos, y cada trozo usa el material de su tesela (D4).
  Donde no hay tesela, porque ningún rectángulo la toca, el trozo usa la vista general.
  El faldón exterior sigue en el borde de la rejilla: es un rectángulo, así que su
  extrusión radial no se solapa. (Antes se proponía construir solo los trozos que tocan
  un rectángulo y llevar el faldón al contorno de la unión; con anexos ese contorno no
  es convexo, la extrusión radial se cruzaría con el terreno y quedarían huecos entre
  el faldón y los trozos.)
- **D10. Rejilla del relieve anclada al origen** (nueva). El paso de datos es exacto,
  10 m, y la malla construida mide 5 m (`meshSubdivisions: 2`). Ambos son múltiplos
  desde el origen, así que los bordes de tesela de 255 m (51 celdas de malla) caen sobre
  vértices. El manifiesto declara su esquina mínima en `bounds` y debe **contener** los
  límites del mundo, no igualarlos. Implementada en la fase 0.
- **D11. Anclajes estables al reconstruir** (nueva). Las áreas llevan su ID de OSM y los
  anclajes de diseño de áreas (`areaAnchor` de plataformas y cubetas) pasan a `areaId`.
  Los anclajes por vértice e índice siguen como comprobación, no como identidad. Se hace
  en la reconstrucción de la fase 4: es cuando se pueden obtener los IDs.

Memoria de GPU estimada: unos 90–110 MB en escritorio (9–12 teselas y la vista general)
y unos 25 MB en móvil, frente a unos 67 y 13 MB hoy.

## Fase 0: relieve preparado para límites no centrados (completada)

Integrada el 8/10/2026 y revisada por el usuario. Estado resultante, del que parten las
fases siguientes:

- La rejilla del terreno se lee siempre desde su manifiesto: `gridX`, `gridZ`,
  `gridColumn` y `gridRow` (`web/js/core/math.js`) usan la esquina `bounds[0]`/`bounds[2]`.
  Ningún módulo supone una rejilla centrada.
- `tools/export-terrain.py` escribe una rejilla de 10 m exactos anclada al origen que
  cubre el mundo redondeado hacia fuera (hoy `bounds: [-680, 680, -510, 510]`, 137 × 103).
  La malla construida mide 5 m. `createTerrain` exige anclaje y cobertura del mundo.
- La transición hacia una plataforma mide siempre `smoothingRadius` y continúa por las
  vías vecinas. `tests/verify-surface-junctions.mjs` impone uniones sin saltos (≤ 5 cm)
  y perfiles sin escalones (≤ 0,3 m en 1 m) con los datos reales.
- El faldón exterior (`terrainExterior`) sigue el borde de la rejilla del terreno, no el
  del mundo.

## Fase 1: límites con rectángulos

Rama `refactor/limites-rectangulos`. Es un refactor: el juego, la escena y los datos
quedan idénticos.

### Paso 1.1: `bounds` sin cambiar el área

- **`world.json`** describe los límites con `bounds`, una lista de rectángulos
  `[x0, x1, z0, z1]`, con un solo rectángulo igual al actual (±671,835 × ±500,94). Se
  genera con `tools/prepare-world.mjs` (:39), no a mano, seguido de
  `node tools/export-provenance.mjs`. El cargador acepta también el `size` antiguo para
  no romper copias locales.
- **Nuevo `web/js/world/bounds.js`**, en el importmap y los `modulepreload` de
  `web/index.html`, con `insideBounds(x, z, pad)`, `boundsBox()` (caja envolvente) y
  `nearEdge(x, z, d)`. Sustituye cada uso de `worldW`, `worldH` y del tamaño del mundo:
  - `web/js/app.js:85` y `web/js/core/state.js:76-77`;
  - `web/js/world/spatial.js:91` (colisión con el borde);
  - `web/js/ui/hud.js:69` (aviso de salida);
  - `web/js/ui/map.js:19-79` (mapa y minimapa, dibujados sobre la caja envolvente);
  - `web/js/world/furniture.js:34-35` y `web/js/world/vegetation.js:66-67` y `:175-176`;
  - `web/js/world/terrain-mesh.js:8` (plano del modo sin relieve).
- **Coordenadas de textura de la ortofoto**: las de los tejados
  (`web/js/world/buildings.js:93`) y las del suelo (`web/js/world/terrain-mesh.js:21-22`)
  dependen del recuadro que cubre la imagen, no del mundo. Se expresan con un recuadro
  propio de la ortofoto (por ejemplo `aerialBox`), que hoy coincide con la caja envolvente.
- **Terreno**: `web/js/world/terrain.js:26-31` exige que el terreno cubra la caja
  envolvente y compara `manifest.size` con el tamaño de esa caja. `tools/export-terrain.py`
  toma la caja de `bounds` en lugar de `size`. Reexportar a `/tmp` desde el original
  (`~/.cache/chiclana-vice/mdt/original.bin`, SHA-256 `71572c05…`) debe dar exactamente los bytes
  de `web/terrain.bin` y `web/terrain.json`; si el original no está, informar sin
  descargarlo. `web/terrain.*` no se regenera.
- **Sin tocar**: `terrainExterior` (`web/js/world/terrain-mesh.js:41-64`) sigue en el
  borde de la rejilla del terreno, y ahí se queda (D9).
- **Tests y herramientas** que usan el tamaño del mundo: `tests/verify-world.mjs:103`,
  `tests/verify-geography.mjs:9`, `tests/verify-surfaces.mjs:163`,
  `tests/verify-terrain.mjs:133`, `tests/verify-terrain-runtime.mjs:11` y `:27`, y
  `tools/browser-smoke.mjs:116`.
- **Tests nuevos de `bounds.js`** con dos rectángulos, aunque los datos solo tengan uno:
  punto dentro de cada uno, fuera, en el hueco entre ambos, con margen y caja envolvente.
- **Verificación**:
  - huella de escena idéntica con relieve y sin él (ver «Refactors»);
  - `npm run check`;
  - `tools/browser-smoke.mjs URL google-chrome-stable --surfaces` y `--surfaces --low`
    sirviendo `web/` en un puerto libre, sin errores;
  - ningún uso de `worldW`, `worldH` ni `city.size` fuera de `bounds.js` y del cargador,
    comprobado con `grep` e incluido en el informe.
- **Documentación**: `docs/DESARROLLO.md` (mundo y límites) y `docs/DATOS.md` (formato de
  `world.json`). `docs/ESTADO.md` no se edita en la rama.
- **Commit**: `refactor(juego): describir los límites del mundo con rectángulos`.

## Fase 2: herramientas de teselas

Rama `feat/teselas-datos`. Añade datos que el juego aún no usa; la fase 3 los usa en su
propia rama.

### Paso 2.1: generar teselas y vista general

- **Archivos**: `tools/aerial-tiles.py` (nuevo), `web/aerial/` (nuevo),
  `tools/export-provenance.mjs`, `tests/verify-world.mjs`, `docs/DATOS.md` y
  `docs/MAP_SOURCES.md`. Lee antes `tools/AGENTS.md`.
- **Consulta**: la de `aerial.jpg`, descrita en `docs/MAP_SOURCES.md:24-29`; ninguna
  herramienta la tiene hoy. WMS 1.1.1 de `https://www.ign.es/wms-inspire/pnoa-ma`,
  `LAYERS=OI.OrthoimageCoverage`, `STYLES=`, `SRS=EPSG:4326`, `FORMAT=image/jpeg` y
  `BBOX=lon_min,lat_min,lon_max,lat_max`. El recuadro local pasa a longitud y latitud
  con la inversa exacta de `proj` de `tools/rebuild-map.py:15-19`:
  `lon = LON + x / SX` y `lat = LAT − z / SZ`, con `SX = 111320 · cos(LAT)` y
  `SZ = 111320`. Es lineal, así que el recuadro de la imagen coincide con el local.
- **Teselas**: las de D1 que tocan algún rectángulo de `world.json` (`bounds`). Hoy son
  24: `i` de −3 a 2 y `j` de −2 a 1. Cada una pide su recuadro con margen D2
  (`[255·i − 20,5, 255·(i+1) + 20,5]` en x, igual en z) a 1184 × 1184.
  - `hi`: el JPEG del WMS tal cual llega, sin recomprimir.
  - `lo`: `hi` reducido a 592 × 592 con Lanczos y JPEG calidad 82, como
    `tools/reduce-aerial.py`.
  - Vista general (D3): una petición del recuadro envolvente de `bounds` a 1 m/píxel,
    redondeado hacia arriba (hoy 1344 × 1002); si un lado pasa de 2048, se reduce la
    resolución por igual en ambos ejes.
- **Salida**: `web/aerial/hi/i_j.jpg`, `web/aerial/lo/i_j.jpg` (por ejemplo `-3_-2.jpg`),
  `web/aerial/general.jpg` y `web/aerial/index.json`:

  ```json
  {
    "version": 1,
    "tile": 255,
    "margin": 20.5,
    "levels": { "hi": [1184, 0.25], "lo": [592, 0.5] },
    "tiles": [[-3, -2], …],
    "general": { "file": "general.jpg", "box": [x0, x1, z0, z1], "size": [1344, 1002] },
    "acquisition": "2022-07",
    "consulted": "AAAA-MM-DD",
    "source": "https://www.ign.es/wms-inspire/pnoa-ma",
    "sha256": { "hi/-3_-2.jpg": "…", "lo/-3_-2.jpg": "…", "general.jpg": "…" }
  }
  ```

- **Caché**: las respuestas del WMS van a `~/.cache/chiclana-vice/pnoa/`. La herramienta
  solo descarga lo que falta, así que la fase 4 la vuelve a ejecutar para los anexos.
  Como mucho dos peticiones a la vez.
- **Fecha de vuelo**: GetFeatureInfo de la capa `OI.MosaicElement` (la misma evidencia
  que hoy) en el centro de cada tesela. Si alguna no es 2022-07, **parar e informar**: la
  atribución dice «PNOA 2022-07» y cambiarla requiere preguntar.
- **Alineación con la ortofoto actual**: la herramienta reduce cada tesela `hi` a la
  resolución de `aerial.jpg` (unos 0,33 m/píxel) y la compara con su zona de
  `aerial.jpg`. Debe dar un desplazamiento menor de un píxel (por correlación) y una
  diferencia media baja; informar las cifras por tesela. Así se descartan errores de
  orden de ejes, de signo en z o de medio píxel.
- **Procedencia**: en `tools/export-provenance.mjs`, un registro nuevo para
  `aerial/index.json` y las imágenes, leídas del índice; mismos `source`, `conditions`,
  `licenseUrl` y `attribution` que `aerial.jpg`. Después,
  `node tools/export-provenance.mjs`. El registro de `aerial.jpg` sigue hasta el paso 3.3.
- **Verificación**:
  - test en `tests/verify-world.mjs`: el índice cubre con sus teselas todos los
    rectángulos, los archivos existen con su SHA-256 y sus dimensiones, y la vista general
    cubre la caja de `bounds`;
  - las cifras de alineación y fecha, en el informe;
  - tamaño total de `web/aerial/` (estimado: unos 9 MB `hi`, 2–3 MB `lo`);
  - `npm run check`.
- **Commit**: `feat(datos): generar la ortofoto por teselas a 0,25 m`. Un solo commit con
  los datos definitivos: cada regeneración confirmada queda para siempre en el historial.

## Fase 3: ortofoto por teselas en el juego

Rama `feat/teselas-juego`, desde `main` con la fase 2 integrada.

### Paso 3.1: gestor de teselas

- **Archivos**: `web/js/world/aerial-tiles.js` (nuevo), `web/js/core/state.js`,
  `web/js/world/loader.js` (`aerialFile` y `reloadGroundTexture` :98-138),
  `web/js/app.js` (:78-86), `web/index.html` (importmap y `modulepreload`).
- `loadLayers` carga `aerial/index.json` y la vista general, y espera a ambas como hoy a
  `aerial.jpg`. `world.aerialBox` pasa a ser `index.general.box`: las UV de mundo se
  refieren a la vista general, que se usa con su transformación identidad.
- Todas las peticiones pasan por `asset()` (con `?v=`); `browser-smoke` lo comprueba.
- `updateAerialTiles(x, z, vx, vz)`:
  - calcula las teselas deseadas (D6): las del índice cuyo recuadro sin margen está a
    menos de R del punto adelantado, ordenadas por esa distancia y recortadas al
    presupuesto;
  - pide las que faltan con `TextureLoader`, con `offset`/`repeat` (D4), espacio de
    color sRGB y anisotropía;
  - libera las sobrantes. Una carga que ya no hace falta cuando termina se libera al llegar.
- **Calidad**: `hi` en calidad normal sin pantalla táctil, `lo` en táctil o modo ligero.
  Al cambiar de calidad se recargan las teselas activas; esto sustituye a
  `reloadGroundTexture`.
- **Commit**: `feat(juego): cargar la ortofoto por teselas alrededor del jugador`.

### Paso 3.2: suelo y tejados por tesela

- **Archivos**: `web/js/engine/renderer.js` (`addGroundPlanes`),
  `web/js/world/terrain-mesh.js`, `web/js/world/buildings.js`, `web/js/game/update.js`
  y `web/js/ui/map.js`.
- **Suelo**: un trozo de malla por tesela D1 que corta la rejilla de
  `world.surfaces.meshTerrain` (D9), con `computeBoundingSphere` para el recorte por
  frustum. Gracias a D10, sus vértices de borde son los mismos que los del trozo vecino.
  Las **normales** se calculan una vez sobre la malla completa (como hoy en
  `terrainGeometry`) y se copian a los trozos: calcularlas por trozo marcaría una línea de
  sombreado cada 255 m. Cada trozo tiene su material, que empieza con la vista general.
  Sin relieve, un plano por tesela recortado a la caja envolvente. Pavimentos, bases y
  consultas no cambian: siguen leyendo la malla completa en memoria.
- **Faldón exterior**: sin cambios, en el borde de la rejilla del terreno (D9).
- **Tejados**: un material por tesela, compartido por los grupos de sus nueve celdas. Las
  6 partes de D5 van a un grupo aparte con la vista general.
- `update` llama a `updateAerialTiles` en cada frame; es barato si no cambia de tesela.
  El mapa (M) dibuja la vista general.
- **Verificación**:
  - Tests con el arnés en `tests/verify3d.mjs`:
    - al arrancar solo se piden la vista general y las teselas del radio;
    - al teletransportarse se piden las nuevas y se liberan las lejanas sin pasar del
      presupuesto;
    - una tesela que falla deja la vista general;
    - cambiar de calidad recarga sin duplicar peticiones.
  - Test de costuras: los vértices de borde de trozos vecinos coinciden exactamente en
    posición y normal, y la suma de triángulos de los trozos es la de la malla completa.
  - Huella de escena nueva: es un cambio deliberado y se documenta.
  - Humo en Chrome en la raíz y bajo `/chiclana-vice/`, con relieve y en modo ligero.
- **Revisión del usuario**: nitidez de suelo y tejados, costuras, paso de vista general
  a tesela al conducir rápido, modo ligero y móvil Android.
- **Commit**: `feat(juego): usar teselas de ortofoto en el suelo y los tejados`.

### Paso 3.3: retirar la ortofoto única

- Borrar `web/aerial.jpg`, `web/aerial-2048.jpg` y `tools/reduce-aerial.py`, y actualizar
  `tools/export-provenance.mjs` (registro de `aerial.jpg`), `MAP_SOURCES.md`, `DATOS.md`,
  `DESARROLLO.md` (modo ligero) y las referencias de `tests/verify3d.mjs`.
  **Borrar datos publicados requiere confirmación del usuario.**
- **`tools/aerial-tiles.py`** deja de depender de `aerial.jpg`, que desaparece y no cubre
  los anexos de la fase 4. La alineación pasa a comprobarse en la franja común de cada
  par de teselas vecinas (41 m a 0,25 m/píxel): correlación de fase con pico subpíxel,
  desplazamiento menor de 0,25 píxeles y diferencia media de luminancia baja. Con los
  datos actuales da como máximo 0,014 píxeles (revisión de la fase 2). Con la caché
  existente, regenerar debe dar los mismos bytes en `web/aerial/`.
- **Commit**: `chore(datos): retirar la ortofoto única`.

## Fase 4: anexos

Rama `feat/anexos-santa-ana-norte`.

### Paso 4.0: reproducir el mapa actual antes de ampliarlo

Comprobado el 8/10/2026: con los originales de la caché
(`~/.cache/chiclana-vice/sources/catastro-chiclana.zip`, Catastro del 4/10, y
`osm-center.xml`) y el recuadro actual, `rebuild-map.py` reproduce los datos publicados
salvo en dos cosas, ambas anteriores a este plan:

- **44 vías con sentido único** (27 `secondary`, 7 `tertiary`, 10 `residential`) que OSM
  marca como `oneway` y las capas publicadas no. El conversor de sentidos se corrigió el
  6/10 sin regenerar las vías (`MAP_SOURCES.md` lo indica). Cambia el tráfico.
- **Un edificio** (índice 3314): la reconstrucción conserva un patio que la capa
  publicada había fundido con el contorno. No depende de la versión de shapely: 2.1.2 y
  2.2.0 dan lo mismo; la causa no está identificada.

Con esas dos diferencias, y regenerando frentes (276 → 277) y la capa de alturas, pasan
todos los tests. Este paso adopta la reconstrucción para que el diff de 4.2 muestre solo
la ampliación:

- **`rebuild-map.py`**: el texto `meta.terrain` (:82) dice «Plano…»; debe conservar el
  vigente de `world.json`. Anotar en `DATOS.md` las versiones de shapely y pyproj usadas
  (2.2.0 y 3.8.0 en la comprobación del 8/10) y fijarlas en el comando
  (`--with shapely==…`): de ellas depende la geometría exacta.
- **Capa de alturas IGN**: `height-samples.json` enlaza los edificios por índice y por
  la huella SHA-256 de `buildings.json`, así que se regenera con
  `audit-ign-heights.py --download --overlay web/height-samples.json`. El recorte del
  IGN ya no está guardado: se descarga a `~/.cache/chiclana-vice/ign` (la ruta por
  defecto). Deben salir las mismas 15 entradas con las mismas alturas; si no, parar.
- Después: `prepare-world.mjs`, `export-facades.mjs`, `export-provenance.mjs`,
  `export-geometry-baseline.mjs` y `npm run check`.
- **Verificación**: diff por capa contra `main`: solo los 44 `oneway`, el edificio 3314,
  su frente nuevo y las sumas de control. Humo en Chrome.
- **Revisión del usuario**: el tráfico en las calles con sentido nuevo.
- **Commit**: `fix(datos): regenerar las capas desde los originales con los sentidos de OSM`.

### Paso 4.1: relieve desde la rejilla nativa del MDT, por teselas

Comprobado el 8 y el 9/10/2026: la cobertura `Elevacion4258_5` que se usaba se remuestrea
según el recuadro pedido. Dos descargas del centro difieren hasta 2 m (p95 0,28–0,36 m),
así que cada ampliación habría cambiado y obligado a revalidar todo el relieve. La
cobertura `Elevacion25830_5` es la rejilla nativa (UTM 30N, 5 m, centros en múltiplos
de 5 m): pidiendo recuadros con los bordes entre centros, la misma petición da los
mismos bytes y dos recortes solapados coinciden en todas las celdas comunes.

- **`tools/mdt-tiles.py`** (nuevo): descarga a `~/.cache/chiclana-vice/mdt/utm/` las
  teselas fijas de 500 m que faltan para cubrir `world.bounds` con 20 m de margen, con
  un índice de URL, fecha y SHA-256. Hoy son 12.
- **`terrain-source.py`**: `read_tiles` une las teselas por celda nativa y rechaza las
  desalineadas o las que no coinciden al solaparse; `sample_cells` interpola entre los
  cuatro centros nativos. `audit-terrain.py` y `export-terrain.py` aceptan el directorio
  de teselas (pyproj 3.8.0 fijado) y siguen aceptando un ASCII antiguo; la auditoría
  entiende también la cabecera `cellsize`.
- **Cambio de cotas, una sola vez**: frente al relieve validado, mediana 1,5 cm, p95
  0,49 m, máximo 4,0 m en una ladera (hacia x = 360, z = 180). `npm run check`, uniones
  a 5 cm y puentes como antes. Se exporta con `--preview`.
- **Revisión del usuario**: el relieve del centro, sobre todo puentes, rampas y la
  ladera indicada. Con su aprobación se registra la decisión con
  `audit-terrain.py --decision` y se reexporta sin `--preview`.
- **Commit**: `feat(relieve): usar la rejilla nativa del MDT por teselas`.

### Paso 4.2: reconstrucción con varios rectángulos e IDs de área

- **Archivos**: `tools/rebuild-map.py`, capas de `web/`, `web/height-samples.json`,
  `source-data/geometry-baseline.json`, `web/frontages.json`, `web/city-design.json`,
  `web/js/world/surface-model.js` y su esquema, y teselas nuevas de `web/aerial/`.
- **`rebuild-map.py`**:
  - acepta `--bounds` con varios rectángulos y recorta con su unión. Hoy tiene fijos
    `W` y `H` (:17-18), el filtro geográfico rápido de Catastro (:72) y la salida `size`
    (:22): los tres deben salir de `--bounds`, y la salida pasa a `bounds`. Árboles e
    hitos (:25 y :47) usan la unión;
  - escribe `id` (ID de OSM) en cada área (:32 y :43; D11).
- **Datos**:
  - **Catastro**: reutilizar el ZIP de la caché. Es el del municipio entero, así que ya
    cubre los anexos, y una descarga nueva cambiaría también edificios del centro.
  - **OSM**: descargar con la API `map` el recuadro envolvente de `bounds` (unos 0,017 ×
    0,016 grados, dentro de sus límites) a `~/.cache/chiclana-vice/sources/`. Al ser un
    extracto más reciente, el centro puede traer ediciones de OSM posteriores al 5/10:
    listarlas en el informe con el diff contra el paso 4.0, limitado al rectángulo
    actual.
  - Reconstruir, revisar y adoptar con `prepare-world.mjs`. Los edificios y vías
    cortados hoy por los bordes sur y norte se completan, y pueden desaparecer IDs de vía
    duplicados por el recorte (hoy hay 5).
- **Capa de alturas**: los índices de edificio cambian; volver a ejecutar
  `audit-ign-heights.py --overlay web/height-samples.json` con el recorte del paso 4.0.
  Las mismas 15 entradas, con índices nuevos.
- **Ortofoto**: `aerial-tiles.py` añade las 14 teselas de los anexos y rehace la vista
  general para la caja nueva (unos 1500 × 1770 a 1 m/píxel). Si alguna tesela no es de
  2022-07, parar. La alineación entre vecinas cubre también las nuevas.
- **Anclajes (D11)**: migrar en el mismo commit los `areaAnchor` de
  `terrainSurfaces.platforms` y `water.features` a `areaId`. El validador acepta `areaId`
  y mantiene la comprobación de forma.
  - Los `heightAnchors` por vía e índice siguen igual: si un índice cambia, el validador
    falla y se corrige a mano con su evidencia. Los anclajes de fachada ya fallan de forma
    explícita por `footprintSha256`.
- Regenerar frentes, procedencia y la huella geográfica en este commit.
- **Commit**: `feat(datos): ampliar el mapa a Santa Ana, el Puente VII Centenario y el ferial`.

### Paso 4.3: relieve de los anexos

- `mdt-tiles.py` añade solo las teselas nativas de los anexos; las del centro no
  cambian, y la reexportación debe dar en el centro las mismas cotas que el paso 4.1
  (comprobarlo). Como el juego no arranca sin relieve que cubra `bounds`, esta parte de
  datos se hace junto con el paso 4.2. La malla del suelo cubrirá toda la caja (D9):
  unos 107.000 vértices y 212.000 triángulos, frente a 56.000 y 111.000 hoy. Después:
  - `audit-terrain.py`, con decisión pendiente;
  - `export-terrain.py --preview --out web`;
  - metadatos y procedencia.
    El exportador (D10) ya admite una caja no centrada.
- **Puente VII Centenario**: es `bridge=yes` en OSM y usa el perfil lineal entre accesos
  del modelo de superficies. Comprobar con `audit-terrain-surfaces.mjs` la cota frente al
  agua y la pendiente. Solo si hace falta, declarar en `terrainSurfaces` una plataforma o
  un paso inferior con evidencia, sin código específico.
- **Agua**: el polígono del Iro ya llega al anexo norte. Su orientación medida ahí
  (unos 52° respecto a x) es parecida a la del centro (unos 45°), así que
  `water.axis: "z"` debería servir. Verificarlo con los niveles por tramo y revisión
  visual. Si no sirve, generalizar el eje por polígono en un paso aparte.
- **Santa Ana**: la regla `baseY` = cota máxima producirá zócalos altos en el cerro.
  Medir `terrainSpread` en el anexo e informar de los peores edificios. La política de
  zócalos y accesos en pendiente es un pendiente propio (ver `ESTADO.md`); no se
  improvisa aquí.
- **Rendimiento**: medir `createSurfaceModel` con `bench-terrain-surfaces.mjs` frente a
  la fase 3. La caja crece unas dos veces, pero casi todo el anexo norte es campo; las
  celdas sin vías, plataformas ni agua solo copian el MDT. Si el tiempo crece más que el
  área, investigar antes de seguir.
- **Verificación**: `npm run check`, incluido el límite de 5 cm en las uniones de las
  vías nuevas; humo en Chrome; mallas, triángulos y tiempo de carga frente a la fase 3.
- **Revisión del usuario**: subida a Santa Ana y la colina, ferial, bordes nuevos,
  puente y rendimiento en móvil. Con su aprobación, registrar la decisión con
  `audit-terrain.py --decision` y reexportar sin `--preview`.
- **Commits**: `feat(relieve): extender el terreno a los anexos` y, tras la revisión,
  `chore(relieve): validar el relieve de los anexos`.

### Paso 4.4: juego en los anexos

- Santa Ana como lugar y mirador en `web/game-data.js` y, si encaja, un encargo de subida
  a la ermita. Revisar que el tráfico y la policía usan las vías nuevas.
- Hecho el 9/10/2026: lugares «Ermita de Santa Ana» y «Puente VII Centenario», miradores
  de Santa Ana y del puente, y el encargo «La subida a Santa Ana» (del puente a la ermita:
  2,0 km en coche, los últimos 55 m a pie; límite de 240 s).
- **Commit**: `feat(juego): añadir Santa Ana como mirador`.

## Fase 5: modelos

Cada modelo en su propia rama y commit `feat(datos)`, como receta de
`facade-designs.json`, con las referencias citadas en `THIRD_PARTY_NOTICES.md` (solo como
referencia; **preguntar antes de añadir atribuciones**) y revisión visual del usuario.
Son independientes de las fases anteriores, salvo los que están en anexos.

1. Ermita del Cristo de la Veracruz (Plaza del Santo Cristo): hoy es un bloque genérico.
2. Iglesia Mayor (San Juan Bautista): rehacer la aproximación actual para que se reconozca.
3. Ermita de Santa Ana (tras el paso 4.2); su base sigue la política de zócalos vigente.
4. Puente VII Centenario: hecho junto con el paso 4.4 a petición del usuario (receta
   `puente-arco`, tablero de 14 m por corrección del mapa). Queda revisar en el navegador
   la flecha estimada de los arcos y su color.
5. Ferial: explanada y portada, solo si sigue interesando.

## Ampliar más adelante

Con teselas, la ortofoto deja de limitar: añadir zona es generar más teselas, y la
memoria no crece porque solo se cargan las cercanas. El límite pasa a los edificios y al
relieve, que se construyen enteros al empezar:

| Área alrededor del origen | Partes de Catastro | Factor |
| ------------------------- | ------------------ | ------ |
| Actual, 1.344 × 1.008 m   | 7.571              | 1      |
| 2.000 × 1.500 m           | 16.091             | 2,1    |
| 3.000 × 2.250 m           | 26.997             | 3,6    |
| Municipio entero          | 101.118            | 13     |

Hasta unas dos veces el área actual debería bastar con este plan (comprobarlo midiendo).
Más allá habría que cargar edificios y construir el relieve por teselas D1: un JSON por
tesela con sus partes y vías, y el modelo de superficies limitado a las teselas cercanas.
El grafo de rutas (unos pocos KB) seguiría cargándose entero.

## Riesgos

- **Salto de nitidez** al conducir rápido: precarga en la dirección de marcha (D6).
- **Costuras** entre teselas de ortofoto: margen de 20 m, filtrado y
  `ClampToEdgeWrapping`. Las grietas entre trozos de malla las evita D10, con un test.
- **Memoria en móvil**: presupuesto D6 y teselas de 592 px; medir en Android.
- **WMS y WCS del IGN**: limitar las peticiones y reintentar; las descargas quedan en caché.
- **Reconstrucción**: anclajes de diseño que cambian; se mitiga con D11 y con
  validadores que fallan de forma explícita.
- **Cuestas de Santa Ana**: zócalos altos (`baseY` máximo) y pendientes mayores. Revisar
  vías, aceras, edificios y cámara con las comprobaciones del relieve.
- **Huella**: la fase 1 deja la escena idéntica; las fases 3 y 4 la cambian a propósito
  y lo documentan.

Lo que no acreditan los tests (DOM y WebGL simulados): GPU, memoria real, fluidez y móvil.
