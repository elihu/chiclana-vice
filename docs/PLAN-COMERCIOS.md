# Plan: locales comerciales, grandes superficies y naves industriales

Fecha: 29/10/2026. Referencias de línea y cifras tomadas sobre `feat/ampliar-mapa` (mapa
ampliado a la caja `[-820, 671.835, -1120, 650]`, 11.771 partes de edificio). Este plan
se ejecuta después de integrar esa rama en `main`.

Lee antes `AGENTS.md`, `docs/DESARROLLO.md`, `docs/ESTADO.md`, `docs/KIT-FACHADAS.md`,
`docs/DATOS.md` (§9, «Usos de los bajos») y `tests/AGENTS.md`. Si tocas `tools/`, lee
`tools/AGENTS.md`. Antecedentes: F2b y F2c de [PLAN-VISUAL.md](PLAN-VISUAL.md), que crearon
la capa de bajos y sus clases.

## Contexto

El usuario quiere que los comercios se reconozcan: tiendas de distinto tipo en el centro,
grandes superficies (el Mercadona) y las naves de los polígonos que trajo la ampliación.
Hoy todo edificio sin receta propia es un muro genérico con ventanas por planta, persianas
y cornisa; solo la planta baja cambia según su clase (`shop`, `block`, `house`,
`garage`; `web/js/world/ground-floors.js` y `web/js/engine/windows.js:128-198`). Una nave
industrial se pinta como un bloque de viviendas bajo.

Datos disponibles (cifras del 29/10/2026):

- **Catastro** (`web/ground-floors.json`, `parts`): uso por parte. `3_industrial` 665
  partes, 420 de ellas de 150 m² o más y hasta 2 plantas; `4_2_retail` 439, 148 de ellas
  de 150 m² o más y hasta 2 plantas (40 de 400 m² o más). El uso describe el edificio
  catastral entero: es un indicio, no una certeza.
- **OSM** (`~/.cache/chiclana-vice/sources/osm-ampliado.xml`): 454 elementos con `shop`,
  `amenity`, `office` o `craft`, 366 con `name` y 47 con `brand`; `building=retail` (22),
  `building=industrial` (16); `landuse=industrial` (44) y `landuse=retail` (14). La capa
  publicada solo guarda `[x, z, tipo]` de 313 comercios dentro del mundo, sin nombre.
- **Alturas**: una nave de una planta mide 3,45 m (plantas × 3,05 + 0,4), aunque las
  reales suelen tener 6–8 m. El Mercadona de la calle Nuestra Señora de los Dolores
  (parte 1704, `4_2_retail`, 1 planta, unos 38 × 33 m) es un ejemplo.

Zonas con más naves (rejilla de 200 m): avenida del Comercio (x ≈ −100, z ≈ −900),
calle Forjadores (x ≈ −300, z ≈ −700), calle Francisco de Orellana (x ≈ 100,
z ≈ −1100) y calle Juan de la Cierva (x ≈ −300, z ≈ −900).

## Cómo ejecutar este plan

- **Una fase = una rama** desde `main` limpio, con el nombre indicado. Un commit por paso.
  Sin push, merge ni rebase: integra quien coordina, cuando el usuario lo pide.
- **Revisión del usuario en cada fase visible** (C1, C2 y C3), sirviendo la rama. El
  usuario compara una sola cosa: lo publicado frente a la rama. Entrega, en lenguaje
  llano, qué debe mirar y dónde (las vistas de cada fase).
- **Verificación mínima**: `npm run check` al final de cada paso. Sin capturas ni
  mediciones en Chrome salvo que la fase las pida; si una cifra de coste hace falta, una
  sola medida con `tools/scene-budget.mjs` al final de la fase, frente a `main`.
- **Huellas**: en C0 la escena no cambia. Genera antes la huella de escena con y sin
  relieve (`tools/scene-fingerprint.mjs`) y compárala al terminar; si cambia, para y
  entrega el diagnóstico.
- **Si algo falla o no cuadra** con este plan, para y explica qué pasa, sin improvisar.
- **No afirmes** FPS, rendimiento de GPU ni comportamiento en móvil: los tests usan DOM y
  WebGL simulados, y SwiftShader solo acredita recuentos y capturas.
- Comandos con argumentos literales (la shell no divide variables). Python solo con
  `uv run --no-project python`.

