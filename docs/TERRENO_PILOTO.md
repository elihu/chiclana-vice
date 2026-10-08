# Relieve: implementación y revisión local

Implementación original en `feat/relieve-terreno`, base `0b4859d` (7/10/2026).
**La capa real sigue siendo provisional y no se publica.** Desde `fix/relieve-datos`
(`02a5420`) se conserva en Git y se activa por defecto para revisión local.
`fix/superficies-terreno` parte de esa rama y corrige la auditoría sin regenerar cotas.
Sin la capa se conserva el mundo plano anterior. No se acredita el cierre de la fase D
del [plan](PLAN-TERRENO.md). Las copias en `/tmp` descritas abajo son históricas.

## Implementación

- Contrato validado, checksum y rejilla Int16 little-endian; interpolación por triángulos
  NW–SE compartida con el dibujo. Sin datos, plano; con datos corruptos, error; con fallo
  de red, plano con aviso.
- Malla indexada, UV de la ortofoto y transición del borde hacia un exterior decorativo.
  Las dos calidades usan la misma geometría y cambiar calidad conserva alturas.
- Bases máximas de edificios muestreadas en interior y aristas, excluyendo patios;
  cubiertas horizontales. Muros subdivididos en cruces de celdas y diagonales. Partes de
  monumentos comparten base; recetas, portadas y cúpula suman esa base una vez.
- Pavimentos, plazas, rayas y pasos cortados contra los triángulos del terreno. Árboles,
  mobiliario y señales conservan lotes y suman su cota.
- Actores, bienvenida, cámaras, primera persona, etiquetas y marcadores relativos a la
  superficie. Inclinación visual de vehículos limitada a 15°, sin física vertical.
  Permanecen `crossesWall`, los márgenes de patios, `nearestRoad` y DoubleSide.
- Superficies de autor separadas del MDT, perfiles de calzada, agua por tramos y
  plataformas con selección inferior/superior por continuidad y ruta. Contrato,
  evidencia y aproximaciones en [SUPERFICIES_TERRENO.md](SUPERFICIES_TERRENO.md).

## Auditoría del recorte

`source-data/terrain-audit.json` registra consulta y SHA-256 del original. La respuesta
WCS de `Elevacion4258_5` es ASCII envuelto en multipart: 346 × 209 muestras sin NoData,
EPSG:4326 según DescribeCoverage, centros de píxel y filas norte→sur. Paso efectivo de
la respuesta: unos 4,04 m este/oeste y 5,01 m norte/sur. No se deduce el CRS del nombre.
DescribeCoverage declara unidades impropias (`W.m-2.Sr-1`); la fecha de adquisición y
la referencia vertical exacta quedan sin confirmar.

La rejilla derivada cubre exactamente 1343,67 × 1001,88 m: 136 × 102 vértices,
27.744 bytes de alturas y 27.270 triángulos del suelo. Referencia: 6,909 m muestreados
en el origen del mapa; no es una cota certificada. Rango del original: 0–52 m. No se
suaviza el MDT original ni se rellena NoData como cero. Los perfiles construidos
suavizan solo corredores de calzada, según el diseño de autor.

`source-data/terrain-surface-audit.json` se genera sobre las capas corregidas en
memoria. El primer piloto registraba 148 muestras de vías con pendiente superior al
20%; la composición de superficies reduce esas muestras a 43. Ese umbral sirve
para revisión, no como límite físico ni criterio de corrección. Algunas partes de
edificio abarcan cerca de 8 m de desnivel, por lo que los accesos necesitan revisión.

Problemas detectados en el primer piloto, antes de componer plataformas y perfiles:

| Zona                            | Coordenadas locales aproximadas | Motivo                                                                                                           |
| ------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Plaza del Arenal                | x 638, z 142                    | Pendiente muestreada de aproximadamente 54,5%.                                                                   |
| Beatriz Cienfuegos, borde sur   | x 286, z 496                    | Pendiente de aproximadamente 44,2%.                                                                              |
| Remedios                        | x 346, z −110                   | El perfil recto puede interferir con el MDT; revisar también los bordes del tablero.                             |
| Pasarelas 1195660889/1195660891 | x 281, z −120                   | Nodo compartido y cotas incompatibles; perfil inicial hasta 2,62 m bajo el MDT en el eje y 2,80 m en los bordes. |

