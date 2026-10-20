// Halcyon Bay city generator. Deterministic (fixed seeds): builds roads with lane markings,
// raised sidewalks with curbs, buildings with window shaders, and a box collider for every
// solid thing. Geometry is merged per 240 m chunk for cheap rendering and culling.
import * as THREE from 'three';
import { GeometryBatch } from './GeometryBatch.js';
import { RoadGraph } from './RoadGraph.js';
import * as M from './Materials.js';
import { RNG } from '../util/math.js';
import { G } from '../core/Physics.js';

export const ROAD_W = 16;
export const SIDEWALK_W = 5;
export const CURB_H = 0.12;
export const CHUNK = 240;

const WALL_COLORS = [
  [0.42, 0.43, 0.45], [0.55, 0.52, 0.48], [0.3, 0.33, 0.37], [0.5, 0.36, 0.3],
  [0.62, 0.6, 0.56], [0.22, 0.25, 0.3], [0.45, 0.47, 0.5], [0.36, 0.3, 0.28],
];

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
    this.root = new THREE.Group();
    this.root.name = 'city';
    this.scene.add(this.root);
    this.markings = new GeometryBatch({ color: true });
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
        road: new GeometryBatch(),
        sidewalk: new GeometryBatch(),
        concrete: new GeometryBatch(),
      };
      this.chunks.set(key, c);
    }
    return c;
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
  buildGrid(xs, zs, lotFn) {
    const g = this.graph;
    const nodes = [];
    for (let i = 0; i < xs.length; i++) {
      nodes[i] = [];
      for (let j = 0; j < zs.length; j++) nodes[i][j] = g.node(xs[i], 0, zs[j], 'grid');
    }
    const hw = ROAD_W / 2;
    // Intersections.
    for (let i = 0; i < xs.length; i++) {
      for (let j = 0; j < zs.length; j++) {
        const x = xs[i];
        const z = zs[j];
        this.chunk(x, z).road.flatRect(x, 0.02, z, ROAD_W, ROAD_W, 0, 8);
      }
    }
    // Segments along Z (north-south streets) and X (east-west avenues).
    for (let i = 0; i < xs.length; i++) {
      for (let j = 0; j < zs.length - 1; j++) {
        const x = xs[i];
        const z0 = zs[j] + hw;
        const z1 = zs[j + 1] - hw;
        this.roadSegment(x, z0, x, z1);
        g.edge(nodes[i][j], nodes[i][j + 1], [nodes[i][j], nodes[i][j + 1]], { name: streetName(i, 'ns') });
      }
    }
    for (let j = 0; j < zs.length; j++) {
      for (let i = 0; i < xs.length - 1; i++) {
        const z = zs[j];
        const x0 = xs[i] + hw;
        const x1 = xs[i + 1] - hw;
        this.roadSegment(x0, z, x1, z);
        g.edge(nodes[i][j], nodes[i + 1][j], [nodes[i][j], nodes[i + 1][j]], { name: streetName(j, 'ew') });
      }
    }
    // Lots.
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < zs.length - 1; j++) {
        const x0 = xs[i] + hw;
        const x1 = xs[i + 1] - hw;
        const z0 = zs[j] + hw;
        const z1 = zs[j + 1] - hw;
        const info = lotFn((x0 + x1) / 2, (z0 + z1) / 2, i, j);
        this.lot(x0, z0, x1, z1, info);
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
    // Sidewalk slab (curb is its side).
    c.sidewalk.box(cx, CURB_H / 2, cz, sx, CURB_H, sz, 0, { uvScale: 1 / 5 });
    this.physics.fixedBox(cx, CURB_H / 2, cz, sx / 2, CURB_H / 2, sz / 2, { kind: 'sidewalk', friction: 0.85, round: 0.06 });
    if (info.kind === 'empty') return;
    if (info.kind === 'plaza' || info.kind === 'park') {
      this.lotFeatures?.(info, x0, z0, x1, z1);
      return;
    }
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
    const style = info.style ?? (h > 80 ? (rng.chance(0.6) ? 2 : 1) : rng.pick([1, 1, 3, 3, 2]));
    const col = rng.pick(WALL_COLORS);
    const tint = rng.float(0.85, 1.1);
    b.setColor(col[0] * tint, col[1] * tint, col[2] * tint);
    const seed = rng.float(0, 100);
    const lit = info.lit ?? rng.float(0.25, 0.6);
    b.setFacade(seed, style, style === 4 ? 6 : 3.4, lit);
    const base = CURB_H;
    // Main mass (possibly with setback tiers on tall towers).
    let tiers = h > 70 && rng.chance(0.6) ? rng.int(2, 3) : 1;
    let tx = sx;
    let tz = sz;
    let y = base;
    let remaining = h;
    for (let t = 0; t < tiers; t++) {
      const th = t === tiers - 1 ? remaining : remaining * rng.float(0.45, 0.65);
      b.box(cx, y + th / 2, cz, tx, th, tz, 0, { baseY: base });
      this.physics.fixedBox(cx, y + th / 2, cz, tx / 2, th / 2, tz / 2, { kind: 'building' });
      this.buildings.push({ x: cx, z: cz, hx: tx / 2, hz: tz / 2, y0: y, h: th });
      y += th;
      remaining -= th;
      tx *= rng.float(0.65, 0.85);
      tz *= rng.float(0.65, 0.85);
    }
    const topY = y;
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
  const body = gen.physics.world.createRigidBody(R.RigidBodyDesc.fixed());
  const desc = R.ColliderDesc.convexHull(flat).setFriction(0.9).setCollisionGroups((G.RAMP << 16) | 0xffff);
  const col = gen.physics.world.createCollider(desc, body);
  gen.physics.meta.set(col.handle, { kind, surface: 'metal' });
  return mesh;
}
