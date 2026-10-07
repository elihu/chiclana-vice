# Superficies transitables sobre el relieve

La revisión local del usuario confirma las cuestas generales y detecta bultos en
calzadas, agua oculta y pasos inferiores perdidos. Se conserva el MDT sin suavizado
global y se añaden superficies de autor en `city-design.json.terrainSurfaces`.
El motor no contiene nombres, identificadores ni coordenadas especiales de Chiclana.
Los datos reales continúan en la copia de revisión, sin activación pública.

## Contrato editable

`engine/surface-model.js` contiene `validateSurfaceDesign` y `createSurfaceModel`.
El esquema de editor está en `schemas/city-design.schema.json`; el validador es la
referencia normativa y comprueba también los anclajes contra las capas cargadas.

- `roads.sampleStep`: resolución de los perfiles longitudinales, en metros.
- `roads.smoothingRadius`: radio longitudinal del filtro triangular. Solo afecta al
  corredor de la vía; mantiene extremos comunes y no altera el ráster fuente.
- `roads.shoulder`: transición lateral y margen de construcción, en metros.
- `roads.bridgeAnchorRadius`: vecindad del MDT usada para estabilizar cotas de acceso.
- `roads.pavementStep` y `roads.meshSubdivisions`: presupuesto de geometría. El perfil
  puede tener más muestras que el pavimento. La malla refina celdas afectadas y comparte
  bordes con las celdas vecinas para evitar grietas.
- `water.axis`, `sliceLength`, `percentile`, `maximumSlope`: tramos de lámina de agua
  sobre muestras locales del cauce. Se limita su variación longitudinal, sin usar el
  mínimo de todo el polígono de kilómetros. `bedDepth` y `shoreWidth` describen un
  lecho visual y su transición de orilla; no son profundidades ni mareas medidas.
- `platforms`: tableros y plazas independientes del terreno. Cada elemento tiene
  `id`, `clearance`, `heightAnchors`, `deckRoads`, `lowerRoads` y `evidence`.
  Un `areaAnchor` usa tipo, vértice y número de vértices de un área existente; un
  `roadAnchor` usa una vía y anchura estructural. Los accesos referencian vía,
  índice de vértice y desplazamiento vertical de autor. Sus cotas estabilizadas
  determinan una plataforma horizontal. Se rechazan anclajes inexistentes o ambiguos.

El panel `?debug` expone MDT original, suelo construido, altura superior, identificador
de plataforma, altura libre y evidencia. Los parámetros se editan en JSON; no hace
falta modificar el motor para añadir otro tablero o paso inferior.

## Dos niveles sin física vertical

La consulta gráfica sin contexto selecciona la plataforma superior. La consulta de un
actor acepta su última `surfaceY` y escoge el nivel que mantiene continuidad. Tráfico y
peatones aportan además el identificador de la vía de su ruta; un paso inferior no
salta al tablero al cruzar su huella. Al bajar del coche se conserva su nivel y una
teletransportación explícita reinicia el anclaje. No se aplica `max(MDT, tablero)`.

Los perfiles inferiores respetan la altura libre declarada y transicionan fuera de la
estructura. Las cotas de sus extremos se propagan a vías conectadas. La malla de terreno
se rebaja localmente y el tablero se dibuja por separado, con cara inferior. La cámara
consulta suelo y techo del nivel del actor; no se eleva automáticamente encima de la
plataforma. La proximidad para subir a coches y los choques entre vehículos tienen en
cuenta la separación vertical. Se mantienen rutas, calles, controles y colisiones de
edificios en planta. La máscara de agua permite superficies secas superiores y vías
inferiores declaradas; los objetos urbanos tienen cota de colisión para no bloquear al
actor del otro nivel. No se añaden gravedad, dinámica de suspensión ni un motor físico.

## Evidencia de las instancias locales

La consulta pública OSM de 7/10/2026 identifica la
[Gran Plaza sobre el Río Iro](https://www.openstreetmap.org/way/183510852) y la
[Plaza de Andalucía](https://www.openstreetmap.org/way/645257882) como áreas peatonales
con `bridge=yes`, `layer=2/1`. Son contornos superpuestos que el conversor conservaba
como plazas, perdiendo sus niveles. El motor representa una plataforma y evita
duplicar el pavimento de polígonos coincidentes. Las pasarelas 1195660889/1195660891
pertenecen a esa plataforma; la interpretación previa como rellano aislado era
incompleta. Carmen Picazo 142718392 conserva su recorrido inferior.

La [huella estructural de Remedios](https://www.openstreetmap.org/way/1109772445)
abarca calzada, andén y tranvía, mientras el eje vial 50664224 solo representa la
calzada. San Sebastián 141508088 cruza por debajo. La
[Junta de Andalucía](https://www.juntadeandalucia.es/fomentoyvivienda/portal-web/web/noticias/db797031-9141-11e7-93f9-9dca4ec7e078)
confirma la continuidad del tranvía por Remedios y Mendizábal.

Las dos plataformas usan cotas aproximadas de los accesos en el MDT y altura libre de
autor de 3,2 m. La anchura agregada de Remedios es una aproximación de 24 m apoyada en
su huella OSM, no una medición estructural. No se inventan cotas certificadas ni se
presenta el gálibo como dato público medido. Coordenadas y contornos publicados no se
reescriben; la composición vertical se declara en el diseño.

## Comprobaciones

`tests/verify-surfaces.mjs` usa un mundo sintético independiente de Chiclana: carretera
ondulada, rampa y cruce inferior/superior. Comprueba reducción de bultos, preservación
fuera del corredor, altura de coches, continuidad, selección por ruta, techo, lámina
de agua y rechazo de anclajes inválidos. `verify-terrain-runtime.mjs` recorre la escena
con una rampa y las adaptaciones de actores/cámaras; `verify-world.mjs` valida anclajes
del diseño real. `npm run check` incluye todos ellos.

La auditoría reproducible compara MDT y superficie construida. Las muestras de vías
con pendiente mayor del 20% pasan de 148 a 43; ese umbral sirve para localizar zonas,
no prueba realismo ni impone un límite físico. La revisión visual y las mediciones en
dispositivos físicos siguen siendo necesarias antes de activar datos por defecto.
