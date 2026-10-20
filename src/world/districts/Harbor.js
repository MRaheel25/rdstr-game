// Harbor & Docks: warehouses, a container yard with stacks and a climbable container
// staircase (stunt jump), gantry cranes on the quay, three piers, a docked container ship
// and a car-carrier truck whose ramp launches you over the yard.
import * as THREE from 'three';
import { HARBOR_BLVD_Z, LAND } from '../Layout.js';

const CONTAINER = { L: 12.2, W: 2.44, H: 2.6 };
const COLORS = [
  [0.62, 0.12, 0.08], [0.1, 0.28, 0.55], [0.12, 0.42, 0.22], [0.78, 0.42, 0.08], [0.55, 0.56, 0.58],
  [0.85, 0.85, 0.82], [0.35, 0.18, 0.4], [0.7, 0.62, 0.1], [0.2, 0.22, 0.25],
];
const PIERS = [-360, 0, 360];

export function buildHarbor(gen) {
  const rng = gen.rng;
  const quay = LAND.south;
  warehouses(gen);
  // Container yard blocks.
  for (let bx = -540; bx <= 680; bx += 62) {
    if (PIERS.some((p) => Math.abs(bx - p) < 40) || Math.abs(bx - 120) < 36) continue;
    for (const bz of [722, 768, 814, 860, 906, 952]) {
      if (bx > 440 && bx < 600 && bz < 800) continue; // car-carrier area
      if (bx < -420 && bz > 880) continue; // staircase area
      containerBlock(gen, bx, bz, rng.int(1, 4), rng);
    }
  }
  containerStaircase(gen, -480, 930);
  carCarrier(gen, 520, 770);
  // Quay: gantry cranes between piers, bollards.
  for (const cx of [-520, -180, 180, 520]) gantryCrane(gen, cx, quay - 22);
  // Piers with roads to their ends.
  for (const px of PIERS) pier(gen, px);
  containerShip(gen, 40, 1120);
  // Yard lamps (tall floodlights).
  for (let x = -520; x <= 660; x += 120) {
    gen.props.add('highwayLamp', x, 0, 700, 0, { groundY: 0.02 });
    gen.props.add('highwayLamp', x + 60, 0, 985, Math.PI, { groundY: 0.02 });
  }
  gen.airStations.push(new THREE.Vector3(-300, 0, 836));
  gen.hideSpots.push({ x: 40, z: 1120, r: 30, kind: 'ship' });
}

function warehouses(gen) {
  const rng = gen.rng;
  const z0 = 624;
  const z1 = HARBOR_BLVD_Z - 14;
  let x = -630;
  while (x < 720) {
    const w = rng.float(50, 90);
    const x1 = Math.min(x + w, 740);
    const blocked = [-360, 120, 360].some((r) => r > x - 10 && r < x1 + 10);
    if (!blocked && x1 - x > 30) {
      gen.building(x, z0, x1, z1, { height: [9, 15], style: 4, lit: 0.18, neon: 0.25 });
    }
    x = x1 + rng.float(14, 24);
  }
}

function containerBlock(gen, cx, cz, maxH, rng) {
  // 4 along x by 6 along z, heights vary per stack.
  const nx = 4;
  const nz = 6;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x = cx - (nx * (CONTAINER.L + 0.4)) / 2 + (i + 0.5) * (CONTAINER.L + 0.4);
      const z = cz - (nz * (CONTAINER.W + 0.12)) / 2 + (j + 0.5) * (CONTAINER.W + 0.12);
      const h = Math.max(1, Math.min(maxH, maxH - (rng.chance(0.3) ? 1 : 0)));
      stack(gen, x, z, h, rng, 0);
    }
  }
}

function stack(gen, x, z, h, rng, rot = 0) {
  const b = gen.batch(x, z, 'containers', { color: true });
  for (let k = 0; k < h; k++) {
    const c = rng.pick(COLORS);
    b.setColor(c[0], c[1], c[2]);
    b.box(x, CONTAINER.H * (k + 0.5), z, CONTAINER.L, CONTAINER.H - 0.04, CONTAINER.W, rot, { uvScale: 0.1 });
  }
  const H = CONTAINER.H * h;
  gen.physics.fixedBox(x, H / 2, z, CONTAINER.L / 2, H / 2, CONTAINER.W / 2, {
    kind: 'building', rotation: rot ? { x: 0, y: Math.sin(rot / 2), z: 0, w: Math.cos(rot / 2) } : undefined,
  });
}

