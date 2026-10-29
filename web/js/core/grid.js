// Celdas numéricas; las consultas conservan el orden de inserción de los elementos.
export function createGrid(cell) {
  const cells = new Map(),
    order = new Map(),
    stamps = new Map(),
    empty = [];
  let stamp = 0;
  const key = (x, z) => (x + 32768) * 65536 + z + 32768;
  function insert(item, minX, maxX, minZ, maxZ) {
    if (!order.has(item)) order.set(item, order.size);
    for (let x = Math.floor(minX / cell); x <= Math.floor(maxX / cell); x++)
      for (let z = Math.floor(minZ / cell); z <= Math.floor(maxZ / cell); z++) {
        const k = key(x, z);
        if (!cells.has(k)) cells.set(k, []);
        const bucket = cells.get(k);
        if (!bucket.includes(item)) bucket.push(item);
      }
  }
  function queryPoint(x, z) {
    return cells.get(key(Math.floor(x / cell), Math.floor(z / cell))) ?? empty;
  }
  // Un visitante que devuelve true termina la consulta.
  function queryBox(minX, maxX, minZ, maxZ, visit) {
    const current = ++stamp,
      candidates = [];
    for (let x = Math.floor(minX / cell); x <= Math.floor(maxX / cell); x++)
      for (let z = Math.floor(minZ / cell); z <= Math.floor(maxZ / cell); z++)
        for (const item of cells.get(key(x, z)) ?? empty) {
          if (stamps.get(item) === current) continue;
          stamps.set(item, current);
          candidates.push(item);
        }
    candidates.sort((a, b) => order.get(a) - order.get(b));
    for (const item of candidates) if (visit(item) === true) return true;
    return false;
  }
  return { insert, queryPoint, queryBox };
}
