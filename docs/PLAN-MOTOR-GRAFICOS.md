# Plan: motor WebGPU, eficiencia y gráficos

Fecha: 26/10/2026. Continúa [PLAN-MEJORA-GRAFICA.md](PLAN-MEJORA-GRAFICA.md) (G0–G5,
publicadas en `v1.4.0`) con lo aprendido de
[slop-newyork](https://github.com/mrdoob/slop-newyork) (MIT, three.js con WebGPURenderer
y TSL) y con los cinco parches de la rama base.

Lee antes `AGENTS.md`, `docs/DESARROLLO.md` (sobre todo «Modo ligero» y «Medir en el
navegador»), `docs/ESTADO.md` y `tests/AGENTS.md`. Si tocas `tools/`, lee `tools/AGENTS.md`.

## Rama base y condición de salida

Todo parte de `feat/base-webgpu`, **no de `main`**:

1. `perf(edificios)`: muros compartidos ocultos y medianeras ciegas.
2. `feat(vehículos)`: coche por secciones adaptado de slop-newyork.
3. `feat(motor)`: three.js 0.186.1 con WebGPURenderer (WebGL 2 de respaldo), `?fps` y
   `?motor=webgl`.
4. `perf(personas)`: un cuerpo con esqueleto, una llamada de dibujo.
5. `feat(motor)`: `#fps` y `#motor=webgl` también en el fragmento.

**Condición de salida**: el usuario prueba la base con `?fps` en el portátil y en un
Android, con WebGPU y con `?motor=webgl`, y la compara con `main`. Si en el Android va
claramente peor que `main`, se vuelve a r169: las fases E1 y E2 se reaprovechan (son
geometría y agrupación, no shaders) y V1 se rehace en GLSL.

`vendor/three.webgpu.min.js` incluye el núcleo y TSL (`THREE.TSL`), `RenderPipeline`,
`PMREMGenerator` y `SkinnedMesh`. **No incluye addons** (`BloomNode`, `SkyMesh`,
`SSRNode`, `SunLight`): no se añaden; lo que haga falta se escribe en `web/js/`.

## Cómo ejecutar este plan