// Climbable staircase of container stacks with steel ramps: drive to the top, jump the aisle.
function containerStaircase(gen, x0, z) {
  const rng = gen.rng;
  const steps = [1, 2, 3, 4];
  const W = 6; // stacks side by side for a 14.6 m wide platform
  steps.forEach((h, k) => {
    const x = x0 + k * (CONTAINER.L + 2);
    for (let j = 0; j < W; j++) stack(gen, x, z - 6 + j * CONTAINER.W, h, rng);
  });
  // Steel ramps between steps (and from the ground to the first).
  for (let k = 0; k < steps.length; k++) {
    const yA = k === 0 ? 0 : steps[k - 1] * CONTAINER.H;
    const yB = steps[k] * CONTAINER.H;
    const xEnd = x0 + k * (CONTAINER.L + 2) - CONTAINER.L / 2;
    const run = k === 0 ? 12 : 8;
    const xStart = xEnd - run;
    const len = Math.hypot(run, yB - yA);
    const ang = Math.atan2(yB - yA, run);
    // Ramp rises toward +x: rotate about z.
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
    const c = new THREE.Vector3((xStart + xEnd) / 2, (yA + yB) / 2 - 0.15, z);
    gen.batch(c.x, c.z, 'yellow').orientedBox(c, q, len + 1, 0.3, 7);
    gen.physics.fixedBox(c.x, c.y, c.z, (len + 1) / 2, 0.15, 3.5, { kind: 'ramp', rotation: { x: q.x, y: q.y, z: q.z, w: q.w } });
  }
  const topX = x0 + 3 * (CONTAINER.L + 2) + CONTAINER.L / 2;
  gen.jumps.push({
    name: 'Container Stack', type: 'stack', takeoff: new THREE.Vector3(topX, 4 * CONTAINER.H, z), landing: new THREE.Vector3(topX + 40, 0, z),
    dir: new THREE.Vector3(1, 0, 0),
  });
}

// Car-carrier truck: cab + trailer with an inclined upper deck used as a ramp.
function carCarrier(gen, x, z) {
  // Faces -z (north). Ramp rises from the trailer tail (south) toward the cab.
  const red = [0.75, 0.1, 0.08];
  gen.solidBox('paint', x, 1.9, z - 11, 2.5, 3.0, 3.2, 0, { color: red, batchOpts: { color: true } });
  gen.solidBox('paint', x, 0.9, z - 8.5, 2.5, 1.0, 2.0, 0, { color: [0.15, 0.15, 0.16], batchOpts: { color: true } });
  // Lower deck.
  gen.solidBox('darkMetal', x, 1.0, z + 2, 2.6, 0.3, 18, 0);
  // Upper deck ramp: from ground at z+13 up to 4.4 m at z-7.
  const yA = 0;
  const yB = 4.4;
  const run = 20;
  const ang = Math.atan2(yB - yA, run);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), ang);
  const c = new THREE.Vector3(x, (yA + yB) / 2, z + 3);
  const len = Math.hypot(run, yB - yA);
  gen.batch(x, z, 'yellow').orientedBox(c, q, 3.6, 0.25, len);
  gen.physics.fixedBox(c.x, c.y, c.z, 1.8, 0.125, len / 2, { kind: 'ramp', rotation: { x: q.x, y: q.y, z: q.z, w: q.w } });
  // Side frame posts.
  for (let k = -8; k <= 12; k += 5) {
    gen.solidBox('darkMetal', x - 1.35, 1.6, z + k, 0.15, 3.0, 0.15, 0);
    gen.solidBox('darkMetal', x + 1.35, 1.6, z + k, 0.15, 3.0, 0.15, 0);
  }
  // Wheels.
  for (const k of [-11, -8.5, 4, 7, 10]) {
    for (const s of [-1.1, 1.1]) gen.batch(x, z, 'darkMetal').box(x + s, 0.5, z + k, 0.4, 1.0, 1.0, 0);
  }
  gen.jumps.push({
    name: 'Car Carrier', type: 'carrier', takeoff: new THREE.Vector3(x, yB, z - 7), landing: new THREE.Vector3(x, 0, z - 60),
    dir: new THREE.Vector3(0, 0, -1),
  });
}

