# Fuentes del mapa y aproximaciones

Qué fuentes se usan, cómo se han transformado y qué partes son aproximadas. Las
licencias, atribuciones exactas y avisos legales están solo en
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md); cómo regenerar los datos, en
[DATOS.md](DATOS.md).

Zona: longitudes -6.156 a -6.141, latitudes 36.415 a 36.424. Origen local
[-6.1485, 36.4195]; x hacia el este, z hacia el sur, en metros. El trazado no se mueve ni
se sustituye.

## Fuentes

- **Catastro INSPIRE BU**, municipio 11015, descarga del 4/10/2026. 7.862 partes de
  edificio (7.419 en el centro, 333 en Santa Ana y 86 en el norte): contornos y patios
  recortados con la unión de los rectángulos del mundo, simplificados a 0,12 m y transformados de
  EPSG:25829 a coordenadas locales con precisión de 0,01 m. Se conservan las plantas;
  altura base = plantas × 3,05 + 0,4 m. Capa: `web/buildings.json`.
  https://www.catastro.hacienda.gob.es/INSPIRE/Buildings/11/11015-CHICLANA%20DE%20LA%20FRONTERA/A.ES.SDGC.BU.11015.zip
- **OpenStreetMap**, extracto del 8/10/2026 (el del 5/10 no cubría los anexos y en el
  centro no difiere): 682 vías, 83 áreas con su ID, 22 hitos y 15 árboles cartografiados; objetos de calle extraídos aparte. Anchuras y categorías de juego
  inferidas donde OSM no las indica. Capas: `web/osm-world.json` y
  `web/street-objects.json`.
  https://api.openstreetmap.org/api/0.6/map?bbox=-6.158,36.413,-6.141,36.430
