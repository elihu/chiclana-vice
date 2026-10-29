import * as THREE from '../../vendor/three.webgpu.min.js';
import { gfx } from '../core/state.js';
import { skyUniforms } from './sky.js';
import { wallMaterial } from './wall-ao.js';

const {
  Fn,
  attribute,
  dot,
  float,
  floor,
  fract,
  mix,
  round,
  select,
  sin,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} = THREE.TSL;

// Ventanas de los muros genéricos: cristal que refleja el cielo y persianas. Cada edificio tiene un
// tono y un estado habitual de persiana; solo una parte de sus ventanas se sale de él.
// Cambia en vivo desde la consola con `(await import('./js/engine/windows.js')).setWindows({ glassRoughness: 0.3 })`.
// El rectángulo de cristal está en el lienzo de `facadeTexture()` (x 32–90, y 24–93 de 128 px).
export const WINDOWS = {
  glassRoughness: 0.1, // rugosidad del cristal (el resto del muro conserva la suya)
  glassMetalness: 0.35, // metal del cristal: sube el reflejo del cielo horneado
  shutterDown: 0.2, // fracción de edificios con la persiana habitual bajada del todo
  shutterHalf: 0.25, // fracción con la habitual a medias (el resto, subida)
  variety: 0.2, // fracción de ventanas que se salen del estado habitual de su edificio
  shutterHalfCover: 0.5, // parte del cristal que tapa la persiana «a medias»
  shutterUpCover: 0.1, // tira de persiana recogida arriba (cajón); 0 = nada
  slats: 16, // lamas por ventana
  slatShade: 0.22, // oscurecimiento de las lamas alternas
  tones: ['#52704d', '#6d4a33', '#d9d3c1'], // verde, marrón y blanco roto
  cornice: 0.28, // m de altura de la cornisa de los muros genéricos
  corniceOut: 0.12, // m que sobresale la cornisa
  corniceTint: 0.82, // oscurecimiento del color del muro para la cornisa (1 = igual)
  // Bajos (clase por vértice `bajo`, ver js/world/ground-floors.js): escaparates, portales, puertas
  // de casa, cocheras, rejas y zócalo, solo en la planta baja de los muros genéricos.
  shopShutter: 0.3, // fracción de escaparates con la persiana metálica bajada
  barsShade: 0.18, // claridad de las rejas de las ventanas del bajo
  plinthHeight: 0.1, // zócalo: fracción de la altura de planta
  signTones: ['#7d2f2a', '#25495f', '#5f5a2b'], // rótulos de los locales (granate, azul, oliva)
  plinthTones: ['#8a7f70', '#a79c88', '#6e6a63'], // zócalos por edificio
  // Noche (uniforme `night` del cielo, de 0 a 1): ventanas y escaparates encendidos.
  litWindows: 0.3, // fracción de ventanas con la luz encendida (las de persiana bajada, no)
  litColor: '#ffbd6a', // luz cálida de las ventanas
  litStrength: 1.5, // intensidad de las ventanas
  litShops: 0.65, // fracción de escaparates iluminados
  litShopStrength: 0.55, // intensidad del escaparate
  // Naves industriales y grandes superficies (clase de edificio, códigos `bajo` 6–9): todo el muro,
  // sin ventanas de vivienda, persianas ni cornisa. Alturas en plantas (3,05 m), anchos en vanos (4,8 m).
  naveTones: ['#a3a6a0', '#cdc4ac', '#7e8e7b'], // chapa: gris, crema y verde apagado
  naveRibs: 24, // nervios de la chapa por vano (unos 20 cm)
  naveRibShade: 0.12, // oscurecimiento de cada nervio
  navePlinth: 0.33, // zócalo de bloque de hormigón (1 m)
  naveBand: [0.74, 0.84], // banda de ventanas altas, en fracción de planta
  naveDoors: 0.5, // fracción de vanos con portón en los frentes a la calle
  retailWall: '#e2ded4', // paño de la gran superficie
  retailTones: ['#2f6b4f', '#b5532c', '#2c4f7c'], // franja alta: verde, teja y azul
  retailBand: 0.78, // la franja de color empieza a esta fracción de planta
  retailGlass: 0.7, // altura de la cristalera de la entrada, en fracción de planta
  // Bodegas y almacenes del casco (códigos 10–11): encalado, zócalo, ventanucos altos y portón.
  cellarWall: '#eeeae1', // cal
  cellarPlinthTones: ['#c39a45', '#8e3b2b', '#7b7871'], // zócalo: albero, almagra y gris
  cellarPlinth: 0.3, // altura del zócalo, en fracción de planta (unos 90 cm)
  cellarWindows: 0.5, // fracción de vanos con ventanuco alto
  cellarDoors: 0.35, // fracción de vanos con portón de madera en los frentes a la calle
};

