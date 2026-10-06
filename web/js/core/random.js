let randSeed = 7631;

export const rnd = () => {
  randSeed = (randSeed * 1664525 + 1013904223) >>> 0;
  return randSeed / 4294967296;
};
