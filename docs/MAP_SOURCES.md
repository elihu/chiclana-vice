# Fuentes del mapa y aproximaciones

Qué fuentes se usan, cómo se han transformado y qué partes son aproximadas. Las
licencias, atribuciones exactas y avisos legales están solo en
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md); cómo regenerar los datos, en
[DATOS.md](DATOS.md).

Zona: longitudes -6.156 a -6.141, latitudes 36.415 a 36.424. Origen local
[-6.1485, 36.4195]; x hacia el este, z hacia el sur, en metros. El trazado no se mueve ni
se sustituye.

## Fuentes

- **Catastro INSPIRE BU**, municipio 11015, descarga del 4/10/2026. 7.448 partes de
  edificio: contornos y patios recortados, simplificados a 0,12 m y transformados de
  EPSG:25829 a coordenadas locales con precisión de 0,01 m. Se conservan las plantas;
  altura base = plantas × 3,05 + 0,4 m. Capa: `web/buildings.json`.
  https://www.catastro.hacienda.gob.es/INSPIRE/Buildings/11/11015-CHICLANA%20DE%20LA%20FRONTERA/A.ES.SDGC.BU.11015.zip
- **OpenStreetMap**, extracto del 4/10/2026: 616 vías, 69 áreas, 20 hitos y 14 árboles
  cartografiados; objetos de calle extraídos aparte. Anchuras y categorías de juego
  inferidas donde OSM no las indica. Capas: `web/osm-world.json` y
  `web/street-objects.json`.
  https://www.openstreetmap.org/api/0.6/map?bbox=-6.156,36.415,-6.141,36.424
- **Ortofoto PNOA máxima actualidad** (IGN), WMS 1.1.1, capa OI.OrthoimageCoverage,
  EPSG:4326, mismos límites, 4096 × 3072 JPEG para suelo y tejados; consulta del 4/10/2026.
  La fecha de vuelo en el centro del sector es 2022-07 (GetFeatureInfo
  OI.MosaicElement, comprobado el 6/10/2026). Archivo: `web/aerial.jpg`; `web/aerial-2048.jpg` es el mismo recorte
  remuestreado a 2048 × 1536 para el modo ligero y los táctiles (`tools/reduce-aerial.py`).
  https://www.ign.es/wms-inspire/pnoa-ma
- **PNOA-LiDAR, primera cobertura 2008–2015** (IGN): MDSnE2,5 por WCS, consulta del
  5/10/2026. Recorte local EPSG:3042 de unos 2,5 m por píxel con valores enteros en
  metros, ya normalizado al terreno. De 1.399 candidatos, 274 tienen al menos 12 muestras
  y 15 pasan los filtros conservadores. Fecha exacta del vuelo local sin confirmar.
  Parámetros, URL y checksums en `web/height-samples.json` y
  `source-data/height-audit-ign.json`; detalle en [ALTURAS_PILOTO.md](ALTURAS_PILOTO.md).
  https://wcs-mds.idee.es/mds?service=WCS&request=GetCapabilities
- **MDT IGN de paso nominal 5 m, provisional**: servicio WCS `Elevacion4258_5`,
  consulta del 7/10/2026, ASCII multipart en EPSG:4326 según DescribeCoverage.
  Transformación local existente, remuestreo a unos 10 m, referencia fija en el origen
  y cuantización a 0,1 m. El original permanece fuera de Git; rejilla real solo en la
  copia local de revisión, sin activar en el juego de la rama. Auditorías:
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

- 276 frentes en 243 partes catalogados en `web/frontages.json` (Constitución,
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

## Aproximaciones

- [Terreno plano](DESARROLLO.md#terreno). Monumentos simplificados; cubiertas e interiores incompletos.
- Árboles: puntos de OSM más una plantación aproximada y determinista.
- Mobiliario y pavimentos recreados; los pasos de peatones toman posiciones de OSM.
- Tráfico, peatones, policía y encargos son mecánicas de juego, no simulación real.
  El tráfico y la policía respetan `oneway` de OSM salvo en tramos del borde del sector
  que dejarían zonas sin salida; a pie no hay restricción.
- Al reconstruir desde OSM, el conversor reconoce `oneway=yes/1/true`, invierte
  los puntos para `oneway=-1` y contempla el sentido implícito de rotondas y autopistas;
  `no/0/false` lo desactiva. No se han regenerado las vías publicadas en esta revisión.
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