Las dos últimas pasarelas están confirmadas en OSM como `footway`, `bridge=yes`,
`layer=1`, unidas en el nodo 11097481555. La revisión posterior identifica sus polígonos
de plaza como plataforma sobre el Iro y corrige la interpretación inicial de un rellano
aislado. Ahora comparten cota de plataforma y permiten el paso inferior de Carmen
Picazo. Remedios incluye también San Sebastián inferior. Las cotas estructurales son
aproximaciones de autor explícitas, pendientes de revisión; no se cambia el trazado.

## Reproducción

Descargar originales únicamente fuera del repositorio:

```sh
curl -L --fail 'https://servicios.idee.es/wcs-inspire/mdt?service=WCS&version=2.0.1&request=GetCapabilities' -o /tmp/chiclana-mdt-capabilities.xml
curl -L --fail 'https://servicios.idee.es/wcs-inspire/mdt?service=WCS&version=2.0.1&request=DescribeCoverage&coverageId=Elevacion4258_5' -o /tmp/chiclana-mdt-description.xml
curl -L --fail 'https://servicios.idee.es/wcs-inspire/mdt?service=WCS&version=2.0.1&request=GetCoverage&coverageId=Elevacion4258_5&subset=Lat(36.4148,36.4242)&subset=Long(-6.1563,-6.1407)&format=application/asc' -D /tmp/chiclana-mdt-headers.txt -o /tmp/chiclana-mdt-original.bin
uv run --no-project python tools/audit-terrain.py /tmp/chiclana-mdt-original.bin --date 2026-10-07 --url 'https://servicios.idee.es/wcs-inspire/mdt?service=WCS&version=2.0.1&request=GetCoverage&coverageId=Elevacion4258_5&subset=Lat(36.4148,36.4242)&subset=Long(-6.1563,-6.1407)&format=application/asc'
uv run --no-project python tools/export-terrain.py /tmp/chiclana-mdt-original.bin --preview
node tools/audit-terrain-surfaces.mjs /tmp/chiclana-terrain-export
```

El exportador escribe por defecto en `/tmp/chiclana-terrain-export`. Para revisar,
copiar `web/` a otro directorio bajo `/tmp`, añadir allí los dos archivos generados y
ejecutar sobre esa copia:

```sh
node tools/export-terrain-metadata.mjs /tmp/chiclana-terrain-preview /tmp/chiclana-terreno-baseline.json
node tools/export-provenance.mjs --directory /tmp/chiclana-terrain-preview
uv run --no-project python -m http.server 8080 --bind 127.0.0.1 --directory /tmp/chiclana-terrain-preview
```

Usar `?debug` para consultar cotas. `--preview` muestra un aviso provisional y no
autoriza publicación. La exportación definitiva a `web/` exige una decisión auditada
`validado para el juego`, después de cerrar puentes y accesos; no modificar ese estado
solo para permitir exportar. Al adoptar datos se registra su huella independiente con
`export-terrain-metadata.mjs web source-data/terrain-baseline.json`, sin renovar la huella
de geografía.

## Verificación y pendientes

- Pasan pruebas de contrato, plano, rampa y celda no coplanaria; esquinas, bordes,
  orientación, diagonal y checksum. NoData y reproducción de bytes se comprueban con
  `uv run --no-project python tests/verify-terrain-tools.py`.
- La rampa sintética recorre construcción, bases, coches, peatón, POIs, cámaras y cambio
  de ortofoto. El verificador tradicional sigue comprobando encargos, rutas, patios,
  guardado y controles en plano.
- La huella plana mantiene 1.421 mallas, 761.408 triángulos sin instancias, las mismas
  rutas y la misma traza de simulación. Cambian bytes por llevar la rotación del suelo
  a su geometría, nombres de selección, referencias verticales y orden Euler. No se
  renueva la huella geográfica de edificios y vías.
- Chrome real con SwiftShader arrancó con el recorte en copia local sin errores: unos
  4,4 s, 1.421 mallas y 1.067.549 triángulos incluyendo instancias, frente a 917.276 en
  plano. El incremento incluye suelo, pavimentos y muros subdivididos. No es una medida
  de rendimiento GPU ni de móvil.
- También arrancaron sin errores el plano en raíz y subruta, y el relieve en subruta;
  se comprobó la carga con calidad normal y ligera. Son pruebas de navegador con
  renderizado por software, no aceptación visual de todas las calles.
