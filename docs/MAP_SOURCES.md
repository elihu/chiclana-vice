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

- Ermita de Santa Ana (`galeria-santa-ana`, `cupula-santa-ana`, `anexo-santa-ana`):
  octógono regular de 9,06 m de apotema (caras de 7,5 m) y centro `[-226.41,524.41]`, el
  menor que envuelve el contorno OSM del hito y la parte catastral 2630; los dos difieren
  hasta 1 m y el catastral sobresale del OSM por el este. Coincide con el borde blanco de
  la terraza en la ortofoto PNOA 2022-07 `web/aerial/hi/-1_2.jpg`. Puerta en la cara
  norte, hacia la explanada del Sagrado Corazón, como en las fotos de Xemenendura; el
  anexo, al sur, es una caja blanca de 8,6 × 9,8 m y 5 m de alto alineada con esa cara.
  La casa de tejado rojo al sur del anexo forma parte de la misma parte catastral y se
  queda como volumen genérico. Galería de 5,9 m hasta la cornisa con arcos de 3,3 m de
  arranque, pretil hasta 7,25 m, tambor de 5 m de apotema hasta 10,45 m y cúpula de
  4,9 m de radio con remate hasta unos 17,6 m sobre la base: proporciones estimadas de
  las fotos de Xemenendura y Carlosrs, sin medición. Relieve: la base es la cota máxima
  (45,35 m); el suelo baja hasta 41,65 m junto al anexo, así que la plataforma y el anexo
  bajan 3,9 m (zócalo de hasta 3,7 m) y la escalinata de seis peldaños llega a la
  explanada (43,95 m). La estatua no se modela.
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
- Árboles: copas aproximadas de ortofoto, puntos OSM y relleno determinista en huecos.
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

## Candidatos de copas en revisión (G5.1)

`tools/detect-tree-crowns.py` deriva `source-data/tree-candidates.json` de las teselas
PNOA de julio de 2022 y las capas actuales de edificios y OSM, sin publicar una capa
ni sustituir los árboles del juego. Usa canales normalizados por R+G+B,
ExG = 2g − r − b > 0,10 y brillo medio ≥ 45/255. Apertura de un píxel, cierre de
tres y relleno de huecos. La detección amplia admite piezas desde 3 m²; la vía de imagen exige 6 m² por copa partida. Excluye edificios (respetando patios),
agua y calzadas con la mitad de la anchura de cada vía; no excluye vías peatonales.
Vuelve a aplicar las exclusiones tras cerrar y rellenar la máscara.

Separa componentes por máximos locales de distancia, con separación mínima de 3 m,
y asigna sus píxeles al máximo más cercano. Conserva solo centros dentro de los límites
del mundo y del núcleo de cada tesela, usando el margen para evitar cortes artificiales.
Posición en el máximo y radio equivalente a la superficie asignada: son aproximaciones,
no un inventario de arbolado ni precisión topográfica. El campo `ign` guarda el máximo MDSnV muestreado en metros; no mide la altura actual de cada árbol.

La vía de imagen exige textura: luminancia RGB con pesos
0,2126/0,7152/0,0722, desviación en ventanas de 5 × 5 píxeles (1,25 m), mediana
≥ 5/255 dentro de cada pieza erosionada dos píxeles para evitar el contraste del
borde. Si no queda interior, se mide la pieza completa. Así se descartan también
las partes lisas de componentes grandes, sin consultar usos deportivos en OSM.

La dirección de sombra se estima de nuevo en cada generación con las huellas de
edificios y la imagen a 1 m/píxel: se desplazan las huellas 2, 4, 6 y 8 m en
24 direcciones, se excluyen los edificios y se maximiza la fracción de luminancia
< 65. En esta pasada da 240° (x este, z sur; vector −0,5/−0,866), con fracción
0,333 frente a 0,113 en la dirección de menor evidencia. No es un cálculo astronómico.
Para cada copa se busca fuera de su pieza y de edificios, entre 0,8 y 2,5 radios
en esa dirección y hasta 0,8 radios a cada lado. Debe haber una región oscura
conectada de al menos max(0,5 m², 8 % del área de copa), con luminancia menor que
min(65, 65 % de la luminancia media de copa). Todos los parámetros y las fracciones
por dirección quedan en `method` del JSON.

Se conservan ExG > 0,10 y brillo ≥ 45, sin añadir mínimo de saturación: el césped del campo ya tiene ExG mediano
0,279, por lo que subir ligeramente el umbral no lo separa. La textura interior
sí lo separa; las piezas asociadas a las copas de las muestras tienen ExG medio
0,139–0,206, inferior al del campo. Endurecer el color perjudica copas apagadas. Los 6 m² (radio
equivalente 1,38 m) eliminan piezas pequeñas: en las jardineras de calibración
hay piezas de 3,12–5,94 m², mientras la alineación de calle tiene piezas de
10,31–38,19 m². También se pierden árboles pequeños; no hay excepciones por lugar.

