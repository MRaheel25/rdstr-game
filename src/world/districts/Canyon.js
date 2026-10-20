// Hillside Canyon: terrain heightfield north of the city with a hairpin road loop climbing
// to a skyline lookout and winding back down. Guard rails, a covered gallery (tunnel),
// pine forest and a lookout pad with an Air Station.
import * as THREE from 'three';
import { Terrain, fbm } from '../Terrain.js';
import { buildRibbon, smoothPath } from '../RoadBuilder.js';
import { smoothstep } from '../../util/math.js';

// Control points: switchbacks whose legs run ~50 m apart, giving ~26-29 m radius hairpins
// for drifting, joined by long climbing legs.
const UP = [
  [0, -700], [0, -760], [-60, -830], [-180, -868], [-300, -890], [-375, -900], [-408, -908], [-424, -924],
  [-418, -942], [-394, -950], [-340, -958], [-280, -985], [-200, -1010], [-120, -1022], [0, -1036], [70, -1050],
  [108, -1062], [126, -1080], [118, -1100], [94, -1106], [40, -1112], [-20, -1140], [-120, -1200], [-240, -1240],
  [-340, -1272], [-430, -1310],
];
const DOWN = [
  [-430, -1310], [-540, -1300], [-650, -1250], [-720, -1170], [-700, -1090], [-640, -1064], [-570, -1058],
  [-534, -1052], [-516, -1036], [-522, -1016], [-548, -1008], [-610, -1000], [-670, -975], [-720, -920],
  [-700, -850], [-600, -790], [-520, -760], [-390, -722], [-360, -700],
];
const SUMMIT_Y = 104;

function graded(ctrl, y0, y1) {
  // Smooth XZ path, then assign heights linearly by distance (constant grade).
  const pts = smoothPath(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), 4);
  let total = 0;
  const d = [0];
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    d.push(total);
  }
  pts.forEach((p, i) => {
    p.y = y0 + (y1 - y0) * (d[i] / total);
  });
  pts[0].y = y0 + (y0 === 0 ? 0.02 : 0);
  pts[pts.length - 1].y = y1 + (y1 === 0 ? 0.02 : 0);
  return pts;
}

