// Construction Zone: dirt yards on both sides of a canal, half-built towers with steel
// frames, tower cranes, scaffolding, dirt jumps, an intact road bridge and the unfinished
// bridge that ends in mid-air over the canal (the big "Broken Bridge" jump).
import * as THREE from 'three';
import { LAND } from '../Layout.js';
import { buildRibbon, smoothPath } from '../RoadBuilder.js';
import { G } from '../../core/Physics.js';

export function buildConstruction(gen) {
  // Dirt yards.
  dirtPatch(gen, 640, -460, LAND.canalX0 - 4, 640);
  dirtPatch(gen, LAND.canalX1 + 4, -460, LAND.east - 20, 640);
  halfBuiltTower(gen, 690, -110, 34, 30, 9, 14);
  halfBuiltTower(gen, 690, 120, 30, 34, 6, 11);
  halfBuiltTower(gen, 1180, 20, 38, 34, 12, 18);
  halfBuiltTower(gen, 1180, -150, 30, 30, 4, 8);
  towerCrane(gen, 650, -40, 62, 0.6);
  towerCrane(gen, 1220, 120, 74, 2.2);
  towerCrane(gen, 830, 420, 56, -0.8);
  scaffolding(gen, 1180, 20, 38, 34, 30);
  dirtRamp(gen, 820, 520, Math.PI, 9, 18, 4.2);
  dirtRamp(gen, 1150, 380, Math.PI, 8, 16, 3.6);
  dirtRamp(gen, 700, 380, -Math.PI / 2, 8, 14, 2.8);
  // Cones and barriers around the works.
  const rng = gen.rng;
  for (let k = 0; k < 40; k++) {
    const x = rng.float(660, 880);
    const z = rng.float(-200, 600);
    if (Math.abs(x - 760) < 12 || Math.abs(z - 240) < 12 || Math.abs(z) < 12) continue;
    gen.props.add(rng.chance(0.6) ? 'cone' : 'barrier', x, 0, z, rng.float(0, 6.3));
  }
  for (let k = 0; k < 30; k++) {
    const x = rng.float(1000, 1300);
    const z = rng.float(-300, 600);
    if (Math.abs(x - 1100) < 12 || Math.abs(z + 240) < 12 || Math.abs(z - 240) < 12) continue;
    gen.props.add(rng.chance(0.5) ? 'cone' : 'barrier', x, 0, z, rng.float(0, 6.3));
  }
  // Site floodlights.
  for (const [x, z] of [[700, 0], [700, 260], [820, -60], [1060, -60], [1240, 260], [1060, 460], [820, 600]]) {
    gen.props.add('highwayLamp', x, 0, z, rng.float(0, 6.3), { groundY: 0.02 });
  }
  normalBridge(gen);
  brokenBridge(gen);
  gen.airStations.push(new THREE.Vector3(842, 0, 252));
  gen.hideSpots.push({ x: 850, z: 240, r: 30, kind: 'bridge' });
}

function dirtPatch(gen, x0, z0, x1, z1) {
  // Split into chunk-sized tiles so each chunk batch gets its share.
  for (let x = x0; x < x1; x += 120) {
    for (let z = z0; z < z1; z += 120) {
      const xx = Math.min(x + 120, x1);
      const zz = Math.min(z + 120, z1);
      gen.batch((x + xx) / 2, (z + zz) / 2, 'dirt').flatRect((x + xx) / 2, 0.012, (z + zz) / 2, xx - x, zz - z, 0, 10);
    }
  }
}

