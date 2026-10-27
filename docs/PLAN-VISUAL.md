# Plan: río, ventanas, árboles y horas del día

Fecha: 27/10/2026. Sigue a [PLAN-MOTOR-GRAFICOS.md](PLAN-MOTOR-GRAFICOS.md) (publicado en
`v1.5.0`) y recoge lo pendiente de [PLAN-MEJORA-GRAFICA.md](PLAN-MEJORA-GRAFICA.md)
(«Más adelante») y de V3–V5, con ideas de
[slop-newyork](https://github.com/mrdoob/slop-newyork) (MIT). No se copia código literal de
slop: se toman las ideas y se escriben en TSL a la medida de Chiclana.

Lee antes `AGENTS.md`, `docs/DESARROLLO.md` (sobre todo «Cielo, entorno y color», «Modo
ligero», «Sustitutos de sombra» y «Medir en el navegador»), `docs/ESTADO.md` y
`tests/AGENTS.md`. Si tocas `tools/`, lee `tools/AGENTS.md`.

## Cómo ejecutar este plan

- **Una fase = una rama** desde `main` limpio, con el nombre indicado. Un commit por paso.
  Sin push, merge ni rebase: integra quien coordina, cuando el usuario lo pide.
- **Revisión del usuario en cada fase.** El usuario prueba una sola comparación: lo
  publicado frente a la rama. Entrega, en lenguaje llano, qué debe mirar y dónde.
- **Verificación mínima** (el usuario no quiere esperas largas):
  - Capturas antes (`main`) y después, lado a lado, en las vistas que indique la fase.
  - **Una** ejecución de `tools/scene-budget.mjs` al final (normal), comparada con `main`.
  - `npm run check` una vez al final de cada paso.
  - Nada más. Si algo tarda más de 15 minutos, para y explica.
- **No afirmes** FPS, rendimiento de GPU ni comportamiento en móvil: SwiftShader solo
  acredita recuentos y capturas.
- Comandos con argumentos literales (la shell no divide variables). Python solo con
  `uv run --no-project python`.

## Decisiones

- **D1. Todo en TSL** (`THREE.TSL`) con `MeshStandardNodeMaterial` o nodos sobre los
  materiales existentes. Sin addons, sin dependencias nuevas, sin tocar `web/vendor/` ni
  la versión de Three.js, sin imágenes binarias nuevas (texturas en canvas o procedurales).
- **D2. Ruido y ondas procedurales en el shader** (sumas de senos o ruido de valor), con
  escalas no conmensurables para que no se note la repetición.
- **D3. Constantes agrupadas** en el módulo que las usa (`WATER`, `WINDOWS`, `FOLIAGE`,
  `TIMES`), comentadas en español, con un `setX(patch)` para ajustarlas en vivo desde la
  consola, como `setSky` o `setWallAO`.
- **D4. Shaders precompilados**: todo material nuevo visible desde el inicio debe estar
  en la escena antes de `precompileShaders` (`app.js`). Un material que aparece después
  (p. ej. al cambiar de hora) se compila al elegirlo, no al primer giro.
- **D5. Modo ligero**: cada fase dice qué hace en ligero. Por defecto, el efecto se
  mantiene si no añade pases ni llamadas, y se simplifica con un uniforme (sin
  recompilar) si es caro por píxel.
- **D6. Sin llamadas de dibujo nuevas** salvo las que declare la fase. Los sustitutos de
  sombra (`shadow-proxies.js`) no animan: el viento de los árboles no mueve su sombra, y se
  acepta.
- **D7. Animación**: usa el nodo `time` de TSL. En pausa el juego solo dibuja a petición,
  así que el agua y el viento se congelan; se acepta.

## Fases

Orden por impacto y coste. F1–F3 son independientes entre sí; F4 va después de F2 (las
ventanas encendidas de noche dependen de ella); F5 necesita datos y su propio plan.

### F1. El río Iro (`feat/agua-rio`)

Hoy el agua es una lámina de color plano (`river-water` en `web/js/world/streets.js`,
`modelMaterial('#658b80', { metalness: 0.2, roughness: 0.45 })`).

1. **Material de agua** en un módulo nuevo `web/js/engine/water.js`
   (`waterMaterial()`, `WATER`, `setWater`):
   - Color de río tranquilo de marisma: verde oliva oscuro en el centro de la vista y más
     claro en el borde; `roughness` baja (0,05–0,15) para que refleje el cielo horneado.
   - `normalNode` con ondas pequeñas: 3–4 capas de ondas en `positionWorld.xz` con distintas
     escalas (de 0,5 a 20 m), direcciones y velocidades lentas (agua casi quieta), más una
     mancha de viento de baja frecuencia que cambia la intensidad por zonas.
   - Fresnel: más reflejo a ángulo rasante y más color propio mirando hacia abajo.
   - Sin transparencia (evita ordenar y un pase extra).
   - Commit `feat(agua): río con ondas y reflejo del cielo`.
2. **Orilla**: en los primeros metros del borde, oscurecer y bajar el reflejo, para que el
   agua no parezca un espejo pegado al terreno. Si la geometría no da la distancia al
   borde, usa un atributo por vértice calculado al construir (`streets.js`), sin geometría
   nueva. Commit `feat(agua): orillas más oscuras`.

Ligero: igual (un solo material, sin pases). Vistas: Puente VII Centenario «sigue» y
«aérea», y una vista a ras del agua junto al puente. Esperado: 0 llamadas nuevas.

### F2. Ventanas y cristales (`feat/ventanas`)

Hoy los muros genéricos (`building-walls`, `buildings.js`) usan `facadeTexture()`
(`textures.js`): un lienzo de 128 px con una sola ventana repetida, igual en toda la
ciudad, y el cristal no refleja nada.

1. **Cristal que refleja**: en el material de muros (`wallMaterial`, `wall-ao.js`) usa la
   celda de UV (`fract(uv)`) para saber si el píxel está dentro del rectángulo de cristal de
   la textura; ahí baja `roughness` (~0,1) y sube algo `metalness`, para que el cristal
   tome el cielo horneado. El resto del muro no cambia. Commit
   `feat(fachadas): cristales que reflejan el cielo`.
2. **Variedad por ventana**: con `floor(uv)` y el color del edificio como semilla, un hash
   decide por ventana: persiana bajada del todo, a medias o subida, y entre 2–3 tonos de
   persiana (verde, marrón, blanco roto). Sin textura nueva ni atlas: se pinta sobre la
   zona de cristal en el shader. Commit `feat(fachadas): persianas variadas por ventana`.
3. **Cornisa** (del plan anterior): una banda fina de remate en lo alto de los muros
   genéricos, del color de la moldura, en la misma geometría agrupada de `buildings.js`.
   Declara los triángulos nuevos; 0 llamadas nuevas. Si sube los triángulos más de un 5 % en
   alguna vista, para y consulta. Commit `feat(edificios): cornisa en los muros genéricos`.

Los cristales de las fachadas del kit (`facade-kit.js`, `palette.glass`) bajan también su
rugosidad en el paso 1 si basta con cambiar el valor; si no, se dejan.

Ligero: igual. Vistas: Alameda «sigue», Plaza Mayor «sigue» y una calle estrecha del
centro a pie. Esperado: 0 llamadas nuevas.

### F3. Árboles con viento y contraluz (`feat/arboles-viento`)

Hoy las copas son icosaedros instanciados (`vegetation.js`), quietos y de color liso.

1. **Viento**: `positionNode` en el material de las copas que desplaza los vértices con la
   altura sobre la base de la copa: balanceo lento de toda la copa más un temblor fino, con
   la fase sacada de la posición de la instancia para que no se muevan al unísono, y una
   ráfaga que recorre la ciudad en la dirección del viento (constante en `FOLIAGE`). Los
   troncos no se mueven. Commit `feat(árboles): balanceo con el viento`.
2. **Hojas**: rompe el color liso con ruido en `positionWorld` (manchas de hojas más claras
   y más oscuras, a 0,3–1 m) y un `normalNode` ligero para que la luz no dibuje las caras
   del icosaedro. Commit `feat(árboles): textura de hojas en las copas`.
3. **Contraluz**: cuando la cámara mira hacia el sol a través de la copa, sumar una luz
   cálida translúcida en los bordes (dependiente de `dot(vista, sol)` y del fresnel).
   Commit `feat(árboles): luz a contraluz en las hojas`.

Ligero: viento sí (coste de vértice bajo); ruido de hojas y contraluz anulados por
uniforme. Vistas: Alameda «sigue» (con el sol de frente si hay una vista así) y un parque
a pie; además, una grabación corta o dos capturas separadas 1 s para comprobar que se
mueven. Esperado: 0 llamadas nuevas.

### F4. Horas del día (`feat/horas-dia`, después de F2)

**Decisión previa del usuario**: dónde se elige la hora. Propuesta: un botón en Pausa
(«HORA: TARDE»), que rota entre las horas y se guarda con la partida, y `#hora=` en la URL
para pruebas. La hora actual (tarde) sigue siendo la de inicio.

1. **Presets** `TIMES` en un módulo `web/js/engine/time-of-day.js`: mañana, mediodía,
   tarde (la actual) y anochecer. Cada uno fija `SUN` (dirección, color, intensidad),
   `SKY` (cenit, horizonte, halo), la niebla y `GRADE`. Cambiar de hora rehornea el
   entorno una vez (`bakeSkyEnvironment`), no cada frame. Commit
   `feat(luz): horas del día`.
2. **Selector** en Pausa y `#hora=`, guardado en la partida. Commit
   `feat(interfaz): elegir la hora del día`.
3. **Anochecer con luces**: ventanas encendidas al azar (emisivo cálido en la zona de
   cristal de F2, con el mismo hash) y faros y pilotos de los coches más brillantes. Sin
   luces dinámicas nuevas. Commit `feat(luz): ventanas y faros encendidos al anochecer`.
4. **Brillo de luces (bloom)**: solo si el usuario lo pide tras ver el paso 3. No está en
   el vendor (`BloomNode` es un addon); habría que escribir un bloom propio de media
   resolución en `post.js`, solo en escritorio y nunca en ligero.

Ligero: las horas sí (son valores, no pases). Vistas: Alameda «sigue» en cada hora.
Declara el tiempo de rehorneado al cambiar de hora.

### F5. Calle: pasos de cebra, bordillos y aceras (plan propio)

Del plan anterior y de slop (`road-paint.js`, bordillos). `osm-world.json` no trae pasos de
peatones ni aceras, así que hace falta ampliar los conversores de `tools/`, la
documentación de fuentes (`MAP_SOURCES.md`, `DATOS.md`) y regenerar datos publicados. Se
planifica aparte cuando F1–F4 estén integradas.

## Descartado

- **Reflejos en pantalla (SSR) y suelo mojado** de slop: caros en móvil y sin sentido en
  Chiclana con buen tiempo.
- **Copas de hojas planas con atlas** (`trees.js` de slop): más bonitas, pero multiplican
  los triángulos y el coste de transparencia; se reconsidera solo si F3 se queda corta.

## Riesgos

- **Coste por píxel en móvil**: agua, ventanas y hojas añaden trabajo de fragmento que
  SwiftShader no mide. Cada fase deja un interruptor en ligero y el usuario mide en su
  Android.
- **Pipelines nuevos tras la carga** (D4): al cambiar de hora o entrar en ligero. Comprobar
  que no aparece el aviso de compilación ni un tirón al primer giro tras el cambio.
- **Hashes congelados**: si un verificador compara capturas o huellas de escena, se
  actualiza solo lo declarado en la fase (`tests/AGENTS.md`).
