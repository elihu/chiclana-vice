# Anexo: inventario de datos y de diseño en el código

Parte de [PLAN-MODULAR.md](../PLAN-MODULAR.md), fase 2. Estado de `main` 5666928.

**Estado al cerrar la fase 2**: las filas con destino FD y CD están migradas
(`facade-designs.json` y `city-design.json`). Siguen en el código los modelos (farola,
banco, papelera, bolardo, árbol), las texturas, las celdas de agrupación (85, 170 y 255 m),
la escena y la cámara, y `game-data.js` (lugares, miradores, encargos): ver la sección 11.4
de PLAN-MODULAR.md. La tabla de abajo describe el punto de partida.
Coordenadas en metros locales (x este, z sur).

## Ya en datos

| Archivo                    | Contenido                                                                                                                                                   | Origen y licencia (ver THIRD_PARTY_NOTICES.md) | Lo escribe                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `web/world.json`           | Manifiesto: origen, tamaño, archivos de capa y checksums                                                                                                    | Propio                                         | `tools/prepare-world.mjs`                             |
| `web/buildings.json`       | 7.448 partes: contorno `p`, patios `holes`, `floors`, `h`                                                                                                   | Catastro INSPIRE                               | `tools/rebuild-map.py` + `prepare-world.mjs`          |
| `web/osm-world.json`       | 616 vías (`id`, `name`, `type`, `w`, `oneway`, `bridge`, `p`), 69 áreas (`kind`, `p`), 20 hitos (`name`, `p`, `outline`), 14 árboles                        | OSM, ODbL                                      | Ídem                                                  |
| `web/street-objects.json`  | 63 nodos etiquetados (pasos de peatones, farolas, bancos, árboles)                                                                                          | OSM, ODbL                                      | Extracción aparte                                     |
| `web/height-samples.json`  | 15 alturas IGN aceptadas por índice de parte, con guardas                                                                                                   | IGN, CC BY 4.0                                 | `tools/audit-ign-heights.py`                          |
| `web/frontages.json`       | 276 frentes `building-<i>-edge-<e>` con `a`, `b`, normal, ancho, altura, plantas, calle y `footprintSha256`                                                 | ODbL en conjunto                               | `tools/export-facades.mjs` (salida del juego)         |
| `web/facade-profiles.json` | Paleta de fachadas, sombras de calle, ancho de vano, celda de lotes, segmento del Ayuntamiento, contorno del Mercado, naves de iglesia, política de alturas | Parámetros propios                             | A mano; `heightPolicy` con `export-height-policy.mjs` |
| `web/game-data.js`         | Clave de guardado, dinero inicial, posiciones inicial y de aparición, población, 6 lugares, 5 miradores, 4 encargos                                         | Propio                                         | A mano (módulo JS que comparten juego y tests)        |
| `web/data-sources.json`    | Procedencia y SHA-256 de cada archivo de datos                                                                                                              | Propio                                         | `tools/export-provenance.mjs`                         |

Observaciones:

- Los IDs de vía OSM no son únicos en `osm-world.json` (616 vías, 609 IDs: una vía partida
  en varios tramos repite ID). Toda referencia a una vía usa `id` y `occurrence` (índice
  entre las vías con ese ID, en orden del archivo).
- Las áreas no tienen ID: se referencian por índice con una guarda de su primer punto.
- `frontages.json` es salida del juego: si la regla de selección cambia, se regenera. Las
  composiciones se anclan a sus IDs, que dependen del orden de `buildings.json`; por eso
  llevan además el `footprintSha256`.
- `game-data.js` ya es «diseño desde datos» para lugares y encargos; pasarlo a JSON no
  aporta nada y obligaría a cambiar los tests. Se mantiene.

## Sigue en el código

Valores literales de `web/game3d.js`. «Destino» indica dónde va en la fase 2
(`FD` = `facade-designs.json`, `CD` = `city-design.json`, `—` = se queda en el motor).

### Fachadas detalladas (`buildDetailedFacades`)

