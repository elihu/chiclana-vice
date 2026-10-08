# Estudio preliminar: ampliación del mapa y ortofoto por teselas

Fecha: 7/10/2026. Estudio, no plan de implementación: fija qué se quiere, si es viable y
en qué orden. Cada fase necesitará su propio plan detallado.

## Objetivo

- Incluir en el juego la **Ermita de Santa Ana**, el **Puente VII Centenario** (el
  «puente azul») y, con menos prioridad, el **recinto ferial**.
- Modelar la **Ermita del Cristo de la Veracruz** (Plaza del Santo Cristo) y mejorar la
  **Iglesia Mayor (San Juan Bautista)**, que hoy son un bloque genérico y una aproximación
  poco reconocible.
- Subir la calidad de la ortofoto sin perder rendimiento, cargándola por teselas
  alrededor del jugador.

## Situación de cada lugar

Coordenadas de juego (x este, z sur, metros desde el origen -6.1485 / 36.4195). Área
actual: 1.343,67 × 1.001,88 m, centrada en el origen (|x| ≤ 671,8, |z| ≤ 500,9).
Posiciones de OpenStreetMap consultadas el 7/10/2026.

| Lugar                                 | Posición                    | Situación                                                               |
| ------------------------------------- | --------------------------- | ----------------------------------------------------------------------- |
| Ermita de Santa Ana (OSM 186528285)   | (-227, 530)                 | 29 m fuera por el sur; el parque Colina de Santa Ana queda medio dentro |
| Puente VII Centenario (OSM 142805148) | (-490, -484) a (-470, -533) | 53 m, cuatro carriles; dentro solo 17 m                                 |
| Recinto ferial (Parque Las Albinas)   | (-593, -978)                | 478 m fuera por el norte, pasado el Puente VII Centenario               |
| Ermita del Cristo de la Veracruz      | (202, 381)                  | Dentro; hoy es un monumento sin modelo (contorno de 5 vértices)         |
| Iglesia Mayor (San Juan Bautista)     | (230, 171)                  | Dentro; nave, portada y cúpula aproximadas en `facade-designs.json`     |

La Ermita de Santa Ana consta en OSM como bien patrimonial del IAPH (Wikidata Q5392518).

## Ampliación: anexos, no un rectángulo mayor

Partes de edificio de Catastro INSPIRE BU (descarga del 7/10/2026, contadas por su primer
vértice; el juego tiene hoy 7.448 tras recortar):

| Opción                                                                  | Área    | Partes nuevas  |
| ----------------------------------------------------------------------- | ------- | -------------- |
| Rectángulo que abarque los tres lugares                                 | × 2,3   | ~5.500 (+75 %) |
| Anexo Santa Ana: x -420…-60, z 500…650                                  | 5,4 ha  | 334            |
| Anexo norte: Puente VII Centenario y ferial, x -820…-380, z -1.120…-500 | 27,3 ha | 84             |

Los anexos añaden unas 420 partes (+6 %). El anexo norte es casi todo campo abierto. Si el
ferial se descarta, el puente solo necesita un anexo de unos 60 m al norte.

Cambios necesarios:

1. **Límites del mundo** (una sola vez): el código supone un rectángulo centrado en el
   origen (`world.worldW` y `worldH`) en colisión con el borde (`world/spatial.js`), aviso
   de salida (`ui/hud.js`), mapa (`ui/map.js`), plano de suelo (`engine/renderer.js`),
   coordenadas de textura de las cubiertas (`world/buildings.js`) y filtros de
   mobiliario y vegetación. Pasaría a «rectángulo principal y anexos» en `world.json`. El
   origen no cambia: se conservan todas las coordenadas actuales.
2. **Datos**: `tools/rebuild-map.py` recorta con `shapely`, así que admite la unión de los
   recuadros. Los edificios y vías hoy cortados por el borde se completarán: cambio de
   contorno deliberado, con huella geográfica nueva en su propio commit.
3. **Relieve**: publicado en la versión 1.2.0. Su rejilla debe anclarse al origen, su
   recorte del MDT cubrir los anexos y su malla trocearse por teselas; el plan lo asume
   (fase 0 y paso 4.2). Santa Ana está en un cerro, así que gana mucho con él.
4. **Modelos** como recetas de `facade-designs.json`: Ermita de Santa Ana, Puente VII
   Centenario (tablero, estructura azul y barandillas), Ermita de la Veracruz y una
   Iglesia Mayor más fiel. El ferial, como mucho la explanada y la portada.
5. **Juego**: Santa Ana como mirador en `game-data.js` y quizá un encargo.

## Ortofoto por teselas

El vuelo PNOA de toda la zona es de julio de 2022 con **0,25 m/píxel** (GetFeatureInfo
de `OI.MosaicElement` en el centro, Santa Ana, la Concordia y el ferial; ortoimagen no
verdadera). Hoy se usan unos 0,33 m/píxel: se puede ganar un 33 % de nitidez lineal y no
más, porque pedir más resolución al WMS solo amplía los mismos píxeles.

Diseño propuesto:

- Teselas de unos 256 m: 1024 × 1024 a 0,25 m/píxel en escritorio y 512 × 512 en móvil y
  modo ligero. Las genera una herramienta de `tools/` a partir del WMS del IGN.
- Una vista general de todo el mapa, a 1 m/píxel aproximadamente, siempre cargada: fondo
  mientras llegan las teselas, mapa (M) y respaldo si una falla.
- Carga de las teselas en un radio de 300–400 m alrededor del jugador, adelantado en la
  dirección de marcha; las lejanas se liberan (`dispose`). La niebla corta la vista a
  620 m (380 en modo ligero).
- Cubiertas: los edificios ya se agrupan en celdas de 85 m; cada grupo usa la tesela de su
  zona. Las teselas llevan un margen solapado, calculado por la herramienta, para los
  tejados que cruzan el borde.
- Los anexos son solo teselas adicionales; no hace falta una imagen por anexo.

Estimación:

|                        | Hoy                  | Con teselas                         |
| ---------------------- | -------------------- | ----------------------------------- |
| Nitidez (escritorio)   | 0,33 m/píxel         | 0,25 m/píxel                        |
| Memoria GPU escritorio | ~67 MB (4096 × 3072) | ~70–80 MB (12–16 teselas y general) |
| Memoria GPU móvil      | ~13 MB               | ~20 MB                              |
| Descarga inicial       | 3,3 MB               | ~4 MB                               |
| Tamaño publicado       | 4,5 MB               | ~25 MB con anexos                   |

Riesgos: un instante de vista general a mucha velocidad (se mitiga precargando), costuras
entre teselas (margen y filtrado), y huella de escena distinta porque el suelo pasa a
estar troceado (necesita tests de carga y liberación). Los edificios no necesitan
cargarse por zonas: el JSON pesa 1 MB y crece un 6 %; la misma rejilla serviría si algún
día el mapa crece mucho más.

## Plan

El orden y los pasos están en [PLAN-AMPLIACION.md](PLAN-AMPLIACION.md): límites con
rectángulos, teselas de ortofoto, anexos y modelos.

Fuentes: las de [MAP_SOURCES.md](MAP_SOURCES.md) (Catastro INSPIRE BU, OpenStreetMap,
PNOA del IGN); no se añaden fuentes ni licencias nuevas.
