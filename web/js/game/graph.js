import { blocked, inBuilding } from '../world/spatial.js';
import { driveNetwork, graph, segments, world } from '../core/state.js';
import { lerp } from '../core/math.js';

export function buildRoadGraph() {
  let ids = new Map();
  function node(p) {
    let k = Math.round(p[0] * 5) + ',' + Math.round(p[1] * 5);
    if (ids.has(k)) return ids.get(k);
    let id = graph.length;
    graph.push({ x: p[0], z: p[1], adj: [] });
    ids.set(k, id);
    return id;
  }
  for (const r of world.city.roads) {
    let drive = !world.cityDesign.pavements.nonDrivableTypes.includes(r.type);
    for (let i = 1; i < r.p.length; i++) {
      let a = r.p[i - 1],
        b = r.p[i],
        length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 0.2) continue;
      let ai = node(a),
        bi = node(b);
      let s = { a, b, ai, bi, length, name: r.name, width: r.w, bridge: r.bridge, drive };
      // OSM oneway=yes follows the vertex order; walking ignores it (edge.drive only).
      s.oneway = drive && !!r.oneway;
      s.forward = { to: bi, length, drive, s };
      s.reverse = { to: ai, length, drive: drive && !s.oneway, s };
      segments.push(s);
      graph[ai].adj.push(s.forward);
      graph[bi].adj.push(s.reverse);
    }
  }
}

export function connectOpenSpaces() {
  const parent = graph.map((_, i) => i);
  const root = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let i = 0; i < graph.length; i++) for (const e of graph[i].adj) parent[root(i)] = root(e.to);
  const candidates = [];
  for (let i = 0; i < graph.length; i++) {
    if (graph[i].adj.length > 2) continue;
    for (let j = i + 1; j < graph.length; j++) {
      let a = graph[i],
        b = graph[j],
        di = Math.hypot(a.x - b.x, a.z - b.z);
      if (di < 24 && root(i) !== root(j)) candidates.push({ i, j, di });
    }
  }
  candidates.sort((a, b) => a.di - b.di);
  for (const { i, j, di } of candidates) {
    if (root(i) === root(j)) continue;
    let a = graph[i],
      b = graph[j],
      clear = true;
    for (let k = 0; k <= 10; k++) {
      if (blocked(lerp(a.x, b.x, k / 10), lerp(a.z, b.z, k / 10), 0.15)) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    graph[i].adj.push({ to: j, length: di, drive: false });
    graph[j].adj.push({ to: i, length: di, drive: false });
    parent[root(i)] = root(j);
  }
}

// Directed driving network for traffic and police (the player drives freely). Each drive
// component must stay strongly connected (no dead ends, police routes everywhere): oneway
// is ignored only on segments around nodes that would otherwise be unreachable or have no
// exit. Segments whose centre line touches a cadastral outline (narrow alleys, where agents
// used to get stuck) are left out of the agents' network.
function driveComponents() {
  const n = graph.length,
    index = new Int32Array(n).fill(-1),
    low = new Int32Array(n),
    onStack = new Uint8Array(n),
    comp = new Int32Array(n).fill(-1),
    stack = [],
    call = [];
  let next = 0,
    count = 0;
  for (let root = 0; root < n; root++) {
    if (index[root] !== -1) continue;
    call.push([root, 0]);
    while (call.length) {
      const top = call[call.length - 1],
        v = top[0],
        adj = graph[v].adj;
      if (index[v] === -1) {
        index[v] = low[v] = next++;
        stack.push(v);
        onStack[v] = 1;
      }
      let descended = false;
      while (top[1] < adj.length) {
        const e = adj[top[1]++];
        if (!e.drive) continue;
        if (index[e.to] === -1) {
          call.push([e.to, 0]);
          descended = true;
          break;
        }
        if (onStack[e.to]) low[v] = Math.min(low[v], index[e.to]);
      }
      if (descended) continue;
      if (low[v] === index[v]) {
        let w;
        do {
          w = stack.pop();
          onStack[w] = 0;
          comp[w] = count;
        } while (w !== v);
        count++;
      }
      call.pop();
      if (call.length) {
        const u = call[call.length - 1][0];
        low[u] = Math.min(low[u], low[v]);
      }
    }
  }
  return comp;
}

