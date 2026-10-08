# Relieve: implementación y revisión local

Implementación original en `feat/relieve-terreno`, base `0b4859d` (7/10/2026).
**Validado para el juego el 8/10/2026** tras la revisión visual del usuario (véase
[Validación](#validación-8102026)); activo por defecto en `web/`. Desde `fix/relieve-datos`
(`02a5420`) se conserva en Git y `fix/superficies-terreno` corrigió la auditoría sin
regenerar cotas. Sin la capa se conserva el mundo plano anterior. Las secciones
siguientes describen la historia del piloto; las copias en `/tmp` son históricas.

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

La rejilla derivada cubre 1360 × 1020 m, con `bounds: [-680, 680, -510, 510]`,
paso exacto de 10 m y 137 × 103 vértices: 28.222 bytes y 27.744 triángulos
del MDT. El mundo conserva 1343,67 × 1001,88 m. Referencia: 6,909 m muestreados
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

Descargar originales únicamente fuera del repositorio, en la caché persistente
`~/.cache/chiclana-vice/mdt` (las rutas de `audit-terrain.py` apuntan ahí por defecto):

```sh
mkdir -p ~/.cache/chiclana-vice/mdt
curl -L --fail 'https://servicios.idee.es/wcs-inspire/mdt?service=WCS&version=2.0.1&request=GetCapabilities' -o ~/.cache/chiclana-vice/mdt/capabilities.xml
curl -L --fail 'https://servicios.idee.es/wcs-inspire/mdt?service=WCS&version=2.0.1&request=DescribeCoverage&coverageId=Elevacion4258_5' -o ~/.cache/chiclana-vice/mdt/description.xml
curl -L --fail 'https://servicios.idee.es/wcs-inspire/mdt?service=WCS&version=2.0.1&request=GetCoverage&coverageId=Elevacion4258_5&subset=Lat(36.4148,36.4242)&subset=Long(-6.1563,-6.1407)&format=application/asc' -D ~/.cache/chiclana-vice/mdt/headers.txt -o ~/.cache/chiclana-vice/mdt/original.bin
uv run --no-project python tools/audit-terrain.py ~/.cache/chiclana-vice/mdt/original.bin --date 2026-10-07 --url 'https://servicios.idee.es/wcs-inspire/mdt?service=WCS&version=2.0.1&request=GetCoverage&coverageId=Elevacion4258_5&subset=Lat(36.4148,36.4242)&subset=Long(-6.1563,-6.1407)&format=application/asc'
uv run --no-project python tools/export-terrain.py ~/.cache/chiclana-vice/mdt/original.bin --preview
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

## Validación (8/10/2026)

El usuario revisó el relieve en el navegador y lo considera realista respecto al
terreno real, con pequeños defectos visuales pendientes de localizar. Con esa revisión,
`source-data/terrain-audit.json` registra la decisión `validado para el juego`, con fecha
y nota, mediante `audit-terrain.py --decision`; la evidencia de servicio se conserva.
`export-terrain.py` regeneró la capa en `web/` sin `--preview`: `terrain.bin` es idéntico
(SHA-256 `4fce7079…`) y solo cambia `preview` en el manifiesto, lo que retira el aviso de
relieve provisional. Se regeneraron metadatos, huella independiente, procedencia y la
auditoría de superficies.

La validación es de juego, no topográfica: la referencia vertical y la fecha de
adquisición del MDT siguen sin confirmar y las cotas estructurales son aproximaciones
de autor. Quedan pendientes los defectos visuales menores, zócalos y accesos de edificios
en pendiente (`baseY` máximo) y la prueba en un móvil físico.

## Fase 0 de ampliación: rejilla del relieve (8/10/2026)

Solo pasos 0.1 y 0.2, desde `main` f1e4ad3. No cambia el rectángulo jugable,
la ortofoto ni el diseño de superficies. La decisión de la auditoría original se
conserva; **el paso 0.2 queda pendiente de revisión visual** del Iro, plataformas,
Plaza Mayor y accesos. No acredita GPU ni móvil físico.

El refactor 0.1 conserva exactamente el SHA de la malla
`cd14f7372782357cf7d00b54ba2a2a77372a7ee8088eb7a6a817a27dedfe148e`
y el del agua (4.346 consultas). `bench-terrain-surfaces.mjs --compare`
y `scene-fingerprint.mjs --compare` pasan: escena con relieve idéntica
(1.465.563 triángulos) y escena plana idéntica (917.276 triángulos), incluidas
transformaciones, materiales, recursos y traza de comportamiento. Para el plano
se apartaron temporalmente ambos archivos y se restauraron. Las referencias
son mediciones puntuales en `/tmp`, no tests de instantánea permanentes.

El paso 0.2 reexporta del original con SHA-256
`71572c05394d10d6d3c708760c2ebc6233df68593cf79f7df125efd730261cae`,
sin descarga nueva ni extrapolación. SHA-256 del binario reexportado:
`ab830423efd95e6926da862b21d690d304418eb218662b616b2cb9716ff5c27c`.
La malla construida pasa de 271 × 203 a 273 × 205 (paso 5 m).
En los 13.872 vértices de la rejilla anterior, la diferencia absoluta del MDT
muestreado es 0,103221 m de media y 2,778100 m de máximo
(en x=373,241667, z=163,673465; diferencia −2,778100 m). Son cambios
de remuestreo, no desplazamientos del mundo ni mediciones de precisión.

| Auditoría CPU                                                  |     Antes |   Después |
| -------------------------------------------------------------- | --------: | --------: |
| Muestras de vía con pendiente >20 %                            |        47 |        44 |
| Muestras MDT de vía con pendiente >20 %                        |       148 |       152 |
| Desnivel máximo de edificio (índice 5865), m                   |  8,769545 |  8,933147 |
| Base de ese edificio, m                                        |  8,761223 |  9,008630 |
| Salto máximo en 611 extremos compartidos y 411 uniones en T, m |  1,11e-16 |  4,44e-16 |
| Triángulos de escena con instancias                            | 1.465.563 | 1.466.564 |

Los nueve puentes conservan sus perfiles como fuente única. Separación mínima
tablero–suelo y pendiente máxima, calculadas por la misma auditoría:

| Vía        | Separación antes/después, m | Pendiente antes/después |
| ---------- | --------------------------: | ----------------------: |
| 50664224   |         1.106639 / 0.745214 |     0.000000 / 0.000000 |
| 53800523   |        0.012047 / -0.061123 |     0.012643 / 0.012213 |
| 142805148  |         1.085064 / 1.263948 |     0.020823 / 0.021899 |
| 759565061  |         4.000000 / 4.000000 |     0.000000 / 0.000000 |
| 759565062  |         1.482732 / 2.462496 |     1.728298 / 2.442239 |
| 760833292  |         0.851980 / 0.926895 |     0.025565 / 0.018726 |
| 760833297  |         0.532079 / 0.502554 |     0.017765 / 0.028079 |
| 1195660889 |         2.796687 / 2.700113 |     0.000000 / 0.000000 |
| 1195660891 |         0.505360 / 0.536922 |     0.514738 / 0.516802 |

Puente Chico registra −0,061123 m de separación mínima, medida en los bordes del
tablero junto al estribo de x 121, z −209; en el eje es +0,025 m. Es el apoyo del
tablero en el suelo, no un cruce en el vano. No se ajusta el diseño para ocultarlo.

**Escalones de acceso (corregido en esta fase).** La pendiente 2,44 de la vía 759565062
era un escalón de 0,83 m en 0,34 m en el acceso peatonal al tablero de Remedios (x 337,4,
z −157,3), ya presente antes de la fase (0,59 m). La transición hacia una plataforma se
recortaba a la longitud de la propia vía. Ahora mide siempre `smoothingRadius` y la
rampa sigue por la acera vecina; cambian 9 de 609 perfiles. La pendiente máxima de esa
vía pasa a 0,003. La pasarela 1195660891 de la Gran Plaza baja de 1,01 m a 0,82 m en
2 m: lo que queda es el desnivel de diseño entre la orilla (−2,5 m) y la plataforma
(+1,0 m) repartido en el radio de 16 m, no un escalón. Suavizarlo más es una decisión de
diseño (radio o acceso de autor). `verify-surface-junctions.mjs` impone ahora como
máximo 0,3 m de desnivel en 1 m de perfil con los datos reales (máximo actual 0,196 m,
cuesta del MDT en la vía 53650596), y `verify-surfaces.mjs` cubre un acceso más corto
que el radio. El informe generado vigente es `source-data/terrain-surface-audit.json`.

Comprobaciones: contrato, cobertura y anclaje, interpolación, recorte de
pavimentos, superficies sintéticas, uniones reales, runtime y escena;
`npm run check` y `tests/verify-terrain-tools.py`. Chrome se ejecuta mediante
`browser-smoke.mjs --surfaces`, normal y `--low`, ambos sin errores y con 112 llamadas de dibujo, usando SwiftShader. El
verificador de accesos excluye el borde **jugable**, no el margen del MDT: este
margen no amplía la zona de colisión. La revisión visual humana sigue pendiente.
