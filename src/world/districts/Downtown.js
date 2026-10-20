// Downtown Core: dense glass towers on a tight grid, neon, street furniture, traffic
// signals, a plaza, a park, surface parking, a multi-storey parking garage (hiding spot,
// rooftop jump) and the elevated train line.
import * as THREE from 'three';
import { GRID_XS, GRID_ZS, TRAIN_Z } from '../Layout.js';
import { ROAD_W, SIDEWALK_W, CURB_H } from '../CityGenerator.js';

const SPECIAL = {
  '3_4': 'plaza',
  '5_2': 'garage',
  '1_5': 'park',
  '6_6': 'parking',
  '2_1': 'parking',
  '0_3': 'park',
};

export function buildDowntown(gen) {
  const rng = gen.rng;
  gen.buildGrid(GRID_XS, GRID_ZS, (cx, cz, i, j) => {
    const sp = SPECIAL[`${i}_${j}`];
    if (sp) return { kind: sp, i, j };
    const d = Math.max(Math.abs(cx), Math.abs(cz));
    if (d < 200) return { kind: 'downtown', height: [45, 110], tallChance: 0.4, neon: 0.85, lit: rng.float(0.3, 0.6) };
    if (d < 330) return { kind: 'downtown', height: [26, 70], tallChance: 0.15, neon: 0.7 };
    return { kind: 'downtown', height: [14, 38], tallChance: 0.05, neon: 0.5, style: rng.chance(0.6) ? 3 : undefined };
  });
  for (const lot of gen.lots) {
    furnishLot(gen, lot);
    if (lot.info.kind === 'plaza') plaza(gen, lot);
    if (lot.info.kind === 'park') park(gen, lot);
    if (lot.info.kind === 'parking') parkingLot(gen, lot);
    if (lot.info.kind === 'garage') garage(gen, lot);
  }
  signals(gen);
  elevatedTrain(gen);
  // Steam vents on manholes in the roads.
  for (let k = 0; k < 26; k++) {
    const vertical = rng.chance(0.5);
    const line = rng.pick(vertical ? GRID_XS : GRID_ZS);
    const along = rng.float(-470, 470);
    const lane = rng.pick([-5.3, -1.8, 1.8, 5.3]);
    const x = vertical ? line + lane : along;
    const z = vertical ? along : line + lane;
    if (nearGrid(along, 14)) continue;
    gen.props.add('vent', x, 0.02, z, 0);
    gen.steamSpots.push(new THREE.Vector3(x, 0.1, z));
  }
}

function nearGrid(v, d) {
  return GRID_XS.some((g) => Math.abs(g - v) < d);
}

// Lamps along the curb, trees, benches, bins, hydrants, news boxes, bus stops.
function furnishLot(gen, lot) {
  const rng = gen.rng;
  const { x0, z0, x1, z1, info } = lot;
  const P = gen.props;
  const y = CURB_H;
  const inset = 0.7;
  const sides = [
    { ax: x0, az: z0 + inset, bx: x1, bz: z0 + inset, rot: Math.PI, nx: 0, nz: -1 }, // north edge, road to north
    { ax: x0, az: z1 - inset, bx: x1, bz: z1 - inset, rot: 0, nx: 0, nz: 1 },
    { ax: x0 + inset, az: z0, bx: x0 + inset, bz: z1, rot: -Math.PI / 2, nx: -1, nz: 0 },
    { ax: x1 - inset, az: z0, bx: x1 - inset, bz: z1, rot: Math.PI / 2, nx: 1, nz: 0 },
  ];
  const leafy = info.kind === 'park' || info.kind === 'plaza' || (info.style === 3);
  sides.forEach((s, si) => {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    const dx = (s.bx - s.ax) / len;
    const dz = (s.bz - s.az) / len;
    const pos = (t, off = 0) => [s.ax + dx * t - s.nx * off, s.az + dz * t - s.nz * off];
    // Lamps every ~32 m, staggered per side.
    for (let t = 10 + (si % 2) * 14; t < len - 6; t += 32) {
      const [x, z] = pos(t);
      P.add('lamp', x, y, z, s.rot, { groundY: 0.02 });
    }
    // Street trees between lamps on leafy blocks.
    if (leafy || rng.chance(0.35)) {
      for (let t = 22 + (si % 2) * 14; t < len - 8; t += 32) {
        const [x, z] = pos(t, 1.0);
        P.add('tree', x, y, z, rng.float(0, 6.28));
      }
    }
    // Small furniture.
    const items = ['bin', 'bench', 'hydrant', 'newsBox', 'bin'];
    for (let k = 0; k < 3; k++) {
      const t = rng.float(6, len - 6);
      const type = rng.pick(items);
      const [x, z] = pos(t, type === 'bench' ? 2.2 : 0.4);
      P.add(type, x, y, z, s.rot + (type === 'bench' ? Math.PI : 0));
    }
    // Bus stop on some sides.
    if (rng.chance(0.18) && info.kind === 'downtown') {
      const [x, z] = pos(len / 2, 2.0);
      P.add('busStop', x, y, z, s.rot + Math.PI);
    }
  });
  // Corner hydrants.
  P.add('hydrant', x0 + 2.0, y, z0 + 2.0, 0);
  P.add('hydrant', x1 - 2.0, y, z1 - 2.0, 0);
}

