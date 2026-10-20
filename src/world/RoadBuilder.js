// Ribbon roads along 3D polylines: elevated highway decks, ramps, bridges and the canyon
// road. Builds the asphalt surface, deck sides, lane markings, jersey barriers or guard
// rails, pillars and lamps, plus trimesh colliders that exactly match the visuals.
import * as THREE from 'three';
import { G } from '../core/Physics.js';

const _v = new THREE.Vector3();

export function roundedRect(cx, cz, hx, hz, r, y, step = 6) {
  const pts = [];
  const corners = [
    [cx + hx - r, cz + hz - r, 0], // SE
    [cx - hx + r, cz + hz - r, Math.PI / 2], // SW
    [cx - hx + r, cz - hz + r, Math.PI], // NW
    [cx + hx - r, cz - hz + r, Math.PI * 1.5], // NE
  ];
  // Walk clockwise starting on the east side heading south: east edge, SE corner, south edge...
  const arc = (ccx, ccz, a0) => {
    const n = Math.max(4, Math.ceil((Math.PI / 2) * r / step));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      pts.push(new THREE.Vector3(ccx + Math.cos(a) * r, y, ccz + Math.sin(a) * r));
    }
  };
  const line = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(len / (step * 4)));
    for (let i = 1; i < n; i++) pts.push(new THREE.Vector3(x0 + ((x1 - x0) * i) / n, y, z0 + ((z1 - z0) * i) / n));
  };
  arc(corners[0][0], corners[0][1], 0);
  line(cx + hx - r, cz + hz, cx - hx + r, cz + hz);
  arc(corners[1][0], corners[1][1], Math.PI / 2);
  line(cx - hx, cz + hz - r, cx - hx, cz - hz + r);
  arc(corners[2][0], corners[2][1], Math.PI);
  line(cx - hx + r, cz - hz, cx + hx - r, cz - hz);
  arc(corners[3][0], corners[3][1], Math.PI * 1.5);
  line(cx + hx, cz - hz + r, cx + hx, cz + hz - r);
  pts.push(pts[0].clone());
  return pts;
}

// Smooth a list of control points into evenly spaced samples.
export function smoothPath(ctrl, step = 4, closed = false) {
  const curve = new THREE.CatmullRomCurve3(ctrl, closed, 'centripetal');
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  return curve.getSpacedPoints(n);
}

class Trimesh {
  constructor() {
    this.v = [];
    this.i = [];
  }
  vert(p) {
    this.v.push(p.x, p.y, p.z);
    return this.v.length / 3 - 1;
  }
  quad(a, b, c, d) {
    const ia = this.vert(a);
    const ib = this.vert(b);
    const ic = this.vert(c);
    const id = this.vert(d);
    this.i.push(ia, ib, ic, ia, ic, id);
  }
  get empty() {
    return this.i.length === 0;
  }
  create(physics, meta, group = G.STATIC) {
    if (this.empty) return null;
    return physics.fixedTrimesh(new Float32Array(this.v), new Uint32Array(this.i), { ...meta, group });
  }
}

