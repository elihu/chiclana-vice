# Plan: mejora gráfica y presupuesto de render

Fecha: 9/10/2026. Desarrolla la propuesta de mejora visual revisada el 9/10/2026 contra
el código. Las cifras de referencia son de `main` en `b007ac5`; las referencias de línea,
de `main` en `083cc29`. Ambas son orientativas: contrástalas con el árbol al empezar cada
fase.

Lee antes `AGENTS.md`, `docs/DESARROLLO.md` (sobre todo «Modo ligero» y «Medir en el
navegador»), `docs/ESTADO.md`, `tests/AGENTS.md` y, si la fase toca datos o `tools/`,
`docs/DATOS.md`, `docs/MAP_SOURCES.md` y `tools/AGENTS.md`.

## Cómo ejecutar este plan

- **Una fase = una rama** en el repositorio principal, desde `main` limpio con
  `git switch -c <rama>`. Sin worktrees ni `stash`. Si el árbol no está limpio u otra
  rama está en curso, **pregunta y espera**. Un commit por paso, con el mensaje indicado.
  Sin push, merge ni rebase: la integración la pide el usuario.
- **Lee el paso entero antes de editar.** Cada paso indica archivos, cambio, verificación
  y commit. Si una verificación falla y no se resuelve dentro del paso, **para** y entrega
  el diagnóstico con la salida del comando. No amplíes el alcance del paso.
- **Pasos «sin cambio visual»**: toma referencias antes de tocar código (huella de
  escena, presupuesto y capturas; ver G0) y compáralas al terminar. Toda diferencia que
  no esté en la lista de diferencias esperadas del paso es un fallo.
- **Pasos «revisión del usuario»**: no se cierran sin que el usuario lo pruebe en el
  navegador. Entrega capturas antes y después desde los puntos de vista fijos de G0.
- `npm run check` pasa en el último commit de cada fase.
- **No afirmes** rendimiento de GPU, FPS ni comportamiento en móvil. SwiftShader y el
  arnés de `tests/` solo acreditan recuentos (llamadas de dibujo, triángulos, mallas) y
  comportamiento en CPU. Los FPS se miden en un dispositivo con `web/measure.js`, y eso
  lo hace el usuario.
- Comandos con argumentos literales: la shell del usuario no divide variables. Python
  siempre con `uv run --no-project python`, con dependencias mediante `--with`.

## Decisiones

- **D1. La métrica es el presupuesto de render.** Llamadas de dibujo y triángulos por
  frame, **sumando el pase principal y el de sombras**, en puntos de vista fijos, en
  calidad normal y en modo ligero. Se miden con `tools/scene-budget.mjs` (G0). Ojo:
  Three r169 pone a cero `renderer.info` _después_ del pase de sombras, así que
  `info.render` por sí solo no cuenta las sombras. Hay que medir con
  `info.autoReset = false`.
- **D2. Sin dependencias nuevas, sin imágenes binarias nuevas.** Las texturas nuevas se
  generan en canvas, como `facadeTexture` y `surfaceTexture` en
  `web/js/engine/textures.js`. Three.js sigue en r169, en `web/vendor/`, sin tocarlo.
  Los parches de shader usan `onBeforeCompile` y `customProgramCacheKey`.
- **D3. Constantes de render en código.** Luces, exposición, tinte de la ortofoto,
  distancias de detalle y anisotropía viven en el módulo que las usa
  (`renderer.js`, `aerial-tiles.js`, `camera.js`), agrupadas y comentadas. No van a
  `city-design.json`, que describe la ciudad y no el motor.
- **D4. El modo ligero nunca se activa solo** (decisión vigente). Este plan solo cambia
  lo que hace cuando el usuario lo activa.
- **D5. Histéresis de 10 m** en todo descarte por distancia: un objeto visible se oculta
  a `alcance + radio + 10`, y uno oculto reaparece a `alcance + radio`.
- **D6. Los verificadores con hashes congelados se actualizan solo a propósito.**
  `scene-fingerprint`, `tests/verify-building-variation-environment.mjs` (si sigue
  existiendo) y la huella geográfica. Se actualiza solo la parte que el paso declara
  como diferencia esperada, y el commit lo dice. Nunca para ocultar una regresión
  (`tests/AGENTS.md`).
