// Compositor: ejecuta las recetas de web/facade-designs.json con las piezas del kit.
// No crea materiales ni mallas propios: todo pasa por `kit` (cube, geo, wall, material…).
// Formato y semántica: docs/plan-modular/KIT-FACHADAS.md (K3 y K4).
import * as THREE from '../../vendor/three.module.min.js';
import { evaluate } from '../engine/expr.js';
import { flatPolygon } from '../engine/materials.js';

const MAX_ITERATIONS = 10000;

// Un valor del JSON: literal, color (#rrggbb o $paleta), texto, pick o expresión.
function value(v, scope, palette) {
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    if (v[0] === '#') return v;
    if (v[0] === '$') {
      if (!Object.hasOwn(palette, v.slice(1))) throw new Error(`Color de paleta desconocido: ${v}`);
      return palette[v.slice(1)];
    }
    return evaluate(v, scope);
  }
  if ('text' in v) return v.text;
  const index = evaluate(v.index, scope);
  if (!(index in v.pick)) throw new Error(`pick: índice fuera de rango (${index})`);
  return value(v.pick[index], scope, palette);
}

function makeGeometry(kit, [name, ...p]) {
  if (name === 'ArchShape') return new THREE.ShapeGeometry(kit.archShape(p[0], p[1]), p[2]);
  if (name === 'TriangleExtrude') {
    const shape = new THREE.Shape();
    shape.moveTo(p[0], p[1]);
    shape.lineTo(p[2], p[3]);
    shape.lineTo(p[4], p[5]);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: p[6], bevelEnabled: false });
  }
  return new THREE[name](...p);
}

function run(body, scope, g, env) {
  const val = (v, s = scope) => value(v, s, env.palette),
    vec = (list) => list.map((v) => val(v));
  for (const node of body) {
    if (node.let) {
      for (const [k, v] of Object.entries(node.let)) scope[k] = val(v);
    } else if (node.box) {
      const [x, y, z, w, h, d] = vec(node.box),
        m = env.kit.cube(g, x, y, z, w, h, d, val(node.color));
      if (node.rotation) m.rotation.set(...vec(node.rotation));
    } else if (node.piece) {
      const m = env.kit[node.piece](g, ...node.args.map((a) => val(a)));
      if (node.rotation) m.rotation.set(...vec(node.rotation));
    } else if (node.geo) {
      const [x, y, z] = vec(node.at),
        geometry = makeGeometry(env.kit, [node.geo[0], ...node.geo.slice(1).map((p) => val(p))]),
        m = env.kit.geo(g, geometry, x, y, z, val(node.color));
      if (node.rotation) m.rotation.set(...vec(node.rotation));
    } else if (node.group) {
      const sub = new THREE.Group();
      if (node.group.at) sub.position.set(...vec(node.group.at));
      if (node.group.rotation) sub.rotation.set(...vec(node.group.rotation));
      g.add(sub);
      run(node.body, Object.create(scope), sub, env);
    } else if (node.for) {
      const loop = Object.create(scope);
      if (node.in) {
        for (const item of node.in.map((v) => val(v))) {
          loop[node.for] = item;
          run(node.body, Object.create(loop), g, env);
        }
      } else {
        // for (v = from; while; v += step): `step` se evalúa una vez, como en el código original.
        const step = val(node.step);
        if (!Number.isFinite(step) || step === 0) throw new Error('for: paso no válido');
        let count = 0;
        for (loop[node.for] = val(node.from); evaluate(node.while, loop); loop[node.for] += step) {
          if (++count > MAX_ITERATIONS) throw new Error('for: demasiadas iteraciones');
          run(node.body, Object.create(loop), g, env);
        }
      }
    } else if (node.if !== undefined) {
      const branch = evaluate(node.if, scope) ? node.then : node.else;
      if (branch) run(branch, Object.create(scope), g, env);
    } else if (node.use) {
      const recipe = env.designs.recipes[node.use],
        inner = Object.create(scope);
      for (const [k, v] of Object.entries(recipe.params || {})) inner[k] = val(v, inner);
      for (const [k, v] of Object.entries(node.with || {})) inner[k] = val(v, scope);
      run(recipe.body, inner, g, env);
    } else if (node.roof) {
      // La cubierta es una sola por frente y se añade tras todos sus muros.
      env.roof ??= { y: val(node.roof.y), color: val(node.roof.color) };
    }
  }
}

// Muros del anclaje, creados de uno en uno para conservar el orden de creación.
function* walls(anchor, kit, context, env) {
  const outwardFrom = (a, b, center) => [
    (a[0] + b[0]) / 2 - center[0],
    (a[1] + b[1]) / 2 - center[1],
  ];
  const ringWalls = function* (ring, center) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      yield { ...kit.wall(a, b, outwardFrom(a, b, center)) };
    }
  };
  if (anchor.ring) yield* ringWalls(anchor.ring, anchor.center);
  else if (anchor.landmarkRing) {
    const mark = (context.landmarks || []).find((p) => p.name.includes(anchor.landmarkRing));
    if (!mark) return;
    env.ring = mark.outline.slice(0, -1);
    yield* ringWalls(env.ring, mark.p);
  } else if (anchor.front) {
    const f = (context.fronts || []).find((x) => x.id === anchor.front);
    if (!f) throw new Error(`Frente no seleccionado: ${anchor.front}`);
    yield {
      ...kit.wall(f.a, f.q, [f.nx, f.nz]),
      extra: {
        h: f.h,
        floors: f.floors,
        seed: f.seed,
        commercialStreet: f.street !== 'Calle Constitución',
      },
    };
  } else if (anchor.world) {
    const g = new THREE.Group();
    kit.staging.add(g);
    yield { g, len: undefined };
  } else {
    const out = anchor.outward ?? outwardFrom(anchor.a, anchor.b, anchor.outwardFrom);
    yield { ...kit.wall(anchor.a, anchor.b, out) };
  }
}

// context: { landmarks, fronts } según los anclajes del edificio. Devuelve los grupos de muro creados.
export function composeBuilding(kit, designs, id, context = {}) {
  const building = designs.buildings.find((b) => b.id === id);
  if (!building) throw new Error(`Diseño de fachada desconocido: ${id}`);
  const groups = [];
  try {
    for (const front of building.fronts) {
      const recipe = designs.recipes[front.recipe],
        env = { kit, designs, palette: kit.palette, roof: null, ring: null };
      for (const w of walls(front.anchor, kit, context, env)) {
        const scope = Object.create(null);
        if (w.len !== undefined) scope.len = w.len;
        Object.assign(scope, w.extra);
        for (const [k, v] of Object.entries(recipe.params || {}))
          scope[k] = value(v, scope, kit.palette);
        for (const [k, v] of Object.entries(front.with || {}))
          scope[k] = value(v, scope, kit.palette);
        if (front.scaleY !== undefined) w.g.scale.y = value(front.scaleY, scope, kit.palette);
        run(recipe.body, scope, w.g, env);
        groups.push(w.g);
      }
      if (env.roof)
        kit.staging.add(flatPolygon(env.ring, env.roof.y, kit.material(env.roof.color)));
    }
  } catch (e) {
    throw new Error(`Diseño de fachada «${id}»: ${e.message}`, { cause: e });
  }
  return groups;
}
