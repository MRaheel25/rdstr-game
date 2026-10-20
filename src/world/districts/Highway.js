// Highway Ring: a six-lane elevated freeway looping the city, with on-ramps on each side,
// a covered tunnel section, overpasses over the ground streets and an unfinished spur in
// the Construction Zone that ends in mid-air (the "Highway Gap" jump).
import * as THREE from 'three';
import { buildRibbon, roundedRect, smoothPath } from '../RoadBuilder.js';
import { RING } from '../Layout.js';
import { smoothstep } from '../../util/math.js';

const _p = new THREE.Vector3();

export function buildHighway(gen) {
  const { hx, hz, r, y, width } = RING;
  const pts = roundedRect(0, 0, hx, hz, r, y, 5);
  const ringHW = width / 2;
  const nearGround = (p) => gen.groundRoads.some((g) => distToSeg(p.x, p.z, g.ax, g.az, g.bx, g.bz) < 13);
  // Interchange points at the middle of each side (merge zones of the ramps).
  const inner = hx - ringHW - 4.5;
  const ramps = [
    // start (ground), heading, ring side normal (toward ring centre line)
    { sx: 120, sz: inner, dx: -1, dz: 0, nx: 0, nz: 1, name: 'South On-Ramp' },
    { sx: -inner, sz: 120, dx: 0, dz: -1, nx: -1, nz: 0, name: 'West On-Ramp' },
    { sx: -120, sz: -inner, dx: 1, dz: 0, nx: 0, nz: -1, name: 'North On-Ramp' },
    { sx: inner, sz: -120, dx: 0, dz: 1, nx: 1, nz: 0, name: 'East On-Ramp' },
  ];
  const climb = 180;
  const merge = 90;
  // Ring distance s of a world point (for barrier gaps).
  const D = [0];
  for (let i = 1; i < pts.length; i++) D.push(D[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const sOf = (x, z) => {
    let best = Infinity;
    let bs = 0;
    for (let i = 0; i < pts.length; i++) {
      const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2;
      if (d < best) {
        best = d;
        bs = D[i];
      }
    }
    return bs;
  };
  const gaps = [];
  for (const rp of ramps) {
    const ax = rp.sx + rp.dx * climb;
    const az = rp.sz + rp.dz * climb;
    const s0 = sOf(ax - rp.dx * 8, az - rp.dz * 8);
    const s1 = sOf(ax + rp.dx * merge, az + rp.dz * merge);
    gaps.push({ side: 'right', s0: Math.min(s0, s1), s1: Math.max(s0, s1) });
    rp.mergeS = (s0 + s1) / 2;
  }
  // Exit to the unfinished spur (outer side, east, heading north).
  const spurS0 = sOf(hx, -40);
  const spurS1 = sOf(hx, -100);
  gaps.push({ side: 'left', s0: Math.min(spurS0, spurS1), s1: Math.max(spurS0, spurS1) });

  // Determine which side of the ribbon is "inner": ribbon right normal = (-dz, dx) of travel.
  // roundedRect walks east side southward first, so the right normal points west (inner).
  const tunnel = { x0: 170, x1: 390, z: -hz };
  const lampGaps = [{ side: 'both', s0: sOf(tunnel.x1, -hz), s1: sOf(tunnel.x0, -hz) }];
  // Build the ring as four edges between interchange nodes so path-finding works.
  const splitS = ramps.map((rp) => rp.mergeS).sort((a, b) => a - b);
  const segments = [];
  let start = 0;
  for (const s of [...splitS, D[D.length - 1]]) {
    segments.push([start, s]);
    start = s;
  }
  // First and last pieces join through s = 0.
  const firstNode = null;
  const nodeAt = (s) => {
    let i = 0;
    while (i < pts.length - 1 && D[i] < s) i++;
    return gen.graph.node(pts[i].x, pts[i].y, pts[i].z, 'highway');
  };
  const nodes = splitS.map((s) => nodeAt(s));
  const ring = buildRibbon(gen, pts, {
    width, deck: 1.6, kind: 'highway', barriers: 'jersey', gaps,
    markings: { center: 'double', lanes: 3 },
    pillars: { every: 40, skip: nearGround, width: 9 },
    lamps: { every: 60, type: 'highwayLamp', skip: (s) => s >= lampGaps[0].s0 - 10 && s <= lampGaps[0].s1 + 10 },
    graph: false,
  });
  void firstNode;
  // Graph edges for the ring, between consecutive interchange nodes (wrapping around).
  for (let k = 0; k < nodes.length; k++) {
    const sA = splitS[k];
    const sB = splitS[(k + 1) % nodes.length] + (k === nodes.length - 1 ? D[D.length - 1] : 0);
    const gp = [];
    for (let s = sA; s <= sB; s += 20) {
      const ss = s % D[D.length - 1];
      ring.pointAt(ss, 0, _p);
      gp.push(_p.clone().setY(y));
    }
    const a = nodes[k];
    const b = nodes[(k + 1) % nodes.length];
    gp[0] = new THREE.Vector3(a.x, a.y, a.z);
    gp.push(new THREE.Vector3(b.x, b.y, b.z));
    gen.graph.edge(a, b, gp, { kind: 'highway', lanes: 3, name: 'Highway Ring', speed: 45, laneWidth: 3.8 });
  }
  void lampGaps;

  // On-ramps: ground -> climb -> taper into the ring's inner lanes.
  ramps.forEach((rp, k) => {
    const rpts = [];
    const hws = [];
    const total = climb + merge;
    for (let s = 8; s <= total + 0.01; s += 5) {
      const climbT = smoothstep(0, climb, s);
      const yy = 0.02 + (y - 0.02) * climbT;
      const taper = s > climb ? 1 - (s - climb) / merge : 1;
      const hwv = Math.max(0.05, 4.5 * taper);
      // Keep the ring-side edge fixed while tapering.
      const off = 4.5 - hwv;
      rpts.push(new THREE.Vector3(rp.sx + rp.dx * s + rp.nx * off, yy, rp.sz + rp.dz * s + rp.nz * off));
      hws.push(hwv);
    }
    // Ring side is to the ramp's right or left depending on the heading.
    const rightNx = -rp.dz;
    const rightNz = rp.dx;
    const ringSide = rightNx * rp.nx + rightNz * rp.nz > 0 ? 'right' : 'left';
    const ramp = buildRibbon(gen, rpts, {
      halfWidths: hws, width: 9, deck: 1.0, kind: 'ramp', barriers: 'jersey',
      gaps: [{ side: ringSide, s0: climb - 14, s1: total + 5 }],
      markings: { center: 'none' },
      pillars: { every: 30, width: 5, skip: nearGround },
      graph: false,
    });
    void ramp;
    const a = gen.graph.node(rp.sx, 0, rp.sz, 'ground');
    const endIdx = Math.round((climb - 8) / 5);
    const mid = rpts[endIdx];
    const m = nodes[k];
    const gp = rpts.filter((_, i) => i % 3 === 0 && i <= endIdx).map((p) => p.clone());
    gp[0] = new THREE.Vector3(a.x, a.y, a.z);
    gp.push(mid.clone(), new THREE.Vector3(m.x, m.y, m.z));
    gen.graph.edge(a, m, gp, { kind: 'ramp', lanes: 1, name: rp.name, speed: 22 });
  });

  // Tunnel: cut-and-cover gallery over the north side.
  const tz = tunnel.z;
  const roofY = y + 7.5;
  const len = tunnel.x1 - tunnel.x0;
  const tcx = (tunnel.x0 + tunnel.x1) / 2;
  gen.solidBox('concrete', tcx, roofY + 0.6, tz, len, 1.2, width + 3, 0);
  for (const side of [-1, 1]) {
    for (let x = tunnel.x0; x < tunnel.x1; x += 20) {
      gen.solidBox('concrete', x + 10, y + 1.1 + (roofY - y - 1.1) / 2, tz + side * (ringHW + 0.7), 20, roofY - y - 1.1, 1.0, 0);
    }
  }
  for (let x = tunnel.x0 + 6; x < tunnel.x1; x += 12) {
    gen.batch(x, tz, 'lights').box(x, roofY - 0.05, tz - 5, 4, 0.1, 0.5, 0, { top: false, bottom: true });
    gen.batch(x, tz, 'lights').box(x, roofY - 0.05, tz + 5, 4, 0.1, 0.5, 0, { top: false, bottom: true });
    gen.tunnelLights.push(new THREE.Vector3(x, roofY - 0.3, tz));
  }
  gen.hideSpots.push({ x: tcx, z: tz, r: len / 2, kind: 'tunnel', y });
  gen.tunnels.push({ x0: tunnel.x0, x1: tunnel.x1, z0: tz - ringHW, z1: tz + ringHW, y0: y - 1, y1: roofY });

  // Unfinished spur: exits the ring's outer lanes northbound, curves east and ends mid-air.
  const spurCtrl = [
    new THREE.Vector3(hx + ringHW + 1, y, -40),
    new THREE.Vector3(hx + ringHW + 5, y, -100),
    new THREE.Vector3(hx + 40, y + 0.5, -150),
    new THREE.Vector3(hx + 90, y + 1.6, -165),
    new THREE.Vector3(760, y + 3.2, -168),
  ];
  const spurPts = smoothPath(spurCtrl, 4);
  const spurHW = spurPts.map((_, i) => Math.min(5, 1 + i * 0.5));
  // Keep the ring-side edge flush with the ring deck while the exit lane widens.
  spurPts.forEach((p, i) => {
    if (p.z > -105) p.x = hx + ringHW + spurHW[i];
  });
  buildRibbon(gen, spurPts, {
    halfWidths: spurHW, width: 10, deck: 1.2, kind: 'stunt', barriers: 'jersey',
    gaps: [{ side: 'left', s0: 0, s1: 52 }],
    markings: { center: 'none' }, pillars: { every: 30, width: 5, skip: nearGround }, graph: false,
  });
  // Rebar stubs at the broken end.
  const end = spurPts[spurPts.length - 1];
  for (let k = -4; k <= 4; k += 1) gen.batch(end.x, end.z, 'darkMetal').box(end.x + 1.2, end.y - 0.6, end.z + k, 2.4, 0.06, 0.06, 0);
  // Far piece: landing deck, then down to the construction yard.
  const farCtrl = [
    new THREE.Vector3(815, y, -168),
    new THREE.Vector3(860, y, -166),
    new THREE.Vector3(878, y - 2, -130),
    new THREE.Vector3(880, y - 8, -60),
    new THREE.Vector3(880, 0.02, 40),
  ];
  const farPts = smoothPath(farCtrl, 4);
  buildRibbon(gen, farPts, {
    width: 10, deck: 1.2, kind: 'stunt', barriers: 'jersey', gaps: [{ side: 'both', s0: 0, s1: 12 }],
    markings: { center: 'none' }, pillars: { every: 26, width: 5, skip: nearGround }, graph: false,
  });
  gen.jumps.push({
    name: 'Highway Gap', type: 'gap',
    takeoff: new THREE.Vector3(end.x, end.y, end.z), landing: new THREE.Vector3(830, y, -167),
    dir: new THREE.Vector3(1, 0, 0),
  });
}

function distToSeg(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const l2 = abx * abx + abz * abz || 1;
  let t = ((px - ax) * abx + (pz - az) * abz) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}
