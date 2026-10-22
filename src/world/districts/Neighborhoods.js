// V2 neighbourhoods inside the downtown grid, all generated from data:
// - Shopping District: rows of street-level shops (12 types), each with its own facade colour,
//   awning, sign and window display (one texture atlas -> one draw call for every shop front).
// - Residential Hills: houses with gardens, fences, trees, driveways and parked cars.
// - City Park: grass, a lake, paths, benches, a fountain and lots of trees.
import * as THREE from 'three';
import { CURB_H, SIDEWALK_W } from '../CityGenerator.js';
import { GeometryBatch } from '../GeometryBatch.js';

// name, sign colours, facade, awning, display painter.
export const SHOP_TYPES = [
  { id: 'cafe', name: 'BEAN THERE', kind: 'CAFE', sign: '#f4e6c8', ink: '#4a2c1a', facade: [0.36, 0.24, 0.16], awning: 0x2f6a4a, display: 'cups' },
  { id: 'restaurant', name: 'TRATTORIA LUNA', kind: 'RESTAURANT', sign: '#1c1c22', ink: '#f2c46a', facade: [0.42, 0.14, 0.12], awning: 0x8a1c1c, display: 'tables' },
  { id: 'fastfood', name: 'BOLT BURGER', kind: 'FAST FOOD', sign: '#ffcc1a', ink: '#c81e1e', facade: [0.7, 0.12, 0.1], awning: 0xffb000, display: 'menu' },
  { id: 'clothing', name: 'THREADLINE', kind: 'CLOTHING', sign: '#ffffff', ink: '#111111', facade: [0.85, 0.85, 0.83], awning: 0x111111, display: 'mannequins' },
  { id: 'electronics', name: 'CIRCUIT CITY', kind: 'ELECTRONICS', sign: '#0b1a3a', ink: '#3fd0ff', facade: [0.12, 0.16, 0.24], awning: 0x1c4aa8, display: 'screens' },
  { id: 'pharmacy', name: 'PHARMA+', kind: 'PHARMACY', sign: '#ffffff', ink: '#14a050', facade: [0.82, 0.84, 0.82], awning: 0x14a050, display: 'shelves', cross: true },
  { id: 'supermarket', name: 'FRESHMART', kind: 'SUPERMARKET', sign: '#e83a1a', ink: '#ffffff', facade: [0.78, 0.74, 0.66], awning: 0xe83a1a, display: 'produce' },
  { id: 'dealer', name: 'HALCYON MOTORS', kind: 'CAR DEALER', sign: '#101114', ink: '#d8dde4', facade: [0.2, 0.21, 0.23], awning: 0x2a2c30, display: 'car' },
  { id: 'gym', name: 'IRON PULSE', kind: 'GYM', sign: '#111111', ink: '#ff4a1a', facade: [0.16, 0.16, 0.18], awning: 0xff4a1a, display: 'weights' },
  { id: 'cinema', name: 'ROXY CINEMA', kind: 'CINEMA', sign: '#2a0a12', ink: '#ffd23f', facade: [0.36, 0.06, 0.1], awning: 0x5a0a18, display: 'posters' },
  { id: 'books', name: 'PAGE & INK', kind: 'BOOKSTORE', sign: '#1e3a2a', ink: '#f0e6c8', facade: [0.22, 0.32, 0.26], awning: 0x1e3a2a, display: 'books' },
  { id: 'bakery', name: 'CRUMB', kind: 'BAKERY', sign: '#fbe8ec', ink: '#b0405a', facade: [0.9, 0.78, 0.8], awning: 0xd0607a, display: 'cakes' },
];

const CELL = 256; // atlas cell (sign strip on top, window display below)
const COLS = 4;
let atlas = null;