// Concrete core, completed slabs up to `slabs`, bare steel columns up to `floors`.
function halfBuiltTower(gen, cx, cz, w, d, slabs, floors) {
  const FH = 4;
  const core = 8;
  gen.solidBox('concrete', cx, (slabs * FH + 6) / 2, cz, core, slabs * FH + 6, core, 0);
  const cols = [];
  for (let i = 0; i <= 3; i++) for (let j = 0; j <= 3; j++) cols.push([cx - w / 2 + (i * w) / 3, cz - d / 2 + (j * d) / 3]);
  for (let f = 1; f <= floors; f++) {
    const y = f * FH;
    if (f <= slabs) gen.solidBox('concrete', cx, y - 0.2, cz, w, 0.4, d, 0);
    else {
      // Steel beams around the perimeter.
      gen.solidBox('steel', cx, y - 0.2, cz - d / 2, w, 0.4, 0.4, 0);
      gen.solidBox('steel', cx, y - 0.2, cz + d / 2, w, 0.4, 0.4, 0);
      gen.solidBox('steel', cx - w / 2, y - 0.2, cz, 0.4, 0.4, d, 0);
      gen.solidBox('steel', cx + w / 2, y - 0.2, cz, 0.4, 0.4, d, 0);
    }
  }
  for (const [x, z] of cols) {
    gen.solidBox('concrete', x, (slabs * FH) / 2, z, 0.8, slabs * FH, 0.8, 0);
    if (floors > slabs) gen.solidBox('steel', x, slabs * FH + ((floors - slabs) * FH) / 2, z, 0.5, (floors - slabs) * FH, 0.5, 0);
  }
  // Work lights on the top slab.
  gen.batch(cx, cz, 'lights').box(cx + w / 2 - 1, slabs * FH + 0.3, cz, 0.3, 0.3, d * 0.6, 0);
  gen.beacons.push(new THREE.Vector3(cx, floors * FH + 1, cz));
}

function towerCrane(gen, x, z, h, rot) {
  // Lattice mast (visual), solid core collider, jib and counter-jib.
  const b = gen.batch(x, z, 'yellow');
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(x + dx * 1.1, h / 2, z + dz * 1.1, 0.25, h, 0.25, 0);
  for (let y = 2; y < h; y += 3) {
    b.box(x, y, z - 1.1, 2.4, 0.15, 0.15, 0);
    b.box(x, y, z + 1.1, 2.4, 0.15, 0.15, 0);
    b.box(x - 1.1, y + 1.5, z, 0.15, 0.15, 2.4, 0);
    b.box(x + 1.1, y + 1.5, z, 0.15, 0.15, 2.4, 0);
  }
  gen.physics.fixedBox(x, h / 2, z, 1.3, h / 2, 1.3, { kind: 'building' });
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const jib = 48;
  const cj = 16;
  const jx = x + (s * (jib - cj)) / 2;
  const jz = z + (c * (jib - cj)) / 2;
  gen.solidBox('yellow', jx, h + 1, jz, 1.6, 1.6, jib + cj, rot);
  gen.solidBox('concrete', x - s * (cj - 3), h - 0.5, z - c * (cj - 3), 3.5, 3, 4, rot);
  gen.solidBox('darkMetal', x, h + 2.5, z, 2.6, 2.6, 2.6, rot);
  gen.beacons.push(new THREE.Vector3(x + s * jib, h + 2, z + c * jib), new THREE.Vector3(x, h + 4, z));
}

function scaffolding(gen, cx, cz, w, d, h) {
  const b = gen.batch(cx, cz, 'rail');
  const off = 1.4;
  for (const side of [-1, 1]) {
    const z = cz + side * (d / 2 + off);
    for (let x = cx - w / 2; x <= cx + w / 2; x += 2.5) b.box(x, h / 2, z, 0.1, h, 0.1, 0);
    for (let y = 2; y <= h; y += 2) {
      b.box(cx, y, z, w, 0.08, 0.08, 0);
      gen.batch(cx, cz, 'concrete').box(cx, y - 0.05, z - side * 0.6, w, 0.06, 1.2, 0);
    }
    gen.physics.fixedBox(cx, h / 2, z - side * 0.5, w / 2, h / 2, 0.9, { kind: 'building' });
  }
}

// Dirt kicker ramp (convex wedge) facing `rot`.
function dirtRamp(gen, x, z, rot, width, length, height) {
  const hw = width / 2;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const P = (lx, ly, lz) => new THREE.Vector3(x + lx * c + lz * s, ly, z - lx * s + lz * c);
  // Approach from local -z, rising toward +z, with a short back slope.
  const pts = [P(-hw, 0, -length / 2), P(hw, 0, -length / 2), P(-hw, height, length / 2 - 2), P(hw, height, length / 2 - 2),
    P(-hw, 0, length / 2 + 5), P(hw, 0, length / 2 + 5)];
  const b = gen.batch(x, z, 'dirt');
  const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
  b.quad(pts[1], pts[0], pts[2], pts[3], uv);
  b.quad(pts[2], pts[4], pts[5], pts[3], uv);
  b.tri(pts[0], pts[4], pts[2], [[0, 0], [1, 0], [0.5, 1]]);
  b.tri(pts[1], pts[3], pts[5], [[0, 0], [0.5, 1], [1, 0]]);
  const R = gen.physics.R;
  const body = gen.physics.staticBody;
  const col = gen.physics.world.createCollider(
    R.ColliderDesc.convexHull(new Float32Array(pts.flatMap((p) => [p.x, p.y, p.z]))).setFriction(0.8).setCollisionGroups((G.RAMP << 16) | 0xffff),
    body,
  );
  gen.physics.meta.set(col.handle, { kind: 'ramp', surface: 'dirt' });
  gen.jumps.push({ name: 'Dirt Kicker', type: 'dirt', takeoff: P(0, height, length / 2 - 2), dir: new THREE.Vector3(s, 0, c) });
}

