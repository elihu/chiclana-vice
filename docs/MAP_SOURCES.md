# Fuentes del mapa y aproximaciones

Qué fuentes se usan, cómo se han transformado y qué partes son aproximadas. Las
licencias, atribuciones exactas y avisos legales están solo en
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md); cómo regenerar los datos, en
[DATOS_PUBLICOS.md](DATOS_PUBLICOS.md).

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
  OI.MosaicElement, comprobado el 6/10/2026). Archivo: `web/aerial.jpg`. TODO(integración):
  añadir la versión reducida para el modo ligero si se fusiona.
  https://www.ign.es/wms-inspire/pnoa-ma
- **PNOA-LiDAR, primera cobertura 2008–2015** (IGN): MDSnE2,5 por WCS, consulta del
  5/10/2026. Recorte local EPSG:3042 de unos 2,5 m por píxel con valores enteros en
  metros, ya normalizado al terreno. De 1.399 candidatos, 274 tienen al menos 12 muestras
  y 15 pasan los filtros conservadores. Fecha exacta del vuelo local sin confirmar.
  Parámetros, URL y checksums en `web/height-samples.json` y
  `source-data/height-audit-ign.json`; detalle en [ALTURAS_PILOTO.md](ALTURAS_PILOTO.md).
  https://wcs-mds.idee.es/mds?service=WCS&request=GetCapabilities
- **Three.js r169** local en `web/vendor/`.

## Fachadas y monumentos

- 276 frentes en 243 partes catalogados en `source-data/facade-catalog.json` (Constitución,
  La Vega, La Plaza, Caraza, Jesús Nazareno, Álamo, García Gutiérrez, Corredera Baja…).
  Son fachadas genéricas generadas por reglas, no cada vivienda fotografiada.
- Ayuntamiento, Mercado e iglesias se modelan con primitivas que interpretan rasgos del
  edificio real a partir de las referencias citadas en los avisos de terceros. No se
  distribuyen fotos ni planos como texturas.
- Las alturas de iglesias y Ayuntamiento son aproximaciones visuales, no mediciones LiDAR.
- Parámetros principales en `web/facade-profiles.json`; recetas de geometría en
  `web/game3d.js`.

## Aproximaciones

- Terreno plano. Monumentos simplificados; cubiertas e interiores incompletos.
- Árboles: puntos de OSM más una plantación aproximada y determinista.
- Mobiliario y pavimentos recreados; los pasos de peatones toman posiciones de OSM.
- Tráfico, peatones, policía y encargos son mecánicas de juego, no simulación real.
  TODO(integración): mencionar el sentido único de las vías si se fusiona.
- Sin precisión fotogramétrica ni validez catastral; no son medidas arquitectónicas.