- **D7. Orden y dependencias.** G0 va primero. G1 y G3 tocan `web/js/world/facades.js`:
  empiezan **después de integrar la fase 5 de [PLAN-AMPLIACION.md](PLAN-AMPLIACION.md)**
  (modelos), que también lo modifica. G2 no depende de G1. G4 va después de G2. G5
  necesita decisiones del usuario (ver la propia fase).

## Referencia medida (main `b007ac5`, SwiftShader, 1280 × 720)

Rumbo inicial del jugador en todos los puntos. «Principal» excluye el pase de sombras.

| Punto, cámara           | Llamadas (total / principal) | Triángulos (total / principal) |
| ----------------------- | ---------------------------- | ------------------------------ |
| Alameda (inicio), sigue | 559 / 450                    | 1,05 M / 0,90 M                |
| Alameda, aérea          | 239 / 130                    | 0,73 M / 0,58 M                |
| Mercado, sigue          | 440 / 275                    | 0,93 M / 0,57 M                |
| Plaza Mayor, sigue      | 753 / 653                    | 1,27 M / 1,19 M                |
| Plaza Mayor, **ligero** | 607 / 607                    | 1,16 M / 1,16 M                |
| Santa Ana, sigue        | 496 / 425                    | 0,81 M / 0,73 M                |

Lo que cuesta en la Plaza Mayor (pase principal, objetos dentro del campo de visión):

- **Fachadas detalladas**: 265 llamadas (40 %) y 468 000 triángulos. En total hay 296
  mallas, repartidas en solo 16 celdas de 170 m y 6 clases de material. La causa:
  `buildDetailedFacades` agrupa por **color** (`facades.js:151`).
- **Edificios genéricos**: 210 grupos de 85 m con 447 mallas (muros con textura, muros
  lisos y tejados).
- **Vegetación**: 105 mallas instanciadas (troncos, ramas, copas y arbustos por celda de
  255 m). Hay 386 árboles; **solo 15 vienen de OSM**, el resto se reparte al azar en los
  parques.
- **El modo ligero apenas aligera**: un 7 % menos de llamadas y un 3 % menos de
  triángulos, porque solo quita las sombras, baja el DPR y acerca la niebla.

Observado en las capturas: la ortofoto sale casi blanca, porque se ilumina dos veces
(la foto ya trae su luz). Cerca de la cámara el suelo se ve borroso. El patrón de
ventanas es idéntico en todos los edificios genéricos. Las copas fotografiadas no
coinciden con los árboles 3D.

---

## Fase G0: herramienta de presupuesto de render

Rama `chore/presupuesto-escena`. Sin cambios en `web/`.

### Paso G0.1: `tools/scene-budget.mjs`

Herramienta de Node sin dependencias que abre el juego en Chrome sin interfaz
(SwiftShader) y mide el presupuesto en puntos de vista fijos. Sigue el patrón de
conexión por CDP de `tools/browser-smoke.mjs` (lanzar Chrome, WebSocket, `send`,
espera a `#welcome`), escrito en el archivo nuevo. No importes de `browser-smoke.mjs`.

Uso:

```
node tools/scene-budget.mjs URL --out /tmp/chiclana-budget/base.json [--low] [--shots DIR]
node tools/scene-budget.mjs URL --compare /tmp/chiclana-budget/base.json [--low]
```

Comportamiento:

1. Ventana de 1280 × 720 y `deviceScaleFactor: 1`
   (`Emulation.setDeviceMetricsOverride`). Con `--low`, guarda la calidad ligera antes
   de cargar, igual que `browser-smoke.mjs` (`SAVE_KEY` de `web/game-data.js`). Al
   terminar, comprueba que `gfx.quality === 'low'`; si no, sale con error.
2. Espera a que el juego esté listo y pulsa `#start`. La API pública
   (`window.__cityGame`) no expone el renderizador. Dentro de la página, usa
   `import('./js/core/state.js')` para leer `gfx`, `player`, `view` y `chunks`, y
   `import('./js/engine/camera.js')` para `cycleCamera` y `snapCamera`.
