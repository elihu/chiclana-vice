export const $ = (id) => document.getElementById(id);

// Cached element references; per-frame HUD writes touch the DOM only when values change.
const domRefs = new Map(),
  domValues = new WeakMap();

export function ui(id) {
  let e = domRefs.get(id);
  if (!e) domRefs.set(id, (e = $(id)));
  return e;
}

function domCache(e) {
  let c = domValues.get(e);
  if (!c) domValues.set(e, (c = {}));
  return c;
}

export function setText(target, value) {
  const e = typeof target === 'string' ? ui(target) : target,
    c = domCache(e);
  if (c.text !== value) e.textContent = c.text = value;
}

export function setStyle(target, prop, value) {
  const e = typeof target === 'string' ? ui(target) : target,
    c = domCache(e);
  if (c[prop] !== value) e.style[prop] = c[prop] = value;
}

export function sleepFrame() {
  return new Promise((r) => requestAnimationFrame(r));
}
