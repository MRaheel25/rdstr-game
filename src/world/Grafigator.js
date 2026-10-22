// GRAFIGATOR brand assets built in 3D: the icon mark (parsed from reference/grafigator-logo.svg
// with SVGLoader and extruded) and a bold geometric wordmark built from extruded block glyphs.
// Used by the Design Studio landmark, city billboards and the showroom wall sign.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BRAND = { lime: 0xe7f75b, teal: 0x54dc9d };

let shapes = null; // THREE.Shape[] normalised to a 1 x 1 box, y up

// Load and parse the logo once (called during start-up).
export async function loadGrafigator(url = 'reference/grafigator-logo.svg') {
  try {
    const text = await (await fetch(url)).text();
    parseLogo(text);
  } catch (e) {
    console.warn('Grafigator logo could not be loaded', e);
    shapes = [];
  }
}

function parseLogo(text) {
  const data = new SVGLoader().parse(text);
  const all = [];
  for (const p of data.paths) all.push(...p.toShapes(true));
  // Normalise: viewBox units -> 0..1, flip y (SVG is y-down).
  const box = new THREE.Box2();
  for (const s of all) for (const v of s.getPoints(8)) box.expandByPoint(v);
  const size = Math.max(box.max.x - box.min.x, box.max.y - box.min.y);
  const map = (v) => new THREE.Vector2((v.x - box.min.x) / size - 0.5, 0.5 - (v.y - box.min.y) / size);
  shapes = all.map((s) => {
    const out = new THREE.Shape(s.getPoints(24).map(map).reverse());
    for (const h of s.holes) out.holes.push(new THREE.Path(h.getPoints(24).map(map).reverse()));
    return out;
  });
}

const geoCache = new Map();

// Extruded icon mark, `size` metres across, centred, facing +z.
export function logoGeometry(size = 1, depth = 0.1) {
  const key = `${size}|${depth}`;
  if (geoCache.has(key)) return geoCache.get(key);
  if (!shapes || !shapes.length) return new THREE.BoxGeometry(size, size, depth);
  const g = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelThickness: depth * 0.12, bevelSize: size * 0.006, bevelSegments: 1, curveSegments: 16 });
  g.scale(size, size, 1);
  g.computeVertexNormals();
  geoCache.set(key, g);
  return g;
}

// Block glyphs on a 4 x 5 grid (stroke 1). Rects [x, y, w, h] or polygons {p: [[x, y], ...]}.
const GLYPHS = {
  G: { w: 4, parts: [[0, 0, 1, 5], [0, 4, 4, 1], [0, 0, 4, 1], [3, 0, 1, 2.4], [2, 1.6, 2, 0.8]] },
  R: { w: 4, parts: [[0, 0, 1, 5], [0, 4, 4, 1], [3, 2.1, 1, 2.9], [0, 2.1, 4, 0.9], { p: [[1.7, 2.1], [2.9, 2.1], [4, 0], [2.8, 0]] }] },
  A: { w: 4, parts: [[0, 0, 1, 4.2], [3, 0, 1, 4.2], { p: [[0, 4.2], [1, 4.2], [1.4, 4], [2.6, 4], [3, 4.2], [4, 4.2], [3.2, 5], [0.8, 5]] }, [0, 1.8, 4, 0.9]] },
  F: { w: 3.6, parts: [[0, 0, 1, 5], [0, 4, 3.6, 1], [0, 2.1, 3, 0.9]] },
  I: { w: 1, parts: [[0, 0, 1, 5]] },
  T: { w: 4, parts: [[0, 4, 4, 1], [1.5, 0, 1, 4]] },
  O: { w: 4, parts: [[0, 0, 1, 5], [3, 0, 1, 5], [0, 4, 4, 1], [0, 0, 4, 1]] },
  D: { w: 4, parts: [[0, 0, 1, 5], [0, 4, 3, 1], [0, 0, 3, 1], [3, 0.7, 1, 3.6], { p: [[3, 4], [3, 5], [4, 4.3], [4, 4.3]] }, { p: [[3, 0], [4, 0.7], [3, 1]] }] },
  E: { w: 3.6, parts: [[0, 0, 1, 5], [0, 4, 3.6, 1], [0, 2.1, 3, 0.9], [0, 0, 3.6, 1]] },
  S: { w: 4, parts: [[0, 4, 4, 1], [0, 2.1, 1, 2.9], [0, 2.1, 4, 0.9], [3, 0, 1, 3], [0, 0, 4, 1]] },
  N: { w: 4, parts: [[0, 0, 1, 5], [3, 0, 1, 5], { p: [[1, 5], [1, 3.4], [3, 0], [3, 1.6]] }] },
  U: { w: 4, parts: [[0, 0, 1, 5], [3, 0, 1, 5], [0, 0, 4, 1]] },
  ' ': { w: 2, parts: [] },
};