3. **Puntos de vista**: la posición inicial y los lugares `Mercado de Abastos`,
   `Plaza Mayor`, `Ermita de Santa Ana` y `San Telmo` (de `window.__cityGame.pois`,
   buscados por nombre). Para cada uno, las cámaras 0 (sigue), 1 (primera persona) y
   2 (aérea), siempre con el **rumbo inicial** del jugador. Para colocar al jugador:
   `Object.assign(player, {x, z, a, speed: 0})` y lo mismo en `player.car` si existe;
   `cycleCamera()` hasta que `view.mode` sea el buscado; `snapCamera()`. Espera 2,5 s,
   `await (await import('./js/world/aerial-tiles.js')).reloadAerialTiles()` y 1 s más.
4. **Medida** de cada punto, dentro de la página:

   ```js
   const r = gfx.renderer,
     i = r.info.render;
   r.info.autoReset = false;
   r.info.reset();
   r.render(gfx.scene, gfx.camera);
   const total = { calls: i.calls, triangles: i.triangles };
   const cast = gfx.sun.castShadow;
   gfx.sun.castShadow = false;
   r.info.reset();
   r.render(gfx.scene, gfx.camera);
   const main = { calls: i.calls, triangles: i.triangles };
   gfx.sun.castShadow = cast;
   r.info.autoReset = true;
   r.render(gfx.scene, gfx.camera);
   ```

5. **Inventario** una sola vez: mallas, triángulos de la escena (las instancias cuentan
   `count` veces), triángulos con `castShadow`, `renderer.info.memory`, número de
   programas, `facadeWork.meshes`, `chunks.length` y `streetEnvironment.trees`.
6. Con `--shots DIR`, guarda una captura PNG por punto y cámara
   (`Page.captureScreenshot`) con el nombre `<punto>-<cámara>[-low].png`.
7. `--out` escribe el JSON. `--compare` imprime, punto a punto, las cifras de antes y
   después y la diferencia en porcentaje. Sale con código 0 salvo que haya errores de
   página.
8. Cierra Chrome y borra el perfil temporal, igual que `browser-smoke.mjs`.

**Verificación**: sirve `web/` en un puerto libre
(`uv run --no-project python -m http.server 8080 --bind 127.0.0.1 --directory web`) y
lanza `--out` en normal y en `--low`. Las cifras deben coincidir con la tabla de
referencia (±2 %). Si no coinciden, `main` ha cambiado (por ejemplo, con la fase 5):
anota las nuevas en el informe y úsalas como referencia. Cierra el servidor al terminar.

**Commit**: `chore(herramientas): medir el presupuesto de render por puntos de vista`.

### Paso G0.2: `tools/compare-shots.py` y documentación

Script de Python: `compare-shots.py DIR_A DIR_B`. Para cada PNG con el mismo nombre,
imprime el porcentaje de píxeles cuya diferencia máxima por canal es mayor que 8 y la
diferencia máxima. Sale con código 1 si algún archivo pasa de `--limit` (por defecto,
0,5 %). Ejecución:
`uv run --no-project --with pillow --with numpy python tools/compare-shots.py A B`.

Documenta las dos herramientas en `docs/DESARROLLO.md`, en «Medir en el navegador»: qué
miden, que no acreditan GPU ni FPS, y lo de `info.autoReset` (D1).

**Verificación**: dos ejecuciones seguidas de `scene-budget --shots` sobre el mismo
árbol dan un 0 % de diferencia en `compare-shots`. Si SwiftShader no es determinista,
anota el ruido máximo observado y úsalo como `--limit` en las fases siguientes.
`npm run check`.

**Commit**: `docs(desarrollo): documentar presupuesto de render y comparación de capturas`.

---

## Fase G1: menos llamadas sin cambio visual

Rama `perf/agrupar-escena`. Antes de empezar (D7), toma referencias del árbol limpio:
`scene-fingerprint --out` (con relieve), `scene-budget --out --shots` en normal y en
ligero.

### Paso G1.1: fachadas agrupadas por clase de material

Hoy `buildDetailedFacades` (`web/js/world/facades.js`, desde `staging.traverse`, :125)
crea un lote por **color** + cara + celda. Los materiales del kit
(`facade-kit.js:42-54`) solo difieren en `color`, `roughness` (0,32 en el cristal y 0,83
en el resto), `metalness` (0,3 en el hierro y 0 en el resto) y `side`.

Cambio:

- Clave del lote: `roughness|metalness|front-o-double@celda`, sin el color.
- Cada lote acumula `position`, `normal` **y `color`**: por cada vértice, `r, g, b` de
  `o.material.color`. Con la gestión de color activa, `THREE.Color` ya guarda valores
  lineales, así que se copian tal cual, sin convertir.
