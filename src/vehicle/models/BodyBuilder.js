// Loft-based car body generator.
// A design is a set of longitudinal crease lines (half-width w and height y at stations
// along z, front = -z). Lines are spline-interpolated along the car for flowing curves;
// the surface between two adjacent lines is a "band" with its own vertices so creases stay
// crisp. Side bands get exact wheel-arch cut-outs. Output: BufferGeometry per material
// (mirrored to both sides), plus separate door panels.
import * as THREE from 'three';

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// Interpolates station values at arbitrary z with a Catmull-Rom spline.
export function sampler(zs, vals) {
  return (z) => {
    if (z <= zs[0]) return vals[0];
    if (z >= zs[zs.length - 1]) return vals[vals.length - 1];
    let i = 0;
    while (i < zs.length - 2 && zs[i + 1] < z) i++;
    const t = (z - zs[i]) / (zs[i + 1] - zs[i]);
    const v0 = vals[Math.max(0, i - 1)];
    const v1 = vals[i];
    const v2 = vals[i + 1];
    const v3 = vals[Math.min(vals.length - 1, i + 2)];
    return catmull(v0, v1, v2, v3, t);
  };
}

class Mesher {
  constructor() {
    this.pos = [];
    this.uv = [];
    this.idx = [];
  }
  get count() {
    return this.pos.length / 3;
  }
  // grid[i][j] = Vector3, i along z, j across; quads skipped when a vertex is null.
  grid(grid, flip = false, uvScale = 1) {
    const base = this.count;
    const rows = grid.length;
    const cols = grid[0].length;
    const map = [];
    for (let i = 0; i < rows; i++) {
      map[i] = [];
      for (let j = 0; j < cols; j++) {
        const p = grid[i][j];
        if (!p) {
          map[i][j] = -1;
          continue;
        }
        map[i][j] = this.count;
        this.pos.push(p.x, p.y, p.z);
        this.uv.push(p.z * uvScale, p.y * uvScale + p.x * uvScale);
      }
    }
    for (let i = 0; i < rows - 1; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = map[i][j];
        const b = map[i + 1][j];
        const c = map[i + 1][j + 1];
        const d = map[i][j + 1];
        if (a < 0 || b < 0 || c < 0 || d < 0) continue;
        if (flip) this.idx.push(a, d, c, a, c, b);
        else this.idx.push(a, b, c, a, c, d);
      }
    }
    return base;
  }
  tris(points, triangles, flip = false) {
    const base = this.count;
    for (const p of points) {
      this.pos.push(p.x, p.y, p.z);
      this.uv.push(p.x, p.y);
    }
    for (const t of triangles) {
      if (flip) this.idx.push(base + t[0], base + t[2], base + t[1]);
      else this.idx.push(base + t[0], base + t[1], base + t[2]);
    }
  }
  // Mirror across x = 0 (duplicate with flipped winding).
  mirrored() {
    const m = new Mesher();
    const n = this.count;
    m.pos = this.pos.slice();
    m.uv = this.uv.slice();
    m.idx = this.idx.slice();
    for (let i = 0; i < n; i++) {
      m.pos.push(-this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      m.uv.push(this.uv[i * 2], this.uv[i * 2 + 1]);
    }
    for (let k = 0; k < this.idx.length; k += 3) m.idx.push(this.idx[k] + n, this.idx[k + 2] + n, this.idx[k + 1] + n);
    return m;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

// design: {
//   z: stations, lines: { name: { w:[], y:[] } }, order: [line names bottom->top on the side],
//   bands: [{ a, b, mat, steps, arches, bulge }], top: [{ a, b, mat, steps, crown, zRange:[z0,z1] }],
//   arches: [{ z, y, r }], door: { z0, z1, bands: [band indices] }, zStep
// }
export function buildBody(design) {
  const S = {};
  for (const [name, l] of Object.entries(design.lines)) {
    S[name] = { w: sampler(design.z, l.w || l.y.map(() => 0)), y: sampler(design.z, l.y) };
  }
  const zF = design.z[0];
  const zR = design.z[design.z.length - 1];
  // Longitudinal samples: fine near arches.
  const zs = [];
  const step = design.zStep ?? 0.06;
  for (let z = zF; z < zR - 1e-4;) {
    zs.push(z);
    const nearArch = design.arches.some((a) => Math.abs(z - a.z) < a.r + 0.08);
    z += nearArch ? step / 3 : step;
  }
  zs.push(zR);
  // Make sure range boundaries (door edges, glass edges) are exact samples.
  const extra = [];
  if (design.door) extra.push(design.door.z0, design.door.z1);
  for (const t of design.top) if (t.zRange) extra.push(...t.zRange);
  for (const e of extra) if (!zs.some((z) => Math.abs(z - e) < 1e-4)) zs.push(e);
  zs.sort((a, b) => a - b);

  const meshers = new Map();
  const get = (mat) => {
    if (!meshers.has(mat)) meshers.set(mat, new Mesher());
    return meshers.get(mat);
  };
  const doorMesh = new Map();
  const getDoor = (mat) => {
    if (!doorMesh.has(mat)) doorMesh.set(mat, new Mesher());
    return doorMesh.get(mat);
  };

  const archTop = (z) => {
    let top = -Infinity;
    for (const a of design.arches) {
      const dz = z - a.z;
      if (Math.abs(dz) < a.r) top = Math.max(top, a.y + Math.sqrt(a.r * a.r - dz * dz));
    }
    return top;
  };

  // Side bands (x = interpolated width between the two crease lines).
  design.bands.forEach((band, bi) => {
    const A = S[band.a];
    const B = S[band.b];
    const steps = band.steps ?? 2;
    const inDoor = design.door && design.door.bands.includes(bi);
    const build = (z0, z1, target) => {
      const grid = [];
      for (const z of zs) {
        if (z < z0 - 1e-5 || z > z1 + 1e-5) continue;
        const ya = A.y(z);
        const yb = B.y(z);
        const wa = A.w(z);
        const wb = B.w(z);
        let lo = ya;
        if (band.arches) lo = Math.max(ya, Math.min(yb, archTop(z)));
        const row = [];
        if (yb - lo < 1e-3) {
          for (let j = 0; j <= steps; j++) row.push(null);
        } else {
          for (let j = 0; j <= steps; j++) {
            const y = lo + ((yb - lo) * j) / steps;
            const t = (y - ya) / Math.max(1e-6, yb - ya);
            const bul = (band.bulge || 0) * Math.sin(Math.PI * t);
            row.push(new THREE.Vector3(wa + (wb - wa) * t + bul, y, z));
          }
        }
        grid.push(row);
      }
      if (grid.length > 1) target.grid(grid, true, band.uvScale ?? 1);
    };
    if (inDoor) {
      build(zF, design.door.z0, get(band.mat));
      build(design.door.z0, design.door.z1, getDoor(band.mat));
      build(design.door.z1, zR, get(band.mat));
    } else build(zF, zR, get(band.mat));
  });

  // Top surfaces (lofted across toward the centre line with an optional crown).
  for (const top of design.top) {
    const A = S[top.a];
    const B = S[top.b];
    const steps = top.steps ?? 3;
    const z0 = top.zRange ? top.zRange[0] : zF;
    const z1 = top.zRange ? top.zRange[1] : zR;
    const grid = [];
    for (const z of zs) {
      if (z < z0 - 1e-5 || z > z1 + 1e-5) continue;
      const row = [];
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        const x = A.w(z) + (B.w(z) - A.w(z)) * t;
        const y = A.y(z) + (B.y(z) - A.y(z)) * t + (top.crown || 0) * Math.sin(Math.PI * t);
        row.push(new THREE.Vector3(x, y, z));
      }
      grid.push(row);
    }
    if (grid.length > 1) get(top.mat).grid(grid, true, top.uvScale ?? 1);
  }

  // Front and rear caps from the section polygons (right half; mirrored later).
  const capSection = (z) => {
    const pts = [new THREE.Vector2(0, S[design.order[0]].y(z))];
    for (const name of design.order) {
      const w = S[name].w(z);
      if (w < 1e-4 && name === design.order[design.order.length - 1]) pts.push(new THREE.Vector2(0, S[name].y(z)));
      else pts.push(new THREE.Vector2(w, S[name].y(z)));
    }
    // Remove consecutive duplicates.
    return pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 1e-4);
  };
  for (const [z, mat, nz] of [[zF, design.frontCapMat || 'black', -1], [zR, design.rearCapMat || 'black', 1]]) {
    const sec = capSection(z);
    const p3 = sec.map((p) => new THREE.Vector3(p.x, p.y, z));
    const tri = THREE.ShapeUtils.triangulateShape(sec, []).map((t) => {
      const a = p3[t[0]];
      const b = p3[t[1]];
      const c = p3[t[2]];
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      return n.z * nz >= 0 ? t : [t[0], t[2], t[1]];
    });
    get(mat).tris(p3, tri, false);
  }

  const out = {};
  for (const [mat, m] of meshers) out[mat] = m.mirrored().geometry();
  const doors = {};
  for (const [mat, m] of doorMesh) {
    doors[mat] = m.geometry();
  }
  return { geometries: out, doors, sample: S, zs };
}