// Traffic signals: one per lot corner, controlling alternate axes.
function signals(gen) {
  const hw = ROAD_W / 2;
  for (let i = 0; i < GRID_XS.length; i++) {
    for (let j = 0; j < GRID_ZS.length; j++) {
      const x = GRID_XS[i];
      const z = GRID_ZS[j];
      const id = i * 31 + j * 17;
      const corners = [
        [x + hw + 1.2, z + hw + 1.2, Math.PI, 'ns'], // SE corner, arm over the NS street (pointing -x... arm along -z)
        [x - hw - 1.2, z - hw - 1.2, 0, 'ns'],
        [x - hw - 1.2, z + hw + 1.2, Math.PI / 2, 'ew'],
        [x + hw + 1.2, z - hw - 1.2, -Math.PI / 2, 'ew'],
      ];
      for (const [cx, cz, rot, axis] of corners) {
        // Skip corners that face open ground at the grid boundary.
        if (Math.abs(cx) > 500 || Math.abs(cz) > 500) continue;
        // Arm reaches over the approaching lanes: rotate so local +z points across the road.
        const armRot = axis === 'ns' ? (cx > x ? -Math.PI / 2 : Math.PI / 2) : (cz > z ? Math.PI : 0);
        gen.props.add('signal', cx, CURB_H, cz, armRot, { axis, intersection: id, x, z });
      }
    }
  }
}

function plaza(gen, lot) {
  const { x0, z0, x1, z1 } = lot;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const P = gen.props;
  // Fountain basin (solid) with a lit water surface.
  const b = gen.batch(cx, cz, 'concrete');
  const seg = 24;
  for (let k = 0; k < seg; k++) {
    const a = (k / seg) * Math.PI * 2;
    const x = cx + Math.cos(a) * 9;
    const z = cz + Math.sin(a) * 9;
    b.box(x, CURB_H + 0.35, z, 2.5, 0.7, 0.6, -a + Math.PI / 2);
  }
  gen.physics.fixedBox(cx, CURB_H + 0.35, cz, 9.2, 0.35, 9.2, { kind: 'building', round: 0.3 });
  gen.batch(cx, cz, 'lights').flatRect(cx, CURB_H + 0.5, cz, 16, 16, 0, 16);
  gen.fountains.push(new THREE.Vector3(cx, CURB_H + 0.6, cz));
  // Trees, benches and food stalls around.
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    P.add('tree', cx + Math.cos(a) * 24, CURB_H, cz + Math.sin(a) * 24, a);
    P.add('bench', cx + Math.cos(a + 0.3) * 16, CURB_H, cz + Math.sin(a + 0.3) * 16, -a - 0.3 - Math.PI / 2);
  }
  P.add('stall', cx - 30, CURB_H, cz + 32, 0);
  P.add('stall', cx - 24, CURB_H, cz + 32, 0);
  P.add('stall', cx + 30, CURB_H, cz - 32, Math.PI);
  for (let k = 0; k < 6; k++) P.add('lamp', cx + Math.cos(k) * 33, CURB_H, cz + Math.sin(k) * 33, k + Math.PI, { groundY: CURB_H });
  // Hidden Air Station behind the stalls.
  gen.airStations.push(new THREE.Vector3(cx - 36, CURB_H, cz + 38));
}

