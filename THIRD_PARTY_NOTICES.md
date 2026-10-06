# Licencias, procedencia y alcance

Código propio: MIT, Copyright 2026 elihu, véase LICENSE.
MIT no sustituye las condiciones de datos, imágenes, librerías o derechos ajenos.
La conversión a JSON y la distribución gratuita no extinguen sus obligaciones.
El juego es independiente, sin afiliación ni recursos de Rockstar Games.

## Catastro: edificios transformados

`buildings.json`: D.G. del Catastro, INSPIRE BU, municipio 11015,
descarga 4/10/2026. Recorte geográfico, simplificación topológica de 0,12 m,
coordenadas locales en metros redondeadas a 0,01 m y reconstrucción de volúmenes
de juego a partir de contornos, patios y plantas. Altura base: plantas × 3,05 + 0,4 m.
No es información catastral oficial ni tiene validez catastral. Las alturas visuales
son estimaciones y no cambian los números de plantas originales.
El producto transformado se distribuye conforme a la licencia INSPIRE de Catastro;
no se redistribuye su ZIP/GML original en la edición pública.
https://www.catastro.hacienda.gob.es/webinspire/documentos/Licencia.pdf

## OpenStreetMap: base geográfica ODbL

© colaboradores de OpenStreetMap, ODbL 1.0, extracto del 4/10/2026.
`osm-world.json` ofrece la capa usada completa: vías, parques/plazas/agua,
árboles cartografiados e hitos; `street-objects.json` incluye objetos cartografiados.
`roads-osm.json` mantiene el extracto descargable anterior de vías.
Transformaciones: recorte, coordenadas locales y categorías/ancho inferidos para juego.
La asociación de nombres de calle con frentes en el catálogo también procede de OSM;
las huellas Catastro y alturas IGN siguen identificadas con sus condiciones.
Los datos OSM y las contribuciones a esa base se ofrecen bajo ODbL, no bajo MIT.
https://www.openstreetmap.org/copyright
https://opendatacommons.org/licenses/odbl/1-0/

## IGN / PNOA / SCNE: imagen y alturas

Obra derivada de PNOA 2022-07,
CC-BY 4.0 IGN / PNOA / SCNE (scne.es). Consulta: 4/10/2026.
Obra derivada de PNOA-LiDAR MDSnE2,5 2008–2015 CC-BY 4.0 scne.es.
La fecha de consulta no sustituye a la fecha de adquisición del producto.
Ortofoto: GetFeatureInfo OI.MosaicElement indica 2022-07 en el centro del sector;
GetMap comprobado el 6/10/2026 coincide por SHA256 con aerial.jpg distribuida
(98d78226512a164a76c244c9925ecc1e01a145f7fcc189a396aaf253151752af).
`aerial.jpg`: ortofoto PNOA máxima actualidad consultada 4/10/2026,
WMS IGN, recorte 4096 × 3072 de la zona jugable; usado en suelo y tejados.
`height-samples.json` y auditoría IGN: derivados independientes del producto
MDSnE2,5 de PRIMERA cobertura PNOA-LiDAR (2008–2015), consultado 5/10/2026.
El servicio WCS declara CC BY 4.0 scne.es. Se seleccionó una ventana local y
se calculó P80 dentro de contornos erosionados 1 m. Alturas ya normalizadas al
terreno; no se restó MDT. Quince partes pasan los filtros documentados.
Píxeles de unos 2,5 m, valores almacenados en pasos de 1 m; fecha exacta del vuelo
local sin confirmar. No son medidas arquitectónicas ni alturas de cornisa.
Se indican transformaciones, fuente, fecha, checksum y límites en los archivos.
Conservar esta atribución y señalar modificaciones futuras.
https://www.ign.es/web/ign/portal/politica-datos
https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf
https://wcs-mds.idee.es/mds?service=WCS&request=GetCapabilities
https://creativecommons.org/licenses/by/4.0/

## Three.js

Three.js 0.169.0, MIT, Copyright © 2010–2024 three.js authors.
Mantener `vendor/LICENSE-three.txt` junto a la librería.

## Fachadas, monumentos y referencias