| Elemento                          | Datos en el código                                                                                                                                                                                                                                                                                                                                                 | Destino                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Ayuntamiento                      | Segmento y escala vertical en perfiles; en código: muro 9,44 m ocre, 5 molduras, 6 pilastras, 3 arcos con balcón, frontones, óculos y lunetos, 2 ventanas laterales, balcón de 13 m con balaustres cada 0,35 m, ático con reloj de 12 marcas, 3 mástiles con banderas, 4 farolas de pared, rótulo                                                                  | FD, paso 2.5                                                     |
| Mercado                           | Contorno y centro en perfiles; en código: muro 9,5 m, zócalo, cornisas, vanos de 5,15 m (mínimo 3), lamas, escaparates, toldos (lados > 60 m, salvo `j % 5 == 2`), ladrillo cada 0,46 m, juntas, rótulo                                                                                                                                                            | FD, paso 2.4 (ejemplo completo en `facade-designs.example.json`) |
| Naves de iglesia                  | Altura y color en perfiles; en código: espesor 0,28 m, remate 0,22 m, cubierta `#bca68b`                                                                                                                                                                                                                                                                           | FD, paso 2.6                                                     |
| Jesús Nazareno                    | Segmento `[-73.04, 73.69]` → `[-50.77, 76.89]`, normal `[0, -1]`; bandas ocres a 3,2/6,75/10,2 m, óculos cada 3,6 m, portada de mármol con 4 columnas salomónicas, estatuas, cruz, espadaña                                                                                                                                                                        | FD, paso 2.7                                                     |
| San Telmo                         | Segmento `[-17.15, -161.36]` → `[-6.55, -171.73]`, normal `[1, 1]`; frontón, rosetón, espadaña desplazada con ala girada                                                                                                                                                                                                                                           | FD, paso 2.7                                                     |
| San Juan Bautista (Iglesia Mayor) | Segmento `[206.93, 180.32]` → `[218.19, 152.82]`, normal `[-1, -0.4]`; sillería, pilastras gigantes, tres portadas, cúpula en `[236.7, 14.3, 177.2]` radio 4,7 con 12 nervios                                                                                                                                                                                      | FD, paso 2.7                                                     |
| Frentes genéricos                 | Zona piloto x ∈ [-410, 110], z ∈ [-270, 125]; zona «original» x ∈ [-365, 90], z ∈ [-230, 125]; 8 calles; arista mínima 3,3 m; prueba de lado a 0,45 m; vía a ≤ 17 m; sombra por `seed % 4`, remate por `seed % 3`, comercio salvo Constitución y `seed % 3 == 0`, persiana metálica `seed % 4 == 0`, toldo `j == 0 && seed % 3 == 1`, balcón salvo `seed % 3 == 2` | CD (selección) y FD (receta), paso 2.8                           |
| Detección de tipos                | Expresiones regulares de hitos: `/Ayuntamiento de Chiclana\|Mercado Municipal/` y `/Iglesia de Jesús Nazareno\|San Telmo\|Iglesia Mayor/`                                                                                                                                                                                                                          | FD (`landmark` de cada edificio), pasos 2.4–2.7                  |
| Lotes                             | Celda de 170 m (perfiles), `FrontSide` para sólidos cerrados                                                                                                                                                                                                                                                                                                       | —                                                                |

### Edificios (`buildBuildings`)

| Elemento           | Valor                                                                                                                                                     | Destino   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Paleta genérica    | `#eee7d7`, `#f4ece1`, `#f1ead8`, `#e8dfd3`, `#e7d2b6`, `#f3eddf`, `#dabdaa` (elegida con `rnd()`)                                                         | CD, 2.9.4 |
| Colores por tipo   | iglesia `#e9e1cd`, Ayuntamiento `#d8b669`, Mercado `#cfbfaa`, con detalle `#eee9db`                                                                       | CD, 2.9.4 |
| Alturas mínimas    | Arquillo del Reloj: centro a < 9 m de `[207.09, 140.89]` → 17 m; Iglesia Mayor: < 24 m de `[233.29, 174.98]` → 12 m; Ayuntamiento con 3+ plantas → 15,1 m | CD, 2.9.4 |
| Celda de grupo     | 85 m                                                                                                                                                      | —         |
| UV de fachada      | 4,8 m por repetición horizontal; altura por planta de la política                                                                                         | CD, 2.9.4 |
| Textura de fachada | Dibujo en lienzo de 128 px (`facadeTexture`)                                                                                                              | —         |

### Calles, pavimentos y marcas (`buildStreetSurfaces`, `buildRoadDetails`)