## Decisiones

- **D1. Los datos no se tocan.** Contornos, patios, plantas y alturas siguen como salen
  del Catastro y de la política de alturas. La clase de cada edificio sale de los datos
  (uso del Catastro, etiquetas de OSM, tamaño), nunca del azar ni de una lista de
  edificios escrita a mano. Sin código para un solo caso.
- **D2. Dos niveles de clase.** La clase de **edificio** (`industrial`, `bigRetail` o
  ninguna) cambia todo el muro; la clase de **bajo** (la de F2c) sigue decidiendo la
  planta baja del resto. Una gran superficie o una nave no lleva ventanas de vivienda,
  persianas ni cornisa en ninguna planta.
- **D3. Familias de local** por la etiqueta de OSM, no por el nombre: hostelería (`bar`,
  `restaurant`, `cafe`, `fast_food`, `pub`), alimentación (`supermarket`, `convenience`,
  `bakery`, `butcher`), moda (`clothes`, `shoes`, `jewelry`), salud y servicios
  (`pharmacy`, `bank`, `optician`, `hairdresser`, `dentist`, `clinic`), motor
  (`car_repair`, `tyres`, `car`) y genérico para el resto. La tabla vive en
  `city-design.json`, no en el código.
- **D4. Rótulos con el nombre de OSM** (`name`), en una tipografía y unos colores
  genéricos de la familia. Sin logotipos, tipografías ni colores corporativos: son marcas
  registradas. `brand` solo ayuda a elegir la familia. Si el usuario quiere el aspecto de
  una marca, se decide antes con él y se documenta en `THIRD_PARTY_NOTICES.md`.
- **D5. Coste acotado.** Muros: sin geometría nueva, todo en el shader de `windows.js` con
  nuevos valores del atributo `bajo` o uno nuevo por vértice. Rótulos: un atlas de canvas,
  un material y una malla fusionada, como `web/js/world/signs.js` (+1 llamada de dibujo).
  Cualquier otra llamada nueva se declara en la fase.
- **D6. Modo ligero.** Igual que el normal: los muros no añaden pases y los rótulos se
  ocultan a la distancia a la que se ocultan las fachadas con relieve (200 m).
- **D7. Fachadas con relieve** (`frontages.json`, 45 calles del centro): en C1 y C2 una nave
  o gran superficie no recibe relieve (se queda con el muro pintado); los locales de las
  calles con relieve eligen variante por familia en la receta `street-generic` en C2.
- **D8. Altura de las naves: la del Catastro** (decisión del usuario del 29/10/2026). Las
  plantas y la política de alturas no cambian: una nave de una planta mide 3,45 m.

## Fases

Orden: C0 prepara datos sin cambios visibles; C1 (naves y grandes superficies) es lo que
más se nota en las zonas nuevas; C2 y C3 afinan los locales y ponen nombres; C4 añade las
gasolineras con los datos de C0 y los rótulos de C3.

### C0. Datos de comercios (`feat/datos-comercios`)

1. **Herramienta** `tools/export-ground-floors.py`:
   - cada comercio pasa de `[x, z, tipo]` a `[x, z, tipo, nombre]` (`name`, o `null`), con
     un quinto elemento `brand` solo si existe; el juego sigue leyendo los tres primeros;
   - `zoneKinds: ["industrial", "retail"]` y `zones`, un entero por parte (0 = ninguno;
     1 o 2 = índice + 1 en `zoneKinds`) cuando el centroide de la parte cae en un polígono
     `landuse=industrial|retail` o en una vía cerrada `building=industrial|warehouse|retail`;
     el indicio del edificio prevalece sobre el de la zona;
   - `fuel`: gasolineras (`amenity=fuel`) dentro del mundo, como
     `{x, z, name, brand, outline}` (`outline` es el contorno si OSM la dibuja como área,
     o `null` si es un punto).

   Actualiza el formato en `docs/DATOS.md` §9 y el verificador
   `tests/verify-ground-floors.mjs`. Commit
   `feat(datos): nombres de comercio, indicios de zona y gasolineras en la capa de bajos`.