export function buildCanyon(gen) {
  const up = graded(UP, 0, SUMMIT_Y);
  const down = graded(DOWN, SUMMIT_Y, 0);
  const x0 = -1000;
  const x1 = 1320;
  const z0 = -1720;
  const z1 = -700;
  const baseFn = (x, z) => {
    const t = smoothstep(-700, -920, z);
    let h = t * (38 + 75 * fbm(x * 0.0032 + 3.1, z * 0.0032 + 7.7, 5));
    h += smoothstep(-950, -1400, z) * 45;
    // Mountains rising at the borders enclose the map.
    h += smoothstep(x1 - 260, x1, x) * 170 + smoothstep(x0 + 260, x0, x) * 170 + smoothstep(z0 + 300, z0, z) * 190;
    // Shoreline: stay low near the bay to the south-west.
    return Math.max(0, h);
  };
  const terrain = new Terrain(gen, {
    x0, x1, z0, z1, cell: 5, baseFn,
    roads: [{ pts: up, halfWidth: 5.5 }, { pts: down, halfWidth: 5.5 }, { pts: lookoutPts(up), halfWidth: 14 }],
  });
  terrain.build();
  gen.terrain = terrain;
  const prev = gen.groundHeight;
  gen.groundHeight = (x, z) => {
    const h = terrain.heightAt(x, z);
    return h === null ? prev(x, z) : h;
  };

  const start = gen.graph.node(0, 0, -700, 'ground');
  const summit = gen.graph.node(up[up.length - 1].x, up[up.length - 1].y, up[up.length - 1].z, 'canyon');
  const end = gen.graph.node(-360, 0, -700, 'ground');
  const upRoad = buildRibbon(gen, up, {
    width: 11, deck: 0.6, kind: 'canyon', barriers: 'rail', markings: { center: 'double', lanes: 1 },
    gaps: [{ side: 'both', s0: 0, s1: 10 }],
    lamps: { every: 70, type: 'lamp' }, graph: { a: start, b: summit, name: 'Canyon Road', speed: 20, lanes: 1 },
  });
  buildRibbon(gen, down, {
    width: 11, deck: 0.6, kind: 'canyon', barriers: 'rail', markings: { center: 'double', lanes: 1 },
    gaps: [{ side: 'both', s0: 0, s1: 14 }, { side: 'both', s0: 99999, s1: 99999 }],
    lamps: { every: 70, type: 'lamp' }, graph: { a: summit, b: end, name: 'Canyon Road', speed: 20, lanes: 1 },
  });
  gen.canyon = { up, down, upTotal: upRoad.total };

  // Covered gallery (tunnel) on the climb.
  // On the long straight leg between the two climbing hairpins.
  const sAt = (x, z) => {
    let best = 0;
    let bd = Infinity;
    up.forEach((p, i) => {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return (best / (up.length - 1)) * upRoad.total;
  };
  gallery(gen, upRoad, sAt(-190, -1012), sAt(-60, -1029));
  lookout(gen, up);
  // Pine forest.
  const rng = gen.rng;
  let placed = 0;
  for (let k = 0; k < 2600 && placed < 420; k++) {
    const x = rng.float(-950, 1250);
    const z = rng.float(-1650, -730);
    const r = terrain.nearestRoad(x, z);
    if (r.d < 16) continue;
    const h = terrain.heightAt(x, z);
    if (h === null || h > 200) continue;
    const hx = terrain.heightAt(x + 3, z) - h;
    const hz = terrain.heightAt(x, z + 3) - h;
    if (Math.hypot(hx, hz) > 2.4) continue;
    gen.props.add(rng.chance(0.85) ? 'pine' : 'tree', x, h - 0.1, z, rng.float(0, 6.3));
    placed++;
  }
}

function lookoutPts(up) {
  const s = up[up.length - 1];
  return [new THREE.Vector3(s.x + 10, s.y, s.z + 25), new THREE.Vector3(s.x + 30, s.y, s.z + 45)];
}

function gallery(gen, road, s0, s1) {
  const roofH = 6.5;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let s = s0; s < s1; s += 6) {
    road.pointAt(s, 0, p);
    road.pointAt(s + 6, 0, n);
    const rot = Math.atan2(n.x - p.x, n.z - p.z);
    const cx = (p.x + n.x) / 2;
    const cz = (p.z + n.z) / 2;
    const y = (p.y + n.y) / 2;
    gen.solidBox('concrete', cx, y + roofH + 0.4, cz, 15, 0.8, 6.4, rot);
    // Pillars on both sides every 12 m.
    if (Math.round((s - s0) / 6) % 2 === 0) {
      const c = Math.cos(rot);
      const sn = Math.sin(rot);
      for (const side of [-1, 1]) {
        gen.solidBox('concrete', cx + c * side * 6.9, y + roofH / 2, cz - sn * side * 6.9, 0.8, roofH, 0.8, rot);
      }
    }
    gen.batch(cx, cz, 'lights').box(cx, y + roofH - 0.02, cz, 0.4, 0.06, 4, rot, { top: false, bottom: true });
    gen.tunnelLights.push(new THREE.Vector3(cx, y + roofH - 0.3, cz));
  }
  const mid = road.pointAt((s0 + s1) / 2, 0, new THREE.Vector3());
  gen.hideSpots.push({ x: mid.x, z: mid.z, r: (s1 - s0) / 2, kind: 'tunnel', y: mid.y });
}

function lookout(gen, up) {
  const s = up[up.length - 1];
  const cx = s.x + 20;
  const cz = s.z + 35;
  gen.solidBox('concrete', cx, s.y - 0.5, cz, 34, 1.0, 34, 0.6, { kind: 'ground' });
  for (let k = 0; k < 8; k++) gen.props.add('fence', cx - 12 + k * 3.2, s.y, cz + 16.5, 0);
  gen.props.add('lamp', cx - 10, s.y, cz + 10, 0, { groundY: s.y });
  gen.props.add('lamp', cx + 10, s.y, cz + 10, 0, { groundY: s.y });
  gen.props.add('bench', cx, s.y, cz + 12, Math.PI);
  gen.airStations.push(new THREE.Vector3(cx - 8, s.y, cz - 4));
  gen.lookout = new THREE.Vector3(cx, s.y, cz);
}