export function buildRibbon(gen, pts, o = {}) {
  const width = o.width ?? 16;
  const hwArr = pts.map((_, i) => (o.halfWidths ? o.halfWidths[i] : width / 2));
  const deck = o.deck ?? 0;
  const n = pts.length;
  const L = [];
  const R = [];
  const N = []; // right normals (XZ)
  const D = [0];
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(n - 1, i + 1)];
    _v.subVectors(next, prev);
    _v.y = 0;
    _v.normalize();
    const nr = new THREE.Vector3(-_v.z, 0, _v.x);
    N.push(nr);
    L.push(pts[i].clone().addScaledVector(nr, -hwArr[i]));
    R.push(pts[i].clone().addScaledVector(nr, hwArr[i]));
    if (i > 0) D.push(D[i - 1] + pts[i].distanceTo(pts[i - 1]));
  }
  const total = D[n - 1];
  const surfaceBatch = (p) => {
    const c = gen.chunk(p.x, p.z);
    return o.surface === 'dirt' ? c.dirt || (c.dirt = new (gen.Batch)()) : c.road;
  };
  const col = new Trimesh();
  // Surface quads.
  for (let i = 0; i < n - 1; i++) {
    const b = surfaceBatch(pts[i]);
    const u0 = -hwArr[i] / 8;
    const u1 = hwArr[i] / 8;
    const v0 = D[i] / 8;
    const v1 = D[i + 1] / 8;
    b.quad(L[i], R[i], R[i + 1], L[i + 1], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    col.quad(L[i], R[i], R[i + 1], L[i + 1]);
  }
  // Deck sides and underside.
  if (deck > 0) {
    for (let i = 0; i < n - 1; i++) {
      const c = gen.chunk(pts[i].x, pts[i].z).deck || (gen.chunk(pts[i].x, pts[i].z).deck = new (gen.Batch)());
      const Lb0 = L[i].clone().setY(L[i].y - deck);
      const Lb1 = L[i + 1].clone().setY(L[i + 1].y - deck);
      const Rb0 = R[i].clone().setY(R[i].y - deck);
      const Rb1 = R[i + 1].clone().setY(R[i + 1].y - deck);
      const uv = [[0, 0], [D[i + 1] / 6 - D[i] / 6, 0], [D[i + 1] / 6 - D[i] / 6, deck / 6], [0, deck / 6]];
      c.quad(L[i + 1], L[i], Lb0, Lb1, uv);
      c.quad(R[i], R[i + 1], Rb1, Rb0, uv);
      c.quad(Lb1, Lb0, Rb0, Rb1, [[0, 0], [1, 0], [1, 1], [0, 1]]);
      col.quad(L[i + 1], L[i], Lb0, Lb1);
      col.quad(R[i], R[i + 1], Rb1, Rb0);
      col.quad(Lb1, Lb0, Rb0, Rb1);
    }
    // End caps.
    for (const [a, b, sgn] of [[0, 0, 1], [n - 1, n - 1, -1]]) {
      const c = gen.chunk(pts[a].x, pts[a].z).deck || (gen.chunk(pts[a].x, pts[a].z).deck = new (gen.Batch)());
      const Lb = L[a].clone().setY(L[a].y - deck);
      const Rb = R[b].clone().setY(R[b].y - deck);
      if (sgn > 0) {
        c.quad(R[b], L[a], Lb, Rb, [[0, 0], [1, 0], [1, 1], [0, 1]]);
        col.quad(R[b], L[a], Lb, Rb);
      } else {
        c.quad(L[a], R[b], Rb, Lb, [[0, 0], [1, 0], [1, 1], [0, 1]]);
        col.quad(L[a], R[b], Rb, Lb);
      }
    }
  }
  col.create(gen.physics, { kind: o.kind || 'road', surface: o.surface || 'asphalt' }, o.group ?? G.STATIC);

  // Markings.
  const mk = gen.markings;
  const pointAt = (s, off, out) => {
    let i = 1;
    while (i < n - 1 && D[i] < s) i++;
    const t = D[i] > D[i - 1] ? (s - D[i - 1]) / (D[i] - D[i - 1]) : 0;
    out.lerpVectors(pts[i - 1], pts[i], t);
    const nx = N[i - 1].x + (N[i].x - N[i - 1].x) * t;
    const nz = N[i - 1].z + (N[i].z - N[i - 1].z) * t;
    out.x += nx * off;
    out.z += nz * off;
    out.y += 0.03;
    return out;
  };
  const strip = (off, s0, s1, w, color, step = 4) => {
    mk.setColor(...color);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const d = new THREE.Vector3();
    for (let s = s0; s < s1 - 0.01; s += step) {
      const e = Math.min(s1, s + step);
      pointAt(s, off - w / 2, a);
      pointAt(s, off + w / 2, b);
      pointAt(e, off + w / 2, c);
      pointAt(e, off - w / 2, d);
      mk.quad(a, b, c, d, [[0, 0], [1, 0], [1, 1], [0, 1]], new THREE.Vector3(0, 1, 0));
    }
  };
  const m = o.markings ?? { center: 'double', lanes: 2 };
  if (m && m.center !== 'none') {
    const white = [0.85, 0.85, 0.82];
    const yellow = [0.9, 0.65, 0.12];
    const hw = width / 2;
    if (m.center === 'double') {
      strip(-0.18, 0, total, 0.14, yellow);
      strip(0.18, 0, total, 0.14, yellow);
    } else if (m.center === 'dashed') {
      for (let s = 0; s < total - 3; s += 9) strip(0, s, s + 3, 0.14, white, 3);
    }
    if (m.edge !== false) {
      strip(-hw + 0.5, 0, total, 0.16, white);
      strip(hw - 0.5, 0, total, 0.16, white);
    }
    const lanes = m.lanes || 1;
    if (lanes > 1) {
      const lw = (hw - 0.5) / lanes;
      for (let l = 1; l < lanes; l++) {
        for (const sg of [-1, 1]) for (let s = 2; s < total - 3; s += 10) strip(sg * lw * l, s, s + 3.5, 0.13, white, 3.5);
      }
    }
  }

  // Barriers / guard rails.
  if (o.barriers) {
    const bh = o.barriers === 'rail' ? 0.85 : 1.1;
    const bt = o.barriers === 'rail' ? 0.25 : 0.5;
    const gaps = o.gaps || [];
    const inGap = (side, s) => gaps.some((g) => (g.side === side || g.side === 'both') && s >= g.s0 && s <= g.s1);
    for (const side of ['left', 'right']) {
      const E = side === 'left' ? L : R;
      const sg = side === 'left' ? -1 : 1;
      const bcol = new Trimesh();
      for (let i = 0; i < n - 1; i++) {
        const sMid = (D[i] + D[i + 1]) / 2;
        if (inGap(side, sMid)) continue;
        const batch = gen.chunk(pts[i].x, pts[i].z);
        const target = o.barriers === 'rail' ? (batch.rail || (batch.rail = new (gen.Batch)())) : (batch.concrete);
        const a0 = E[i].clone();
        const a1 = E[i + 1].clone();
        const o0 = a0.clone().addScaledVector(N[i], sg * bt);
        const o1 = a1.clone().addScaledVector(N[i + 1], sg * bt);
        const yb = o.barriers === 'rail' ? 0.35 : 0;
        const ia0 = a0.clone().setY(a0.y + yb);
        const ia1 = a1.clone().setY(a1.y + yb);
        const t0 = a0.clone().setY(a0.y + bh);
        const t1 = a1.clone().setY(a1.y + bh);
        const ot0 = o0.clone().setY(o0.y + bh);
        const ot1 = o1.clone().setY(o1.y + bh);
        const ob0 = o0.clone().setY(o0.y + yb);
        const ob1 = o1.clone().setY(o1.y + yb);
        const du = (D[i + 1] - D[i]) / 4;
        const uv = [[0, 0], [du, 0], [du, 0.3], [0, 0.3]];
        if (side === 'left') {
          target.quad(ia1, ia0, t0, t1, uv);
          target.quad(t1, t0, ot0, ot1, uv);
          target.quad(ob0, ob1, ot1, ot0, uv);
        } else {
          target.quad(ia0, ia1, t1, t0, uv);
          target.quad(t0, t1, ot1, ot0, uv);
          target.quad(ob1, ob0, ot0, ot1, uv);
        }
        bcol.quad(ia0, ia1, t1, t0);
        bcol.quad(t0, t1, ot1, ot0);
        bcol.quad(ob0, ob1, ot1, ot0);
        // Rail posts.
        if (o.barriers === 'rail' && i % 2 === 0) {
          const p = a0.clone().addScaledVector(N[i], sg * 0.12);
          target.box(p.x, p.y + 0.45, p.z, 0.12, 0.9, 0.12, 0);
        }
      }
      bcol.create(gen.physics, { kind: 'barrier', surface: 'metal' });
    }
  }

  // Pillars under elevated decks.
  if (deck > 0 && o.pillars) {
    const every = o.pillars.every ?? 36;
    for (let s = every / 2; s < total; s += every) {
      const p = pointAt(s, 0, new THREE.Vector3());
      if (o.pillars.skip && o.pillars.skip(p)) continue;
      const ground = gen.groundHeight ? gen.groundHeight(p.x, p.z) : 0;
      const top = p.y - 0.03 - deck;
      const h = top - ground;
      if (h < 1) continue;
      let i = 1;
      while (i < n - 1 && D[i] < s) i++;
      const rot = Math.atan2(N[i].x, N[i].z);
      const pw = o.pillars.width ?? Math.min(width * 0.45, 8);
      const c = gen.chunk(p.x, p.z);
      c.concrete.box(p.x, ground + h / 2, p.z, 1.6, h, pw, rot);
      gen.physics.fixedBox(p.x, ground + h / 2, p.z, 0.8, h / 2, pw / 2, {
        kind: 'building', rotation: { x: 0, y: Math.sin(rot / 2), z: 0, w: Math.cos(rot / 2) },
      });
    }
  }

  // Lamps on barrier tops.
  if (o.lamps && gen.props) {
    const every = o.lamps.every ?? 50;
    let k = 0;
    for (let s = every / 2; s < total - 2; s += every, k++) {
      if (o.lamps.skip && o.lamps.skip(s)) continue;
      const side = o.lamps.side ?? (k % 2 ? 'left' : 'right');
      const sg = side === 'left' ? -1 : 1;
      const hw = width / 2;
      const p = pointAt(s, sg * (hw + 0.25), new THREE.Vector3());
      p.y -= 0.03;
      let i = 1;
      while (i < n - 1 && D[i] < s) i++;
      // Arm points toward the road centre.
      const rot = Math.atan2(-sg * N[i].x, -sg * N[i].z);
      if (o.gaps && o.gaps.some((g) => (g.side === side || g.side === 'both') && s >= g.s0 && s <= g.s1)) continue;
      gen.props.add(o.lamps.type || 'highwayLamp', p.x, p.y + (o.barriers ? 1.1 : 0), p.z, rot, { groundY: p.y });
    }
  }

  // Road graph.
  if (o.graph) {
    const step = Math.max(1, Math.round(10 / Math.max(1, total / n)));
    const gp = pts.filter((_, i) => i % step === 0 || i === n - 1);
    const a = o.graph.a || gen.graph.node(pts[0].x, pts[0].y, pts[0].z, o.kind);
    const b = o.graph.b || gen.graph.node(pts[n - 1].x, pts[n - 1].y, pts[n - 1].z, o.kind);
    gp[0] = new THREE.Vector3(a.x, a.y, a.z);
    gp[gp.length - 1] = new THREE.Vector3(b.x, b.y, b.z);
    gen.graph.edge(a, b, gp, { kind: o.kind || 'road', lanes: o.graph.lanes ?? 2, name: o.graph.name || '', speed: o.graph.speed ?? 25, laneWidth: o.graph.laneWidth ?? 3.6 });
  }
  return { L, R, N, D, total, pointAt };
}