- La segunda composición de perfiles y plataformas contiene 1.246.745 triángulos
  incluyendo instancias y mantiene 112 llamadas de dibujo. El primer intento de
  refinamiento tenía 1.599.238; se redujo la resolución de construcción y se conserva
  un perfil longitudinal más fino. Las capturas y pruebas genéricas de Chrome cubren
  cuatro posiciones, encima y debajo de ambas plataformas, también con calidad ligera:
  cotas exactas del coche, cámaras finitas y ausencia de bloqueo falso por agua o por
  objetos del otro nivel. No prueban rendimiento GPU ni aceptación visual completa.
- Hay capturas de Mercado, Plaza Mayor, San Telmo, Puente Chico, Remedios y pasarela
  problemática en `/tmp/chiclana-relieve-*.png`. Detectan interferencias y no prueban
  que estén corregidas. La medición inicial de cinco segundos con `measure.js` resultó
  insuficiente; no se presentan FPS ni porcentajes de mejora.
- Pendientes antes de activar/publicar: perfiles de puentes y rellanos, accesos en
  pendiente, revisión visual completa y mediciones comparables. Android físico e iOS
  siguen sin comprobarse con este relieve.

La copia de la primera revisión de superficies permanece congelada mientras se
recorre. Las correcciones posteriores de máscara de agua y obstáculos por nivel se
preparan en otra copia física; cambiar de copia exige coordinación para no alterar una
visita en curso. `browser-smoke.mjs URL google-chrome-stable --surfaces --low` reproduce
las comprobaciones de alturas, cámaras y transitabilidad a partir del diseño cargado,
sin coordenadas especiales en el verificador.

Las condiciones y atribución aprobada están exclusivamente en
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

### Tercera revisión del piloto

Tras confirmar el usuario el relieve general y la lámina del Iro se corrigen cubeta
Alameda, continuidad del Puente Chico y pasarelas, grosor de plataformas,
recubrimiento de calzadas y separación de la reserva del tranvía. La copia local
`/tmp/chiclana-terrain-preview-v4` usa la versión `2026-10-07-terreno-accesos`.
Conserva exactamente 2.173 muestras de cota del río respecto a la revisión anterior.
La construcción local del suelo deja cero protrusiones en 344.100 muestras de vías.
Los perfiles peatonales conservan soporte y pasan colisiones dentro del límite
jugable; dos pasarelas meridionales están recortadas por el borde del mapa y sus
extremos exteriores permanecen fuera de ese límite. El humo en Chrome con
SwiftShader pasa en modo normal y ligero; las capturas no sustituyen la revisión
humana ni acreditan GPU o móvil físicos. La escena del piloto ronda 1,47 millones de
triángulos y 112 llamadas de dibujo en esta comprobación, pendiente de medir en
dispositivos físicos. El contrato y las aproximaciones están en
`SUPERFICIES_TERRENO.md`. La activación publicada sigue pendiente.

### Copia persistente para revisión (8/10/2026)

La rama `fix/relieve-datos` conserva en Git `web/terrain.json`,
`web/terrain.bin` y `source-data/terrain-baseline.json`, junto con los metadatos
regenerados de mundo y procedencia. El recorte recuperado coincide con el SHA-256
del original auditado el 7/10/2026; la rejilla se regenera con el exportador existente.
No se conservan originales en el repositorio. Los diseños de superficies y los
ajustes de accesos son los integrados en `main`.

La capa mantiene `preview: true` y la decisión de auditoría pendiente: se activa
para la revisión local de esta rama, sin declarar validación ni publicar.
La copia de prueba ya no depende de `/tmp`: se sirve directamente `web/` del
worktree persistente de la rama. La huella de geografía no cambia.

## Auditoría corregida en `fix/superficies-terreno`

Rama creada desde `02a5420`; no integrada ni publicada. Los tres archivos de cotas y
huella permanecen idénticos al punto de partida (`preview: true`, SHA-256 de alturas
`4fce7079…`). No se modifican contornos, coordenadas, plantas ni diseño de instancias.
La ampliación del mapa y los zócalos/accesos basados en `baseY = max` quedan fuera de
esta corrección. La implementación de bases no se cambia.

Evidencia persistente en `source-data/auditoria-relieve/`:

| Comprobación                                            | Antes                              | Después                            |
| ------------------------------------------------------- | ---------------------------------- | ---------------------------------- |
| Salto máximo en unión en T                              | 1,723327 m                         | 0 m                                |
| Salto máximo entre extremos compartidos                 | 0,380845 m                         | 1,11 × 10⁻¹⁶ m                     |
| `createSurfaceModel`, mediana CPU Node v26.8.2          | 343,42 ms                          | 158,87 ms                          |
| Mediana justo antes de optimizar el modelo ya corregido | 261,53 ms                          | 158,87 ms                          |
| Consulta de actor, misma tanda de 100.000 puntos        | 2,18 µs                            | 0,80 µs                            |
| Escena con relieve en Chrome SwiftShader                | 1.465.517 triángulos, 112 llamadas | 1.465.563 triángulos, 112 llamadas |
| Huella plana CPU                                        | `3afabb84…`                        | idéntica                           |

Solo se conservan `antes.json` y `despues.json`, con las mediciones históricas de
esta revisión. La tabla recoge la evidencia puntual de Chrome, modo plano y la
medición intermedia; los informes auxiliares y el script temporal se retiraron.
`tools/bench-terrain-surfaces.mjs [raíz] [informe.json]` fija la semilla de 100.000
consultas y mide siete construcciones tras una de calentamiento. Se usó el mismo
script y máquina para ambos informes; los tiempos son orientativos de CPU y varían
entre tandas. No son medidas de FPS, GPU ni móvil.

Para una refactorización que deba conservar el resultado exacto, la herramienta
calcula huellas de la malla y de 2.173 puntos deterministas por polígono de agua,
incluidas cubetas. `--compare` contrasta esas huellas y termina con código 1 si
cambian. Es una comprobación puntual y voluntaria: no forma parte de `npm run check`.
No debe usarse para exigir igualdad cuando se añaden plataformas o se ajusta el diseño.
Los informes históricos anteriores a esta opción no incluyen huellas; generar una
referencia nueva antes de optimizar, fuera del conjunto de evidencia versionado:

```sh
node tools/bench-terrain-surfaces.mjs . /tmp/superficies-antes.json
# Después de la refactorización, en el mismo equipo y con la misma versión de Node:
node tools/bench-terrain-surfaces.mjs . /tmp/superficies-despues.json --compare /tmp/superficies-antes.json
```

El auditor nuevo cuenta 611 pares de extremos y 411 uniones en T. El script recibido
contaba 409 T porque su mapa guardaba una sola vía interior por coordenada y usaba
extremos de perfiles sobrescritos cuando un ID aparecía varias veces. Ahora compara
las cotas consultadas en cada coordenada para todas las apariciones. No se omite
ninguna unión del mismo nivel ni se eleva el umbral de 5 cm.

`tests/verify-surface-junctions.mjs` carga mundo corregido y terreno real como el
auditor e impone el máximo de 5 cm como invariante de continuidad. La igualdad de
las 2.173 muestras del río y de los bytes de malla fue evidencia puntual de esta
optimización; no se fija como contrato permanente del diseño. La auditoría de pendientes sigue
disponible con `node tools/audit-terrain-surfaces.mjs web RUTA_INFORME`. El informe
final registra 47 muestras con pendiente >20%, frente a las 43 de la composición
anterior; es un indicador de revisión, no un criterio de aceptación ni un límite
físico.

Para la comparación plana se apartaron temporalmente `terrain.json` y `terrain.bin`,
se ejecutó `scene-fingerprint.mjs` y se restauraron. Las huellas puntuales
coincidieron en geometría, materiales, transformaciones, recursos,
rutas y traza de 600 pasos. Permanecen 1.421 mallas y 917.276 triángulos con instancias.

Chrome sin interfaz pasa `tools/browser-smoke.mjs URL google-chrome-stable --surfaces`
y `--surfaces --low`: arranque sin errores, niveles superior/inferior, techo, cámaras
finitas, cotas de vehículo y perfiles peatonales sin bloqueo dentro del límite jugable.
La tabla conserva el resultado de estas comprobaciones. El incremento de 46
triángulos corresponde a los corredores siguiendo la polilínea y los cortes explícitos
en límites de plataformas. Las dos pasarelas recortadas por el borde siguen teniendo
muestras fuera del límite, que no se convierte en un pendiente de ampliación.
`npm run check` pasa con el relieve activo. Estos verificadores y SwiftShader no
acreditan revisión visual completa, GPU física ni móvil; sigue pendiente la prueba del
usuario y las mediciones en dispositivos físicos.
