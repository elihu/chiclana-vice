# Chiclana Vice — fuentes de la edición actual

Zona: longitudes -6.156 a -6.141, latitudes 36.415 a 36.424. Origen
[-6.1485,36.4195]; x este, z sur, metros. No se mueve ni sustituye el trazado.

- Catastro INSPIRE BU, municipio 11015, descarga 4/10/2026. 7.448 partes,
  contornos y patios recortados/simplificados 0,12 m, EPSG:25829 a WGS84 y
  coordenadas locales a 0,01 m. Plantas conservadas; altura base plantas×3,05+0,4 m.
  Reconstrucción de juego sin validez catastral. El ZIP original no se publica.
  https://www.catastro.hacienda.gob.es/INSPIRE/Buildings/11/11015-CHICLANA%20DE%20LA%20FRONTERA/A.ES.SDGC.BU.11015.zip
  https://www.catastro.hacienda.gob.es/webinspire/documentos/Licencia.pdf
- © colaboradores OpenStreetMap, ODbL 1.0, extracto 4/10/2026. 616 vías,
  69 áreas, 20 hitos, 14 árboles cartografiados; objetos de calle extraídos aparte.
  Anchuras/categorías de juego inferidas donde no constan. Capas y objetos usados
  disponibles en dist/osm-world.json y dist/street-objects.json.
  https://www.openstreetmap.org/api/0.6/map?bbox=-6.156,36.415,-6.141,36.424
  https://www.openstreetmap.org/copyright
- © IGN / PNOA / SCNE, ortofoto máxima actualidad, CC BY 4.0 compatible.
  WMS 1.1.1, capa OI.OrthoimageCoverage, EPSG:4326, límites anteriores,
  4096×3072 JPEG para suelo/tejados. Consulta 4/10/2026.
  Obra derivada de PNOA 2022-07 CC-BY 4.0 IGN / PNOA / SCNE (scne.es).
  Fecha comprobada el 6/10/2026 con GetFeatureInfo OI.MosaicElement en el centro
  del sector; GetMap actual coincide por SHA256 con aerial.jpg distribuida.
  https://www.ign.es/wms-inspire/pnoa-ma
- IGN / PNOA-LiDAR PRIMERA cobertura 2008–2015: MDSnE2,5 WCS, CC BY 4.0
  scne.es declarado por el servicio, consulta 5/10/2026. Recorte local EPSG:3042,
  551×417 píxeles ~2,5 m, valores enteros en metros. Quince estimaciones de cubierta
  pasan filtros conservadores de 1.399 candidatos/274 con ≥12 muestras.
  Fuente ya normalizada; no restar MDT. Fecha exacta de vuelo local sin confirmar.
  No afirmar cobertura 2020–21, precisión submétrica ni medidas arquitectónicas.
  URL/checksum/filtros/versiones en height-samples.json y height-audit-ign.json.
  https://wcs-mds.idee.es/mds?service=WCS&request=GetCapabilities
  https://pnoa.ign.es/pnoa-lidar/productos-a-descarga
  https://www.ign.es/web/ign/portal/politica-datos
- Three.js 0.169.0 local, MIT; licencia en dist/vendor/LICENSE-three.txt.

## Fachadas y aproximaciones

276 frentes en 243 partes, incluyendo Constitución, La Vega, La Plaza, Caraza,
Jesús Nazareno, Álamo, García Gutiérrez y Corredera Baja. Genéricas aproximadas,
no cada vivienda fotografiada. Ayuntamiento/Mercado e iglesias usan primitivas
interpretando rasgos del edificio real; referencias completas y condiciones en
THIRD_PARTY_NOTICES.md. No se distribuyen originales de fotos/planos como texturas.
Parámetros principales en facade-profiles.json; recetas de geometría en game3d.js.
Alturas de iglesias y Ayuntamiento son aproximaciones visuales independientes,
no mediciones LiDAR. No se aumenta globalmente el número de plantas.

Terreno plano; monumentos simplificados, cubiertas/interiores incompletos.
Árboles: puntos OSM más plantación aproximada determinista (310 en total).
Mobiliario/pavimentos recreados; pasos de peatones toman posiciones OSM.
Puentes, agua, rutas, policía, circulación, cuatro encargos y paseo conservados.
La versión arcade anterior permanece en dist/arcade/.

## Distribución y verificación

La edición pública contiene datos transformados, código y conversores, con
procedencia separada; no originales Catastro ni antiguos derivados REDIAM.
El historial local conserva investigación previa y no se copia a GitHub.
La conversión de formato no elimina licencias. DATOS_PUBLICOS.md documenta
reproducción/exportación; THIRD_PARTY_NOTICES.md delimita derechos y referencias.

Se comprueban invariantes geográficas, checksums, plantas, catálogo de aristas,
flujos del juego y cámaras con DOM/WebGL simulados. Chrome desktop en GPU Intel
Iris Xe comprobado; móvil físico pendiente. No afirmar FPS móvil, precisión
fotogramétrica ni ausencia absoluta de reclamaciones.