const u = {
  glassRoughness: uniform(WINDOWS.glassRoughness),
  glassMetalness: uniform(WINDOWS.glassMetalness),
  shutterDown: uniform(WINDOWS.shutterDown),
  shutterHalf: uniform(WINDOWS.shutterHalf),
  variety: uniform(WINDOWS.variety),
  shutterHalfCover: uniform(WINDOWS.shutterHalfCover),
  shutterUpCover: uniform(WINDOWS.shutterUpCover),
  slats: uniform(WINDOWS.slats),
  slatShade: uniform(WINDOWS.slatShade),
  shopShutter: uniform(WINDOWS.shopShutter),
  barsShade: uniform(WINDOWS.barsShade),
  plinthHeight: uniform(WINDOWS.plinthHeight),
  litWindows: uniform(WINDOWS.litWindows),
  litStrength: uniform(WINDOWS.litStrength),
  litShops: uniform(WINDOWS.litShops),
  litShopStrength: uniform(WINDOWS.litShopStrength),
  naveRibs: uniform(WINDOWS.naveRibs),
  naveRibShade: uniform(WINDOWS.naveRibShade),
  navePlinth: uniform(WINDOWS.navePlinth),
  naveDoors: uniform(WINDOWS.naveDoors),
  retailBand: uniform(WINDOWS.retailBand),
  retailGlass: uniform(WINDOWS.retailGlass),
  cellarPlinth: uniform(WINDOWS.cellarPlinth),
  cellarWindows: uniform(WINDOWS.cellarWindows),
  cellarDoors: uniform(WINDOWS.cellarDoors),
};
const naveBand = uniform(new THREE.Vector2(...WINDOWS.naveBand)),
  retailWall = uniform(new THREE.Color(WINDOWS.retailWall)),
  cellarWall = uniform(new THREE.Color(WINDOWS.cellarWall));
const litColor = uniform(new THREE.Color(WINDOWS.litColor));
const tones = WINDOWS.tones.map((hex) => uniform(new THREE.Color(hex))),
  signTones = WINDOWS.signTones.map((hex) => uniform(new THREE.Color(hex))),
  plinthTones = WINDOWS.plinthTones.map((hex) => uniform(new THREE.Color(hex))),
  naveTones = WINDOWS.naveTones.map((hex) => uniform(new THREE.Color(hex))),
  retailTones = WINDOWS.retailTones.map((hex) => uniform(new THREE.Color(hex))),
  cellarPlinthTones = WINDOWS.cellarPlinthTones.map((hex) => uniform(new THREE.Color(hex)));

export function setWindows(patch = {}) {
  Object.assign(WINDOWS, patch);
  for (const key of Object.keys(u)) u[key].value = WINDOWS[key];
  WINDOWS.tones.forEach((hex, i) => tones[i].value.set(hex));
  WINDOWS.signTones.forEach((hex, i) => signTones[i].value.set(hex));
  WINDOWS.plinthTones.forEach((hex, i) => plinthTones[i].value.set(hex));
  WINDOWS.naveTones.forEach((hex, i) => naveTones[i].value.set(hex));
  WINDOWS.retailTones.forEach((hex, i) => retailTones[i].value.set(hex));
  naveBand.value.set(...WINDOWS.naveBand);
  retailWall.value.set(WINDOWS.retailWall);
  WINDOWS.cellarPlinthTones.forEach((hex, i) => cellarPlinthTones[i].value.set(hex));
  cellarWall.value.set(WINDOWS.cellarWall);
  litColor.value.set(WINDOWS.litColor);
  gfx.needsRender = true;
}

