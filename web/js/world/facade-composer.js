// Compositor: ejecuta las recetas de web/facade-designs.json con las piezas del kit.
// No crea materiales ni mallas propios: todo pasa por `kit` (cube, geo, wall, material…).
// Formato y semántica: docs/plan-modular/KIT-FACHADAS.md (K3 y K4).
import * as THREE from '../../vendor/three.module.min.js';
import { evaluate } from '../engine/expr.js';
import { flatPolygon } from '../engine/materials.js';
import { outwardOf } from './facade-kit.js';
import { world } from '../core/state.js';
import { groundHeightAt } from '../engine/terrain-sampling.js';
import { pInside, pointSeg } from '../core/math.js';

const MAX_ITERATIONS = 10000,
  HEX = /^#[0-9a-f]{6}$/;

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

// Campo `color`: literal, `$paleta`, parámetro o variable (nombre), `=expresión` o pick.
// El resultado debe ser #rrggbb (tras resolver `$paleta`); si no, error claro.
function color(v, scope, palette) {
  const c =
    typeof v === 'string' && v[0] === '=' ? evaluate(v.slice(1), scope) : value(v, scope, palette);
  const resolved =
    typeof c === 'string' && c[0] === '$' && Object.hasOwn(palette, c.slice(1))
      ? palette[c.slice(1)]
      : c;
  if (typeof resolved !== 'string' || !HEX.test(resolved))
    throw new Error(`Se esperaba un color (#rrggbb o $paleta), no «${String(c)}»`);
  return resolved;
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
        m = env.kit.cube(g, x, y, z, w, h, d, color(node.color, scope, env.palette));
      if (node.rotation) m.rotation.set(...vec(node.rotation));
    } else if (node.piece) {
      const m = env.kit[node.piece](g, ...node.args.map((a) => val(a)));
      if (node.rotation) m.rotation.set(...vec(node.rotation));
    } else if (node.geo) {
      const [x, y, z] = vec(node.at),
        geometry = makeGeometry(env.kit, [node.geo[0], ...node.geo.slice(1).map((p) => val(p))]),
        m = env.kit.geo(g, geometry, x, y, z, color(node.color, scope, env.palette));
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
    }
  }
}