| Elemento              | Valor                                                                                                        | Destino                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Zona de pavimento     | Vías con algún punto en x ∈ (-370, 100), z ∈ (-250, 110); plazas en x ∈ (-360, 100), z ∈ (-240, 100)         | CD, 2.9.2                |
| Tipos peatonales      | `pedestrian`, `footway`, `path` (piedra); resto asfalto; plazas con losas                                    | CD, 2.9.2                |
| Alturas de capa       | Asfalto 0,028; piedra 0,05; losas 0,036; marcas 0,065; pasos 0,082; agua 0,025; tablero 0,02; barandilla 1   | CD, 2.9.2 (y TERRENO.md) |
| Pasos de peatones     | Nodos OSM `highway=crossing` a ≤ 8 m de una vía de coche de ≥ 4 m sin puente; franjas 0,43 × 4 m cada 0,85 m | CD, 2.9.2                |
| Línea central         | Vías de coche de ≥ 7 m de ancho y ≥ 9 m de largo, trazos de 3 m cada 9 m, color `#e8dfbb` al 55 %            | CD, 2.9.2                |
| Tipos no circulables  | `footway`, `pedestrian`, `cycleway`, `path` (grafo)                                                          | CD, 2.9.2                |
| Texturas de pavimento | Lienzos de 256 px (`surfaceTexture`)                                                                         | —                        |

### Mobiliario (`buildUrbanFurniture`)

| Elemento                    | Valor                                                                                                                                         | Destino   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Puntos protegidos (radio 5) | `[186, -156]`, `[-279, -95]`, `[133, -229]`, `[188, 185]`, `[207, 141]`, `[-95, -12]`, `[-35, -174]`, `[-99, -15]`, `[-215, -145]`            | CD, 2.9.1 |
| Farolas de calle            | Calles «originales», tramos ≥ 10 m, cada 22 m desde 7 m, zona x ∈ [-355, 90], z ∈ [-230, 100], a `w/2 + 0,48` del eje, separación ≥ 14 m      | CD, 2.9.1 |
| Plaza de las Bodegas        | 5 farolas modernas de `[-258, -167]` a `[-192, -93]` desplazadas `(+7, -6)`; banco y papelera en las pares                                    | CD, 2.9.1 |
| Bancos fijos                | `[-107, -33, 1.4]`, `[-105, 20, 1.4]`, `[-118, 45, 1.4]`, `[-48, -45, -0.7]`, `[-173, -87, -0.7]`, `[-299, -120, -0.6]` con papelera a +2,3 m | CD, 2.9.1 |
| Bolardos                    | Calle Constitución y Calle de la Plaza, tramos ≥ 12 m, cada 9 m, a `w/2 + 0,2`                                                                | CD, 2.9.1 |
| Objetos OSM                 | `highway=street_lamp` → farola clásica; `amenity=bench` → banco                                                                               | CD, 2.9.1 |
| Modelos                     | Farola clásica y moderna, banco, papelera, bolardo                                                                                            | —         |

### Vegetación (`buildTrees`)

| Elemento              | Valor                                                                                                           | Destino   |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | --------- |
| Plantación en parques | Hasta `min(100, área de la caja / 105)` intentos, separación 4,2 m, a ≥ `w/2 + 2` de la vía, 1,8 m de edificios | CD, 2.9.3 |
| Plaza del Mercado     | 5 árboles de `[-254, -164]` a `[-195, -98]` desplazados `(+9, -8)`                                              | CD, 2.9.3 |
| Arbustos              | Cada tercer vértice de los parques, a ≥ `w/2 + 1` de la vía                                                     | CD, 2.9.3 |
| Modelo y colores      | Tronco, 5 copas, 3 ramas; tonos HSL aleatorios con `rnd()`                                                      | —         |
| Celdas                | 255 m                                                                                                           | —         |

### Señales, lugares, escena y juego

| Elemento             | Valor                                                                                                | Destino                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Señales de calle     | Una por nombre (vías con > 2 puntos), máximo 91, a `w/2 + 0,5`, atlas 512 × 96 + 8 px                | CD, 2.9.2                                                            |
| Escena               | Cielo y niebla `#a5bbc8` 175–620 m (ligero 380 m), hemisférica, sol, sombras 1024 px, exposición 1,2 | Se queda en `engine/renderer.js` (opcional en el futuro: `CD.scene`) |
| Cámara               | Distancias, alturas y límites de cabeceo                                                             | —                                                                    |
| Encargos y lugares   | `game-data.js`                                                                                       | Ya en datos                                                          |
| Recompensas y multas | Lugar descubierto +75 € a < 24 m; rescate 100 €; multa 150 €; entrega a < 8 m durante 1 s            | Opcional: `game-data.js`                                             |
| Mapa 2D              | Colores del callejero                                                                                | —                                                                    |
| Texto de ayuda       | Créditos y recuentos                                                                                 | — (pendiente D-N9 de la propuesta de convenciones)                   |
