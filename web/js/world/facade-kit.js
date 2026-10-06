import * as THREE from '../../vendor/three.module.min.js';

// Piezas que las recetas JSON pueden llamar con `piece` (statue y spiralColumn llegarán con el paso 2.7).
export const KIT_PIECES = [
  'pane',
  'balcony',
  'arch',
  'pediment',
  'sign',
  'civicPane',
  'cross',
  'column',
  'door',
  'belfry',
];

// Parametric facade pieces in a wall's local frame (x along the wall from `a`, y up, z outward).
// They create staging meshes only; buildDetailedFacades bakes them into batches.
export function createFacadeKit({ staging, palette }) {
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map();
  function material(color) {
    if (!materials.has(color))
      materials.set(
        color,
        new THREE.MeshStandardMaterial({
          color,
          roughness: color === palette.glass ? 0.32 : 0.83,
          metalness: color === palette.iron ? 0.3 : 0,
          side: THREE.DoubleSide,
        }),
      );
    return materials.get(color);
  }
  // Staging only: one unit box scaled per piece; the batches bake the final vertices.
  function cube(g, x, y, z, w, h, d, color) {
    let m = new THREE.Mesh(unitBox, material(color));
    m.position.set(x, y, z);
    m.scale.set(w, h, d);
    g.add(m);
    return m;
  }
  function geo(g, geometry, x, y, z, color) {
    let m = new THREE.Mesh(geometry, material(color));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }
  function wall(a, b, out) {
    let dx = b[0] - a[0],
      dz = b[1] - a[1],
      len = Math.hypot(dx, dz);
    if (out && -dz * out[0] + dx * out[1] < 0) {
      a = b;
      dx = -dx;
      dz = -dz;
    }
    let g = new THREE.Group();
    g.position.set(a[0], 0, a[1]);
    g.rotation.y = Math.atan2(-dz, dx);
    staging.add(g);
    return { g, len };
  }
  function pane(g, x, y, w, h, z = 0.12, shutters = false, frameColor = palette.wood) {
    cube(g, x, y, z, w + 0.24, h + 0.23, 0.14, palette.cream);
    cube(g, x, y, z + 0.09, w, h, 0.035, palette.glass);
    cube(g, x, y, z + 0.13, 0.05, h, 0.04, frameColor);
    cube(g, x, y, z + 0.13, w, 0.05, 0.04, frameColor);
    cube(g, x, y - h / 2 - 0.1, z + 0.12, w + 0.38, 0.12, 0.36, palette.cream);
    if (shutters)
      for (const side of [-1, 1]) {
        cube(g, x + side * (w / 2 + 0.2), y, z + 0.12, 0.3, h, 0.055, palette.green);
        for (let k = 0; k < 8; k++)
          cube(
            g,
            x + side * (w / 2 + 0.2),
            y - h / 2 + 0.1 + (k * h) / 8,
            z + 0.16,
            0.28,
            0.025,
            0.03,
            '#788578',
          );
      }
  }
  function balcony(g, x, y, w, color = palette.iron, depth = 0.55) {
    cube(g, x, y, 0.25 + depth / 2, w + 0.4, 0.14, depth + 0.3, palette.cream);
    cube(g, x, y + 0.9, 0.2 + depth, w + 0.25, 0.055, 0.055, color);
    cube(g, x, y + 0.12, 0.2 + depth, w + 0.25, 0.045, 0.045, color);
    for (let u = -w / 2; u <= w / 2; u += 0.22)
      cube(g, x + u, y + 0.5, 0.2 + depth, 0.035, 0.8, 0.035, color);
    for (const side of [-1, 1])
      cube(g, x + side * (w / 2 + 0.08), y + 0.9, 0.2 + depth / 2, 0.04, 0.04, depth, color);
  }
  function archShape(w, h) {
    let s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w / 2, h - w / 2);
    s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
    s.lineTo(-w / 2, 0);
    return s;
  }
  function arch(g, x, y, w, h) {
    let inner = archShape(w, h);
    geo(g, new THREE.ShapeGeometry(inner, 14), x, y, 0.16, palette.iron);
    let outer = archShape(w + 0.48, h + 0.24);
    outer.holes.push(new THREE.Path(inner.getPoints(20)));
    geo(
      g,
      new THREE.ExtrudeGeometry(outer, { depth: 0.14, bevelEnabled: false, curveSegments: 16 }),
      x,
      y,
      0.2,
      palette.cream,
    );
    for (let u = -w / 2 + 0.14; u < w / 2; u += 0.2)
      cube(g, x + u, y + (h - w / 2) / 2, 0.23, 0.026, h - w / 2, 0.025, '#626561');
    for (let i = 0; i <= 16; i++) {
      let angle = -Math.PI / 2 + (i * Math.PI) / 16,
        r = w / 2,
        m = cube(
          g,
          x + (Math.sin(angle) * r) / 2,
          y + h - r + (Math.cos(angle) * r) / 2,
          0.26,
          0.022,
          r,
          0.025,
          '#626561',
        );
      m.rotation.z = -angle;
    }
    cube(g, x, y + 1.2, 0.25, w, 0.05, 0.045, '#626561');
  }
  function pediment(g, x, y, w) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(0, w * 0.25);
    s.closePath();
    geo(
      g,
      new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: false }),
      x,
      y,
      0.26,
      palette.cream,
    );
    cube(g, x, y - 0.04, 0.3, w + 0.12, 0.12, 0.32, palette.white);
  }
  function sign(g, text, x, y, w, h, color = '#e5e0ce', bg = '#514d43') {
    let c = document.createElement('canvas');
    c.width = 1024;
    c.height = 128;
    let a = c.getContext('2d');
    a.fillStyle = bg;
    a.fillRect(0, 0, 1024, 128);
    a.fillStyle = color;
    a.font = 'bold 55px Arial';
    a.textAlign = 'center';
    a.textBaseline = 'middle';
    a.fillText(text, 512, 65, 965);
    let tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    let m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }),
    );
    m.position.set(x, y, 0.42);
    g.add(m);
    return m;
  }
  function civicPane(g, x, y, w, h, z) {
    pane(g, x, y, w, h, z, false, '#4d3d32');
    for (const u of [-w / 6, w / 6]) cube(g, x + u, y, z + 0.14, 0.045, h, 0.035, '#4d3d32');
    for (const v of [-0.33, -0.16, 0.16, 0.33])
      cube(g, x, y + h * v, z + 0.14, w, 0.045, 0.035, '#4d3d32');
  }
  function cross(g, x, y, z = 0.2) {
    cube(g, x, y, z, 0.13, 1.5, 0.16, palette.iron);
    cube(g, x, y + 0.19, z, 0.78, 0.13, 0.16, palette.iron);
  }
  function column(g, x, y, h, r, color) {
    geo(g, new THREE.CylinderGeometry(r * 0.83, r, h, 12), x, y, 0.5, color);
    cube(g, x, y - h / 2, 0.5, r * 2.8, 0.2, 0.7, color);
    cube(g, x, y + h / 2, 0.5, r * 2.9, 0.24, 0.75, color);
  }
  function door(g, x, y, w, h) {
    geo(g, new THREE.ShapeGeometry(archShape(w, h), 20), x, y, 0.24, '#554437');
    for (let u = -w / 2 + 0.12; u < w / 2; u += 0.2) {
      let top = h - w / 2 + Math.sqrt(Math.max(0, (w * w) / 4 - u * u));
      cube(g, x + u, y + top / 2, 0.27, 0.016, top, 0.018, '#88715a');
    }
    cube(g, x, y + 1.1, 0.29, 0.05, 2.2, 0.035, '#352e29');
  }
  function belfry(g, x, y, w, h) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(w / 2, h);
    shape.lineTo(-w / 2, h);
    shape.closePath();
    let path = new THREE.Path();
    path.moveTo(-w * 0.28, 0.15);
    path.lineTo(w * 0.28, 0.15);
    path.lineTo(w * 0.28, h - w * 0.28 - 0.2);
    path.absarc(0, h - w * 0.28 - 0.2, w * 0.28, 0, Math.PI, false);
    path.lineTo(-w * 0.28, 0.15);
    shape.holes.push(path);
    geo(
      g,
      new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: false, curveSegments: 16 }),
      x,
      y,
      -0.15,
      palette.cream,
    );
    geo(g, new THREE.CylinderGeometry(0.15, 0.36, 0.52, 12), x, y + 0.85, 0.1, '#6a6554');
    cube(g, x, y + 1.3, 0.1, 0.06, 0.5, 0.08, palette.iron);
  }
  return {
    staging,
    palette,
    unitBox,
    material,
    cube,
    geo,
    wall,
    pane,
    balcony,
    archShape,
    arch,
    pediment,
    sign,
    civicPane,
    cross,
    column,
    door,
    belfry,
  };
}