- Material del lote, en caché por clase: `MeshStandardMaterial({ color: '#ffffff',
vertexColors: true, roughness, metalness, side })`, con `FrontSide` para los sólidos
  cerrados y `DoubleSide` para el resto (conserva `closedSolid` y la corrección del
  sentido de giro con transformaciones reflejadas).
- **Comprobación de seguridad**: si un material del montaje no es `MeshStandardMaterial`,
  o tiene `map`, `emissive` distinto de negro, `transparent` u `opacity < 1`, se lanza un
  error con el nombre de la receta. Las mallas con textura (`textMeshes`) siguen yendo
  aparte, como ahora.
- El nombre pasa a `'facade-cell-' + clave`. `facadeWork.meshes` sigue contando los
  hijos.

Tests: el bloque de `tests/verify3d.mjs:282-285` cuenta caras. Sustitúyelo por una
relación, no un total: todo lote con `FrontSide` procede de sólidos cerrados, existe
algún lote `DoubleSide`, y todo lote sin `map` tiene `vertexColors` y atributo `color`.

**Diferencias esperadas**: en `scene-fingerprint`, solo `scene`, y dentro de
`reference-led-facades`. `render`, `routes`, `resources` y `behaviour` deben quedar
idénticos. En `compare-shots`, dentro del límite de G0.2. Objetivo: `facadeWork.meshes`
pasa de 296 a ≤ 100 (16 celdas × ≤ 6 clases, más las mallas con textura). En la Plaza
Mayor (sigue), unas 200 llamadas menos en el pase principal.

**Commit**: `perf(fachadas): agrupar lotes por material con colores de vértice`.

### Paso G1.2: troncos y ramas en una sola malla instanciada

En `buildTrees` (`web/js/world/vegetation.js`), las ramas se colocan respecto al tronco
solo con `size` y ángulos fijos (`a = j·TAU/3`), sin `rnd()`. Por eso tronco y ramas
caben en una geometría:

- Con `mergeParts` (`engine/materials.js`), une el cilindro del tronco (sin
  transformar) y tres ramas. Matriz local de la rama `j`: posición
  `(0.5·cos a, 3.3·0.84 − 3.3/2, 0.5·sin a)`, rotación `(0.55·cos a, 0, 0.55·sin a)`,
  escala 1. Es la transformación actual dividida por `size` y relativa al centro del
  tronco: compruébala con un árbol de prueba antes de seguir.
- Un solo `InstancedMesh` `'wood'` con las matrices del tronco y el material del tronco
  (`#786d57`). Las ramas pasan de `#796c54` a `#786d57`, una diferencia imperceptible que
  se acepta.
- **Conserva el orden y el número de llamadas a `rnd()`**, para que las copas, los
  arbustos y los actores no cambien.
- `addVegetationCells(vegetation, wood, 'wood')`. Desaparecen las celdas `trunks` y
  `branches`.

Tests: en `tests/verify3d.mjs:378-392`, `count('wood') === trees`, sin las
comprobaciones de `trunks` y `branches`. En `verify-building-variation-environment`
cambiará el hash `vegetation`, pero `trace` debe quedar **idéntico**. Actualiza solo
`environment.vegetation` en `source-data/building-variation-baseline.json` y dilo en el
commit (D6).

**Diferencias esperadas**: `scene` (vegetación). `behaviour` idéntico. En
`compare-shots`, dentro del límite o con diferencias solo en píxeles de ramas.
Objetivo: unas 26 llamadas menos en el pase principal y otras tantas en el de sombras.

**Commit**: `perf(vegetación): unir troncos y ramas en una malla instanciada`.

### Paso G1.3 (experimento medido): grupos de edificios por tesela

Hoy `buildBuildings` agrupa por celdas de 85 m (`buildings.js:39-56`), tres por tesela
de 255 m (D1 de PLAN-AMPLIACION). Prueba a agrupar por tesela: clave `i,j` en lugar de
la celda de 85 m. Así cada tesela tiene un solo grupo, con un único material de tejado.