function park(gen, lot) {
  const { x0, z0, x1, z1 } = lot;
  const rng = gen.rng;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  gen.batch(cx, cz, 'grass').flatRect(cx, CURB_H + 0.02, cz, x1 - x0 - 10, z1 - z0 - 10, 0, 6);
  for (let k = 0; k < 26; k++) {
    gen.props.add('tree', rng.float(x0 + 8, x1 - 8), CURB_H, rng.float(z0 + 8, z1 - 8), rng.float(0, 6.3));
  }
  for (let k = 0; k < 8; k++) gen.props.add('bench', rng.float(x0 + 10, x1 - 10), CURB_H, rng.float(z0 + 10, z1 - 10), rng.float(0, 6.3));
  // Low fence along two sides.
  for (let x = x0 + 6; x < x1 - 6; x += 3) gen.props.add('fence', x, CURB_H, z0 + 5, 0);
}

function parkingLot(gen, lot) {
  const { x0, z0, x1, z1 } = lot;
  const rng = gen.rng;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  gen.batch(cx, cz, 'road').flatRect(cx, CURB_H + 0.01, cz, x1 - x0 - 8, z1 - z0 - 8, 0, 8);
  const mk = gen.markings;
  mk.setColor(0.8, 0.8, 0.78);
  const colors = [0xb03030, 0x2a4a8a, 0xd0d0d0, 0x1a1a1a, 0x707880, 0x8a6a2a, 0x3a6a4a, 0xe0e0e0];
  for (let row = 0; row < 4; row++) {
    const z = z0 + 14 + row * 22;
    for (let x = x0 + 10; x < x1 - 10; x += 3.2) {
      mk.quad(
        new THREE.Vector3(x - 0.06, CURB_H + 0.03, z - 2.6), new THREE.Vector3(x + 0.06, CURB_H + 0.03, z - 2.6),
        new THREE.Vector3(x + 0.06, CURB_H + 0.03, z + 2.6), new THREE.Vector3(x - 0.06, CURB_H + 0.03, z + 2.6),
        [[0, 0], [1, 0], [1, 1], [0, 1]], new THREE.Vector3(0, 1, 0),
      );
      if (rng.chance(0.55)) gen.props.add('parkedCar', x + 1.6, CURB_H, z, row % 2 ? 0 : Math.PI, { color: rng.pick(colors) });
    }
  }
  for (let k = 0; k < 4; k++) gen.props.add('lamp', x0 + 20 + k * 22, CURB_H, cz, k % 2 ? 0 : Math.PI, { groundY: CURB_H });
}