function normalBridge(gen) {
  const z = -240;
  const pts = [];
  for (let x = 880; x <= 1000; x += 5) pts.push(new THREE.Vector3(x, 0.02, z));
  buildRibbon(gen, pts, { width: 16, deck: 1.0, kind: 'bridge', barriers: 'jersey', markings: { center: 'double', lanes: 2 }, graph: false });
  const a = gen.graph.node(880, 0, z, 'ground');
  const b = gen.graph.node(1000, 0, z, 'ground');
  gen.graph.edge(a, b, [a, b], { name: 'Canal Bridge', speed: 22 });
}

function brokenBridge(gen) {
  const z = 240;
  const deckY = 9.5;
  // West half: rises from Yard Rd and ends over the middle of the canal.
  const west = smoothPath([
    new THREE.Vector3(768, 0.02, z), new THREE.Vector3(800, 0.6, z), new THREE.Vector3(850, 5.5, z),
    new THREE.Vector3(895, 8.8, z), new THREE.Vector3(926, deckY + 0.6, z),
  ], 4);
  buildRibbon(gen, west, {
    width: 16, deck: 1.6, kind: 'bridge', barriers: 'jersey', markings: { center: 'double', lanes: 2 },
    pillars: { every: 32, width: 8 }, graph: false,
  });
  const wEnd = west[west.length - 1];
  for (let k = -7; k <= 7; k++) gen.batch(wEnd.x, z, 'darkMetal').box(wEnd.x + 1.4, wEnd.y - 0.8 + (k % 2) * 0.4, z + k, 2.8, 0.07, 0.07, 0.15 * k);
  // East half: begins over the canal lower down and returns to the ground at Rebar Rd.
  const east = smoothPath([
    new THREE.Vector3(966, 7.0, z), new THREE.Vector3(1000, 6.6, z), new THREE.Vector3(1050, 3.0, z),
    new THREE.Vector3(1092, 0.02, z),
  ], 4);
  buildRibbon(gen, east, {
    width: 16, deck: 1.6, kind: 'bridge', barriers: 'jersey', gaps: [{ side: 'both', s0: 0, s1: 6 }],
    markings: { center: 'double', lanes: 2 }, pillars: { every: 28, width: 8 }, graph: false,
  });
  const eStart = east[0];
  for (let k = -7; k <= 7; k++) gen.batch(eStart.x, z, 'darkMetal').box(eStart.x - 1.4, eStart.y - 0.8 + (k % 2) * 0.4, z + k, 2.8, 0.07, 0.07, -0.15 * k);
  // Warning barriers before the drop.
  gen.props.add('barrier', 905, west[west.length - 6].y, z - 4, 0);
  gen.props.add('barrier', 905, west[west.length - 6].y, z + 4, 0);
  // Graph: the west half is a dead end, the east half links to Rebar Rd.
  const a = gen.graph.node(760, 0, z, 'ground');
  const b = gen.graph.node(wEnd.x - 6, wEnd.y, z, 'stunt');
  gen.graph.edge(a, b, [a, ...west.filter((_, i) => i % 4 === 0).slice(1), b], { name: 'Span Ave Bridge', kind: 'stunt', speed: 20 });
  const c = gen.graph.node(eStart.x + 8, eStart.y, z, 'stunt');
  const d = gen.graph.node(1100, 0, z, 'ground');
  gen.graph.edge(c, d, [c, ...east.filter((_, i) => i % 4 === 0).slice(1), d], { name: 'Span Ave Bridge', kind: 'stunt', speed: 20 });
  gen.jumps.push({
    name: 'Broken Bridge', type: 'bridge', takeoff: wEnd.clone(), landing: new THREE.Vector3(990, 6.8, z), dir: new THREE.Vector3(1, 0, 0),
  });
}