- **Una fase = una rama = un worktree**, creado por quien coordina desde
  `feat/base-webgpu`, en `.claude/worktrees/<rama-con-guion>` con `node_modules` enlazado
  ([GIT_WORKFLOW.md](GIT_WORKFLOW.md#agentes-en-paralelo-excepción)). Trabaja **solo** en
  tu worktree. No toques el repositorio principal ni otras ramas. Sin `npm install`.
- Un commit por paso, Conventional Commits en español, **sin** `Co-Authored-By` ni líneas
  de atribución. Sin merge, rebase ni push: integra el usuario cuando lo haya probado.
- **Lee el paso entero antes de editar.** Si una verificación falla y no se resuelve
  dentro del paso, **para** y entrega el diagnóstico con la salida del comando. No amplíes
  el alcance de tu fase ni edites archivos de otra fase sin necesidad.
- **Mide antes y después** con `tools/scene-budget.mjs` (requiere `google-chrome-stable`)
  sirviendo **tu** worktree en un puerto libre (no uses 8080, 8091 ni 8092; prueba 81xx y
  comprueba con `ss -ltn`). Cierra al terminar el servidor que arrancaste. Las referencias
  van al scratchpad o a `/tmp/chiclana-<fase>/`, nunca al repositorio.
- **Pasos «sin cambio visual»**: capturas con `--shots` antes y después y
  `tools/compare-shots.py`; toda diferencia no declarada es un fallo.
- **Pasos «revisión del usuario»**: el cambio se ve. Entrega capturas antes y después
  desde los puntos fijos de `scene-budget` y deja la rama lista para que el usuario la
  sirva; no se cierran sin su visto bueno.
- `npm run check` pasa en el último commit de la fase.
- **No afirmes** FPS, rendimiento de GPU, WebGPU real ni comportamiento en móvil. El
  entorno de pruebas usa SwiftShader con WebGL 2 de respaldo: solo acredita llamadas,
  triángulos, mallas, programas y comportamiento en CPU.
- Conserva coordenadas, contornos, alturas, capacidades del juego, controles táctiles y
  modo ligero (el ligero nunca se activa solo). Los JSON de datos se generan con
  `tools/`.
- Si copias código literal de slop-newyork, **para y pregunta**: obliga a añadir
  atribución en `THIRD_PARTY_NOTICES.md`. Reimplementar la idea no lo necesita.
- Shell del usuario: argumentos literales (no divide variables). Python con
  `uv run --no-project python`.

## Cifras de partida (`feat/base-webgpu` en `a0b75ec`, SwiftShader, WebGL 2, 1280 × 720)

| Punto, cámara      | Llamadas (total / principal) | Triángulos (total / principal) |
| ------------------ | ---------------------------- | ------------------------------ |
| Alameda, sigue     | 461 / 385                    | 1,45 M / 1,17 M                |
| Alameda, aérea     | 162 / 86                     | 0,90 M / 0,62 M                |
| Mercado, sigue     | 360 / 266                    | 1,22 M / 0,73 M                |
| Plaza Mayor, sigue | 548 / 479                    | 1,91 M / 1,78 M                |
| Santa Ana, sigue   | 429 / 342                    | 1,62 M / 1,32 M                |
| San Telmo, sigue   | 414 / 317                    | 1,48 M / 0,95 M                |

Inventario: 1.043 mallas, 2,33 M triángulos, **1,86 M que proyectan sombra**,
219 programas, 138 MB de texturas, 54 mallas de fachada, 210 trozos y 2.354 árboles.
`main` (`48de70a`) mide casi lo mismo (±2 %).

**Medida intermitente**: en la base, algunas vistas salen sin pase de sombras
(`total == main`), y en cada ejecución cambian cuáles (Mercado y Plaza Mayor «sigue» en
una ejecución; Plaza Mayor «aérea» y San Telmo «primera persona» en otra). Lo arregla
E1.1.

## Fases

Primera tanda, en paralelo: E1, E2 y V1. Segunda tanda, tras la revisión de V1: V2–V5.
E0 se añadió el 27/10/2026 tras la prueba del usuario en el móvil, y bloquea la condición de
salida: sin ella, WebGPU no se acepta.

### E0. Tirones al girar: compartir y precompilar shaders (`perf/precompilar-shaders`)

Prueba del usuario en su Android (27/10/2026): `main` va a 90 FPS fijos. Con la base, en
cualquier motor (WebGPU y `motor=webgl`), al girar 360° la primera vez hay frames de más de
1 s; estabilizado o en línea recta, 90 FPS. Diagnóstico (lectura de three 0.186.1):

- `WebGPURenderer` crea cada pipeline la primera vez que su objeto se dibuja. Al girar
  entran objetos nuevos y el frame espera a compilarlos. `renderer.compileAsync` también
  descarta lo que queda fuera del campo de visión (`_projectObject` con frustum).
- `src/nodes/accessors/Instance.js`: si `instanceMatrix.count * 64` cabe en
  `getUniformBufferLimit()` (unas 1.024 instancias), las matrices van en un `buffer()`
  propio cuyo nombre entra en el código del shader, así que **cada `InstancedMesh` tiene su
  propio shader**. E2 contó 177 de 196 programas de vértice así, casi todos celdas de
  vegetación. Por encima del límite usa un atributo instanciado y el shader se comparte.

Pasos:

1. **Medir.** Una herramienta (en `tools/`, o una opción de `scene-budget`) que, en
   SwiftShader, recorra un giro de 360° en dos o tres puntos fijos y registre la duración de
   cada frame y el número de pipelines o programas creados (por ejemplo, el tamaño de las
   cachés de `renderer._pipelines` o el contador que encuentres). Debe distinguir el
   primer giro del segundo. Commit `feat(herramientas): medir los tirones al girar`.
2. **Compartir shaders entre mallas instanciadas.** Sin parchear `web/vendor/`. Opciones,
   de menor a mayor coste: un atributo instanciado propio para la matriz (si TSL lo permite
   sin tocar el vendor, como `instancedBufferAttribute` en un `positionNode` o `vertexNode`
   compartido), reservar 1.025 plazas por malla (E2 lo probó en coches: unos 64 KB por
   malla), o menos celdas. Elige con cifras de memoria y de número de programas. Commit
   `perf(motor): un shader para todas las mallas instanciadas`.
3. **Precompilar detrás de la pantalla de carga** (idea de `precompileShaders()` en
   `js/main.js` de slop-newyork): tras construir el mundo, `compileAsync` de cada pipeline
   distinto con `frustumCulled = false` y un objeto por material o pipeline, y un primer
   frame de calentamiento con el descarte apagado para que se compilen también los pases de
   sombras. La barra de carga avanza durante la compilación. Cubre también el modo ligero y
   el cambio entre normal y ligero en marcha (si cambiar recompila, precompila ambos o
   decláralo). Commit `perf(motor): precompilar los shaders al cargar`.

Verificación: el segundo y el primer giro dan los mismos tiempos de frame (salvo ruido), y
no se crean pipelines nuevos durante el giro; tiempo de carga antes y después;
`npm run check`. Sin cambio visual: capturas idénticas. No afirmes nada del móvil: el
usuario repite su prueba.

### E1. Pase de sombras (`perf/pase-sombras`, sin cambio visual salvo lo declarado)

Archivos probables: `tools/scene-budget.mjs`, `web/js/engine/renderer.js`, un módulo
nuevo `web/js/world/shadow-proxies.js` y los constructores que marcan `castShadow`.

1. **Medida fiable.** Haz que `scene-budget` mida siempre el pase de sombras (forzar
   `shadow.needsUpdate` y esperar a un frame completo antes de leer
   `info.render.drawCalls`, o lo que diagnostiques). Averigua además si el juego mismo
   deja de actualizar sombras tras un teletransporte: si es así, es un fallo y se
   arregla en este paso. Verificación: tres ejecuciones seguidas dan las mismas cifras.
   Commit `fix(herramientas): medir siempre el pase de sombras`.
2. **Inventario de proyectores.** Añade a `scene-budget` el desglose de triángulos que
   proyectan sombra por categoría (nombre de malla o grupo: árboles, fachadas, muros,
   tejados, monumentos, mobiliario, terreno, actores). Commit
   `feat(herramientas): desglosar los proyectores de sombra`.
3. **Quitar proyectores inútiles.** Lo que no puede dar sombra visible no proyecta:
   suelo, terreno, láminas planas, detalles pequeños, caras inferiores. Declara qué
   cambia. Commit `perf(sombras): quitar proyectores sin sombra visible`.
4. **Sustitutos de sombra.** Idea de `scene-culling.js` de slop: para los proyectores
   estáticos grandes, geometría solo de posición, con un material por `side` y
   `shadowSide`, cortada en celdas (unos 150–200 m, porque nuestra sombra cubre 150 m),
   en una capa que solo ve la cámara de sombra (`mesh.layers.set(N)` y
   `sun.shadow.camera.layers.enable(N)`). Los originales dejan de proyectar. Para las
   copas, valora un sustituto de menos triángulos. Verificación: capturas sin
   diferencias apreciables en sombras (declara las que haya) y cifras del pase de
   sombras antes y después. Objetivo orientativo: la mitad de llamadas y triángulos en
   sombras. Commit `perf(sombras): sustitutos simplificados por celdas`.

### E2. Llamadas y materiales (`perf/llamadas-materiales`, sin cambio visual)

Archivos probables: `tools/scene-budget.mjs` (solo el desglose del pase principal),
`web/js/world/furniture.js`, `signs.js`, `streets.js`, `facades.js`, `buildings.js`,
`web/js/engine/materials.js`. No toques `renderer.js` (E1 y V1), ni los shaders, ni la
iluminación.

1. **Inventario del pase principal**: llamadas, triángulos y programas por categoría y
   por material en los puntos fijos. Commit
   `feat(herramientas): desglosar llamadas por categoría y material`.
2. **Agrupar lo repetido**: piezas iguales en `InstancedMesh` y piezas estáticas
   distintas con el mismo material fusionadas por celda (o `BatchedMesh` si compensa).
   Mantén el descarte por distancia y la histéresis de 10 m del modo ligero. Commit por
   grupo (`perf(mobiliario): …`, `perf(fachadas): …`).
3. **Menos programas**: materiales equivalentes compartidos y nada de parámetros que
   fuercen variantes de shader sin necesidad. Commit `perf(materiales): …`.

Verificación: capturas idénticas (diferencias solo de orden de dibujo, declaradas) y
`scene-budget --compare`. Objetivo orientativo: un 30 % menos de llamadas en el pase
principal en «sigue».

### V1. Cielo, entorno, niebla y color (`feat/cielo-entorno`, revisión del usuario)

Archivos probables: `web/js/engine/renderer.js` y módulos nuevos `web/js/engine/sky.js` y
`web/js/engine/post.js`. Todo en TSL (`THREE.TSL`).

1. **Cielo**: cúpula con degradado del cenit al horizonte, brillo alrededor del sol en la
   dirección de `SUN_OFFSET` y suelo lejano neutro. Sustituye al color plano de
   `scene.background`. Commit `feat(cielo): cúpula con degradado y halo del sol`.
2. **Entorno**: hornea el cielo una vez con `PMREMGenerator.fromScene` en
   `scene.environment` y ajusta `scene.environmentIntensity` y la hemisférica para que la
   exposición total no cambie de golpe. Sin rehornear cada frame. Commit
   `feat(luz): luz ambiente desde el cielo horneado`.
3. **Niebla del color del cielo**: `scene.fogNode` que toma el color del entorno hacia el
   horizonte en la dirección de la vista y aclara con la altura de la cámara (idea de
   `createAerialFogNode` en `lighting.js` de slop). Conserva las distancias actuales de
   niebla, incluida la del modo ligero, porque el descarte de G3 depende de ellas.
   Commit `feat(niebla): niebla con el color del cielo`.
4. **Color**: `RenderPipeline` con exposición, contraste sobre gris medio, saturación,
   sombras algo frías y luces algo cálidas, y una viñeta suave (idea de
   `post-processing.js` de slop, sin bloom). Valores agrupados en una constante para
   ajustarlos en vivo; en modo ligero se mantiene si no añade pases, y si los añade se
   desactiva. Commit `feat(color): gradación y viñeta`.

Verificación: `npm run check`, capturas antes y después de los puntos fijos (normal y
ligero) y cifras de `scene-budget` (la pasada de salida ya cuenta 1). Declara el coste
del horneado al arrancar.

### Segunda tanda (se detalla tras revisar V1)

- **V2. Oclusión y contacto**: oscurecer la luz ambiente en la base de los muros y en
  calles estrechas (`canyonSkyAONode` de slop) y sombras de contacto difuminadas bajo
  coches, personas y jugador, sobre todo para el modo ligero, que no tiene sombras.
- **V3. Árboles**: balanceo por viento en el vértice y luz a contraluz en las hojas
  (`FoliageLightingModel` de slop).
- **V4. Cristales**: rugosidad baja en los vidrios de la textura de fachada para que
  reflejen el cielo de V1.
- **V5. Horas y bloom**: horas del día (dorada, mediodía, atardecer) y bloom solo en
  escritorio.