**Acepta** el cambio solo si, en `scene-budget`, en todos los puntos de la cámara que
sigue: llamadas totales −15 % o más, y triángulos totales +10 % como mucho (los grupos
grandes recortan peor con el campo de visión y con la cámara de sombras). Comprueba
también que el test de modo ligero de `verify3d.mjs:521-526` sigue pasando. Si no se
cumplen las condiciones, **descarta el código** (`git restore`) y anota las cifras en el
informe de la fase; no hay commit.

**Commit** (solo si se acepta): `perf(edificios): agrupar muros y tejados por tesela`.

### Cierre de G1

`npm run check`, `scene-budget --compare` en normal y en ligero, y `browser-smoke`
normal y con `--low`. El informe lleva la tabla de antes y después.

---

## Fase G2: luz, ortofoto y muros

Rama `feat/luz-y-muros`. **Revisión del usuario** en G2.2 y al cierre.

### Paso G2.1: ajuste en vivo en `?debug`

En `web/js/debug/inspector.js` (solo se carga con `?debug`), lee los parámetros de la URL
`exposure`, `hemi`, `sun` y `aerial` (este último, un gris de 0 a 1), aplícalos al
iniciar y expón `window.__luz({ exposure, hemi, sun, aerial })` para cambiarlos desde la
consola con `gfx.needsRender = true`.

Para el tinte de la ortofoto, añade en `aerial-tiles.js` una constante `AERIAL_TINT`
(hoy `'#ffffff'`) y una función exportada `setAerialTint(color)`. Debe recorrer todos
los materiales de `materials` y aplicar el tinte allí donde haya `map`; `aerialMaterial`
y `assign` (`aerial-tiles.js:27` y `:35`) usan el tinte en lugar de `'#ffffff'`. Los
otros dos materiales con la vista general, `roofMat` en `buildings.js` y el suelo de
respaldo en `app.js:103`, también usan el tinte (expórtalo con una función
`aerialTint()`).

Sin `?debug`, la escena no cambia: `scene-fingerprint --compare` idéntico.

**Commit**: `feat(depuración): ajustar luz y tinte de la ortofoto en vivo`.

### Paso G2.2: equilibrio de luz y exposición (revisión del usuario)

Valores actuales (`renderer.js:13-24`): ACES, exposición 1,2, luz hemisférica 2,2, sol
3,2 y ortofoto en blanco. Prepara tres combinaciones y entrega capturas de
`scene-budget --shots` de cada una, pasándolas por URL con `?debug` (una ejecución por
combinación):

| Combinación | exposición | hemi | sol | ortofoto |
| ----------- | ---------- | ---- | --- | -------- |
| A           | 1,0        | 1,9  | 3,0 | 0,85     |
| B           | 1,05       | 1,7  | 3,2 | 0,78     |
| C           | 1,1        | 2,0  | 2,8 | 0,9      |

El usuario elige una o propone otros valores con `__luz`. Escribe los valores elegidos
como constantes en `renderer.js` y `AERIAL_TINT`. Criterio: en la vista aérea, la
ortofoto no se ve lavada (los blancos de la Alameda no saturan) y las fachadas claras
conservan el detalle.

**Commit**: `feat(render): equilibrar luz, exposición y tinte de la ortofoto`.

### Paso G2.3: UV continuas en los muros genéricos

En `buildBuildings` (`buildings.js:77-110`), cada tramo de `terrainEdge` vuelve a
empezar en `u = 0`. Por eso las ventanas salen cortadas en las cuestas. Además, la `v`
inferior empieza en el suelo y no en `baseY`, y la textura se estira.

Cambio para cada arista original `ring[i] → ring[i+1]`:

- `L` = longitud de la arista; `bays = max(1, round(L / rules.wallUvWidth))`;
  `uScale = bays / L`.
- Acumula `along` sobre los tramos de `terrainEdge`. El tramo `[along, along + len]`
  lleva `u0 = along · uScale` y `u1 = (along + len) · uScale`.
- `v` de un vértice = `(y − b.baseY) / floorHeight`, donde `y` es la cota real del
  vértice: la inferior, sobre el terreno, y la superior, `b.baseY + h`. Bajo `baseY`
  la `v` es negativa y el patrón sigue anclado a la planta baja.

Así cada arista tiene un número entero de huecos de ventana y las esquinas no cortan
ventanas. **Diferencias esperadas**: solo el atributo `uv` de los muros con textura.

**Commit**: `fix(edificios): huecos enteros y continuos en los muros genéricos`.