// Bold 3D wordmark: `height` metres tall, centred on x, baseline at y = 0, facing +z.
export function wordGeometry(text, height = 1, depth = 0.1) {
  const key = `w|${text}|${height}|${depth}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const u = height / 5;
  const gap = 0.8;
  let x = 0;
  const parts = [];
  for (const ch of text.toUpperCase()) {
    const gl = GLYPHS[ch] || GLYPHS[' '];
    for (const part of gl.parts) {
      const pts = Array.isArray(part)
        ? [[part[0], part[1]], [part[0] + part[2], part[1]], [part[0] + part[2], part[1] + part[3]], [part[0], part[1] + part[3]]]
        : part.p;
      const shape = new THREE.Shape(pts.map(([px, py]) => new THREE.Vector2((px + x) * u, py * u)));
      parts.push(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }));
    }
    x += gl.w + gap;
  }
  const width = (x - gap) * u;
  const g = parts.length ? mergeGeometries(parts) : new THREE.BufferGeometry();
  g.translate(-width / 2, 0, 0);
  g.computeVertexNormals();
  g.userData.width = width;
  geoCache.set(key, g);
  return g;
}

// A complete illuminated sign: mark on the left, GRAFIGATOR wordmark (and an optional
// sub-line) to its right, a dark backing plate with lime / teal edge light. Width ~ 5.6 * h.
export function makeSign({ height = 1, sub = 'DESIGN STUDIO', backing = true, glow = 1 } = {}) {
  const g = new THREE.Group();
  g.name = 'grafigator_sign';
  const face = new THREE.MeshStandardMaterial({ color: 0xf4f6f0, roughness: 0.35, metalness: 0.1, emissive: new THREE.Color(0xf2f7e6), emissiveIntensity: 0.25 * glow });
  const lime = new THREE.MeshStandardMaterial({ color: BRAND.lime, roughness: 0.4, emissive: new THREE.Color(BRAND.lime), emissiveIntensity: 0.9 * glow });
  const teal = new THREE.MeshBasicMaterial({ color: new THREE.Color(BRAND.teal).multiplyScalar(1 + 1.6 * glow) });
  const markSize = height * 1.15;
  const mark = new THREE.Mesh(logoGeometry(markSize, height * 0.16), lime);
  mark.castShadow = true;
  const word = new THREE.Mesh(wordGeometry('GRAFIGATOR', height * 0.55, height * 0.12), face);
  word.castShadow = true;
  const ww = word.geometry.userData.width;
  const total = markSize + height * 0.35 + ww;
  mark.position.set(-total / 2 + markSize / 2, 0, 0);
  word.position.set(-total / 2 + markSize + height * 0.35 + ww / 2, sub ? height * 0.02 : -height * 0.27, 0);
  g.add(mark, word);
  if (sub) {
    const s = new THREE.Mesh(wordGeometry(sub, height * 0.2, height * 0.06), teal);
    s.position.set(word.position.x - ww / 2 + s.geometry.userData.width / 2, -height * 0.42, 0);
    g.add(s);
  }
  if (backing) {
    const bw = total + height * 0.8;
    const bh = height * 1.7;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, height * 0.1), new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.5, metalness: 0.6 }));
    plate.position.z = -height * 0.08;
    plate.receiveShadow = true;
    g.add(plate);
    // Backlight halo behind the letters (soft glow at night).
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(bw * 0.96, bh * 0.9), new THREE.MeshBasicMaterial({ map: haloTexture(), color: new THREE.Color(BRAND.teal).multiplyScalar(0.55 * glow), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.z = -height * 0.02;
    g.add(halo);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(bw, height * 0.05, height * 0.14), teal);
    edge.position.set(0, -bh / 2, 0);
    const edge2 = new THREE.Mesh(new THREE.BoxGeometry(bw, height * 0.05, height * 0.14), new THREE.MeshBasicMaterial({ color: new THREE.Color(BRAND.lime).multiplyScalar(1 + glow) }));
    edge2.position.set(0, bh / 2, 0);
    g.add(edge, edge2);
  }
  g.userData.width = total;
  g.userData.mats = { face, lime, teal };
  return g;
}

let halo = null;
function haloTexture() {
  if (halo) return halo;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 32, 4, 64, 32, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.25)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 64);
  halo = new THREE.CanvasTexture(c);
  halo.colorSpace = THREE.SRGBColorSpace;
  return halo;
}

// 2D canvas version of the logo (billboards, door decals, minimap icon).
export function drawLogo2D(ctx, x, y, size, color = '#e7f75b') {
  if (!shapes) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, -size);
  ctx.fillStyle = color;
  for (const s of shapes) {
    ctx.beginPath();
    const pts = s.getPoints(24);
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
