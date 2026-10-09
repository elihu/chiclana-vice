let randSeed = 7631;

export const rnd = () => {
  randSeed = (randSeed * 1664525 + 1013904223) >>> 0;
  return randSeed / 4294967296;
};

// El entorno tiene una secuencia propia; los edificios usan muestras por identidad.
export function setRandomSeed(seed) {
  randSeed = seed >>> 0;
}

export function randomForKey(key, seed) {
  let hash = seed >>> 0;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909) >>> 0;
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}