### Paso G2.4: anisotropía

Teselas `hi` de ortofoto (`aerial-tiles.js:79`) y texturas de pavimento
(`textures.js:80`): `Math.min(8, gfx.renderer.capabilities.getMaxAnisotropy?.() ?? 4)`.
Las teselas `lo` siguen en 4. Comprueba que el WebGL simulado de `tests/` no rompe; si
no tiene `capabilities`, el valor de respaldo es 4.

**Commit**: `feat(render): subir la anisotropía del suelo cercano`.

### Paso G2.5: sombras sin parpadeo

Hay dos sitios que colocan el sol (`app.js:172` y `camera.js:155`). Sustitúyelos por una
función `placeSun(x, y, z)` en `engine/renderer.js` que encaje el destino en la rejilla
de texeles del mapa de sombras:

```js
const SUN_OFFSET = new THREE.Vector3(-85, 125, 60),
  sunBasis = new THREE.Matrix4().lookAt(
    SUN_OFFSET,
    new THREE.Vector3(),
    new THREE.Vector3(0, 1, 0),
  ),
  sunBasisInverse = sunBasis.clone().invert(),
  snapped = new THREE.Vector3();
export function placeSun(x, y, z) {
  const cam = gfx.sun.shadow.camera,
    texel = (cam.right - cam.left) / gfx.sun.shadow.mapSize.x;
  snapped.set(x, y, z).applyMatrix4(sunBasisInverse);
  snapped.x = Math.round(snapped.x / texel) * texel;
  snapped.y = Math.round(snapped.y / texel) * texel;
  snapped.applyMatrix4(sunBasis);
  gfx.sun.target.position.copy(snapped);
  gfx.sun.position.copy(snapped).add(SUN_OFFSET);
  gfx.sun.target.updateMatrixWorld();
}
```

La base coincide con la orientación de la cámara de sombras de Three (`lookAt` con
`up = (0, 1, 0)`). Añade a `verify3d.mjs` un test: tras mover al jugador una distancia
arbitraria, las coordenadas del destino en la base del sol son múltiplos del texel
(±1e-6), y `sun.position − sun.target.position` es `SUN_OFFSET`.

**Diferencias esperadas**: solo `scene`, en la matriz de la luz y de su destino.
`render`, `routes` y `behaviour` quedan idénticos.

**Commit**: `fix(render): encajar la sombra del sol en su rejilla de texeles`.

### Cierre de G2 (revisión del usuario)

Capturas antes y después, y prueba del usuario en movimiento: conducir por la Alameda y
comprobar que los bordes de las sombras no parpadean. `npm run check`.

---

## Fase G3: modo ligero con menos detalle

Rama `perf/detalle-ligero`. Requiere G1 integrada.

### Paso G3.1: descarte de detalle por distancia

- En `core/state.js`, añade `export const detailCells = []`, con entradas
  `{ object, x, z, radius, kind }`, donde `kind` es `'facade'` o `'vegetation'`.
- Regístralas al construir: cada malla `facade-cell-*` y de texto en `facades.js`
  (centro y radio de su `boundingSphere`) y cada `InstancedMesh` en
  `addVegetationCells` (`vegetation.js`, con `computeBoundingSphere()` ya hecho).
- En `updateCamera` (`camera.js`, después del bucle de `chunks`, :163), aplica la tabla
  con el mismo origen que los `chunks` (la cámara en ligero, el jugador en normal) y la
  histéresis D5:

  | `kind`     | normal       | ligero | ligero, vista aérea |
  | ---------- | ------------ | ------ | ------------------- |
  | facade     | sin descarte | 200 m  | 380 m               |
  | vegetation | sin descarte | 300 m  | 380 m               |

  En calidad normal, todo `detailCells` queda `visible = true`: la escena normal no
  cambia.

Tests, en el bloque de modo ligero de `verify3d.mjs:512-531`, junto al de los `chunks`.
En ligero, para cada entrada: si es visible, `d < alcance + radio + 10`; si no lo es,
`d ≥ alcance + radio`. Al volver a la calidad normal, todas son visibles.

**Diferencias esperadas**: ninguna en `scene-fingerprint` (se toma en calidad normal).
En `scene-budget --low`, menos llamadas. **Objetivo** en la Plaza Mayor (sigue, ligero):
al menos un 25 % menos de llamadas que en calidad normal en el mismo punto. Si no se
alcanza, informa de las cifras sin cambiar la tabla.

