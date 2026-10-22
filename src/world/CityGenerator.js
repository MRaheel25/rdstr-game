// Halcyon Bay city generator. Deterministic (fixed seeds): builds roads with lane markings,
// raised sidewalks with curbs, buildings with window shaders, and a box collider for every
// solid thing. Geometry is merged per 240 m chunk for cheap rendering and culling.
import * as THREE from 'three';
import { GeometryBatch } from './GeometryBatch.js';
import { RoadGraph } from './RoadGraph.js';
import * as M from './Materials.js';
import { RNG } from '../util/math.js';
import { G } from '../core/Physics.js';

// V2: wider roads. Streets are 20 m (2 lanes each way, 4.7 m lanes); boulevards 28 m (3 lanes each way).
export const ROAD_W = 20;
export const BOULEVARD_W = 28;
export const SIDEWALK_W = 5;
export const CURB_H = 0.12;
export const CHUNK = 240;

const WALL_COLORS = [
  [0.3, 0.31, 0.33], [0.4, 0.38, 0.35], [0.2, 0.23, 0.27], [0.38, 0.26, 0.22],
  [0.46, 0.44, 0.41], [0.15, 0.17, 0.21], [0.33, 0.35, 0.38], [0.26, 0.22, 0.2],
];

// V2 modular building styles: base (podium), middle (facade style + colour palette, vertical
// fins) and top (crown). Combined per building so many different towers come from a few rules.
export const BUILDING_STYLES = {
  glassTower: { facade: 2, colors: [[0.16, 0.24, 0.3], [0.12, 0.18, 0.24], [0.2, 0.28, 0.32], [0.22, 0.24, 0.22]], podium: 0.6, fins: 0.45, crowns: ['spire', 'flat', 'stepped'] },
  office: { facade: 1, colors: WALL_COLORS, podium: 0.55, fins: 0.3, crowns: ['flat', 'stepped', 'flat'] },
  hotel: { facade: 3, colors: [[0.55, 0.5, 0.42], [0.48, 0.4, 0.34], [0.6, 0.58, 0.52], [0.42, 0.44, 0.48]], podium: 0.85, fins: 0, crowns: ['stepped', 'flat'] },
  brick: { facade: 3, colors: [[0.45, 0.24, 0.18], [0.5, 0.3, 0.22], [0.38, 0.2, 0.16], [0.52, 0.4, 0.3]], podium: 0, fins: 0, crowns: ['flat', 'tank'] },
  industrial: { facade: 4, colors: [[0.4, 0.4, 0.38], [0.32, 0.34, 0.36]], podium: 0, fins: 0, crowns: ['flat'] },
};
const PODIUM_COLORS = [[0.12, 0.12, 0.13], [0.62, 0.6, 0.56], [0.3, 0.2, 0.16], [0.18, 0.2, 0.24]];

function pickStyle(rng, info, h) {
  if (info.buildingStyles) return BUILDING_STYLES[rng.pick(info.buildingStyles)];
  if (info.style === 3) return rng.chance(0.5) ? BUILDING_STYLES.brick : BUILDING_STYLES.hotel;
  if (info.style === 4) return BUILDING_STYLES.industrial;
  if (h > 80) return rng.chance(0.6) ? BUILDING_STYLES.glassTower : BUILDING_STYLES.office;
  if (h > 40) return BUILDING_STYLES[rng.pick(['office', 'glassTower', 'hotel', 'office'])];
  return BUILDING_STYLES[rng.pick(['brick', 'office', 'hotel'])];
}