2. **Procedencia y fuentes**: `node tools/export-provenance.mjs`; en `MAP_SOURCES.md`, qué
   se toma de OSM y sus límites. La capa ya es ODbL; no cambies textos de licencia. Si
   hiciera falta algo más que describir los campos, para y pregunta. Commit
   `docs(datos): documentar nombres e indicios de zona`.

Verificación: `npm run check`, huellas de escena iguales a `main`, recuento en el informe
(comercios con nombre y con marca dentro del mundo, partes con indicio industrial o
comercial, gasolineras) y tamaño del archivo.

### C1. Naves industriales y grandes superficies (`feat/naves`)

> **Hecha el 29/10/2026** (commits `3e95a04`, `73c9a64` y `ce85d2f`), con tres cambios sobre lo
> previsto: las reglas viven en `groundFloors.buildingKinds`, junto a las de los bajos; la regla
> de supermercados se quita porque ningún punto `shop=supermarket` de OSM cae dentro de un
> edificio (suelen marcar la entrada), y, por decisión del usuario, lo industrial dentro de
> `zones.frontagePilot` (el casco) se dibuja como **bodega** encalada (`cellarZone`), no como
> nave de chapa. Con los datos actuales: 510 partes industriales (unas 30 bodegas en el centro)
> y 22 grandes superficies; 47 frentes del centro dejan el relieve de vivienda.

1. **Reglas** en `city-design.json`, bloque nuevo `buildingKinds` (esquema en `schemas/` y
   validación en `design-validate.js`), por orden de confianza:
   1. uso `3_industrial`, o indicio industrial de OSM, con hasta `maximumFloors` plantas y
      al menos `minimumArea` m² → `industrial`;
   2. uso `4_2_retail`, `building=retail` o un comercio de la familia alimentación con
      `supermarket`, con hasta `maximumFloors` plantas y al menos `bigRetailArea` m² →
      `bigRetail`;
   3. resto: ninguna (sigue la lógica de F2c).

   Umbrales iniciales: 2 plantas, 150 m² para `industrial` y 400 m² para `bigRetail`.
   Informa de cuántas partes caen en cada clase. Función pura en `ground-floors.js` con
   pruebas en `tests/`. Commit `feat(diseño): clase de edificio para naves y grandes superficies`.

2. **Muros**: `buildings.js` pasa la clase por vértice; `windows.js` la dibuja sin ventanas
   de vivienda, persianas, rejas ni cornisa:
   - `industrial`: chapa con nervios verticales (en el shader, por coordenada de muro),
     zócalo de bloque de hormigón, un portón seccional cada pocos metros en los frentes a
     la calle y una banda de ventanas altas estrecha; tonos grises, crema y verde apagado
     por edificio.
   - `bigRetail`: paño liso, franja de color de la familia a lo alto, entrada acristalada
     en el frente con el comercio de OSM más cercano y muro ciego en el resto.

   Constantes nuevas en `WINDOWS`, comentadas, ajustables con `setWindows`. De noche:
   portones apagados y entrada de la gran superficie encendida. Commit
   `feat(fachadas): naves industriales y grandes superficies en los muros genéricos`.

3. **Fachadas con relieve**: excluir de `street-generic` los frentes de partes
   `industrial` o `bigRetail` (D7). Regenera `web/frontages.json` y la procedencia.
   Commit `feat(fachadas): sin relieve de vivienda en naves`.

Vistas para el usuario: avenida del Comercio, calle Forjadores y el Mercadona de la calle
Nuestra Señora de los Dolores (x ≈ −465, z ≈ −188), a pie y en coche; una al anochecer.
Una medida de `scene-budget` frente a `main`.

### C2. Locales por familia (`feat/locales`)

> **Hecha el 29/10/2026** (commits `5c49a38`, `885cdbe` y `5ec6f5a`). La tabla vive en
> `groundFloors.families` (hasta 6 tipos; etiquetas con comodín `clave:*`), el tipo va en el
> atributo `bajo` como código + 16 × tipo y el shader lo lee de uniformes (`setShopFamilies`).
> De 313 comercios: 70 de hostelería, 34 de alimentación, 41 de moda, 89 de servicios, 15 de
> motor y 64 genéricos; 124 de los 375 frentes con relieve que son local tienen tipo.

1. **Tabla de familias** (D3) en `city-design.json`, con su color de toldo o franja y su
   tipo de escaparate. Validación y esquema. Commit `feat(diseño): familias de locales`.