**Commit**: `perf(ligero): ocultar fachadas y vegetación lejanas en modo ligero`.

### Paso G3.2: documentación

Actualiza «Modo ligero» en `docs/DESARROLLO.md` con las distancias y la histéresis.

**Commit**: `docs(desarrollo): describir el descarte de detalle del modo ligero`.

### Cierre de G3 (revisión del usuario)

Capturas en ligero antes y después desde los puntos fijos. El usuario lo prueba en su
Android y mide con `web/measure.js` en normal y en ligero; anota sus cifras en el
informe. El agente no las inventa.

---

## Fase G4: detalle cercano sobre la ortofoto

Rama `feat/detalle-suelo`. Requiere G2. **Revisión del usuario.**

### Paso G4.1: textura de grano

En `textures.js`, añade `groundDetailTexture()`: un canvas de 256 × 256 de grano fino
gris centrado en 128 (variaciones de ±18), sin motivos repetidos visibles,
`RepeatWrapping`, `colorSpace = THREE.NoColorSpace` (es un dato, no un color) y
anisotropía como en G2.4.

### Paso G4.2: parche de shader en el suelo

Solo para el suelo: `aerialMaterial(i, j, options)` acepta `options.detail = true`, que
pasa `app.js` (no los tejados). Uniformes **compartidos** por todos los materiales del
suelo, en un objeto del módulo:
`{ uDetailMap, uDetailScale: 1.5, uDetailNear: 8, uDetailFar: 60, uDetailStrength: 0.35 }`.

