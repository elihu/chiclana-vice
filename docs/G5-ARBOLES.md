# G5.3: capa publicada y juego

Medición del 13/10/2026 contra `main 04081ae`, extraído con `git archive`,
sin cambiar de rama. Chrome sin interfaz, SwiftShader, 1280 × 720, sesión
congelada y puntos de `scene-budget.mjs`. No acredita GPU física, móvil ni FPS.

386 → 3.319 árboles: capa 0 → 3.113; OSM 15 → 1; plaza 4 → 4;
relleno de parque 367 → 201. Los 14 puntos OSM omitidos tienen otra copa
dentro de la separación exigida. La capa no se deduplica contra sí misma: conserva
todas las copas aceptadas (el detector ya aplica 3 m de separación).

## Presupuesto normal

Llamadas y triángulos totales incluyen sombras en normal; las instancias
de vegetación corresponden al frustum principal (incluyen arbustos y cinco piezas por copa).

| Punto               | Cámara          | Llamadas antes → después | Triángulos antes → después | Instancias vegetación antes → después |
| ------------------- | --------------- | -----------------------: | -------------------------: | ------------------------------------: |
| Alameda             | sigue           |                366 → 374 |          1148247 → 1617099 |                           1363 → 8692 |
| Alameda             | primera-persona |                359 → 366 |          1146350 → 1602162 |                           1363 → 8529 |
| Alameda             | aerea           |                148 → 158 |           834180 → 1008860 |                            188 → 1823 |
| Mercado de Abastos  | sigue           |                288 → 308 |           942900 → 1379756 |                           1073 → 6275 |
| Mercado de Abastos  | primera-persona |                280 → 300 |           940252 → 1332596 |                           1047 → 5690 |
| Mercado de Abastos  | aerea           |                178 → 199 |           893828 → 1295874 |                            531 → 5157 |
| Plaza Mayor         | sigue           |                471 → 465 |          1268321 → 2166581 |                          2069 → 16644 |
| Plaza Mayor         | primera-persona |                456 → 459 |          1261735 → 2161245 |                          2069 → 16644 |
| Plaza Mayor         | aerea           |                114 → 150 |            445442 → 927018 |                            119 → 6409 |
| Ermita de Santa Ana | sigue           |                401 → 413 |           847100 → 1826268 |                          1893 → 14988 |
| Ermita de Santa Ana | primera-persona |                374 → 395 |           838188 → 1818606 |                          1888 → 14983 |
| Ermita de Santa Ana | aerea           |                148 → 152 |           532430 → 1216676 |                            809 → 8450 |
| San Telmo           | sigue           |                329 → 345 |          1201826 → 1592562 |                           1015 → 5881 |
| San Telmo           | primera-persona |                320 → 335 |          1196400 → 1584320 |                           1015 → 5849 |
| San Telmo           | aerea           |                170 → 197 |          1129154 → 1427238 |                            331 → 3432 |

Construcción completa de árboles y arbustos: 287.6 → 474.0 ms.
Una muestra de arranque por calidad, con otras verificaciones concurrentes;
no es un benchmark de latencia ni una medida de fluidez.

## Presupuesto ligero

Llamadas y triángulos totales incluyen sombras en normal; las instancias
de vegetación corresponden al frustum principal (incluyen arbustos y cinco piezas por copa).

| Punto               | Cámara          | Llamadas antes → después | Triángulos antes → después | Instancias vegetación antes → después |
| ------------------- | --------------- | -----------------------: | -------------------------: | ------------------------------------: |
| Alameda             | sigue           |                212 → 206 |            693028 → 818360 |                            188 → 2506 |
| Alameda             | primera-persona |                210 → 203 |            692003 → 804295 |                            188 → 2343 |
| Alameda             | aerea           |                  76 → 85 |            586246 → 675986 |                            188 → 1823 |
| Mercado de Abastos  | sigue           |                172 → 180 |            518282 → 690534 |                            446 → 3677 |
| Mercado de Abastos  | primera-persona |                165 → 173 |            515678 → 643418 |                            420 → 3092 |
| Mercado de Abastos  | aerea           |                 92 → 109 |            523359 → 762545 |                            531 → 5157 |
| Plaza Mayor         | sigue           |                283 → 243 |            540463 → 672315 |                            222 → 2704 |
| Plaza Mayor         | primera-persona |                272 → 241 |            536165 → 669267 |                            222 → 2704 |
| Plaza Mayor         | aerea           |                  62 → 85 |            372746 → 742854 |                            119 → 6409 |
| Ermita de Santa Ana | sigue           |                268 → 259 |            512704 → 941408 |                            809 → 8450 |
| Ermita de Santa Ana | primera-persona |                242 → 242 |            503836 → 933790 |                            804 → 8445 |
| Ermita de Santa Ana | aerea           |                  83 → 83 |            401445 → 831399 |                            809 → 8450 |
| San Telmo           | sigue           |                186 → 178 |            655853 → 789617 |                            214 → 2605 |
| San Telmo           | primera-persona |                183 → 173 |            654148 → 783160 |                            236 → 2573 |
| San Telmo           | aerea           |                 90 → 103 |            680252 → 850344 |                            331 → 3432 |

Construcción completa de árboles y arbustos: 375.9 → 1069.1 ms.
Una muestra de arranque por calidad, con otras verificaciones concurrentes;
no es un benchmark de latencia ni una medida de fluidez.

## Medida de geometría

Las 1.584 copas detectadas de radio ≤ 2 m conservan las cinco piezas, matrices
y colores, pero cada icosaedro pasa de 80 a 20 triángulos. Las grandes y las
anteriores conservan la geometría. Ahorra 475.200 triángulos en el inventario:
3.113.621 sin esta medida → 2.638.421 final (1.686.067 antes).
Plaza Mayor, seguimiento normal: 2.617.541 sin optimizar → 2.166.581 final.
El descarte G3 sigue activo en ligero: Plaza Mayor 243 llamadas frente a 465
en normal, y 672.315 frente a 2.166.581 triángulos.

## Artefactos y comprobaciones

En `/tmp/g5-arboles/juego/`: `antes-normal/`, `despues-normal/`,
`antes-ligero/`, `despues-ligero/` contienen 15 PNG cada uno. Los JSON homónimos
guardan todos los pases y lotes de vegetación; `sin-optimizar-normal.json`
guarda la primera implementación. `comparacion-normal.txt` y
`comparacion-ligero.txt` son la salida de `compare-shots.py` con límite predeterminado
0,5 %. Es un cambio visual deliberado: superar el límite no implica equivalencia
ni se oculta aumentando la tolerancia.

Se comprueban relación con revisión y redondeo, un tronco por copa, tamaño y
apoyo sobre superficie, recurso versionado, entorno anterior idéntico sin capa,
y los contratos de colisiones, rutas y modo ligero de `npm run check`.
Las huellas geográficas, paleta, semilla, rutas y parámetros de render se conservan.
Las capturas de Alameda en seguimiento muestran que la alineación permanece
y cambian tamaños y siluetas; la vista aérea permite revisar la densidad nueva.
Queda pendiente la valoración visual del usuario.