// Hash estable en [0, 1) de una celda de ventana (`floor(uv)`) y una semilla por edificio.
// Reutilizable: las ventanas encendidas de noche usan el mismo (`windowHash(cell, seed, salt)`).
export const windowHash = Fn(([cell, seed, salt]) =>
  fract(
    sin(dot(cell.add(vec2(seed, seed.mul(1.7))), vec2(127.1, 311.7)).add(salt.mul(74.7))).mul(
      43758.5453,
    ),
  ),
);

// Semilla del edificio: sale del color de vértice, redondeado a 8 bits para que la interpolación
// no meta ruido por píxel (el hash amplifica cualquier diferencia mínima).
export const buildingSeed = () =>
  fract(dot(round(attribute('color', 'vec3').mul(255)), vec3(0.1031, 0.1137, 0.0973))).mul(37);

// Rectángulo de cristal en la celda de UV. El eje V va volteado respecto al lienzo.
const GLASS = { u0: 32 / 128, u1: 90 / 128, v0: 1 - 93 / 128, v1: 1 - 24 / 128 };

let nodes = null;

// Material de muros con ventanas: cristal reflectante y persianas por ventana.
export function windowWallMaterial(parameters) {
  const material = wallMaterial(parameters);
  nodes ??= (() => {
    const coord = uv(),
      cell = floor(coord),
      f = fract(coord),
      seed = buildingSeed(),
      // Bajo: clase por vértice (0 = ninguna; 1 local, 2 bloque con locales, 3 bloque con viviendas,
      // 4 casa, 5 cochera). Solo la planta baja (altura de planta < 1) cambia. Del 6 al 9, clase del
      // edificio entero: 6 nave, 7 nave a la calle, 8 gran superficie, 9 su entrada, 10 bodega,
      // 11 bodega a la calle.
      bajo = attribute('bajo', 'float').add(0.5).floor(),
      gy = coord.y,
      is = (n) => step(n - 0.5, bajo).mul(step(bajo, n + 0.5)),
      nave = is(6).add(is(7)),
      retail = is(8).add(is(9)),
      cellar = is(10).add(is(11)),
      whole = nave.add(retail).add(cellar),
      inU = step(GLASS.u0, f.x).mul(step(f.x, GLASS.u1)),
      inV = step(GLASS.v0, f.y).mul(step(f.y, GLASS.v1)),
      inGlassWindow = inU.mul(inV).mul(float(1).sub(whole)),
      t = f.y.sub(GLASS.v0).div(GLASS.v1 - GLASS.v0), // 0 abajo del cristal, 1 arriba
      building = vec2(0),
      ground = step(gy, 1).mul(step(0.5, bajo)).mul(float(1).sub(whole)),
      first = float(1).sub(step(0.5, cell.x.abs())), // primer vano de la arista
      rest = float(1).sub(first),
      rect = (x0, x1, y0, y1) =>
        step(x0, f.x).mul(step(f.x, x1)).mul(step(y0, gy)).mul(step(gy, y1)),
      shopBay = ground.mul(is(1).add(is(2).mul(rest))),
      portalBay = ground.mul(is(2).add(is(3))).mul(first),
      doorBay = ground.mul(is(4)).mul(first),
      garageBay = ground.mul(is(5)).mul(first),
      barredBay = ground.mul(is(3).add(is(4)).add(is(5))).mul(rest),
      replaced = shopBay.add(portalBay).add(doorBay).add(garageBay),
      inGlass = inGlassWindow.mul(float(1).sub(replaced)),
      // Estado: el habitual del edificio, salvo `variety` de las ventanas, que eligen el suyo.
      r1 = select(
        windowHash(cell, seed, float(3)).lessThan(u.variety),
        windowHash(cell, seed, float(0)),
        windowHash(building, seed, float(0)),
      ),
      r2 = windowHash(building, seed, float(1)), // un solo tono por edificio
      cover = select(
        r1.lessThan(u.shutterDown),
        float(1),
        select(r1.lessThan(u.shutterDown.add(u.shutterHalf)), u.shutterHalfCover, u.shutterUpCover),
      ),
      covered = inGlass.mul(step(float(1).sub(cover), t)).mul(step(0.001, cover)),
      tone = select(r2.lessThan(0.4), tones[0], select(r2.lessThan(0.7), tones[1], tones[2])),
      slat = float(1).sub(step(0.5, fract(t.mul(u.slats))).mul(u.slatShade)),
      shutter = vec3(tone).mul(slat),
      // Los vanos reemplazados parten del texel liso del enlucido, no de la ventana pintada.
      base = mix(
        texture(material.map, coord).rgb,
        texture(material.map, vec2(0.06, 0.94)).rgb,
        replaced.max(whole),
      ),
      glassBase = inGlass.mul(float(1).sub(covered)),
      // Escaparate: hueco con cristal oscuro o persiana metálica, y rótulo encima.
      r3 = select(
        windowHash(cell, seed, float(7)).lessThan(0.2),
        windowHash(cell, seed, float(8)),
        windowHash(building, seed, float(8)),
      ),
      shopOpening = shopBay.mul(rect(0.1, 0.9, 0.1, 0.76)),
      shopClosed = shopOpening.mul(step(r3, u.shopShutter)),
      shopGlass = shopOpening.sub(shopClosed),
      shopSign = shopBay.mul(rect(0.1, 0.9, 0.76, 0.92)),
      mullion = step(f.x.sub(0.5).abs(), 0.015),
      shopColor = mix(vec3(0.1, 0.15, 0.17).add(gy.mul(0.16)), vec3(0.2, 0.22, 0.22), mullion),
      closedColor = vec3(0.5, 0.52, 0.5).mul(float(1).sub(step(0.5, fract(gy.mul(30))).mul(0.16))),
      signColor = select(
        r2.lessThan(0.34),
        signTones[0],
        select(r2.lessThan(0.67), signTones[1], signTones[2]),
      ),
      // Portal, puerta de casa y cochera.
      portalFrame = portalBay.mul(rect(0.24, 0.76, 0.08, 0.84)),
      portalDoor = portalBay.mul(rect(0.29, 0.71, 0.1, 0.8)),
      houseFrame = doorBay.mul(rect(0.26, 0.66, 0.08, 0.76)),
      houseDoor = doorBay.mul(rect(0.3, 0.62, 0.1, 0.72)),
      garageDoor = garageBay.mul(rect(0.08, 0.92, 0.1, 0.8)),
      garageColor = vec3(0.43, 0.48, 0.45).mul(
        float(1).sub(step(0.5, fract(gy.mul(10))).mul(0.18)),
      ),
      // Rejas: tres barras verticales sobre el hueco de la ventana.
      barX = f.x.sub(GLASS.u0).div(GLASS.u1 - GLASS.u0),
      bars = barredBay.mul(inGlassWindow).mul(
        step(fract(barX.mul(4)), 0.07)
          .add(step(0.94, fract(barX.mul(4))))
          .min(1),
      ),
      plinth = ground.mul(step(gy, u.plinthHeight)),
      plinthColor = select(
        r2.lessThan(0.34),
        plinthTones[0],
        select(r2.lessThan(0.67), plinthTones[1], plinthTones[2]),
      );
    let color = mix(base, shutter, covered);
    color = mix(color, shopColor, shopGlass);
    color = mix(color, closedColor, shopClosed);
    color = mix(color, signColor, shopSign);
    color = mix(color, vec3(0.72, 0.68, 0.6), portalFrame.max(houseFrame));
    color = mix(color, vec3(0.29, 0.22, 0.17), portalDoor);
    color = mix(color, vec3(tone), houseDoor);
    color = mix(color, garageColor, garageDoor);
    color = mix(color, vec3(u.barsShade), bars);
    color = mix(color, plinthColor, plinth);
    // Nave: chapa nervada del tono del edificio, zócalo de hormigón, banda de ventanas altas en
    // cada planta y, en los frentes a la calle, portones seccionales en parte de los vanos.
    const fy = fract(gy),
      rib = float(1).sub(step(0.5, fract(coord.x.mul(u.naveRibs))).mul(u.naveRibShade)),
      naveTone = select(
        r2.lessThan(0.4),
        naveTones[0],
        select(r2.lessThan(0.75), naveTones[1], naveTones[2]),
      ),
      navePlinth = nave.mul(step(gy, u.navePlinth)),
      naveWindow = nave
        .mul(step(naveBand.x, fy))
        .mul(step(fy, naveBand.y))
        .mul(float(1).sub(step(fract(coord.x.mul(4)).sub(0.5).abs(), 0.03))),
      naveDoor = is(7)
        .mul(step(windowHash(cell, seed, float(21)), u.naveDoors))
        .mul(rect(0.14, 0.86, u.navePlinth.mul(0.2), 0.68))
        .mul(step(gy, 1)),
      doorPanels = float(1).sub(step(0.5, fract(gy.mul(14))).mul(0.12)),
      // Gran superficie: paño claro, franja de color arriba y cristalera continua en la entrada.
      retailTone = select(
        r2.lessThan(0.34),
        retailTones[0],
        select(r2.lessThan(0.67), retailTones[1], retailTones[2]),
      ),
      retailBand = retail.mul(step(u.retailBand, fy)),
      retailGlass = is(9)
        .mul(step(gy, u.retailGlass))
        .mul(step(0.04, gy))
        .mul(float(1).sub(step(fract(coord.x.mul(4)).sub(0.5).abs(), 0.025))),
      // Bodega: cal, zócalo de color por edificio, ventanucos altos con reja y portón de madera.
      cellarPlinthTone = select(
        r2.lessThan(0.45),
        cellarPlinthTones[0],
        select(r2.lessThan(0.75), cellarPlinthTones[1], cellarPlinthTones[2]),
      ),
      cellarPlinth = cellar.mul(step(gy, u.cellarPlinth)),
      cellarWindow = cellar
        .mul(step(windowHash(cell, seed, float(31)), u.cellarWindows))
        .mul(rect(0.42, 0.58, 0.62, 0.8)),
      cellarBars = cellarWindow.mul(step(fract(f.x.sub(0.42).div(0.16).mul(4)), 0.18)),
      cellarDoor = is(11)
        .mul(step(windowHash(cell, seed, float(32)), u.cellarDoors))
        .mul(rect(0.3, 0.7, 0, 0.74))
        .mul(step(gy, 1)),
      planks = float(1).sub(step(0.5, fract(f.x.mul(24))).mul(0.14)),
      buildingGlass = naveWindow.max(retailGlass);
    color = mix(color, naveTone.mul(rib), nave);
    color = mix(color, vec3(0.55, 0.54, 0.51), navePlinth);
    color = mix(color, vec3(0.74, 0.75, 0.72).mul(doorPanels), naveDoor);
    color = mix(color, vec3(retailWall), retail);
    color = mix(color, vec3(retailTone), retailBand);
    color = mix(color, vec3(0.1, 0.14, 0.16).add(fy.mul(0.12)), buildingGlass);
    color = mix(color, vec3(cellarWall), cellar);
    color = mix(color, vec3(cellarPlinthTone), cellarPlinth);
    color = mix(color, vec3(0.13, 0.11, 0.1), cellarWindow);
    color = mix(color, vec3(u.barsShade), cellarBars);
    color = mix(color, vec3(0.33, 0.21, 0.13).mul(planks), cellarDoor);
    const glass = glassBase.max(shopGlass).max(buildingGlass),
      // Luz de noche: cada ventana con cristal visible se enciende según su hash (distinto del de
      // la persiana); el brillo varía un poco entre ventanas. Los escaparates, algo iluminados.
      windowOn = step(windowHash(cell, seed, float(11)), u.litWindows).mul(glassBase),
      windowGlow = float(0.7).add(windowHash(cell, seed, float(12)).mul(0.6)),
      shopOn = step(windowHash(cell, seed, float(13)), u.litShops).mul(shopGlass),
      lit = windowOn
        .mul(windowGlow)
        .mul(u.litStrength)
        .add(shopOn.max(retailGlass).mul(u.litShopStrength)),
      emissive = vec3(litColor).mul(lit).mul(skyUniforms.night);
    return {
      color,
      emissive,
      roughness: mix(float(material.roughness), u.glassRoughness, glass),
      metalness: glass.mul(u.glassMetalness),
    };
  })();
  material.colorNode = nodes.color;
  material.roughnessNode = nodes.roughness;
  material.metalnessNode = nodes.metalness;
  material.emissiveNode = nodes.emissive;
  return material;
}