- **Ortofoto PNOA máxima actualidad** (IGN), WMS 1.1.1, capa `OI.OrthoimageCoverage`,
  EPSG:4326, por teselas en `web/aerial/` (`tools/aerial-tiles.py`); consulta del
  8/10 y 9/10/2026. 36 teselas de 255 m con 20,5 m de margen por lado, JPEG del WMS sin
  recomprimir a 0,25 m/píxel (`hi/`) y derivados a 0,5 m/píxel (`lo/`) para el modo
  ligero y los táctiles, más una vista general de la caja envolvente en 1492 × 1770. El
  recuadro local pasa a longitud y latitud con la inversa exacta de la proyección de
  `rebuild-map.py` (`lon = -6.1485 + x / (111320 · cos 36.4195°)`,
  `lat = 36.4195 − z / 111320`). Los 36 centros declaran vuelo 2022-07 (GetFeatureInfo
  `OI.MosaicElement`). Las franjas comunes de los 57 pares de teselas vecinas coinciden
  con un desplazamiento máximo de 0,005 píxeles de 0,25 m. Al generar las 24 del centro,
  además, coincidían con la ortofoto única anterior (`aerial.jpg`, 4096 × 3072, consulta del
  4/10/2026, retirada después) con un desplazamiento máximo de 0,091 píxeles de esa
  imagen. Son comprobaciones de coincidencia de imágenes, no de precisión topográfica.
  Método en [DATOS.md](DATOS.md#4-ortofoto-por-teselas-opcional).
  https://www.ign.es/wms-inspire/pnoa-ma
- **PNOA-LiDAR, primera cobertura 2008–2015** (IGN): MDSnE2,5 por WCS, consulta del
  5/10/2026. Recorte local EPSG:3042 de unos 2,5 m por píxel con valores enteros en
  metros, ya normalizado al terreno. De 1.399 candidatos, 274 tienen al menos 12 muestras
  y 15 pasan los filtros conservadores. Fecha exacta del vuelo local sin confirmar.
  Parámetros, URL y checksums en `web/height-samples.json` y
  `source-data/height-audit-ign.json`; detalle en [ALTURAS_PILOTO.md](ALTURAS_PILOTO.md).
  https://wcs-mds.idee.es/mds?service=WCS&request=GetCapabilities
- **MDT IGN de paso 5 m, rejilla nativa**: servicio WCS `Elevacion25830_5`
  (EPSG:25830, UTM 30N), consulta del 9/10/2026, en teselas de 500 m cuyos bordes caen
  entre centros nativos (`tools/mdt-tiles.py`). El servidor devuelve así las celdas
  originales: la misma petición da los mismos bytes y dos teselas solapadas coinciden
  celda a celda, de modo que ampliar el mapa solo añade teselas y no cambia las cotas
  existentes. Sustituye al recorte `Elevacion4258_5` del 7/10/2026, que el servicio
  remuestreaba según el recuadro pedido; el cambio movió las cotas del centro (mediana
  1,5 cm, p95 0,49 m, máximo 4,0 m en una ladera). Conversión a UTM con pyproj,
  bilineal a la rejilla de juego de 10 m, referencia fija en el origen y cuantización a
  0,1 m. Los originales permanecen fuera de Git; la rejilla derivada (`terrain.json`,
  `terrain.bin`) está activa en el juego desde la validación visual del usuario del
  9/10/2026, que cubre el centro y los anexos. Referencia vertical y fecha de adquisición sin confirmar. Auditorías:
  `source-data/terrain-audit.json` y `source-data/terrain-surface-audit.json`; detalle y
  aproximaciones en [TERRENO_PILOTO.md](TERRENO_PILOTO.md).
- **Superficies de autor sobre el MDT**: áreas OSM de plaza `bridge=yes` y huella del
  puente/andén/tranvía, consultadas el 7/10/2026. Anclajes y evidencia en
  `city-design.json.terrainSurfaces`; perfiles de calzada, lecho visual, plataformas
  horizontales y gálibos son aproximaciones explícitas. No alteran el MDT original.
  Procedimiento y límites en [SUPERFICIES_TERRENO.md](SUPERFICIES_TERRENO.md).
  https://servicios.idee.es/wcs-inspire/mdt
- **Three.js r169** local en `web/vendor/`.

## Fachadas y monumentos

- Iglesia Mayor (`portada-san-juan-bautista`, `cupula-san-juan-bautista`,
  `nave-iglesia-mayor`): fachada de 27,5 m sobre el borde oeste de la parte catastral 5106,
  de `[204.36,179.39]` a `[214.14,153.68]`, que coincide con el tejado en la ortofoto
  PNOA 2022-07 `web/aerial/hi/0_0.jpg`; el contorno OSM queda unos 2,5 m por detrás y
  dejaba la portada tapada por el volumen catastral. La base del conjunto es la cota
  máxima del hito (14,71 m) y la plaza está a unos 7–8 m: la fachada arranca del podio a
  9,4 m (5,3 m por debajo de la base) y el podio baja hasta 8,4 m bajo la base, enterrado
  en el extremo bajo. Proporciones de las fotos de Oscar Sanchez y Xemenendura citadas en
  los avisos de terceros: cornisa a unos 17,6 m sobre el podio, frontón hasta 19,9 m,
  podio de 2 m con escalinata central de siete peldaños. Tambor octogonal sobre el
  octógono catastral 5104 (centro `[236.8,177.1]`, apotema 5,4 m), de 5,7 m de alto, y
  media naranja de 5 m de radio con 16 nervios dobles, según la foto de PEPE GADEIRAS; la
  cúpula de la ortofoto aparece desplazada por la perspectiva y no se usa para situarla.
  Nave a 12,2 m sobre la base, al nivel de la cornisa. Alturas estimadas, sin medición.
- Jesús Nazareno (`portada-jesus-nazareno`): la portada de mármol y la torre miran al
  oeste, a la Plaza de Jesús Nazareno, al otro lado de Calle Hormaza; el lado de Calle
  Larga es un muro liso. Lo indican la foto IAPH «Fachadas lateral y principal del
  Convento de Jesús Nazareno» y la foto de Xemenendura, ya citadas en los avisos de
  terceros, junto con la ortofoto PNOA 2022-07. El contorno OSM del hito queda unos 3 m
  dentro del borde catastral por ese lado, así que la fachada se ancla al borde exterior
  de las partes catastrales 3865 (la torre) y 3868: de `[-77.55,75]` a `[-77.25,106.91]`,
  unos 31,9 m. La torre queda a 2,1 m del extremo norte y la portada a 7,9 m. Una franja
  de cubierta de 3,4 m y un muro de retorno en el extremo sur cierran el hueco hasta la
  nave. Contorno, volúmenes catastrales, colisiones y base sin cambios. Posiciones
  estimadas sobre las fotos, sin medición. Corregido el 9/10/2026 tras la revisión del
  usuario.
- Ermita del Cristo de la Veracruz (`veracruz`): planta visual de la nave a partir del
  hito OSM y la ortofoto PNOA 2022-07 `web/aerial/hi/0_1.jpg`. La fachada mira al lado
  corto norte, vértices 0→3 (`[207.54,367.8]`–`[194.03,366.67]`), de 13,56 m, hacia la
  plaza. El atrio está dentro del contorno: portada sobre
  `[208.35,374.19]`–`[193.87,372.98]`, unos 6,3 m detrás de la reja del borde norte.
  Orientación corregida tras la revisión del usuario: la fachada es la del extremo
  norte de la nave. Cabecera y laterales se conservan como referencia; el recorte es una planta visual
  de autor, no una corrección cartográfica. Encalado, remate curvo, bandas ocres,
  espadaña de un vano con campana y cruz de veleta, óculo, arco de piedra, puertas,
  faroles, reja, pilares y hornacinas se interpretan de las dos fotos aprobadas de
  Xemenendura identificadas en los avisos de terceros. No se distribuyen como texturas.
  Muros a 9,10 m, cubierta a dos aguas hasta unos 10,60 m y cruz hasta 17 m sobre la
  base: proporciones estimadas, sin medición arquitectónica. El atrio visual se apoya
  a 3,50 m sobre la base para cubrir el volumen catastral de 3,45 m que se conserva;
  no se vuelve transitable. `baseY` del hito es 15,22 m y el desnivel bajo la parte
  catastral 4909 es 3,18 m: la política de cota máxima permanece y deja un zócalo alto (hasta unos
  6,68 m hasta el pavimento visual). No se modifica relieve, contorno ni colisiones;
  no se añaden cipreses. Modelo aproximado pendiente de revisión visual del usuario.
- Puente VII Centenario (receta `puente-arco`): dos arcos laterales de acero sobre toda la
  luz, con péndolas cada 3,5 m y apoyos, en los bordes de un tablero de 14 m. La planta de
  los arcos y su posición sobre la calzada salen de la ortofoto PNOA 2022-07 y el eje y los
  cuatro carriles de OSM 142805148; la anchura de juego del tablero se corrige de 8 a 14 m
  en `map-corrections.json` (`fix-001`). La flecha de los arcos (9 m) se estimó por sus
  sombras en la ortofoto y el color azul acero es una aproximación pendiente de confirmar.
- 277 frentes en 221 partes catalogados en `web/frontages.json` (Constitución,
  La Vega, La Plaza, Caraza, Jesús Nazareno, Álamo, García Gutiérrez, Corredera Baja…).
  Son fachadas genéricas generadas por reglas, no cada vivienda fotografiada.
- Ayuntamiento, Mercado e iglesias se modelan con primitivas que interpretan rasgos del
  edificio real a partir de las referencias citadas en los avisos de terceros. No se
  distribuyen fotos ni planos como texturas.
- Las alturas de iglesias y Ayuntamiento son aproximaciones visuales, no mediciones LiDAR.
- La fachada del Mercado sigue un rectángulo simplificado de cuatro esquinas, no el
  contorno catastral de 22 vértices de su parte (2615): tres esquinas son vértices
  catastrales y la cuarta queda a unos 6 m del más cercano, y no reproduce los entrantes.
- Paleta, celda de lotes y política de alturas en `web/facade-profiles.json`; recetas de
  geometría en `web/facade-designs.json`; reglas de selección de calles, zonas, mobiliario,
  pavimentos, vegetación y edificios genéricos (paleta, colores y alturas mínimas) en
  `web/city-design.json`. Todos son valores aproximados de autor, interpretados de las
  referencias de los avisos de terceros, no mediciones.
- Correcciones manuales: `web/map-corrections.json` guarda ajustes sobre las vías, las áreas
  y los contornos catastrales (esquema en `schemas/map-corrections.schema.json`). Se aplican
  en memoria al cargar y cada una lleva una guarda con el valor que debe encontrar, el
  motivo y la evidencia. No tocan `osm-world.json` ni `buildings.json`. Por ser una base
  derivada de OSM se publica bajo ODbL 1.0 con su atribución. Hoy no contiene ninguna.

La variación de color de los edificios es de autor: el catálogo inicial de
`source-data/building-variation.json` conserva los colores procedurales anteriores;
para los contornos nuevos el generador resuelve una muestra determinista por identidad
geométrica y publica solo el índice de paleta en cada parte.
No representa colores medidos o extraídos de fotografías. La semilla de vegetación y
actores se declara por separado en `city-design.json.randomSeed`.

## Aproximaciones

- [Terreno plano](DESARROLLO.md#terreno). Monumentos simplificados; cubiertas e interiores incompletos.
- Árboles: puntos de OSM más una plantación aproximada y determinista.
- Mobiliario y pavimentos recreados; los pasos de peatones toman posiciones de OSM.
- Tráfico, peatones, policía y encargos son mecánicas de juego, no simulación real.
  El tráfico y la policía respetan `oneway` de OSM salvo en tramos del borde del sector
  que dejarían zonas sin salida; a pie no hay restricción.
- Al reconstruir desde OSM, el conversor reconoce `oneway=yes/1/true`, invierte
  los puntos para `oneway=-1` y contempla el sentido implícito de rotondas y autopistas;
  `no/0/false` lo desactiva. Las vías publicadas se regeneraron con este conversor el
  8/10/2026: 44 tramos ganaron el sentido único que OSM ya indicaba.
  Semántica: https://wiki.openstreetmap.org/wiki/Key:oneway
- Sin precisión fotogramétrica ni validez catastral; no son medidas arquitectónicas.

La revisión de terreno separa el estanque `water=pond` de OSM 184499839 de la
lámina del Iro mediante un anclaje de autor al área existente. La cubeta horizontal,
el grosor de 0,8 m de las plataformas y la reserva lateral del tranvía son
aproximaciones editables en `terrainSurfaces`; no representan mediciones de obra.
La reserva usa como evidencia OSM 759565059 y no incorpora una línea de tranvía.
La construcción del suelo bajo pavimentos usa un margen local de una diagonal de
celda y 15 cm de separación para evitar que la ortofoto atraviese el recubrimiento;
el ráster original no se modifica. Véase `SUPERFICIES_TERRENO.md` para el contrato,
los límites de estas aproximaciones y las verificaciones.

La rejilla derivada (`terrain.json` y `terrain.bin`) está en Git desde el 8/10/2026.
El original recuperado coincide con la auditoría del 7/10/2026 y el exportador
reproduce las cotas. Tras la revisión visual del usuario, la auditoría registra la
decisión `validado para el juego`; véase [TERRENO_PILOTO.md](TERRENO_PILOTO.md#validación-8102026).