export class CityGenerator {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.physics = ctx.physics;
    this.graph = new RoadGraph();
    this.rng = new RNG(20260);
    this.chunks = new Map();
    this.staticMeshes = [];
    this.buildings = []; // { x, z, hx, hz, h, rot }
    this.Batch = GeometryBatch;
    this.groundHeight = () => 0;
    this.root = new THREE.Group();
    this.root.name = 'city';
    this.scene.add(this.root);
    this.markings = new GeometryBatch({ color: true });
    this.skyline = new GeometryBatch({ facade: true, color: true });
    this.steamSpots = [];
    this.fountains = [];
    this.airStations = [];
    this.hideSpots = [];
    this.jumps = [];
    this.lots = [];
    this.groundRoads = [];
    this.tunnelLights = [];
    this.tunnels = [];
    this.beacons = [];
  }

  chunk(x, z) {
    const key = `${Math.floor(x / CHUNK)}_${Math.floor(z / CHUNK)}`;
    let c = this.chunks.get(key);
    if (!c) {
      c = {
        key,
        cx: (Math.floor(x / CHUNK) + 0.5) * CHUNK,
        cz: (Math.floor(z / CHUNK) + 0.5) * CHUNK,
        buildings: new GeometryBatch({ facade: true, color: true }),
        containers: new GeometryBatch({ color: true }),
        road: new GeometryBatch(),
        sidewalk: new GeometryBatch(),
        concrete: new GeometryBatch(),
      };
      this.chunks.set(key, c);
    }
    return c;
  }

  // Lazily created per-chunk batch by material name.
  batch(x, z, name, opts = {}) {
    const c = this.chunk(x, z);
    if (!c[name]) c[name] = new GeometryBatch(opts);
    return c[name];
  }

  // Static box with matching collider in one call.
  solidBox(batchName, cx, cy, cz, sx, sy, sz, rot = 0, opts = {}) {
    const b = this.batch(cx, cz, batchName, opts.batchOpts || {});
    if (opts.color) b.setColor(...opts.color);
    b.box(cx, cy, cz, sx, sy, sz, rot, { uvScale: opts.uvScale ?? 0.25 });
    this.physics.fixedBox(cx, cy, cz, sx / 2, sy / 2, sz / 2, {
      kind: opts.kind || 'building', rotation: rot ? { x: 0, y: Math.sin(rot / 2), z: 0, w: Math.cos(rot / 2) } : undefined,
      friction: opts.friction,
    });
  }

  addStatic(mesh, hasCollider, { shadows = true } = {}) {
    mesh.userData.static = true;
    mesh.userData.hasCollider = hasCollider;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    if (shadows) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    this.root.add(mesh);
    this.staticMeshes.push(mesh);
    return mesh;
  }

  // -----------------------------------------------------------------------------
  build(layout) {
    this.buildGround(layout.groundSize || 3000);
    this.buildGrid(layout.xs, layout.zs, layout.lotFn || (() => ({ kind: 'downtown' })));
    if (layout.extras) layout.extras(this);
    this.finalize();
    return this;
  }

  buildGround(size) {
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size / 12, uv.getY(i) * size / 12);
    const mesh = new THREE.Mesh(geo, M.groundMaterial('concrete'));
    mesh.position.y = -0.01;
    this.addStatic(mesh, true, { shadows: false });
    mesh.receiveShadow = true;
    this.physics.fixedBox(0, -1, 0, size / 2, 1, size / 2, { kind: 'ground', friction: 0.9 });
  }

  // Street grid with intersections, crosswalks, lane markings, sidewalks and building lots.
  // widthFn(axis, index) gives each street's width ('ns' = the street at xs[i], 'ew' = zs[j]).
  buildGrid(xs, zs, lotFn, widthFn = () => ROAD_W) {
    const g = this.graph;
    const nodes = [];
    for (let i = 0; i < xs.length; i++) {
      nodes[i] = [];
      for (let j = 0; j < zs.length; j++) nodes[i][j] = g.node(xs[i], 0, zs[j], 'grid');
    }
    const wx = xs.map((_, i) => widthFn('ns', i));
    const wz = zs.map((_, j) => widthFn('ew', j));
    this.gridW = { xs, zs, wx, wz };
    const lanesFor = (w) => (w >= BOULEVARD_W - 0.1 ? 3 : 2);
    // Intersections.
    for (let i = 0; i < xs.length; i++) {
      for (let j = 0; j < zs.length; j++) {
        this.chunk(xs[i], zs[j]).road.flatRect(xs[i], 0.02, zs[j], wx[i], wz[j], 0, 8);
      }
    }
    // Segments along Z (north-south streets) and X (east-west avenues).
    for (let i = 0; i < xs.length; i++) {
      for (let j = 0; j < zs.length - 1; j++) {
        const x = xs[i];
        const lanes = lanesFor(wx[i]);
        this.roadSegment(x, zs[j] + wz[j] / 2, x, zs[j + 1] - wz[j + 1] / 2, { width: wx[i], lanes });
        g.edge(nodes[i][j], nodes[i][j + 1], [nodes[i][j], nodes[i][j + 1]], { name: streetName(i, 'ns'), lanes, laneWidth: (wx[i] / 2 - 0.6) / lanes });
      }
    }
    for (let j = 0; j < zs.length; j++) {
      for (let i = 0; i < xs.length - 1; i++) {
        const z = zs[j];
        const lanes = lanesFor(wz[j]);
        this.roadSegment(xs[i] + wx[i] / 2, z, xs[i + 1] - wx[i + 1] / 2, z, { width: wz[j], lanes });
        g.edge(nodes[i][j], nodes[i + 1][j], [nodes[i][j], nodes[i + 1][j]], { name: streetName(j, 'ew'), lanes, laneWidth: (wz[j] / 2 - 0.6) / lanes });
      }
    }
    // Lots.
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < zs.length - 1; j++) {
        const x0 = xs[i] + wx[i] / 2;
        const x1 = xs[i + 1] - wx[i + 1] / 2;
        const z0 = zs[j] + wz[j] / 2;
        const z1 = zs[j + 1] - wz[j + 1] / 2;
        const info = lotFn((x0 + x1) / 2, (z0 + z1) / 2, i, j);
        this.lot(x0, z0, x1, z1, { i, j, ...info });
      }
    }
  }

  // Straight road segment between road-edge points (axis aligned or not).
  roadSegment(x0, z0, x1, z1, { lanes = 2, width = ROAD_W, y = 0.02, crosswalks = true } = {}) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const rot = Math.atan2(dx, dz);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    this.chunk(cx, cz).road.flatRect(cx, y, cz, width, len, rot, 8);
    // Markings in segment-local frame: along = local z.
    const dirX = dx / len;
    const dirZ = dz / len;
    const rX = dirZ; // right vector (perpendicular in XZ)
    const rZ = -dirX;
    const mk = this.markings;
    const yy = y + 0.012;
    const strip = (off, s0, s1, w, color) => {
      mk.setColor(...color);
      const a = s0 - len / 2;
      const b = s1 - len / 2;
      const p = (o, s) => new THREE.Vector3(cx + rX * o + dirX * s, yy, cz + rZ * o + dirZ * s);
      mk.quad(p(off - w / 2, a), p(off + w / 2, a), p(off + w / 2, b), p(off - w / 2, b), [[0, 0], [1, 0], [1, 1], [0, 1]], new THREE.Vector3(0, 1, 0));
    };
    const white = [0.85, 0.85, 0.82];
    const yellow = [0.9, 0.65, 0.12];
    const cw = crosswalks ? 4.5 : 0;
    // Double yellow center line.
    strip(-0.18, cw, len - cw, 0.14, yellow);
    strip(0.18, cw, len - cw, 0.14, yellow);
    // Edge lines.
    const edge = width / 2 - 0.6;
    strip(-edge, cw, len - cw, 0.15, white);
    strip(edge, cw, len - cw, 0.15, white);
    // Dashed lane dividers.
    if (lanes >= 2) {
      const laneW = (width / 2 - 0.6) / lanes;
      for (let l = 1; l < lanes; l++) {
        for (const sgn of [-1, 1]) {
          for (let s = cw + 2; s < len - cw - 3; s += 9) strip(sgn * laneW * l, s, s + 3, 0.13, white);
        }
      }
    }
    if (crosswalks && len > 20) {
      for (const s0 of [0.6, len - 4.1]) {
        for (let o = -width / 2 + 1; o < width / 2 - 0.5; o += 1.2) strip(o + 0.3, s0, s0 + 3.4, 0.6, white);
        // stop lines
      }
      strip(-width / 4, 4.2, 4.6, width / 2 - 1, white);
      strip(width / 4, len - 4.6, len - 4.2, width / 2 - 1, white);
      // Turn arrows painted before intersections.
      this.arrow(cx + rX * (width / 4) + dirX * (len / 2 - 9), cz + rZ * (width / 4) + dirZ * (len / 2 - 9), dirX, dirZ, yy);
      this.arrow(cx - rX * (width / 4) - dirX * (len / 2 - 9), cz - rZ * (width / 4) - dirZ * (len / 2 - 9), -dirX, -dirZ, yy);
    }
  }

  arrow(x, z, dx, dz, y) {
    const mk = this.markings;
    mk.setColor(0.85, 0.85, 0.82);
    const rx = dz;
    const rz = -dx;
    const p = (o, s) => new THREE.Vector3(x + rx * o + dx * s, y, z + rz * o + dz * s);
    const n = new THREE.Vector3(0, 1, 0);
    mk.quad(p(-0.15, -2.2), p(0.15, -2.2), p(0.15, 0.4), p(-0.15, 0.4), [[0, 0], [1, 0], [1, 1], [0, 1]], n);
    mk.tri(p(-0.6, 0.4), p(0.6, 0.4), p(0, 1.6), [[0, 0], [1, 0], [0.5, 1]]);
  }

  // A city lot: raised sidewalk slab plus buildings (with alleys between them).
  lot(x0, z0, x1, z1, info) {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const sx = x1 - x0;
    const sz = z1 - z0;
    const c = this.chunk(cx, cz);
    this.lots.push({ x0, z0, x1, z1, info });
    // Sidewalk slab (curb is its side).
    c.sidewalk.box(cx, CURB_H / 2, cz, sx, CURB_H, sz, 0, { uvScale: 1 / 5 });
    this.physics.fixedBox(cx, CURB_H / 2, cz, sx / 2, CURB_H / 2, sz / 2, { kind: 'sidewalk', friction: 0.85, round: 0.06 });
    if (info.kind === 'empty') return;
    if (info.kind !== 'downtown') return;
    const inset = SIDEWALK_W;
    const bx0 = x0 + inset;
    const bx1 = x1 - inset;
    const bz0 = z0 + inset;
    const bz1 = z1 - inset;
    const rng = this.rng;
    const split = rng.next();
    const alley = 7;
    const parcels = [];
    const mx = (bx0 + bx1) / 2;
    const mz = (bz0 + bz1) / 2;
    if (split < 0.25) parcels.push([bx0, bz0, bx1, bz1]);
    else if (split < 0.55) {
      parcels.push([bx0, bz0, mx - alley / 2, bz1], [mx + alley / 2, bz0, bx1, bz1]);
    } else if (split < 0.75) {
      parcels.push([bx0, bz0, bx1, mz - alley / 2], [bx0, mz + alley / 2, bx1, bz1]);
    } else {
      parcels.push(
        [bx0, bz0, mx - alley / 2, mz - alley / 2], [mx + alley / 2, bz0, bx1, mz - alley / 2],
        [bx0, mz + alley / 2, mx - alley / 2, bz1], [mx + alley / 2, mz + alley / 2, bx1, bz1],
      );
    }
    for (const p of parcels) this.building(p[0], p[1], p[2], p[3], info);
  }

  // A building on a parcel: main mass, optional setbacks, crown, rooftop units, antenna.
  building(x0, z0, x1, z1, info) {
    const rng = this.rng;
    const inset = rng.float(0, 2.5);
    x0 += inset;
    z0 += inset;
    x1 -= inset;
    z1 -= inset;
    const sx = x1 - x0;
    const sz = z1 - z0;
    if (sx < 6 || sz < 6) return;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const c = this.chunk(cx, cz);
    const b = c.buildings;
    const [hMin, hMax] = info.height || [20, 70];
    let h = rng.float(hMin, hMax);
    if (info.tallChance && rng.chance(info.tallChance)) h *= rng.float(1.6, 2.4);
    h = Math.round(h / 3.4) * 3.4 + 0.6;
    const kit = pickStyle(rng, info, h);
    const style = info.style ?? kit.facade;
    const col = rng.pick(kit.colors);
    const tint = rng.float(0.85, 1.1);
    b.setColor(col[0] * tint, col[1] * tint, col[2] * tint);
    const seed = rng.float(0, 100);
    const lit = info.lit ?? rng.float(0.25, 0.6);
    b.setFacade(seed, style, style === 4 ? 6 : 3.4, lit);
    let base = CURB_H;
    // Base: a podium with a contrasting colour and a canopy line over the shop fronts.
    if (rng.chance(kit.podium) && h > 18) {
      const pc = rng.pick(PODIUM_COLORS);
      const ph = 4.6;
      b.setColor(...pc);
      b.setFacade(seed + 1, 1, 4.6, 0.8);
      b.box(cx, base + ph / 2, cz, sx + 1.2, ph, sz + 1.2, 0, { baseY: base });
      this.physics.fixedBox(cx, base + ph / 2, cz, (sx + 1.2) / 2, ph / 2, (sz + 1.2) / 2, { kind: 'building' });
      this.batch(cx, cz, 'darkMetal').box(cx, base + ph + 0.12, cz, sx + 2.4, 0.24, sz + 2.4, 0);
      b.setColor(col[0] * tint, col[1] * tint, col[2] * tint);
      b.setFacade(seed, style, style === 4 ? 6 : 3.4, lit);
    }
    // Main mass (possibly with setback tiers on tall towers).
    let tiers = h > 70 && rng.chance(0.6) ? rng.int(2, 3) : 1;
    let tx = sx;
    let tz = sz;
    let y = base;
    let remaining = h;
    for (let t = 0; t < tiers; t++) {
      const th = t === tiers - 1 ? remaining : remaining * rng.float(0.45, 0.65);
      b.box(cx, y + th / 2, cz, tx, th, tz, 0, { baseY: base });
      // Low-detail copy for the distant skyline (slightly inset so it hides inside when near).
      this.skyline.curColor = b.curColor;
      this.skyline.curFacade = b.curFacade;
      this.skyline.box(cx, y + th / 2 - 0.2, cz, tx - 0.8, th - 0.4, tz - 0.8, 0, { baseY: base - 0.4 });
      this.physics.fixedBox(cx, y + th / 2, cz, tx / 2, th / 2, tz / 2, { kind: 'building' });
      this.buildings.push({ x: cx, z: cz, hx: tx / 2, hz: tz / 2, y0: y, h: th });
      y += th;
      remaining -= th;
      tx *= rng.float(0.65, 0.85);
      tz *= rng.float(0.65, 0.85);
    }
    const topY = y;
    // Middle: vertical fins on the main facade (no colliders, they barely protrude).
    if (kit.fins && rng.chance(kit.fins)) {
      const fb = this.batch(cx, cz, 'darkMetal');
      const step = rng.pick([2.7, 3.2, 5.4]);
      const fh = Math.min(h, topY - base) - 1;
      for (let u = -sx / 2 + step / 2; u < sx / 2; u += step) {
        fb.box(cx + u, base + 1 + fh / 2 + 4.6, cz + sz / 2 + 0.15, 0.22, fh - 4.6, 0.3, 0);
        fb.box(cx + u, base + 1 + fh / 2 + 4.6, cz - sz / 2 - 0.15, 0.22, fh - 4.6, 0.3, 0);
      }
      for (let u = -sz / 2 + step / 2; u < sz / 2; u += step) {
        fb.box(cx + sx / 2 + 0.15, base + 1 + fh / 2 + 4.6, cz + u, 0.3, fh - 4.6, 0.22, 0);
        fb.box(cx - sx / 2 - 0.15, base + 1 + fh / 2 + 4.6, cz + u, 0.3, fh - 4.6, 0.22, 0);
      }
    }
    // Top: crown variants.
    const crown = rng.pick(kit.crowns);
    if (crown === 'stepped') {
      b.setFacade(seed, 0, 3.4, 0);
      let w = tx;
      let d = tz;
      let yy = topY;
      for (let k = 0; k < 3; k++) {
        w *= 0.8;
        d *= 0.8;
        b.setColor(col[0] * (0.8 - k * 0.1), col[1] * (0.8 - k * 0.1), col[2] * (0.8 - k * 0.1));
        b.box(cx, yy + 1.4, cz, w, 2.8, d, 0);
        this.physics.fixedBox(cx, yy + 1.4, cz, w / 2, 1.4, d / 2, { kind: 'building' });
        yy += 2.8;
      }
    } else if (crown === 'spire' && h > 60) {
      const sh = rng.float(14, 30);
      b.setFacade(seed, 0, 3.4, 0);
      b.setColor(0.7, 0.72, 0.75);
      b.box(cx, topY + sh / 2, cz, 1.2, sh, 1.2, 0);
      this.beacons.push(new THREE.Vector3(cx, topY + sh + 0.4, cz));
    } else if (crown === 'tank') {
      b.setFacade(seed, 0, 3.4, 0);
      b.setColor(0.42, 0.3, 0.2);
      const tx0 = cx + rng.float(-tx * 0.2, tx * 0.2);
      const tz0 = cz + rng.float(-tz * 0.2, tz * 0.2);
      b.box(tx0, topY + 4.5, tz0, 3.2, 3.4, 3.2, Math.PI / 4);
      b.setColor(0.2, 0.2, 0.22);
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(tx0 + ox, topY + 1.4, tz0 + oz, 0.2, 2.8, 0.2, 0);
    }
    // Beveled crown / parapet.
    b.setFacade(seed, 0, 3.4, 0);
    b.setColor(col[0] * 0.7, col[1] * 0.7, col[2] * 0.7);
    const crownH = rng.float(0.8, 2.2);
    b.box(cx, topY + crownH / 2, cz, tx * 0.96, crownH, tz * 0.96, 0);
    this.physics.fixedBox(cx, topY + crownH / 2, cz, (tx * 0.96) / 2, crownH / 2, (tz * 0.96) / 2, { kind: 'building' });
    // Rooftop units.
    const units = rng.int(1, 4);
    for (let u = 0; u < units; u++) {
      const ux = cx + rng.float(-tx * 0.3, tx * 0.3);
      const uz = cz + rng.float(-tz * 0.3, tz * 0.3);
      const us = rng.float(2, 5);
      const uh = rng.float(1.5, 3.5);
      b.setColor(0.35, 0.36, 0.38);
      b.box(ux, topY + crownH + uh / 2, uz, us, uh, us * rng.float(0.6, 1.4), 0);
      this.physics.fixedBox(ux, topY + crownH + uh / 2, uz, us / 2, uh / 2, (us * 0.7) / 2, { kind: 'building' });
    }
    // Helipad or antenna on tall towers.
    if (h > 90) {
      if (rng.chance(0.5)) {
        this.helipads = this.helipads || [];
        this.helipads.push(new THREE.Vector3(cx, topY + crownH, cz));
      } else {
        const ah = rng.float(10, 26);
        b.setColor(0.25, 0.25, 0.27);
        b.box(cx, topY + crownH + ah / 2, cz, 0.6, ah, 0.6, 0);
        this.antennas = this.antennas || [];
        this.antennas.push(new THREE.Vector3(cx, topY + crownH + ah, cz));
      }
    }
    // Neon sign anchors for shop fronts / billboards (filled by WorldDecor).
    this.signSpots = this.signSpots || [];
    if (rng.chance(info.neon ?? 0.5)) {
      const side = rng.int(0, 3);
      const nx = [0, 1, 0, -1][side];
      const nz = [1, 0, -1, 0][side];
      const along = side % 2 === 0 ? sx : sz;
      this.signSpots.push({
        x: cx + nx * (sx / 2 + 0.25), z: cz + nz * (sz / 2 + 0.25), y: rng.float(5.5, Math.min(h - 3, 26)),
        nx, nz, width: Math.min(along * 0.7, rng.float(6, 14)), brand: rng.int(0, 99),
        vertical: rng.chance(0.3),
      });
    }
  }

  // Turn chunk batches into meshes.
  finalize() {
    const bmat = M.buildingMaterial();
    for (const c of this.chunks.values()) {
      if (!c.buildings.empty) this.addStatic(new THREE.Mesh(c.buildings.toGeometry(), bmat), true);
      if (!c.road.empty) {
        const m = this.addStatic(new THREE.Mesh(c.road.toGeometry(), M.roadMaterial()), true);
        m.castShadow = false;
      }
      if (!c.sidewalk.empty) {
        const m = this.addStatic(new THREE.Mesh(c.sidewalk.toGeometry(), M.sidewalkMaterial()), true);
        m.castShadow = false;
      }
      if (!c.concrete.empty) this.addStatic(new THREE.Mesh(c.concrete.toGeometry(), M.concreteMaterial()), true);
      if (c.deck && !c.deck.empty) this.addStatic(new THREE.Mesh(c.deck.toGeometry(), M.concreteMaterial()), true);
      if (c.dirt && !c.dirt.empty) {
        const m = this.addStatic(new THREE.Mesh(c.dirt.toGeometry(), M.groundMaterial('dirt')), true);
        m.castShadow = false;
      }
      if (c.rail && !c.rail.empty) this.addStatic(new THREE.Mesh(c.rail.toGeometry(), M.metalMaterial(0x9aa0a6)), true);
      if (c.containers && !c.containers.empty) this.addStatic(new THREE.Mesh(c.containers.toGeometry(), M.containerMaterial()), true);
      if (c.steel && !c.steel.empty) this.addStatic(new THREE.Mesh(c.steel.toGeometry(), M.metalMaterial(0xb06a2a)), true);
      if (c.darkMetal && !c.darkMetal.empty) this.addStatic(new THREE.Mesh(c.darkMetal.toGeometry(), M.metalMaterial(0x30343a)), true);
      if (c.yellow && !c.yellow.empty) this.addStatic(new THREE.Mesh(c.yellow.toGeometry(), M.metalMaterial(0xd8a020)), true);
      if (c.grass && !c.grass.empty) {
        const m = this.addStatic(new THREE.Mesh(c.grass.toGeometry(), M.groundMaterial('grass')), true);
        m.castShadow = false;
      }
      if (c.lights && !c.lights.empty) {
        const m = this.addStatic(new THREE.Mesh(c.lights.toGeometry(), M.emissiveMaterial(0xdfeeff, 3.2)), false, { shadows: false });
        m.userData.decal = true;
      }
      // V2 landmark trims.
      if (c.policeBlue && !c.policeBlue.empty) this.addStatic(new THREE.Mesh(c.policeBlue.toGeometry(), M.emissiveMaterial(0x2a5cff, 3)), false, { shadows: false }).userData.decal = true;
      if (c.chargeGlow && !c.chargeGlow.empty) this.addStatic(new THREE.Mesh(c.chargeGlow.toGeometry(), M.emissiveMaterial(0x40e8ff, 2.4)), false, { shadows: false }).userData.decal = true;
      if (c.metalPole && !c.metalPole.empty) this.addStatic(new THREE.Mesh(c.metalPole.toGeometry(), M.metalMaterial(0xc0c4c8)), true);
      if (c.paint && !c.paint.empty) {
        const m = this.addStatic(new THREE.Mesh(c.paint.toGeometry(), M.paintedMaterial()), true);
        m.castShadow = true;
      }
    }
    if (!this.skyline.empty) {
      const m = new THREE.Mesh(this.skyline.toGeometry(), M.buildingMaterial());
      m.name = 'skyline';
      m.userData.decal = true; // the detailed chunk meshes carry the colliders
      m.matrixAutoUpdate = false;
      m.receiveShadow = false;
      this.root.add(m);
      this.skylineMesh = m;
    }
    if (!this.markings.empty) {
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.5, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      });
      const m = this.addStatic(new THREE.Mesh(this.markings.toGeometry(), mat), false, { shadows: false });
      m.receiveShadow = true;
      m.userData.decal = true;
    }
  }
}

