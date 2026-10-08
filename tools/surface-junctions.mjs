// Uniones cartografiadas: extremos compartidos y extremos sobre vértices interiores.
export function surfaceJunctions(city, model) {
  const vertices = new Map();
  for (const road of city.roads) {
    if (!model.profiles.get(road.id)?.length) continue;
    for (let i = 0; i < road.p.length; i++) {
      const point = road.p[i],
        key = point.join(',');
      if (!vertices.has(key)) vertices.set(key, []);
      vertices.get(key).push({ road, point, end: i === 0 || i === road.p.length - 1 });
    }
  }
  const shared = [],
    tees = [];
  for (const entries of vertices.values()) {
    const ends = entries.filter((e) => e.end);
    for (let i = 0; i < ends.length; i++) {
      const a = ends[i],
        y = model.roadAt(...a.point, a.road.id).y;
      for (const b of entries) {
        if (a.road.id === b.road.id || (b.end && ends.indexOf(b) <= i)) continue;
        const jump = Math.abs(y - model.roadAt(...b.point, b.road.id).y);
        (b.end ? shared : tees).push({ jump, point: a.point, roads: [a.road.id, b.road.id] });
      }
    }
  }
  shared.sort((a, b) => b.jump - a.jump);
  tees.sort((a, b) => b.jump - a.jump);
  return {
    shared: { count: shared.length, maximum: shared[0]?.jump ?? 0, worst: shared.slice(0, 10) },
    tees: { count: tees.length, maximum: tees[0]?.jump ?? 0, worst: tees.slice(0, 10) },
  };
}
