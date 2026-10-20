// Road graph used by traffic, police path-finding, resets and the minimap.
import * as THREE from 'three';
import { closestOnSegmentXZ } from '../util/math.js';

const _c = { t: 0, x: 0, z: 0, d2: 0 };

export class RoadGraph {
  constructor() {
    this.nodes = [];
    this.edges = [];
    this.nodeIndex = new Map();
  }

  // Nodes are deduplicated by rounded position.
  node(x, y, z, tag = '') {
    const key = `${Math.round(x)}_${Math.round(y)}_${Math.round(z)}`;
    if (this.nodeIndex.has(key)) return this.nodeIndex.get(key);
    const n = { id: this.nodes.length, x, y, z, edges: [], tag };
    this.nodes.push(n);
    this.nodeIndex.set(key, n);
    return n;
  }

  // points: array of {x,y,z} including both endpoints. lanes per direction.
  edge(a, b, points, { kind = 'street', lanes = 2, laneWidth = 3.5, name = '', speed = 22, oneWay = false } = {}) {
    const pts = points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    let length = 0;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      length += pts[i].distanceTo(pts[i - 1]);
      cum.push(length);
    }
    const e = { id: this.edges.length, a, b, points: pts, cum, length, kind, lanes, laneWidth, name, speed, oneWay };
    this.edges.push(e);
    a.edges.push(e);
    if (!oneWay) b.edges.push(e);
    return e;
  }

  other(e, n) {
    return e.a === n ? e.b : e.a;
  }

  // Sample position/tangent along an edge at distance s (from a to b).
  sample(e, s, outPos, outDir) {
    const pts = e.points;
    s = Math.max(0, Math.min(e.length, s));
    let i = 1;
    while (i < pts.length - 1 && e.cum[i] < s) i++;
    const s0 = e.cum[i - 1];
    const s1 = e.cum[i];
    const t = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
    outPos.lerpVectors(pts[i - 1], pts[i], t);
    if (outDir) outDir.subVectors(pts[i], pts[i - 1]).normalize();
    return outPos;
  }

  // Nearest point on any road. Returns { edge, s, point, dir, dist }.
  nearest(pos, filter = null, maxY = Infinity) {
    let best = null;
    let bestD = Infinity;
    for (const e of this.edges) {
      if (filter && !filter(e)) continue;
      const pts = e.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        closestOnSegmentXZ(pos.x, pos.z, a.x, a.z, b.x, b.z, _c);
        const y = a.y + (b.y - a.y) * _c.t;
        const dy = Math.abs(y - pos.y);
        if (dy > maxY) continue;
        const d = _c.d2 + dy * dy * 4;
        if (d < bestD) {
          bestD = d;
          best = { edge: e, seg: i, t: _c.t, s: e.cum[i] + (e.cum[i + 1] - e.cum[i]) * _c.t, x: _c.x, y, z: _c.z };
        }
      }
    }
    if (!best) return null;
    const e = best.edge;
    const a = e.points[best.seg];
    const b = e.points[best.seg + 1];
    best.point = new THREE.Vector3(best.x, best.y, best.z);
    best.dir = new THREE.Vector3().subVectors(b, a).normalize();
    best.dist = Math.sqrt(bestD);
    return best;
  }

  nearestNode(pos) {
    let best = null;
    let bd = Infinity;
    for (const n of this.nodes) {
      const d = (n.x - pos.x) ** 2 + (n.z - pos.z) ** 2 + (n.y - pos.y) ** 2;
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  // A* over nodes. Returns array of nodes.
  path(start, goal, maxIter = 4000) {
    if (!start || !goal) return null;
    const open = new Map([[start.id, start]]);
    const came = new Map();
    const g = new Map([[start.id, 0]]);
    const f = new Map([[start.id, this.h(start, goal)]]);
    let iter = 0;
    while (open.size && iter++ < maxIter) {
      let cur = null;
      let cf = Infinity;
      for (const n of open.values()) {
        const v = f.get(n.id);
        if (v < cf) {
          cf = v;
          cur = n;
        }
      }
      if (cur === goal) {
        const out = [cur];
        while (came.has(cur.id)) {
          cur = came.get(cur.id);
          out.unshift(cur);
        }
        return out;
      }
      open.delete(cur.id);
      for (const e of cur.edges) {
        const nb = this.other(e, cur);
        const cost = g.get(cur.id) + e.length / Math.max(8, e.speed);
        if (cost < (g.get(nb.id) ?? Infinity)) {
          came.set(nb.id, cur);
          g.set(nb.id, cost);
          f.set(nb.id, cost + this.h(nb, goal));
          open.set(nb.id, nb);
        }
      }
    }
    return null;
  }

  h(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z) / 40;
  }

  edgeBetween(a, b) {
    for (const e of a.edges) if (this.other(e, a) === b) return e;
    return null;
  }
}