function shopAtlas() {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = CELL * COLS;
  c.height = CELL * Math.ceil(SHOP_TYPES.length / COLS);
  const x = c.getContext('2d');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  SHOP_TYPES.forEach((t, i) => {
    const ox = (i % COLS) * CELL;
    const oy = Math.floor(i / COLS) * CELL;
    // Sign strip (top 64 px).
    x.fillStyle = t.sign;
    x.fillRect(ox, oy, CELL, 64);
    x.fillStyle = t.ink;
    x.font = `bold ${t.name.length > 11 ? 26 : 34}px "Arial Black", Impact, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(t.name, ox + CELL / 2 + (t.cross ? 16 : 0), oy + 34);
    if (t.cross) {
      x.fillRect(ox + 18, oy + 26, 30, 12);
      x.fillRect(ox + 27, oy + 17, 12, 30);
    }
    // Window display (y 64..256): warm interior with props drawn per type.
    const wy = oy + 64;
    const wh = CELL - 64;
    const gr = x.createLinearGradient(0, wy, 0, wy + wh);
    gr.addColorStop(0, '#fff2dc');
    gr.addColorStop(1, '#c8a880');
    x.fillStyle = gr;
    x.fillRect(ox, wy, CELL, wh);
    x.fillStyle = 'rgba(0,0,0,0.15)';
    x.fillRect(ox, wy + wh - 30, CELL, 30);
    const p = (color, rx, ry, rw, rh) => {
      x.fillStyle = color;
      x.fillRect(ox + rx, wy + ry, rw, rh);
    };
    const hue = () => `hsl(${Math.floor(rnd() * 360)},60%,${45 + Math.floor(rnd() * 20)}%)`;
    switch (t.display) {
      case 'cups': for (let k = 0; k < 6; k++) { p('#ffffff', 20 + k * 38, 120, 22, 28); p('#6a3a20', 22 + k * 38, 122, 18, 6); } p('#4a2c1a', 10, 150, 236, 10); break;
      case 'tables': for (let k = 0; k < 3; k++) { p('#ffffff', 20 + k * 80, 120, 56, 8); p('#6a3020', 44 + k * 80, 128, 8, 36); p('#e8c060', 40 + k * 80, 104, 16, 16); } break;
      case 'menu': for (let k = 0; k < 3; k++) { p('#1c1c1c', 14 + k * 80, 16, 72, 54); p('#ffcc1a', 22 + k * 80, 24, 56, 8); p('#d04020', 30 + k * 80, 40, 40, 22); } p('#c81e1e', 0, 150, 256, 12); break;
      case 'mannequins': for (let k = 0; k < 4; k++) { const c = hue(); p('#e8d8c8', 36 + k * 56, 40, 16, 16); p(c, 28 + k * 56, 58, 32, 50); p('#222', 32 + k * 56, 108, 10, 40); p('#222', 46 + k * 56, 108, 10, 40); } break;
      case 'screens': for (let k = 0; k < 6; k++) { p('#111', 12 + (k % 3) * 80, 20 + Math.floor(k / 3) * 70, 72, 50); p(hue(), 16 + (k % 3) * 80, 24 + Math.floor(k / 3) * 70, 64, 42); } break;
      case 'shelves': for (let r = 0; r < 4; r++) { p('#ffffff', 10, 30 + r * 36, 236, 4); for (let k = 0; k < 14; k++) p(hue(), 14 + k * 16, 14 + r * 36, 12, 16); } break;
      case 'produce': for (let r = 0; r < 3; r++) for (let k = 0; k < 9; k++) { x.fillStyle = ['#e83a1a', '#f0a020', '#60b030', '#f0d040'][(r + k) % 4]; x.beginPath(); x.arc(ox + 20 + k * 27, wy + 50 + r * 40, 11, 0, 7); x.fill(); } break;
      case 'car': p('#e8ecf0', 0, 0, 256, wh); x.fillStyle = '#c81e1e'; x.beginPath(); x.moveTo(ox + 30, wy + 140); x.lineTo(ox + 70, wy + 100); x.lineTo(ox + 180, wy + 96); x.lineTo(ox + 230, wy + 130); x.lineTo(ox + 230, wy + 150); x.lineTo(ox + 30, wy + 150); x.fill(); p('#111', 60, 140, 34, 34); p('#111', 170, 140, 34, 34); p('#3a5a7a', 86, 104, 80, 22); break;
      case 'weights': for (let k = 0; k < 4; k++) { p('#222', 20 + k * 60, 120, 44, 8); p('#111', 16 + k * 60, 108, 10, 32); p('#111', 58 + k * 60, 108, 10, 32); } p('#ff4a1a', 0, 20, 256, 10); break;
      case 'posters': for (let k = 0; k < 3; k++) { p('#111', 16 + k * 80, 14, 64, 100); p(hue(), 20 + k * 80, 18, 56, 70); p('#ffd23f', 20 + k * 80, 94, 56, 12); } break;
      case 'books': for (let r = 0; r < 4; r++) for (let k = 0; k < 20; k++) p(hue(), 8 + k * 12, 12 + r * 40, 10, 32 - (k % 3) * 4); break;
      case 'cakes': for (let k = 0; k < 5; k++) { p('#ffffff', 14 + k * 48, 130, 40, 6); p(['#f0c0d0', '#f8e0a0', '#a06040'][k % 3], 18 + k * 48, 100, 32, 30); p('#d04060', 30 + k * 48, 94, 8, 8); } break;
      default: break;
    }
    // Glass reflection streak.
    const rg = x.createLinearGradient(ox, wy, ox + CELL, wy + wh);
    rg.addColorStop(0.3, 'rgba(255,255,255,0)');
    rg.addColorStop(0.45, 'rgba(255,255,255,0.22)');
    rg.addColorStop(0.55, 'rgba(255,255,255,0)');
    x.fillStyle = rg;
    x.fillRect(ox, wy, CELL, wh);
  });
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}

function cellUV(i, part) {
  const W = CELL * COLS;
  const H = CELL * Math.ceil(SHOP_TYPES.length / COLS);
  const u0 = ((i % COLS) * CELL) / W;
  const u1 = u0 + CELL / W;
  const top = 1 - (Math.floor(i / COLS) * CELL) / H;
  if (part === 'sign') return [u0, top - 64 / H, u1, top];
  return [u0, top - CELL / H, u1, top - 64 / H];
}

// One batch for all shop fronts (signs + windows), built in finalize.
function frontBatch(gen) {
  if (!gen.shopFronts) gen.shopFronts = new GeometryBatch();
  return gen.shopFronts;
}

export function finishNeighborhoods(gen) {
  if (!gen.shopFronts || gen.shopFronts.empty) return;
  const t = shopAtlas();
  const mat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.55, roughness: 0.25, metalness: 0.1 });
  const m = gen.addStatic(new THREE.Mesh(gen.shopFronts.toGeometry(), mat), false, { shadows: false });
  m.receiveShadow = true;
  m.name = 'shopFronts';
  m.userData.decal = true;
}

// Quad on a facade: centre (x, y, z), facing normal (nx, nz), width w, height h, uv rect.
function facadeQuad(b, x, y, z, nx, nz, w, h, uv) {
  const rx = nz;
  const rz = -nx;
  const P = (u, v) => new THREE.Vector3(x + rx * u, y + v, z + rz * u);
  b.quad(P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, h / 2), P(-w / 2, h / 2), [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]], new THREE.Vector3(nx, 0, nz));
}

// ---- Shopping District -------------------------------------------------------------------
// A lot ringed by shops on every street side, a service yard in the middle.
export function shoppingLot(gen, lot) {
  const rng = gen.rng;
  const { x0, z0, x1, z1 } = lot;
  const inset = SIDEWALK_W;
  const depth = 16;
  const sides = [
    { nx: 0, nz: -1, ax: x0 + inset, bx: x1 - inset, fixed: z0 + inset }, // north face
    { nx: 0, nz: 1, ax: x0 + inset, bx: x1 - inset, fixed: z1 - inset },
    { nx: -1, nz: 0, ax: z0 + inset + depth, bx: z1 - inset - depth, fixed: x0 + inset },
    { nx: 1, nz: 0, ax: z0 + inset + depth, bx: z1 - inset - depth, fixed: x1 - inset },
  ];
  const fb = frontBatch(gen);
  for (const s of sides) {
    let a = s.ax;
    while (a < s.bx - 8) {
      const type = rng.int(0, SHOP_TYPES.length - 1);
      const t = SHOP_TYPES[type];
      const w = Math.min(s.bx - a, t.id === 'supermarket' || t.id === 'dealer' || t.id === 'cinema' ? rng.float(18, 24) : rng.float(9, 14));
      if (w < 8) break;
      const mid = a + w / 2;
      // Footprint (x/z extents) of this shop's building.
      const horiz = s.nz !== 0;
      const cx = horiz ? mid : s.fixed - s.nx * depth / 2;
      const cz = horiz ? s.fixed - s.nz * depth / 2 : mid;
      const sx = horiz ? w - 0.4 : depth;
      const sz = horiz ? depth : w - 0.4;
      const floors = t.id === 'dealer' || t.id === 'supermarket' ? 1 : rng.int(2, 4);
      const h = floors === 1 ? 6.2 : 4.6 + (floors - 1) * 3.4;
      const tint = rng.float(0.85, 1.1);
      const b = gen.chunk(cx, cz).buildings;
      b.setColor(t.facade[0] * tint, t.facade[1] * tint, t.facade[2] * tint);
      b.setFacade(rng.float(0, 100), floors === 1 ? 0 : 3, 3.4, rng.float(0.3, 0.7));
      b.box(cx, CURB_H + h / 2, cz, sx, h, sz, 0, { baseY: CURB_H });
      gen.physics.fixedBox(cx, CURB_H + h / 2, cz, sx / 2, h / 2, sz / 2, { kind: 'building' });
      gen.buildings.push({ x: cx, z: cz, hx: sx / 2, hz: sz / 2, y0: CURB_H, h });
      // Parapet.
      b.setFacade(0, 0, 3.4, 0);
      b.setColor(t.facade[0] * 0.6, t.facade[1] * 0.6, t.facade[2] * 0.6);
      b.box(cx, CURB_H + h + 0.4, cz, sx, 0.8, sz, 0);
      // Front: window display, sign band and awning on the street face.
      const fx = horiz ? mid : s.fixed + s.nx * 0.06;
      const fz = horiz ? s.fixed + s.nz * 0.06 : mid;
      const ww = w - 2.2;
      facadeQuad(fb, fx, CURB_H + 1.9, fz, s.nx, s.nz, ww, 3.0, cellUV(type, 'display'));
      // Sign band above.
      facadeQuad(fb, fx, CURB_H + 4.45, fz, s.nx, s.nz, ww, 1.1, cellUV(type, 'sign'));
      const aw = gen.batch(cx, cz, 'paint', { color: true });
      aw.setColor(...new THREE.Color(t.awning).toArray());
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(horiz ? 1 : 0, 0, horiz ? 0 : 1), (horiz ? s.nz : -s.nx) * 0.35);
      aw.orientedBox(new THREE.Vector3(fx + s.nx * 1.0, CURB_H + 3.55, fz + s.nz * 1.0), q, horiz ? ww : 2.2, 0.08, horiz ? 2.2 : ww);
      // Sidewalk display: bins, bike racks, planters, menu boards, kiosks.
      const px = fx + s.nx * 3.3;
      const pz = fz + s.nz * 3.3;
      const rot = Math.atan2(s.nx, s.nz);
      const r = rng.next();
      if (r < 0.25) gen.props.add('planter', px, CURB_H, pz, rot);
      else if (r < 0.4) gen.props.add('bikeRack', px, CURB_H, pz, rot);
      else if (r < 0.5) gen.props.add('bike', px, CURB_H, pz, rot + Math.PI / 2 + rng.float(-0.2, 0.2));
      else if (r < 0.58) gen.props.add('kiosk', px, CURB_H, pz, rot);
      // AC units on the roof edge.
      if (rng.chance(0.7)) gen.props.add('acUnit', cx + rng.float(-sx * 0.3, sx * 0.3), CURB_H + h + 0.8, cz + rng.float(-sz * 0.3, sz * 0.3), rng.float(0, 6.3));
      gen.shops = gen.shops || [];
      gen.shops.push({ type: t.id, x: fx + s.nx * 2.5, z: fz + s.nz * 2.5, nx: s.nx, nz: s.nz, w });
      a += w;
    }
  }
  // Back yard: delivery parking.
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  gen.batch(cx, cz, 'concrete').flatRect(cx, CURB_H + 0.01, cz, x1 - x0 - (inset + depth) * 2, z1 - z0 - (inset + depth) * 2, 0, 0.25);
}

// ---- Residential Hills -------------------------------------------------------------------
const HOUSE_COLORS = [[0.86, 0.82, 0.72], [0.72, 0.8, 0.86], [0.9, 0.86, 0.8], [0.78, 0.66, 0.56], [0.66, 0.74, 0.66], [0.94, 0.92, 0.88], [0.82, 0.7, 0.62]];
const ROOF_COLORS = [[0.3, 0.14, 0.12], [0.22, 0.22, 0.25], [0.36, 0.28, 0.22], [0.18, 0.22, 0.3]];
const CAR_COLORS = [0xb03030, 0x2a4a8a, 0xd0d0d0, 0x1a1a1a, 0x707880, 0x3a6a4a, 0xe0e0e0];

export function residentialLot(gen, lot) {
  const rng = gen.rng;
  const { x0, z0, x1, z1 } = lot;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  // Whole lot is lawn inside the sidewalk ring.
  gen.batch(cx, cz, 'grass').flatRect(cx, CURB_H + 0.015, cz, x1 - x0 - SIDEWALK_W * 2, z1 - z0 - SIDEWALK_W * 2, 0, 6);
  const plot = 18;
  const sides = [
    { nx: 0, nz: -1, a0: x0 + 10, a1: x1 - 10, edge: z0 + SIDEWALK_W },
    { nx: 0, nz: 1, a0: x0 + 10, a1: x1 - 10, edge: z1 - SIDEWALK_W },
    { nx: -1, nz: 0, a0: z0 + 30, a1: z1 - 30, edge: x0 + SIDEWALK_W },
    { nx: 1, nz: 0, a0: z0 + 30, a1: z1 - 30, edge: x1 - SIDEWALK_W },
  ];
  for (const s of sides) {
    const horiz = s.nz !== 0;
    for (let a = s.a0; a + plot <= s.a1 + 0.1; a += plot) {
      const mid = a + plot / 2;
      const setback = 8;
      const w = rng.float(8, 11);
      const d = rng.float(8, 10);
      const h = rng.chance(0.4) ? 6.6 : 3.6;
      const hx = horiz ? mid - 2 : s.edge - s.nx * (setback + d / 2);
      const hz = horiz ? s.edge - s.nz * (setback + d / 2) : mid - 2;
      const sx = horiz ? w : d;
      const sz = horiz ? d : w;
      const b = gen.chunk(hx, hz).buildings;
      const c = rng.pick(HOUSE_COLORS);
      b.setColor(...c);
      b.setFacade(rng.float(0, 100), 3, 3.3, 0.4);
      b.box(hx, CURB_H + h / 2, hz, sx, h, sz, 0, { baseY: CURB_H });
      // Gable roof: two sloped slabs.
      const rc = rng.pick(ROOF_COLORS);
      const roof = gen.batch(hx, hz, 'paint', { color: true });
      roof.setColor(...rc);
      const span = (horiz ? sz : sx) / 2 + 0.5;
      const pitch = 0.55;
      for (const sg of [-1, 1]) {
        const ax = horiz ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
        const q = new THREE.Quaternion().setFromAxisAngle(ax, sg * pitch * (horiz ? 1 : -1));
        const off = (span / 2) * Math.cos(pitch);
        const center = new THREE.Vector3(hx + (horiz ? 0 : sg * off), CURB_H + h + (span / 2) * Math.sin(pitch), hz + (horiz ? sg * off : 0));
        roof.orientedBox(center, q, horiz ? sx + 0.8 : span, 0.18, horiz ? span : sz + 0.8);
      }
      gen.physics.fixedBox(hx, CURB_H + (h + 2) / 2, hz, sx / 2, (h + 2) / 2, sz / 2, { kind: 'building' });
      gen.buildings.push({ x: hx, z: hz, hx: sx / 2, hz: sz / 2, y0: CURB_H, h });
      // Driveway + parked car beside the house.
      const dx = horiz ? mid + plot / 2 - 3 : s.edge - s.nx * (setback / 2 + 1);
      const dz = horiz ? s.edge - s.nz * (setback / 2 + 1) : mid + plot / 2 - 3;
      gen.batch(dx, dz, 'concrete').flatRect(dx, CURB_H + 0.03, dz, horiz ? 3.4 : setback + 2, horiz ? setback + 2 : 3.4, 0, 0.25);
      if (rng.chance(0.6)) gen.props.add('parkedCar', dx, CURB_H, dz, horiz ? 0 : Math.PI / 2, { color: rng.pick(CAR_COLORS) });
      // Front fence with a gap at the path, a tree and a mailbox.
      for (let f = a + 1.5; f < a + plot - 5; f += 3) {
        const fx = horiz ? f : s.edge - s.nx * 0.8;
        const fz = horiz ? s.edge - s.nz * 0.8 : f;
        if (Math.abs(f - (mid - 2)) < 1.6) continue;
        gen.props.add('fence', fx, CURB_H, fz, horiz ? 0 : Math.PI / 2, { color: 0xf2f2ee });
      }
      const tx = horiz ? a + 2.5 : s.edge - s.nx * 4;
      const tz = horiz ? s.edge - s.nz * 4 : a + 2.5;
      gen.props.add(rng.chance(0.3) ? 'pine' : 'tree', tx, CURB_H, tz, rng.float(0, 6.3));
      gen.props.add('mailbox', horiz ? mid - 4 : s.edge - s.nx * 1.2, CURB_H, horiz ? s.edge - s.nz * 1.2 : mid - 4, 0);
    }
  }
  // Back gardens: trees.
  for (let k = 0; k < 10; k++) gen.props.add('tree', rng.float(cx - 20, cx + 20), CURB_H, rng.float(cz - 20, cz + 20), rng.float(0, 6.3));
}

// ---- City Park ---------------------------------------------------------------------------
export function cityParkLot(gen, lot, { lake = false, fountain = false } = {}) {
  const rng = gen.rng;
  const { x0, z0, x1, z1 } = lot;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const W = x1 - x0 - SIDEWALK_W * 2;
  const D = z1 - z0 - SIDEWALK_W * 2;
  gen.batch(cx, cz, 'grass').flatRect(cx, CURB_H + 0.015, cz, W, D, 0, 6);
  // Cross paths.
  const path = gen.batch(cx, cz, 'concrete');
  path.flatRect(cx, CURB_H + 0.03, cz, 5, D, 0, 0.25);
  path.flatRect(cx, CURB_H + 0.03, cz, W, 5, 0, 0.25);
  const avoid = [];
  if (lake) {
    // Lake: water disc with a stone rim (the rim is low and solid).
    const lx = cx + W * 0.22;
    const lz = cz - D * 0.22;
    const r = Math.min(W, D) * 0.22;
    const water = new THREE.Mesh(new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2), gen.water ? gen.water.material : new THREE.MeshStandardMaterial({ color: 0x1a4a5a, roughness: 0.05, metalness: 0.4 }));
    water.position.set(lx, CURB_H + 0.05, lz);
    gen.addStatic(water, false, { shadows: false });
    water.receiveShadow = true;
    water.userData.decal = true;
    const seg = 28;
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      gen.solidBox('concrete', lx + Math.cos(a) * (r + 0.4), CURB_H + 0.25, lz + Math.sin(a) * (r + 0.4), 0.8, 0.5, (2 * Math.PI * r) / seg + 0.3, -a, { kind: 'building' });
    }
    avoid.push([lx, lz, r + 4]);
    for (let k = 0; k < 6; k++) {
      const a = k + 0.4;
      gen.props.add('bench', lx + Math.cos(a) * (r + 3), CURB_H, lz + Math.sin(a) * (r + 3), -a - Math.PI / 2);
    }
  }
  if (fountain) {
    const b = gen.batch(cx, cz, 'concrete');
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2;
      b.box(cx + Math.cos(a) * 6, CURB_H + 0.35, cz + Math.sin(a) * 6, 2.0, 0.7, 0.5, -a + Math.PI / 2);
    }
    gen.physics.fixedBox(cx, CURB_H + 0.35, cz, 6.2, 0.35, 6.2, { kind: 'building', round: 0.3 });
    gen.fountains.push(new THREE.Vector3(cx, CURB_H + 0.6, cz));
    avoid.push([cx, cz, 10]);
  }
  const free = (x, z) => Math.abs(x - cx) > 4 && Math.abs(z - cz) > 4 && avoid.every(([ax, az, r]) => Math.hypot(x - ax, z - az) > r);
  for (let k = 0; k < 46; k++) {
    const x = rng.float(x0 + 9, x1 - 9);
    const z = rng.float(z0 + 9, z1 - 9);
    if (free(x, z)) gen.props.add(rng.chance(0.25) ? 'pine' : 'tree', x, CURB_H, z, rng.float(0, 6.3));
  }
  // Benches and lamps along the paths.
  for (let t = -D / 2 + 12; t < D / 2 - 8; t += 16) {
    gen.props.add('bench', cx + 4, CURB_H, cz + t, -Math.PI / 2);
    gen.props.add('lamp', cx - 3.2, CURB_H, cz + t + 8, Math.PI / 2, { groundY: CURB_H });
  }
  for (let t = -W / 2 + 12; t < W / 2 - 8; t += 16) {
    gen.props.add('bench', cx + t, CURB_H, cz + 4, Math.PI);
    gen.props.add('bin', cx + t + 3, CURB_H, cz - 3.4, 0);
  }
  gen.parks = gen.parks || [];
  gen.parks.push({ x: cx, z: cz, w: W, d: D });
}