2. **Muros genéricos**: el frente clasificado `shop` por un comercio de OSM delante toma la
   familia de ese comercio (el más cercano); sin comercio, genérico. En el shader: toldo o
   franja de color, escaparate amplio (alimentación, moda), puerta y cristalera
   (hostelería, servicios) o portón (motor). Sin geometría nueva. Commit
   `feat(fachadas): escaparates por familia en los muros genéricos`.
3. **Fachadas con relieve**: la receta `street-generic` recibe la familia y elige la
   variante del bajo. Regenera `frontages.json`. Commit
   `feat(fachadas): escaparates por familia en las calles con relieve`.

Vistas: Alameda, Mercado y Plaza Mayor «sigue» y a pie; una calle con bares. Una medida
de `scene-budget` frente a `main`.

### C3. Rótulos con nombre (`feat/rotulos`)

> **Hecha el 29/10/2026** (commit `3e9bd7b`): `world/shop-signs.js`, 267 rótulos de 289
> comercios con nombre, atlas de 1856 × 1632 px y una llamada de dibujo más. No se ocultan a
> distancia: son 267 cuadriláteros en una malla. Los créditos no cambian, porque OSM ya figura en
> la pantalla de fuentes.

1. **Rótulos**: módulo nuevo junto a `signs.js`, con un atlas de canvas con los nombres
   (D4), un material y una malla fusionada (+1 llamada). Cada comercio con nombre pone su
   rótulo sobre el frente que lo clasificó (`shopNear`), encima del escaparate; en
   `bigRetail`, en lo alto de la fachada de la entrada. Nombres largos: reducir el cuerpo
   y, si no caben, cortar con puntos suspensivos. Sin nombre, sin rótulo. Commit
   `feat(fachadas): rótulos con el nombre de los comercios`.
2. **Créditos**: los nombres salen de OSM (ODbL), que ya figura en la pantalla de
   fuentes. Si hace falta tocar el texto de atribución, para y pregunta. Commit
   `docs: rótulos de comercios`.

Vistas: el Mercadona, la Alameda y la calle con bares de C2, de día y al anochecer. Una
medida de `scene-budget` frente a `main`.

### C4. Gasolineras (`feat/gasolineras`, después de C3)

Datos de C0 (`fuel`): 6 dentro del mundo el 29/10/2026, cuatro como punto (Moeve, BP
Urbisur, Repsol y BP) y dos como área (Plenergy y Gasolinera CLC).

1. **Receta** `gasolinera` en `facade-designs.json` (validada con `tests/verify-design.mjs`):
   marquesina plana sobre pilares, de 2 a 4 islas de surtidores según el tamaño, tienda
   pequeña al fondo y banda de color en el canto de la marquesina. Tamaño estándar para las
   de punto y, para las de área, la marquesina inscrita en el contorno. Commit
   `feat(fachadas): receta de gasolinera`.
2. **Colocación**: una por entrada de `fuel`, orientada hacia la vía rodada más cercana, sin
   invadir calzadas ni edificios (si no cabe, se omite y se informa). Geometría fusionada por
   material, como el mobiliario. El nombre va en el canto de la marquesina con los rótulos de
   C3 (D4: sin logotipos ni colores de marca). Commit
   `feat(fachadas): gasolineras desde OSM`.

Vistas: las seis gasolineras, de día y al anochecer. Una medida de `scene-budget` frente a
`main`.

## Fuera de este plan

- Modelos específicos por establecimiento (fachadas de autor en `facade-designs.json`):
  solo si el usuario lo pide para un local concreto.
- Interiores, aparcamientos de las grandes superficies y carga y descarga.
- Vallas y muros de parcela: plan propio, después de este.

## Riesgos

- **Falsos positivos del Catastro**: el uso es del edificio entero; un bloque con un local
  puede salir `4_2_retail`. Por eso las clases de edificio exigen pocas plantas y planta
  grande, y se informa de los recuentos antes de dibujar.
- **Rótulos ilegibles o amontonados** en calles con muchos comercios: limitar uno por
  frente y medir el atlas (tamaño de textura) en el informe.
- **Shader más largo** en `windows.js`: compilación en la pantalla de carga (los shaders se
  precompilan) y coste por píxel en móvil, que solo el usuario puede comprobar.
