// Sonda aislada: vegetación inicial y 600 pasos de actores, comparables con 60c3e7a.
import { createHash } from 'node:crypto';
import { createRuntime } from './runtime-harness.mjs';

const { g } = await createRuntime();
const hash = () => createHash('sha256');
const bytes = (array) => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const geometryHash = (geometry) => {
  const h = hash();
  for (const name of Object.keys(geometry.attributes).sort()) {
    h.update(name);
    h.update(bytes(geometry.attributes[name].array));
  }
  if (geometry.index) h.update(bytes(geometry.index.array));
  return h.digest('hex');
};
const vegetation = [];
g.scene.updateMatrixWorld(true);
g.scene.traverse((o) => {
  if (!o.name.startsWith('vegetation-')) return;
  const materials = o.isMesh ? (Array.isArray(o.material) ? o.material : [o.material]) : null;
  vegetation.push([
    o.name,
    [...o.matrixWorld.elements],
    o.isMesh ? geometryHash(o.geometry) : null,
    materials?.map((m) => m.color.getHexString()) ?? null,
    o.isInstancedMesh ? o.count : null,
    o.isInstancedMesh ? hash().update(bytes(o.instanceMatrix.array)).digest('hex') : null,
    o.isInstancedMesh && o.instanceColor
      ? hash().update(bytes(o.instanceColor.array)).digest('hex')
      : null,
  ]);
});
g.start();
g.input.gas = true;
const trace = hash();
for (let i = 0; i < 600; i++) {
  g.input.right = i % 120 < 30;
  g.update(1 / 60);
  if (i % 30 === 0)
    trace.update(
      JSON.stringify([
        g.player.x,
        g.player.z,
        g.player.a,
        g.state,
        [...g.state.found],
        g.traffic.map((c) => [c.x, c.z, c.a, c.node, c.next]),
        g.people.map((p) => [p.u, p.dir, p.mesh.visible]),
        g.view.position,
      ]),
    );
}
console.log(
  JSON.stringify({
    vegetation: hash().update(JSON.stringify(vegetation)).digest('hex'),
    trace: trace.digest('hex'),
  }),
);