function gantryCrane(gen, cx, cz) {
  const H = 40;
  const span = 26;
  const depth = 18;
  for (const sx of [-span / 2, span / 2]) {
    for (const sz of [-depth / 2, depth / 2]) gen.solidBox('yellow', cx + sx, H / 2, cz + sz, 1.6, H, 1.6, 0);
    gen.solidBox('yellow', cx + sx, H, cz, 1.8, 2.2, depth + 2, 0);
    gen.solidBox('yellow', cx + sx, 6, cz, 1.2, 1.2, depth, 0);
  }
  // Boom reaching over the water and back over the yard.
  gen.solidBox('yellow', cx, H + 2.4, cz + 20, span + 2, 2.4, 80, 0);
  gen.solidBox('darkMetal', cx, H + 7, cz - 4, 4, 8, 4, 0);
  gen.batch(cx, cz, 'lights').box(cx, H + 1, cz + 55, 2, 0.2, 2, 0, { top: false, bottom: true });
  gen.beacons.push(new THREE.Vector3(cx, H + 11.2, cz - 4));
}

function pier(gen, px) {
  const z0 = LAND.south;
  const z1 = 1225;
  const w = 26;
  gen.solidBox('concrete', px, -1.0, (z0 + z1) / 2, w, 2.0, z1 - z0, 0, { kind: 'ground' });
  for (let z = z0 + 12; z < z1; z += 18) {
    for (const s of [-1, 1]) gen.solidBox('concrete', px + s * (w / 2 - 1.5), -6, z, 1.4, 8, 1.4, 0);
  }
  // Road on the pier and through the yard to Harbor Blvd.
  gen.roadSegment(px, HARBOR_BLVD_Z + 8, px, z1 - 4, { crosswalks: false });
  const a = gen.graph.node(px, 0, HARBOR_BLVD_Z, 'ground');
  const b = gen.graph.node(px, 0, z1 - 6, 'pier');
  gen.graph.edge(a, b, [a, b], { name: 'Pier ' + (PIERS.indexOf(px) + 1), speed: 20 });
  gen.groundRoads.push({ ax: px, az: HARBOR_BLVD_Z, bx: px, bz: z1 });
  // Edge bollards / kerb (solid low wall) on the pier sides.
  for (const s of [-1, 1]) gen.solidBox('concrete', px + s * (w / 2 - 0.3), 0.35, (z0 + z1) / 2, 0.6, 0.7, z1 - z0, 0, { kind: 'barrier' });
  gen.solidBox('concrete', px, 0.5, z1 - 0.4, w, 1.0, 0.8, 0, { kind: 'barrier' });
  for (let z = z0 + 20; z < z1 - 10; z += 40) {
    gen.props.add('lamp', px - w / 2 + 1.2, 0, z, Math.PI / 2, { groundY: 0.02 });
    gen.props.add('lamp', px + w / 2 - 1.2, 0, z + 20, -Math.PI / 2, { groundY: 0.02 });
  }
}

function containerShip(gen, x, z) {
  const rng = gen.rng;
  const L = 170;
  const B = 26;
  // Hull (dark) and deck.
  gen.solidBox('paint', x + B / 2 + 1, 3, z, B, 10, L, 0, { color: [0.12, 0.13, 0.15], batchOpts: { color: true } });
  gen.solidBox('paint', x + B / 2 + 1, -1.2, z, B - 0.5, 1.6, L - 0.5, 0, { color: [0.5, 0.08, 0.06], batchOpts: { color: true } });
  // Bridge tower at the stern.
  gen.solidBox('paint', x + B / 2 + 1, 18, z + L / 2 - 14, B - 4, 20, 12, 0, { color: [0.85, 0.85, 0.82], batchOpts: { color: true } });
  gen.batch(x, z, 'lights').box(x + B / 2 + 1, 24, z + L / 2 - 20.05, B - 6, 1.2, 0.1, 0);
  // Containers on deck.
  for (let k = -6; k <= 4; k++) {
    for (let j = 0; j < 8; j++) {
      const h = rng.int(1, 4);
      const sx = x + 4 + j * (CONTAINER.W + 0.3);
      const sz = z + k * 13.2;
      const b = gen.batch(sx, sz, 'containers', { color: true });
      for (let m = 0; m < h; m++) {
        const c = rng.pick(COLORS);
        b.setColor(c[0], c[1], c[2]);
        b.box(sx, 8 + CONTAINER.H * (m + 0.5), sz, CONTAINER.W, CONTAINER.H - 0.04, CONTAINER.L, 0, { uvScale: 0.1 });
      }
      gen.physics.fixedBox(sx, 8 + (CONTAINER.H * h) / 2, sz, CONTAINER.W / 2, (CONTAINER.H * h) / 2, CONTAINER.L / 2, { kind: 'building' });
    }
  }
  gen.beacons.push(new THREE.Vector3(x + B / 2 + 1, 29, z + L / 2 - 14));
}

