// Accumulates static geometry (quads, boxes, prisms) into a single BufferGeometry so
// each city chunk renders in a handful of draw calls.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class GeometryBatch {
  constructor({ facade = false, color = false } = {}) {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.facade = facade ? [] : null; // vec4 per vertex: seed, style, floorHeight, litProb
    this.col = color ? [] : null;
    this.idx = [];
    this.count = 0;
    this.curFacade = [0, 0, 3.4, 0.4];
    this.curColor = [1, 1, 1];
  }

  get empty() {
    return this.count === 0;
  }

  setFacade(seed, style, floorH, lit) {
    this.curFacade = [seed, style, floorH, lit];
  }

  setColor(r, g, b) {
    this.curColor = [r, g, b];
  }

  vertex(p, n, u, v) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    if (this.facade) this.facade.push(...this.curFacade);
    if (this.col) this.col.push(...this.curColor);
    return this.count++;
  }

  // Quad p0..p3 counter-clockwise when seen from the front; uvs: [[u,v] x4].
  quad(p0, p1, p2, p3, uvs, normal) {
    if (!normal) {
      _a.subVectors(p1, p0);
      _b.subVectors(p3, p0);
      _n.crossVectors(_a, _b).normalize();
      normal = _n;
    }
    const i0 = this.vertex(p0, normal, uvs[0][0], uvs[0][1]);
    const i1 = this.vertex(p1, normal, uvs[1][0], uvs[1][1]);
    const i2 = this.vertex(p2, normal, uvs[2][0], uvs[2][1]);
    const i3 = this.vertex(p3, normal, uvs[3][0], uvs[3][1]);
    this.idx.push(i0, i1, i2, i0, i2, i3);
  }

  tri(p0, p1, p2, uvs) {
    _a.subVectors(p1, p0);
    _b.subVectors(p2, p0);
    _n.crossVectors(_a, _b).normalize();
    const i0 = this.vertex(p0, _n, uvs[0][0], uvs[0][1]);
    const i1 = this.vertex(p1, _n, uvs[1][0], uvs[1][1]);
    const i2 = this.vertex(p2, _n, uvs[2][0], uvs[2][1]);
    this.idx.push(i0, i1, i2);
  }

  // Axis-aligned-in-local-space box rotated around Y by `rot`, centred at (cx, cy, cz).
  // uvMode 'meters': side UVs in meters (u along face, v = height above `baseY`), top in XZ meters.
  box(cx, cy, cz, sx, sy, sz, rot = 0, { uvScale = 1, baseY = null, top = true, bottom = false, roofFacade = null } = {}) {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const P = (x, y, z) => new THREE.Vector3(cx + x * c + z * s, cy + y, cz - x * s + z * c);
    const corners = [
      P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz),
      P(-hx, hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), P(-hx, hy, hz),
    ];
    const by = baseY === null ? cy - hy : baseY;
    const v0 = (cy - hy - by) * uvScale;
    const v1 = (cy + hy - by) * uvScale;
    // sides: front (+z), right (+x), back (-z), left (-x)
    const faces = [
      [3, 2, 6, 7, sx], // +z
      [2, 1, 5, 6, sz], // +x
      [1, 0, 4, 5, sx], // -z
      [0, 3, 7, 4, sz], // -x
    ];
    let uOff = 0;
    for (const [a, b, cc, d, w] of faces) {
      const u0 = uOff * uvScale;
      const u1 = (uOff + w) * uvScale;
      this.quad(corners[a], corners[b], corners[cc], corners[d], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
      uOff += w;
    }
    if (top) {
      const saved = this.curFacade;
      if (roofFacade) this.curFacade = roofFacade;
      else if (this.facade) this.curFacade = [saved[0], -1, saved[2], 0];
      const t = corners;
      this.quad(t[7], t[6], t[5], t[4], [
        [t[7].x * uvScale, -t[7].z * uvScale], [t[6].x * uvScale, -t[6].z * uvScale],
        [t[5].x * uvScale, -t[5].z * uvScale], [t[4].x * uvScale, -t[4].z * uvScale],
      ]);
      this.curFacade = saved;
    }
    if (bottom) {
      const t = corners;
      this.quad(t[0], t[1], t[2], t[3], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
  }

  // Horizontal quad at height y spanning a rotated rectangle, UV in world meters / tile.
  flatRect(cx, y, cz, sx, sz, rot = 0, tile = 1, uvFn = null) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const hx = sx / 2;
    const hz = sz / 2;
    const P = (x, z) => new THREE.Vector3(cx + x * c + z * s, y, cz - x * s + z * c);
    const p = [P(-hx, hz), P(hx, hz), P(hx, -hz), P(-hx, -hz)];
    const uvs = uvFn ? uvFn(p) : p.map((q) => [q.x / tile, -q.z / tile]);
    this.quad(p[0], p[1], p[2], p[3], uvs, new THREE.Vector3(0, 1, 0));
  }

  // Ribbon along a 3D polyline: left/right offsets, optional vertical walls.
  // points: Vector3[], widths: half-width per point or number, vScale meters per V unit.
  ribbon(points, halfWidth, { vScale = 1, uMode = 'width', yOffset = 0, side = 'top' } = {}) {
    let dist = 0;
    const L = [];
    const R = [];
    const D = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      _v.subVectors(next, prev);
      _v.y = 0;
      _v.normalize();
      const rx = -_v.z;
      const rz = _v.x;
      const hw = typeof halfWidth === 'number' ? halfWidth : halfWidth[i];
      if (i > 0) dist += p.distanceTo(points[i - 1]);
      L.push(new THREE.Vector3(p.x - rx * hw, p.y + yOffset, p.z - rz * hw));
      R.push(new THREE.Vector3(p.x + rx * hw, p.y + yOffset, p.z + rz * hw));
      D.push(dist);
    }
    for (let i = 0; i < points.length - 1; i++) {
      const v0 = D[i] / vScale;
      const v1 = D[i + 1] / vScale;
      if (side === 'top') {
        const u1 = uMode === 'width' ? 1 : (L[i].distanceTo(R[i])) / vScale;
        this.quad(L[i], R[i], R[i + 1], L[i + 1], [[0, v0], [u1, v0], [u1, v1], [0, v1]], null);
      }
    }
    return { L, R, D };
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.facade) g.setAttribute('aFacade', new THREE.Float32BufferAttribute(this.facade, 4));
    if (this.col) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