Modelos aproximados construidos con primitivas y reglas de juego. Se interpretan
rasgos del edificio real; no se distribuyen las fotografías, planos originales,
texturas fotográficas ni su composición o iluminación como assets del juego.
`facade-profiles.json` reúne parámetros propios; el catálogo identifica aristas,
dimensiones y procedencia de alturas/nombres. No es una reconstrucción fotogramétrica.
Las recetas geométricas siguen en el código; no se ha horneado toda la escena.

Referencias que se mantienen identificadas, con sus condiciones originales:
- Ayuntamiento: Jms1952, 9/10/2023, CC BY-SA 4.0.
  https://commons.wikimedia.org/wiki/File:Ayuntamiento_de_Chiclana_de_la_Frontera.jpg
- Mercado: Xemenendura, 10/4/2025, CC BY-SA 4.0.
  https://commons.wikimedia.org/wiki/File:Mercado_municioal_Chiclana.jpg
- Jesús Nazareno: «Fachadas lateral y principal del Convento de Jesús Nazareno»,
  Isabel Dugo Cobacho, 23/8/2012, © Instituto Andaluz del Patrimonio Histórico,
  CC BY-NC-SA 3.0.
  https://repositorio.iaph.es/handle/11532/331929
  https://guiadigital.iaph.es/sys/productos/ClausurasCadiz/chiclana/jesusnazareno/conventoJesusNazarenoPortada.html
- Portada Jesús Nazareno: Xemenendura, 29/12/2015, CC BY-SA 3.0 Unported.
  https://commons.wikimedia.org/wiki/File:Portada_Jes%C3%BAs_Nazareno.jpeg
  https://creativecommons.org/licenses/by-sa/3.0/
- San Telmo: Xemenendura, 5/12/2021, CC BY-SA 4.0.
  https://commons.wikimedia.org/wiki/File:Iglesia_San_Telmo_Chiclana.jpg
- Turismo municipal: referencias documentales; licencia abierta no verificada.
  https://turismo.chiclana.es/detalle-de-recurso/iglesia-de-san-telmo/
  https://turismo.chiclana.es/detalle-de-recurso/iglesia-de-san-juan-bautista/
- Ayuntamiento: alzado/sección de Rafael Suárez Almanzor y Victorín Agueda Goyeneche,
  proyecto de 2006, consultado para interpretar escala vertical; originales no
  redistribuidos. No se ha identificado una licencia abierta para estos planos.
  https://www.juntadeandalucia.es/fomentoyvivienda/portal-web/web/areas/arquitectura/ArquitecturaObras/8d49721f-0e54-11e4-b2a9-5d6b642921e7

Consultar una foto para identificar hechos/rasgos arquitectónicos no impone
automáticamente su licencia al motor. Si se incorporan fotografías o adaptaciones
de su expresión protegida, habrá que aplicar las condiciones correspondientes
(atribución/compartir igual y, en IAPH, no comercial) o reemplazar ese recurso.
MIT no otorga esos derechos. El artículo 35.2 de la LPI contextualiza las vistas
de obras permanentes en vías públicas; no se usa como permiso universal para
copiar fotos ni para cualquier modelo 3D.
https://creativecommons.org/faq/#what-is-an-adaptation
https://creativecommons.org/licenses/by-sa/4.0/
https://creativecommons.org/licenses/by-nc-sa/3.0/
https://www.boe.es/buscar/act.php?id=BOE-A-1996-8930#a35

No se ofrecen garantías de exactitud geográfica, ausencia de derechos de terceros
ni respaldo de las instituciones citadas. La edición pública excluye originales
Catastro y los anteriores derivados/auditorías/capturas REDIAM.

## Resultado de la revisión de fachadas — 6/10/2026

Las fachadas genéricas se generan por reglas, sin fotografías de cada vivienda.
Quedan abiertos dos puntos antes de considerar cerrada la revisión de monumentos:
las figuras específicas de la portada de Jesús Nazareno y la dependencia del alzado
moderno del Ayuntamiento para su escala vertical 1,6. No se ha verificado autoría
y vigencia de derechos de esas figuras ni una licencia de adaptación del alzado.
Las atribuciones anteriores documentan las consultas, no conceden esos permisos.
No se han alterado esos modelos ni sus proporciones para aparentar una resolución.
Para cerrar estos puntos: documentar una medición independiente del Ayuntamiento
y sustituir las figuras por ornamentación propia o verificar sus derechos.