```js
m.customProgramCacheKey = () => 'aerial-detail-v1';
m.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, detailUniforms);
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      '#include <common>\nvarying vec2 vDetailXZ;\nvarying float vDetailDist;',
    )
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 detailWorld = modelMatrix * vec4(transformed, 1.0);
      vDetailXZ = detailWorld.xz;
      vDetailDist = distance(detailWorld.xyz, cameraPosition);`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
      uniform sampler2D uDetailMap; uniform float uDetailScale, uDetailNear, uDetailFar, uDetailStrength;
      varying vec2 vDetailXZ; varying float vDetailDist;`,
    )
    .replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      float detailFade = 1.0 - smoothstep(uDetailNear, uDetailFar, vDetailDist);
      vec3 detail = texture2D(uDetailMap, vDetailXZ / uDetailScale).rgb * 2.0;
      diffuseColor.rgb *= mix(vec3(1.0), detail, detailFade * uDetailStrength);`,
    );
};
```

Si una sustitución no encuentra su cadena, el shader queda sin detalle sin avisar.
Compruébalo con un test que verifique que las cuatro cadenas existen en
`THREE.ShaderLib.standard` del vendor. En ligero, `uDetailStrength = 0`, sin recompilar.
Se fija en `applyQuality` (`renderer.js`).

**Diferencias esperadas**: los materiales del suelo (`customProgramCacheKey`). Las
geometrías no cambian.

**Commit**: `feat(suelo): grano cercano sobre la ortofoto`.

### Cierre de G4 (revisión del usuario)

Capturas en primera persona y con la cámara que sigue, desde los puntos fijos y desde
una acera ancha. El usuario ajusta escala, distancias e intensidad con `?debug` si hace
falta (extiende `__luz` con `detail`). Comprueba que en la vista aérea no cambia nada
(fuera de 60 m no hay grano).

---

## Fase G5: árboles sobre las copas reales

Rama `feat/arboles-ortofoto`. **Fase con decisiones del usuario.** El agente para y
pregunta en cada punto marcado **[decisión]**.

### Paso G5.0: investigación (sin código)

Entrega un informe breve:

1. ¿Ofrece el WCS del IGN que usa `tools/audit-ign-heights.py` un modelo normalizado de
   **vegetación** (MDSnV) para la zona, con qué resolución y qué fecha? Solo
   consulta: no descargues rásteres al repositorio. Los originales van a
   `~/.cache/chiclana-vice/ign/`.
2. Prueba de detección en tres teselas de `web/aerial/hi/` (una de parque, una de calle
   arbolada y una de casco denso), con `ExG = 2g − r − b` sobre los canales normalizados,
   un umbral y la exclusión de sombras por brillo mínimo. Entrega imágenes de máscara a
   `/tmp` y el recuento de copas frente a la inspección visual.
3. La transformación de píxel a coordenadas del juego **debe salir de
   `tools/aerial-tiles.py`** (tesela de 255 m, margen de 20,5 m, 0,25 m/píxel), no
   suponerse. Valídala con tres puntos conocidos (por ejemplo, esquinas de edificios de
   `buildings.json`).

**[decisión]** El usuario decide si sigue, con qué fuente de altura (MDSnV o altura
estimada por el radio de la copa) y la atribución de la nueva capa derivada (preguntar
antes de tocar `THIRD_PARTY_NOTICES.md`).

### Paso G5.1: candidatos

`tools/detect-tree-crowns.py` (Python, `--with numpy --with pillow --with scipy
--with shapely`). Lee las teselas `hi`, `web/aerial/index.json`, `web/buildings.json` y
las áreas de agua y las vías de `web/osm-world.json`. Excluye los píxeles dentro de
edificios, agua y calzadas. Separa copas unidas con máximos locales de la transformada
de distancia, a 3 m como mínimo. Escribe `source-data/tree-candidates.json` (no se
publica) con `{ x, z, r, score, tile }` y su procedencia.

### Paso G5.2: revisión

Superposición en `?debug`: anillos de los candidatos, con color según su estado. La
revisión se guarda en `source-data/tree-review.json` (archivo de autor): zonas aceptadas
como rectángulos y exclusiones por candidato. **[decisión]** El usuario revisa al menos
la zona del piloto de fachadas (`zones.frontagePilot` de `city-design.json`).

### Paso G5.3: capa publicada y juego

- Un generador escribe `web/vegetation.json` (`version`, `source`, `license`,
  `attribution` y `trees: [[x, z, r], …]`) con los candidatos aceptados. Regístralo en
  `tools/export-provenance.mjs` como `street-objects.json` y sigue el orden de
  `tools/AGENTS.md`.
- Carga opcional en `loader.js`, como `street-objects.json`. Sin el archivo, la
  vegetación sigue como hoy.
- `buildTrees`: árboles de la capa con `size = clamp(r / 1,6, 0,6, 1,8)`, más los 15 de
  OSM sin duplicados (separación `rules.spacing`). **[decisión]** ¿El relleno aleatorio
  de los parques se mantiene solo donde no hay copas detectadas, o se retira?
- Las colisiones de los árboles nuevos cambian el recorrido de los actores: `behaviour`
  y `verify-building-variation-environment` cambiarán. **[decisión]** El usuario
  aprueba la actualización de esas referencias tras ver el informe.

Documenta en `docs/MAP_SOURCES.md` el método, el umbral y que las posiciones son
aproximadas (no un inventario de arbolado).

---

## Más adelante (fuera de este plan)

Cada uno necesita su propio plan cuando G0–G4 estén integradas:

- **Atlas de fachadas genéricas**: varias ventanas, persianas y puertas en un canvas.
  `RepeatWrapping` no sirve con un atlas, así que hace falta un parche de shader con
  `fract()` y un atributo de variante por vértice, asignado con el `paletteIndex` o la
  identidad del edificio.
- **Aceras y patios** como superficies propias, con una herramienta que genere polígonos
  entre el borde de calzada y la línea de fachada, teñidos con el color medio de la
  ortofoto.
- **Sombras de contacto** en ligero, bajo vehículos y árboles.
- **Reflejos de entorno** pequeños para vehículos y cristales, con `PMREMGenerator` de
  un gradiente propio (sin añadir `RoomEnvironment` al vendor).
- Cornisas, pretiles y cubiertas, por impacto visual.

## Riesgos

- **Conflictos con la fase 5** en `facades.js` y en el kit: por eso D7 retrasa G1 y G3.
- **SwiftShader no es una GPU**: las capturas sirven para comparar colores y geometría,
  no para medir rendimiento. El coste de fragmento del parche de G4 y de la anisotropía
  solo se ve en un dispositivo.
- **Parches de shader frágiles** si cambia Three.js. Está fijado en r169 y cambiarlo
  exige preguntar. El test de G4.2 detecta que falten las cadenas.
- **Hashes congelados** (D6): un agente puede verse tentado a actualizarlos para que
  pase el check. Solo se actualiza lo declarado en el paso.
