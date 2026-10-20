// Procedural canvas textures: asphalt, road markings, concrete, metal, neon signs.
// No external image files are used anywhere in the game.
import * as THREE from 'three';
import { RNG } from '../util/math.js';

let maxAniso = 4;
export function setMaxAnisotropy(a) {
  maxAniso = a;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finish(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

// Value noise helper on a canvas-sized grid.
function makeNoise(size, cell, rng) {
  const n = Math.ceil(size / cell) + 1;
  const grid = new Float32Array(n * n);
  for (let i = 0; i < grid.length; i++) grid[i] = rng.next();
  return (x, y) => {
    const gx = x / cell;
    const gy = y / cell;
    const x0 = Math.floor(gx) % (n - 1);
    const y0 = Math.floor(gy) % (n - 1);
    const fx = gx - Math.floor(gx);
    const fy = gy - Math.floor(gy);
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = grid[y0 * n + x0];
    const b = grid[y0 * n + x0 + 1];
    const c = grid[(y0 + 1) * n + x0];
    const d = grid[(y0 + 1) * n + x0 + 1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

const cache = new Map();
function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

// Asphalt albedo + roughness (puddles are low roughness so they mirror lights).
export function asphalt() {
  return cached('asphalt', () => {
    const S = 512;
    const rng = new RNG(1337);
    const col = canvas(S, S);
    const rough = canvas(S, S);
    const cx = col.getContext('2d');
    const rx = rough.getContext('2d');
    const ci = cx.createImageData(S, S);
    const ri = rx.createImageData(S, S);
    const n1 = makeNoise(S, 64, rng);
    const n2 = makeNoise(S, 16, rng);
    const n3 = makeNoise(S, 128, rng);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const grain = rng.next();
        const wear = n1(x, y) * 0.6 + n2(x, y) * 0.4;
        let v = 34 + wear * 26 + (grain - 0.5) * 22;
        if (grain > 0.985) v += 40; // aggregate stones
        ci.data[i] = v * 0.95;
        ci.data[i + 1] = v * 0.97;
        ci.data[i + 2] = v * 1.02;
        ci.data[i + 3] = 255;
        // Roughness: wet asphalt ~0.45, puddles ~0.06.
        const puddle = n3(x, y);
        let r = 0.42 + (grain - 0.5) * 0.25 + wear * 0.12;
        if (puddle > 0.68) r = 0.05 + (1 - Math.min(1, (puddle - 0.68) * 8)) * 0.35;
        const rv = Math.max(0, Math.min(255, r * 255));
        ri.data[i] = rv;
        ri.data[i + 1] = rv;
        ri.data[i + 2] = rv;
        ri.data[i + 3] = 255;
      }
    }
    cx.putImageData(ci, 0, 0);
    rx.putImageData(ri, 0, 0);
    // Cracks and patch repairs.
    cx.strokeStyle = 'rgba(10,10,12,0.7)';
    for (let k = 0; k < 14; k++) {
      cx.lineWidth = rng.float(0.6, 1.6);
      cx.beginPath();
      let x = rng.float(0, S);
      let y = rng.float(0, S);
      cx.moveTo(x, y);
      for (let s = 0; s < 8; s++) {
        x += rng.float(-18, 18);
        y += rng.float(-18, 18);
        cx.lineTo(x, y);
      }
      cx.stroke();
    }
    for (let k = 0; k < 4; k++) {
      cx.fillStyle = `rgba(${rng.int(20, 30)},${rng.int(20, 30)},${rng.int(22, 32)},0.55)`;
      cx.fillRect(rng.float(0, S), rng.float(0, S), rng.float(30, 90), rng.float(20, 60));
    }
    return { map: finish(col), roughnessMap: finish(rough, { srgb: false }) };
  });
}

// Concrete paving slabs for sidewalks.
export function concrete() {
  return cached('concrete', () => {
    const S = 512;
    const rng = new RNG(99);
    const c = canvas(S, S);
    const x = c.getContext('2d');
    const img = x.createImageData(S, S);
    const n = makeNoise(S, 32, rng);
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const i = (py * S + px) * 4;
        const v = 92 + n(px, py) * 30 + (rng.next() - 0.5) * 18;
        img.data[i] = v;
        img.data[i + 1] = v * 0.98;
        img.data[i + 2] = v * 0.95;
        img.data[i + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    x.strokeStyle = 'rgba(40,40,40,0.8)';
    x.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      x.beginPath();
      x.moveTo(0, i * 128);
      x.lineTo(S, i * 128);
      x.moveTo(i * 128, 0);
      x.lineTo(i * 128, S);
      x.stroke();
    }
    return finish(c);
  });
}

// Generic rough concrete / dirt.
export function groundTex(kind = 'dirt') {
  return cached('ground_' + kind, () => {
    const S = 256;
    const rng = new RNG(kind === 'dirt' ? 7 : 8);
    const c = canvas(S, S);
    const x = c.getContext('2d');
    const img = x.createImageData(S, S);
    const n = makeNoise(S, 32, rng);
    const n2 = makeNoise(S, 8, rng);
    const base = kind === 'dirt' ? [92, 74, 56] : kind === 'grass' ? [40, 58, 36] : kind === 'rock' ? [74, 70, 66] : [70, 70, 72];
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const i = (py * S + px) * 4;
        const f = 0.65 + n(px, py) * 0.45 + n2(px, py) * 0.2 + (rng.next() - 0.5) * 0.15;
        img.data[i] = base[0] * f;
        img.data[i + 1] = base[1] * f;
        img.data[i + 2] = base[2] * f;
        img.data[i + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    return finish(c);
  });
}

// Road marking atlas: transparent texture, white/yellow paint, used on decal meshes.
// Rows (v): 0..0.25 dashed white, 0.25..0.5 double yellow, 0.5..0.75 solid white, 0.75..1 crosswalk.
export function markings() {
  return cached('markings', () => {
    const W = 64;
    const H = 1024;
    const c = canvas(W, H);
    const x = c.getContext('2d');
    x.clearRect(0, 0, W, H);
    const paint = 'rgba(235,235,225,0.95)';
    const yellow = 'rgba(240,190,40,0.95)';
    // dashed (along v): 3 m dash / 6 m gap mapped onto 256 px tile
    x.fillStyle = paint;
    x.fillRect(24, 0, 16, 90);
    // double yellow
    x.fillStyle = yellow;
    x.fillRect(14, 256, 12, 256);
    x.fillRect(38, 256, 12, 256);
    // solid white
    x.fillStyle = paint;
    x.fillRect(24, 512, 16, 256);
    // crosswalk bars
    x.fillStyle = paint;
    for (let i = 0; i < 4; i++) x.fillRect(0, 768 + i * 64, W, 34);
    const t = finish(c);
    t.wrapS = THREE.ClampToEdgeWrapping;
    return t;
  });
}

// Corrugated container metal.
export function corrugated() {
  return cached('corrugated', () => {
    const c = canvas(256, 64);
    const x = c.getContext('2d');
    for (let i = 0; i < 256; i++) {
      const v = 150 + Math.sin(i * 0.8) * 70;
      x.fillStyle = `rgb(${v},${v},${v})`;
      x.fillRect(i, 0, 1, 64);
    }
    const rng = new RNG(4);
    for (let k = 0; k < 160; k++) {
      x.fillStyle = `rgba(60,40,30,${rng.float(0.05, 0.25)})`;
      x.fillRect(rng.float(0, 256), rng.float(0, 64), rng.float(1, 6), rng.float(1, 10));
    }
    return finish(c, { srgb: true });
  });
}

// Neon sign with fictional brand text. Emissive map, drawn once per brand.
export const BRANDS = [
  { text: 'VOLTAIRE', color: '#ff2fd1' },
  { text: 'NEO-KOBE', color: '#21e8ff' },
  { text: 'HALCYON', color: '#ffb02e' },
  { text: 'SYNTHCOLA', color: '#ff3b3b' },
  { text: 'ORBITAL', color: '#7cff4f' },
  { text: 'KAIJU RAMEN', color: '#ff6a2a' },
  { text: 'AETHER BANK', color: '#5aa2ff' },
  { text: 'NIGHTJAR', color: '#c46bff' },
  { text: 'ZEN·DATA', color: '#2affb4' },
  { text: 'MOTEL 24', color: '#ff3f6e' },
  { text: 'GRID FUEL', color: '#ffd23f' },
  { text: 'CHROMA', color: '#3fd0ff' },
];

export function neonSign(index) {
  return cached('neon_' + index, () => {
    const b = BRANDS[index % BRANDS.length];
    const c = canvas(512, 128);
    const x = c.getContext('2d');
    x.fillStyle = '#05050a';
    x.fillRect(0, 0, 512, 128);
    x.font = 'bold 76px "Arial Black", Impact, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.shadowColor = b.color;
    x.shadowBlur = 24;
    x.fillStyle = b.color;
    x.fillText(b.text, 256, 66);
    x.shadowBlur = 8;
    x.fillStyle = '#ffffff';
    x.globalAlpha = 0.65;
    x.fillText(b.text, 256, 66);
    x.globalAlpha = 1;
    x.strokeStyle = b.color;
    x.lineWidth = 5;
    x.shadowBlur = 16;
    x.strokeRect(8, 8, 496, 112);
    const t = finish(c, { repeat: false });
    return t;
  });
}

// Text label texture (police livery, plates, signs).
export function textTexture(text, { w = 512, h = 128, bg = null, color = '#fff', font = 'bold 70px Arial', stroke = null } = {}) {
  return cached(`text_${text}_${w}_${h}_${bg}_${color}_${font}`, () => {
    const c = canvas(w, h);
    const x = c.getContext('2d');
    if (bg) {
      x.fillStyle = bg;
      x.fillRect(0, 0, w, h);
    }
    x.font = font;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    if (stroke) {
      x.strokeStyle = stroke;
      x.lineWidth = 6;
      x.strokeText(text, w / 2, h / 2 + 4);
    }
    x.fillStyle = color;
    x.fillText(text, w / 2, h / 2 + 4);
    return finish(c, { repeat: false });
  });
}

// Soft radial sprite used for glows, smoke and light pools.
export function radial(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  return cached(`radial_${inner}_${outer}_${size}`, () => {
    const c = canvas(size, size);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    return finish(c, { repeat: false });
  });
}

// Puffy smoke sprite with some internal structure.
export function smokeSprite() {
  return cached('smoke', () => {
    const S = 128;
    const c = canvas(S, S);
    const x = c.getContext('2d');
    const rng = new RNG(21);
    for (let i = 0; i < 26; i++) {
      const r = rng.float(14, 40);
      const px = S / 2 + rng.float(-26, 26);
      const py = S / 2 + rng.float(-26, 26);
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, S, S);
    }
    const mask = x.createRadialGradient(S / 2, S / 2, S * 0.25, S / 2, S / 2, S / 2);
    mask.addColorStop(0, 'rgba(0,0,0,1)');
    mask.addColorStop(1, 'rgba(0,0,0,0)');
    x.globalCompositeOperation = 'destination-in';
    x.fillStyle = mask;
    x.fillRect(0, 0, S, S);
    return finish(c, { repeat: false });
  });
}