const NS_NAMES = ['Harbor Ave', 'Pike St', 'Volta Ave', 'Main St', 'Faraday Blvd', 'Tesla Way', 'Kepler St', 'Ohm St', 'Ampere Ave', 'Coil St', 'Arc Ave'];
const EW_NAMES = ['Bay Rd', '1st St', '2nd St', 'Neon Ave', 'Market St', 'Grid Ave', 'Copper St', 'Signal Rd', 'Fuse St', 'Ridge Rd', 'Pier Rd'];
function streetName(i, dir) {
  const arr = dir === 'ns' ? NS_NAMES : EW_NAMES;
  return arr[i % arr.length];
}

// Used by the test-block layout in milestone 1 and as a building block for districts.
export function addRamp(gen, x, z, rot, { width = 6, length = 14, height = 3.2, kind = 'ramp', material = null } = {}) {
  // Wedge: rises from 0 at the start (local -z side... we use +z forward along `rot`).
  const hw = width / 2;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const P = (lx, ly, lz) => new THREE.Vector3(x + lx * c + lz * s, ly, z - lx * s + lz * c);
  const pts = [
    P(-hw, 0, 0), P(hw, 0, 0), P(-hw, 0, length), P(hw, 0, length),
    P(-hw, height, length), P(hw, height, length),
  ];
  const b = new GeometryBatch();
  const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
  b.quad(pts[1], pts[0], pts[4], pts[5], [[width / 4, 0], [0, 0], [0, length / 4], [width / 4, length / 4]]);
  b.quad(pts[2], pts[3], pts[5], pts[4], uv);
  b.tri(pts[0], pts[2], pts[4], [[0, 0], [1, 0], [1, 1]]);
  b.tri(pts[1], pts[5], pts[3], [[0, 0], [1, 1], [1, 0]]);
  const mesh = new THREE.Mesh(b.toGeometry(), material || M.metalMaterial(0x5a5f66));
  gen.addStatic(mesh, true);
  const flat = new Float32Array(pts.flatMap((p) => [p.x, p.y, p.z]));
  const R = gen.physics.R;
  const body = gen.physics.staticBody;
  const desc = R.ColliderDesc.convexHull(flat).setFriction(0.9).setCollisionGroups((G.RAMP << 16) | 0xffff);
  const col = gen.physics.world.createCollider(desc, body);
  gen.physics.meta.set(col.handle, { kind, surface: 'metal' });
  return mesh;
}
