# Relieve: implementación y revisión local

Rama `feat/relieve-terreno`, base `0b4859d` (7/10/2026). **La capa real sigue siendo
provisional: no se publica ni se activa por defecto en la rama.** El modo plano conserva
el mundo y el comportamiento anteriores. La revisión local usa una copia separada con
`terrain.json` y `terrain.bin`; no acredita cierre de la fase D del
[plan](PLAN-TERRENO.md).

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
- Índice estático de tableros separado del terreno. **Su perfil inicial une cotas de
  accesos; es una hipótesis pendiente de resolver para varios tramos reales.** El agua
  es horizontal por área en el mínimo del borde, una aproximación visual sin medición
  de profundidad o marea.

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
suavizan pendientes ni se rellena NoData como cero.

`source-data/terrain-surface-audit.json` se genera sobre las capas corregidas en
memoria. Registra 148 muestras de vías con pendiente superior al 20%; ese umbral sirve
para revisión, no como límite físico ni criterio de corrección. Algunas partes de
edificio abarcan cerca de 8 m de desnivel, por lo que los accesos necesitan revisión.

Puntos prioritarios:

| Zona                            | Coordenadas locales aproximadas | Motivo                                                                                                           |
| ------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Plaza del Arenal                | x 638, z 142                    | Pendiente muestreada de aproximadamente 54,5%.                                                                   |
| Beatriz Cienfuegos, borde sur   | x 286, z 496                    | Pendiente de aproximadamente 44,2%.                                                                              |
| Remedios                        | x 346, z −110                   | El perfil recto puede interferir con el MDT; revisar también los bordes del tablero.                             |
| Pasarelas 1195660889/1195660891 | x 281, z −120                   | Nodo compartido y cotas incompatibles; perfil inicial hasta 2,62 m bajo el MDT en el eje y 2,80 m en los bordes. |

Las dos últimas pasarelas están confirmadas en OSM como `footway`, `bridge=yes`,
`layer=1`, unidas en el nodo 11097481555. Están dentro de polígonos de plaza, junto a
la Alameda, al oeste de Remedios; **no cruzan el Iro**. La ortofoto muestra equipamiento
con diferencias de nivel en ese entorno. Esto identifica el problema, pero no confirma
la cota estructural del rellano. No se usa una envolvente automática para ocultarlo ni
se cambian los trazados.

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
- Hay capturas de Mercado, Plaza Mayor, San Telmo, Puente Chico, Remedios y pasarela
  problemática en `/tmp/chiclana-relieve-*.png`. Detectan interferencias y no prueban
  que estén corregidas. La medición inicial de cinco segundos con `measure.js` resultó
  insuficiente; no se presentan FPS ni porcentajes de mejora.
- Pendientes antes de activar/publicar: perfiles de puentes y rellanos, accesos en
  pendiente, revisión visual completa y mediciones comparables. Android físico e iOS
  siguen sin comprobarse con este relieve.

Las condiciones y atribución aprobada están exclusivamente en
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