// Muro de un frente catastral y variables predefinidas de su receta: `hash` y `seed` son el
// mismo hash determinista por frente, `street` el nombre de la calle y `commercialStreet` que
// esa calle no figura en `context.residentialStreets` (city-design.json, frontages).
function frontWall(kit, f, context) {
  const w = kit.wall(f.a, f.q, [f.nx, f.nz]);
  w.g.position.y = f.baseY ?? 0;
  return {
    ...w,
    extra: {
      h: f.h,
      floors: f.floors,
      seed: f.seed,
      hash: f.seed,
      street: f.street,
      commercialStreet: !(context.residentialStreets || []).includes(f.street),
    },
  };
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
    if (f) yield frontWall(kit, f, context);
    else {
      // Frente que prepareFacades no ha seleccionado: la normal sale de outwardOf.
      const [, bi, ei] = /^building-(\d+)-edge-(\d+)$/.exec(anchor.front),
        b = (context.buildings || [])[Number(bi)],
        out = b && outwardOf(b, Number(ei), context.sideProbe);
      if (!out) throw new Error(`Frente no seleccionado: ${anchor.front}`);
      const edge = Number(ei),
        cx = (b.minX + b.maxX) / 2,
        cz = (b.minZ + b.maxZ) / 2;
      yield frontWall(
        kit,
        {
          a: b.p[edge],
          q: b.p[(edge + 1) % b.p.length],
          nx: out[0],
          nz: out[1],
          h: b.visualH ?? b.h,
          floors: b.floors,
          baseY: b.baseY,
          seed: Math.abs(Math.round(cx * 7 + cz * 13)),
          street: '',
        },
        context,
      );
    }
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
  // Base común del conjunto según sus anclajes; las coordenadas y alturas del diseño son relativas.
  let baseY = world.terrain?.kind === 'grid' ? -Infinity : 0;
  if (world.terrain?.kind === 'grid') {
    const mark = world.city.landmarks.find(
      (l) => building.landmark && l.name.includes(building.landmark),
    );
    if (Number.isFinite(mark?.baseY)) baseY = mark.baseY;
    for (const f of building.fronts) {
      const a = f.anchor;
      const point = a.center ?? (a.a ? [(a.a[0] + a.b[0]) / 2, (a.a[1] + a.b[1]) / 2] : null);
      if (point) {
        const mark = world.city.landmarks.find(
          (l) =>
            Array.isArray(l.outline) &&
            (pInside(...point, l.outline) ||
              l.outline.some(
                (p, i) => pointSeg(...point, p, l.outline[(i + 1) % l.outline.length]).d < 0.5,
              )),
        );
        if (Number.isFinite(mark?.baseY)) {
          baseY = Math.max(baseY, mark.baseY);
          continue;
        }
      }
      if (a.front)
        baseY = Math.max(baseY, world.city.buildings[Number(a.front.split('-')[1])]?.baseY ?? 0);
      else if (a.landmarkRing)
        baseY = Math.max(
          baseY,
          world.city.landmarks.find((l) => l.name.includes(a.landmarkRing))?.baseY ?? 0,
        );
      else if (a.ring) baseY = Math.max(baseY, ...a.ring.map((p) => groundHeightAt(...p)));
      else if (a.a) baseY = Math.max(baseY, groundHeightAt(...a.a), groundHeightAt(...a.b));
    }
  }
  if (!Number.isFinite(baseY)) baseY = 0;
  let roofRing = null,
    roofScope = null;
  try {
    for (const front of building.fronts) {
      const recipe = designs.recipes[front.recipe],
        env = { kit, designs, palette: kit.palette, ring: null };
      for (const w of walls(front.anchor, kit, context, env)) {
        w.g.position.y = baseY;
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
      if (env.ring && building.roof && !roofRing) {
        // Ámbito de la cubierta: parámetros de la receta y `with`, sin variables del muro.
        roofRing = env.ring;
        roofScope = Object.create(null);
        for (const [k, v] of Object.entries(recipe.params || {}))
          roofScope[k] = value(v, roofScope, kit.palette);
        for (const [k, v] of Object.entries(front.with || {}))
          roofScope[k] = value(v, roofScope, kit.palette);
      }
    }
    // Una sola cubierta por edificio, tras todos sus muros (como `nave()` original).
    if (building.roof && roofRing) {
      const y = value(building.roof.y, roofScope, kit.palette),
        c = color(building.roof.color, roofScope, kit.palette);
      kit.staging.add(flatPolygon(roofRing, baseY + y, kit.material(c)));
    }
  } catch (e) {
    throw new Error(`Diseño de fachada «${id}»: ${e.message}`, { cause: e });
  }
  return groups;
}

// Aplica una receta a un frente seleccionado por prepareFacades (frentes genéricos de calle),
// sin que haya un edificio en el diseño. Devuelve el grupo del muro.
export function composeFront(kit, designs, recipeName, front, context = {}) {
  const recipe = designs.recipes[recipeName];
  if (!recipe) throw new Error(`Receta de frente desconocida: ${recipeName}`);
  try {
    const w = frontWall(kit, front, context),
      scope = Object.create(null);
    scope.len = w.len;
    Object.assign(scope, w.extra);
    for (const [k, v] of Object.entries(recipe.params || {}))
      scope[k] = value(v, scope, kit.palette);
    run(recipe.body, scope, w.g, { kit, designs, palette: kit.palette, ring: null });
    return w.g;
  } catch (e) {
    throw new Error(`Receta «${recipeName}» en el frente ${front.id}: ${e.message}`, { cause: e });
  }
}
