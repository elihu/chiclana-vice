let randSeed = 7631;

export const rnd = () => {
  randSeed = (randSeed * 1664525 + 1013904223) >>> 0;
  return randSeed / 4294967296;
};

// El entorno tiene una secuencia propia; los colores de edificios ya vienen resueltos.
export function setRandomSeed(seed) {
  randSeed = seed >>> 0;
}