// Four-level open parking garage with alternating ramps. Roof is a stunt launch point.
function garage(gen, lot) {
  const { x0, z0, x1, z1 } = lot;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const W = 64;
  const D = 48;
  const gx0 = cx - W / 2;
  const gx1 = cx + W / 2;
  const gz0 = cz - D / 2;
  const gz1 = cz + D / 2;
  const LH = 3.6;
  const levels = 4;
  const strip = 8;
  const rz0 = cz - 14;
  const rz1 = cz + 14;
  const slab = 0.35;
  const base = CURB_H;
  const conc = (x, y, z, sx, sy, sz) => gen.solidBox('concrete', x, y, z, sx, sy, sz, 0, { kind: 'building' });
  for (let L = 1; L <= levels; L++) {
    const y = base + L * LH;
    // Centre slab.
    conc(cx, y - slab / 2, cz, W - strip * 2, slab, D);
    // Strips: opening over the ramp that arrives at this level.
    const arriving = (L - 1) % 2 === 0 ? 'east' : 'west';
    for (const side of ['east', 'west']) {
      const sx = side === 'east' ? gx1 - strip / 2 : gx0 + strip / 2;
      if (side === arriving) {
        conc(sx, y - slab / 2, (gz0 + rz0) / 2, strip, slab, rz0 - gz0);
        conc(sx, y - slab / 2, (rz1 + gz1) / 2, strip, slab, gz1 - rz1);
      } else conc(sx, y - slab / 2, cz, strip, slab, D);
    }
    // Parapets (leave the ramp strips open at their ends).
    conc(cx, y + 0.45, gz0 + 0.15, W, 0.9, 0.3);
    conc(cx, y + 0.45, gz1 - 0.15, W - (L === levels ? 30 : 0), 0.9, 0.3);
    conc(gx0 + 0.15, y + 0.45, cz, 0.3, 0.9, D);
    conc(gx1 - 0.15, y + 0.45, cz, 0.3, 0.9, D);
    // Ceiling strip lights.
    if (L < levels) {
      for (let x = gx0 + 10; x < gx1 - 8; x += 12) gen.batch(cx, cz, 'lights').box(x, y - slab - 0.04, cz, 0.3, 0.06, D - 10, 0, { top: false, bottom: true });
    }
  }
  // Columns (outside the ramp strips).
  for (let x = gx0 + strip; x <= gx1 - strip + 0.1; x += (W - strip * 2) / 4) {
    for (let z = gz0 + 1; z <= gz1 - 1 + 0.1; z += (D - 2) / 3) {
      conc(x, base + (levels * LH) / 2, z, 0.7, levels * LH, 0.7);
    }
  }
  // Ramps: ramp k rises from level k to k+1, east strip for even k (heading north), west for odd (heading south).
  const len = rz1 - rz0;
  for (let k = 0; k < levels; k++) {
    const yA = base + k * LH;
    const yB = base + (k + 1) * LH;
    const east = k % 2 === 0;
    const x = east ? gx1 - strip / 2 : gx0 + strip / 2;
    const ang = Math.atan2(yB - yA, len) * (east ? 1 : -1);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), ang);
    const center = new THREE.Vector3(x, (yA + yB) / 2 - slab / 2, cz);
    const l = Math.hypot(len, yB - yA) + 1.2;
    gen.batch(cx, cz, 'concrete').orientedBox(center, q, strip - 0.4, slab, l);
    gen.physics.fixedBox(center.x, center.y, center.z, (strip - 0.4) / 2, slab / 2, l / 2, { kind: 'ramp', rotation: { x: q.x, y: q.y, z: q.z, w: q.w } });
  }
  // Roof furniture, a parked car and an Air Station.
  const roofY = base + levels * LH;
  for (let k = 0; k < 4; k++) gen.props.add('lamp', gx0 + 12 + k * 14, roofY, gz0 + 2, 0, { groundY: roofY });
  gen.props.add('parkedCar', cx - 10, roofY, cz + 6, Math.PI / 2, { color: 0x2a4a8a });
  gen.airStations.push(new THREE.Vector3(cx + 4, roofY, cz - 6));
  gen.hideSpots.push({ x: cx, z: cz, r: 32, kind: 'garage' });
  gen.jumps.push({ name: 'Garage Roof', x: cx, y: roofY, z: gz1 - 4 });
}

// Elevated train line along the TRAIN_Z avenue with two stations and a shuttling train.
function elevatedTrain(gen) {
  const y = 11;
  const z = TRAIN_Z;
  const x0 = -500;
  const x1 = 500;
  const conc = (x, yy, zz, sx, sy, sz) => gen.solidBox('concrete', x, yy, zz, sx, sy, sz, 0, { kind: 'building' });
  // Deck in 50 m sections.
  for (let x = x0; x < x1; x += 50) conc(x + 25, y - 0.6, z, 50, 1.2, 6.5);
  // Rails.
  for (const off of [-1.4, 1.4]) {
    const b = gen.batch(0, z, 'darkMetal');
    for (let x = x0; x < x1; x += 50) b.box(x + 25, y + 0.12, z + off, 50, 0.24, 0.3, 0);
  }
  // Pillars on the median, skipping intersections.
  for (let x = x0 + 20; x <= x1 - 20; x += 40) {
    if (nearGrid(x, 14)) continue;
    conc(x, (y - 1.2) / 2, z, 1.0, y - 1.2, 1.0);
  }
  // Stations.
  for (const sx of [-300, 180]) {
    for (const side of [-1, 1]) {
      conc(sx, y - 0.2, z + side * 5.6, 60, 0.6, 4.6);
      gen.solidBox('darkMetal', sx, y + 4.2, z + side * 5.6, 60, 0.25, 5.2, 0);
      for (let x = sx - 27; x <= sx + 27; x += 9) gen.solidBox('darkMetal', x, y + 2.1, z + side * 7.6, 0.25, 4.2, 0.25, 0);
      gen.batch(sx, z, 'lights').box(sx, y + 4.05, z + side * 5.6, 56, 0.06, 0.4, 0, { top: false, bottom: true });
    }
  }
  gen.trainLine = { x0: x0 + 12, x1: x1 - 12, y: y + 0.24, z, stations: [-300, 180] };
}