La imagen sola **no separa bien todos los arbustos**: los grandes con textura y
sombra, o cerca de sombras ajenas, pueden pasar. La sombra obligatoria pierde
copas reales con sombra oculta o fusionada y las palmeras y copas oscuras siguen
faltando. El resultado requiere revisión manual; véase la calibración en DATOS.

El campo `zone` clasifica centros por prioridad: parque OSM, plaza OSM, entorno de
calzada (hasta 8 m desde su borde), resto. Son categorías para revisar resultados,
no especies ni usos de suelo certificados.

La combinación aprobada el 13/10/2026 conserva una pieza amplia si el MDSnV es
≥ 3 m **o** si pasa el filtro de imagen anterior. `source` distingue `ign`, `imagen`
y `ambos`; la deduplicación global mantiene la separación de 3 m. El IGN se muestrea
con pyproj, de WGS84 a EPSG:3042, usando la conversión local del auditor de alturas;
se toma el máximo válido no negativo del centro ±1 celda (3 × 3, unos 7,5 m).
La celda central pierde demasiadas copas por desfase y resolución; la ventana por
radio puede heredar la altura de una copa vecina. Comparación con el recorte inicial del revisor sobre los 4.203 centros
anteriores: centro 1.800, ±1 celda 2.947, ±2 celdas 3.337 y ±ceil(r/2,5) 3.055
superan 3 m. La unión con los 1.305 centros de imagen da respectivamente 2.295,
3.099, 3.412 y 3.182, antes de volver a deduplicar la salida combinada.

Fuente: [WCS MDS del IGN](https://wcs-mds.idee.es/mds?service=WCS&request=GetCapabilities),
GetCoverage `mdsn_v025`, resolución nominal 2,5 m, EPSG:3042. Primera cobertura
**2008–2015**, sin fecha local confirmada, anterior a la ortofoto de 2022: faltan
árboles jóvenes y pueden persistir alturas de vegetación retirada. Se descarga solo
la caja de los límites del mundo más 20 m; el original y la fecha de acceso quedan
en la caché externa. `provenance.ign` registra consulta, fecha, SHA-256 y resolución.
No es un inventario de arbolado: centros, radios y correspondencias temporales son
aproximados. El máximo puede aún tomar una copa vecina a menos de una celda; arbustos
altos o con textura/sombra pasan y las copas oscuras o palmeras siguen ausentes.
La decisión de aceptación y la publicación se describen en G5.3, más abajo.

Con el recorte regenerado (consulta con margen de 20 m, acceso 13/10/2026), los mismos
4.203 centros dan: central 1.884 (unión 2.369), ±1 2.975 (unión 3.115), ±2 3.334
(unión 3.411) y por radio 3.079 (unión 3.198). El WCS ajusta ligeramente la rejilla
al rectángulo solicitado; el SHA del recorte fija qué muestreo se ha usado.
Tras regenerar y deduplicar quedan **3.113**: parque 1.182, plaza 82, calle 686,
resto 1.163; `ign` 1.811, `imagen` 137 y `ambos` 1.165. La vía de imagen preserva
la fila joven de plaza en `-1_0`, aunque aún faltan algunos centros visibles.
Superposiciones de revisión en `/tmp/g5-arboles/combinado/{-1_0,-2_-3,2_0,0_0}.jpg`:
IGN verde vivo, imagen verde claro, ambos verde oscuro y descartados rojo.

## Copas publicadas y vegetación del juego (G5.3)

El usuario acepta los 3.113 candidatos combinados el 13/10/2026 mediante una zona
`todo-el-mundo` que cubre la caja de todos los límites, sin exclusiones.
`tools/export-vegetation.mjs` aplica esa revisión y publica centros y radios a
0,01 m en `web/vegetation.json`; las exclusiones por ID permiten retirar copas
más adelante sin modificar código. El método y sus umbrales son los de G5.1,
con los límites temporales y de detección descritos arriba. Las posiciones y tamaños
siguen siendo aproximados; la aceptación completa no constituye un inventario de arbolado.

El juego carga la capa opcional y escala cada árbol con `clamp(r / 1,6, 0,6, 1,8)`.
Añade los puntos OSM y los árboles de plaza que no tengan otro centro a menos de
`max(vegetation.spacing, radio detectado)`. Mantiene el relleno determinista de
parques únicamente en huecos con esa misma separación, conservando las exclusiones
de edificios, calzadas y límites. Sin capa conserva exactamente la vegetación anterior.
Las copas detectadas de radio ≤ 2 m usan icosaedros sin subdivisión en sus cinco
piezas; las mayores y los árboles anteriores conservan una subdivisión.
