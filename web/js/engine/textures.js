import * as THREE from '../../vendor/three.module.min.js';

export function facadeTexture() {
  let c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  let a = c.getContext('2d');
  a.fillStyle = '#dedbcf';
  a.fillRect(0, 0, 128, 128);
  let seed = 31;
  for (let i = 0; i < 2000; i++) {
    seed = (seed * 16807) % 2147483647;
    a.fillStyle = seed % 2 ? '#ffffff0a' : '#3e372b09';
    a.fillRect(seed % 128, Math.floor(seed / 128) % 128, 1, 1);
  }
  a.fillStyle = '#c2bcae';
  a.fillRect(30, 22, 70, 83);
  a.fillStyle = '#faf3df';
  a.fillRect(26, 18, 70, 82);
  a.fillStyle = '#4c6766';
  a.fillRect(32, 24, 58, 69);
  a.fillStyle = '#26484f';
  a.fillRect(39, 27, 21, 59);
  a.fillStyle = '#88a1a0';
  a.fillRect(42, 28, 17, 25);
  a.fillStyle = '#566b5b';
  a.fillRect(64, 26, 21, 62);
  a.fillStyle = '#e8dbc2';
  a.fillRect(25, 94, 74, 8);
  a.fillStyle = '#303b37';
  a.fillRect(25, 80, 75, 3);
  for (let x = 28; x < 99; x += 11) a.fillRect(x, 79, 2, 18);
  let tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Street-level materials and lightweight instanced urban detail.
export function surfaceTexture(kind) {
  let c = document.createElement('canvas');
  c.width = c.height = 256;
  let a = c.getContext('2d'),
    seed = 711;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  a.fillStyle = kind === 'asphalt' ? '#727775' : '#a5a294';
  a.fillRect(0, 0, 256, 256);
  if (kind === 'asphalt') {
    for (let i = 0; i < 19000; i++) {
      let v = Math.floor(92 + r() * 59);
      a.fillStyle = `rgb(${v},${v + 3},${v + 1})`;
      let x = r() * 256,
        y = r() * 256;
      a.fillRect(x, y, r() > 0.85 ? 2 : 1, 1);
    }
  } else {
    let step = kind === 'stone' ? 32 : 64;
    for (let y = 0; y < 256; y += step)
      for (let x = -step; x < 256; x += step) {
        let xx = x + ((Math.floor(y / step) % 2) * step) / 2,
          v = Math.floor(165 + r() * 25);
        a.fillStyle =
          kind === 'stone' ? `rgb(${v},${v - 2},${v - 10})` : `rgb(${v + 11},${v + 7},${v - 6})`;
        a.fillRect(xx + 1, y + 1, step - 2, step - 2);
        a.fillStyle = '#ffffff1b';
        a.fillRect(xx + 2, y + 2, step - 4, 1);
      }
    for (let i = 0; i < 5000; i++) {
      a.fillStyle = r() > 0.5 ? '#ffffff08' : '#403c340c';
      a.fillRect(r() * 256, r() * 256, 1, 1);
    }
  }
  let tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