export function orientDriveGraph() {
  for (const s of segments) {
    if (!s.drive) continue;
    const steps = Math.ceil(s.length / 0.5);
    for (let i = 0; i <= steps && !s.blocked; i++)
      s.blocked = inBuilding(
        lerp(s.a[0], s.b[0], i / steps),
        lerp(s.a[1], s.b[1], i / steps),
        0.35,
      );
    if (s.blocked) s.forward.drive = s.reverse.drive = false;
  }
  const n = graph.length,
    road = (e) => e.s?.drive && !e.s.blocked,
    group = new Int32Array(n).fill(-1),
    groups = [];
  for (let i = 0; i < n; i++) {
    if (group[i] !== -1 || !graph[i].adj.some(road)) continue;
    const members = [i];
    group[i] = groups.length;
    for (let k = 0; k < members.length; k++)
      for (const e of graph[members[k]].adj)
        if (road(e) && group[e.to] === -1) {
          group[e.to] = groups.length;
          members.push(e.to);
        }
    groups.push(members);
  }
  const reach = (root, forward, members) => {
    const seen = new Uint8Array(n),
      queue = [root],
      incoming = new Map();
    if (!forward)
      for (const u of members)
        for (const e of graph[u].adj)
          if (e.drive) {
            if (!incoming.has(e.to)) incoming.set(e.to, []);
            incoming.get(e.to).push(u);
          }
    seen[root] = 1;
    const visit = (v) => {
      if (!seen[v]) {
        seen[v] = 1;
        queue.push(v);
      }
    };
    for (let k = 0; k < queue.length; k++) {
      const u = queue[k];
      if (forward) {
        for (const e of graph[u].adj) if (e.drive) visit(e.to);
      } else for (const v of incoming.get(u) || []) visit(v);
    }
    return seen;
  };
  const comp = driveComponents();
  for (const members of groups) {
    // Root in the largest strongly connected part, so only isolated pockets are relaxed.
    const sizes = new Map();
    for (const m of members) sizes.set(comp[m], (sizes.get(comp[m]) || 0) + 1);
    const best = [...sizes].sort((a, b) => b[1] - a[1])[0][0],
      root = members.find((m) => comp[m] === best);
    for (;;) {
      const out = reach(root, true, members),
        back = reach(root, false, members),
        inside = (m) => out[m] && back[m],
        outside = members.filter((m) => !inside(m));
      if (!outside.length) break;
      // Relax only the oneway segments on the frontier, then grow the component again.
      for (const m of outside)
        for (const e of graph[m].adj)
          if (road(e) && !e.s.reverse.drive && inside(e.to)) {
            e.s.reverse.drive = true;
            e.s.relaxed = true;
          }
    }
  }
  const main = groups.reduce((a, b) => (b.length > a.length ? b : a), []);
  for (const m of main) graph[m].driveMain = true;
  Object.assign(driveNetwork, {
    oneway: segments.filter((s) => s.oneway).length,
    relaxed: segments.filter((s) => s.relaxed).length,
    blocked: segments.filter((s) => s.blocked).length,
    components: groups.length,
    mainNodes: main.length,
  });
}

export function nearestNode(x, z, driveOnly = false) {
  let md = Infinity,
    best = 0;
  for (let i = 0; i < graph.length; i++) {
    let n = graph[i];
    if (driveOnly && !n.driveMain) continue;
    let di = (x - n.x) ** 2 + (z - n.z) ** 2;
    if (di < md) {
      md = di;
      best = i;
    }
  }
  return best;
}

// Dijkstra with a binary heap keyed by (distance, node). Ties settle the lowest node
// first and relaxation is strict, as in the previous O(N²) scan: identical routes.
let routeDist, routePrev, routeUsed, heapDist, heapNode;

export function findRoute(from, to, driveOnly = false) {
  if (from === to) return [from];
  const n = graph.length;
  if (!routeDist || routeDist.length !== n) {
    routeDist = new Float64Array(n);
    routePrev = new Int32Array(n);
    routeUsed = new Uint8Array(n);
  }
  let edges = 1;
  for (const g of graph) edges += g.adj.length;
  if (!heapDist || heapDist.length < edges) {
    heapDist = new Float64Array(edges);
    heapNode = new Int32Array(edges);
  }
  const ds = routeDist,
    prev = routePrev,
    used = routeUsed,
    less = (i, j) =>
      heapDist[i] < heapDist[j] || (heapDist[i] === heapDist[j] && heapNode[i] < heapNode[j]);
  ds.fill(Infinity);
  prev.fill(-1);
  used.fill(0);
  ds[from] = 0;
  let size = 0;
  const swap = (i, j) => {
    let dv = heapDist[i],
      nv = heapNode[i];
    heapDist[i] = heapDist[j];
    heapNode[i] = heapNode[j];
    heapDist[j] = dv;
    heapNode[j] = nv;
  };
  const push = (dv, node) => {
    let i = size++;
    heapDist[i] = dv;
    heapNode[i] = node;
    while (i > 0) {
      let parent = (i - 1) >> 1;
      if (!less(i, parent)) break;
      swap(i, parent);
      i = parent;
    }
  };
  const pop = () => {
    let top = heapNode[0];
    size--;
    heapDist[0] = heapDist[size];
    heapNode[0] = heapNode[size];
    for (let i = 0; ;) {
      let l = i * 2 + 1,
        r = l + 1,
        m = i;
      if (l < size && less(l, m)) m = l;
      if (r < size && less(r, m)) m = r;
      if (m === i) break;
      swap(i, m);
      i = m;
    }
    return top;
  };
  push(0, from);
  while (size) {
    let u = pop();
    if (used[u]) continue;
    if (u === to) break;
    used[u] = 1;
    for (let e of graph[u].adj) {
      if (driveOnly && !e.drive) continue;
      let nd = ds[u] + e.length;
      if (nd < ds[e.to]) {
        ds[e.to] = nd;
        prev[e.to] = u;
        push(nd, e.to);
      }
    }
  }
  if (prev[to] === -1) return [];
  let out = [to];
  while (out[out.length - 1] !== from) {
    out.push(prev[out[out.length - 1]]);
    if (out.length > n) return [];
  }
  return out.reverse();
}
