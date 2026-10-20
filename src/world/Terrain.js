// Hillside terrain: a Rapier heightfield + matching mesh. Roads are carved into the slope
// (cut and fill) so the canyon road sits on a flat bench with natural embankments.
import * as THREE from 'three';
import * as Tex from './Textures.js';
import { smoothstep, clamp } from '../util/math.js';

function hash(x, z) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
export function fbm(x, z, oct = 5) {
  let v = 0;
  let a = 0.5;
  for (let i = 0; i < oct; i++) {
    v += a * vnoise(x, z);
    x = x * 2.03 + 17.1;
    z = z * 2.03 + 3.7;
    a *= 0.5;
  }
  return v;
}

export class Terrain {
  // roads: array of { pts: Vector3[], halfWidth }
  constructor(gen, { x0, x1, z0, z1, cell = 5, baseFn, roads = [] }) {
    this.gen = gen;
    this.x0 = x0;
    this.z0 = z0;
    this.cell = cell;
    this.nx = Math.round((x1 - x0) / cell);
    this.nz = Math.round((z1 - z0) / cell);
    this.x1 = x0 + this.nx * cell;
    this.z1 = z0 + this.nz * cell;
    this.baseFn = baseFn;
    this.roads = roads;
    this.buildRoadIndex();
    this.heights = new Float32Array((this.nx + 1) * (this.nz + 1));
    for (let ix = 0; ix <= this.nx; ix++) {
      for (let iz = 0; iz <= this.nz; iz++) {
        this.heights[ix * (this.nz + 1) + iz] = this.computeHeight(x0 + ix * cell, z0 + iz * cell);
      }
    }
  }

  buildRoadIndex() {
    this.segIndex = new Map();
    const C = 40;
    this.segCell = C;
    for (const r of this.roads) {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i];
        const b = r.pts[i + 1];
        const minx = Math.floor((Math.min(a.x, b.x) - 60) / C);
        const maxx = Math.floor((Math.max(a.x, b.x) + 60) / C);
        const minz = Math.floor((Math.min(a.z, b.z) - 60) / C);
        const maxz = Math.floor((Math.max(a.z, b.z) + 60) / C);
        for (let cx = minx; cx <= maxx; cx++) {
          for (let cz = minz; cz <= maxz; cz++) {
            const k = `${cx}_${cz}`;
            if (!this.segIndex.has(k)) this.segIndex.set(k, []);
            this.segIndex.get(k).push({ a, b, hw: r.halfWidth });
          }
        }
      }
    }
  }

  // Distance to nearest road centre line and the road's height there.
  nearestRoad(x, z) {
    const list = this.segIndex.get(`${Math.floor(x / this.segCell)}_${Math.floor(z / this.segCell)}`);
    let best = Infinity;
    let by = 0;
    let bhw = 0;
    if (!list) return { d: Infinity, y: 0, hw: 0 };
    for (const s of list) {
      const abx = s.b.x - s.a.x;
      const abz = s.b.z - s.a.z;
      const l2 = abx * abx + abz * abz || 1;
      let t = ((x - s.a.x) * abx + (z - s.a.z) * abz) / l2;
      t = clamp(t, 0, 1);
      const px = s.a.x + abx * t;
      const pz = s.a.z + abz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best) {
        best = d;
        by = s.a.y + (s.b.y - s.a.y) * t;
        bhw = s.hw;
      }
    }
    return { d: best, y: by, hw: bhw };
  }

  computeHeight(x, z) {
    const base = this.baseFn(x, z);
    const r = this.nearestRoad(x, z);
    if (r.d === Infinity) return base;
    const flat = r.hw + 2.5;
    const blend = 26;
    const roadY = r.y - 0.18;
    if (r.d <= flat) return roadY;
    const t = smoothstep(flat, flat + blend, r.d);
    return roadY + (base - roadY) * t;
  }

  heightAt(x, z) {
    const fx = (x - this.x0) / this.cell;
    const fz = (z - this.z0) / this.cell;
    if (fx < 0 || fz < 0 || fx > this.nx || fz > this.nz) return null;
    const ix = Math.min(this.nx - 1, Math.floor(fx));
    const iz = Math.min(this.nz - 1, Math.floor(fz));
    const tx = fx - ix;
    const tz = fz - iz;
    const H = (a, b) => this.heights[a * (this.nz + 1) + b];
    const h00 = H(ix, iz);
    const h10 = H(ix + 1, iz);
    const h01 = H(ix, iz + 1);
    const h11 = H(ix + 1, iz + 1);
    return h00 * (1 - tx) * (1 - tz) + h10 * tx * (1 - tz) + h01 * (1 - tx) * tz + h11 * tx * tz;
  }

  build() {
    const { nx, nz, cell, x0, z0 } = this;
    const verts = (nx + 1) * (nz + 1);
    const pos = new Float32Array(verts * 3);
    const uv = new Float32Array(verts * 2);
    const col = new Float32Array(verts * 3);
    for (let ix = 0; ix <= nx; ix++) {
      for (let iz = 0; iz <= nz; iz++) {
        const i = ix * (nz + 1) + iz;
        const x = x0 + ix * cell;
        const z = z0 + iz * cell;
        const y = this.heights[i];
        pos.set([x, y, z], i * 3);
        uv.set([x / 14, z / 14], i * 2);
      }
    }
    const idx = [];
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        const a = ix * (nz + 1) + iz;
        const b = (ix + 1) * (nz + 1) + iz;
        const c = (ix + 1) * (nz + 1) + iz + 1;
        const d = ix * (nz + 1) + iz + 1;
        idx.push(a, d, b, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;
    for (let i = 0; i < verts; i++) {
      const slope = 1 - nrm.getY(i);
      const y = pos[i * 3 + 1];
      const n = fbm(pos[i * 3] * 0.02, pos[i * 3 + 2] * 0.02, 3);
      // Grass on gentle slopes, rock on steep ones, dusty near roads.
      const g = smoothstep(0.12, 0.35, slope + (n - 0.5) * 0.2);
      const grass = [0.26, 0.33, 0.2];
      const rock = [0.5, 0.47, 0.44];
      const snow = smoothstep(150, 200, y);
      for (let k = 0; k < 3; k++) col[i * 3 + k] = (grass[k] * (1 - g) + rock[k] * g) * (0.75 + n * 0.5) * (1 - snow) + 0.8 * snow;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({ map: Tex.groundTex('rock'), vertexColors: true, roughness: 0.92, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'terrain';
    this.gen.addStatic(mesh, true);
    mesh.castShadow = false;
    // Collider.
    const center = { x: x0 + (nx * cell) / 2, y: 0, z: z0 + (nz * cell) / 2 };
    this.gen.physics.fixedHeightfield(nz, nx, this.heights, { x: nx * cell, y: 1, z: nz * cell }, center, { kind: 'terrain' });
    return mesh;
  }
}
