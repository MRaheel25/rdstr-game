// V3 GPS: a waypoint (set on the full map, by a mission / taxi fare, or from code), an A*
// route over the road graph, glowing chevrons on the road ahead, the route on the minimap
// and the map, and the remaining distance on the HUD.
import * as THREE from 'three';

const CHEVRONS = 18;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function chevronGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-1.3, -0.5);
  s.lineTo(0, 0.7);
  s.lineTo(1.3, -0.5);
  s.lineTo(1.3, -1.25);
  s.lineTo(0, -0.05);
  s.lineTo(-1.3, -1.25);
  s.closePath();
  // Shape is in XY with +Y = forward; lay it flat with forward = -Z.
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
}

export class Navigation {
  constructor(game) {
    this.game = game;
    this.graph = game.world.graph;
    this.target = null; // { x, z, label }
    this.route = []; // Vector3 points from the car to the target
    this.length = 0;
    this.timer = 0;
    this.color = '#3fe0ff';
    this.mesh = new THREE.InstancedMesh(chevronGeometry(), new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x3fe0ff).multiplyScalar(1.6), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
    }), CHEVRONS);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 2;
    this.mesh.userData.noCollider = true;
    game.scene.add(this.mesh);
    this.distEl = document.getElementById('nav-dist');
  }

  setWaypoint(x, z, label = 'WAYPOINT', { color = '#3fe0ff', silent = false, onArrive = null } = {}) {
    this.target = { x, z, label, onArrive };
    this.color = color;
    this.mesh.material.color.set(color).multiplyScalar(1.6);
    this.timer = 0;
    this.update(0);
    if (!silent) this.game.banner.show('WAYPOINT SET', label, 'cool', 1.4);
  }

  clear() {
    this.target = null;
    this.route = [];
    this.mesh.count = 0;
    this.length = 0;
    if (this.distEl) this.distEl.classList.add('hidden');
  }

  computeRoute() {
    const g = this.graph;
    const car = this.game.player.position;
    const t = this.target;
    const startHit = g.nearest(car, (e) => e.kind !== 'stunt');
    const endHit = g.nearest(new THREE.Vector3(t.x, 0, t.z), (e) => e.kind !== 'stunt');
    if (!startHit || !endHit) return;
    // Enter the graph at the closer end of the current edge.
    const pick = (hit, ref) => {
      const e = hit.edge;
      return Math.hypot(e.a.x - ref.x, e.a.z - ref.z) < Math.hypot(e.b.x - ref.x, e.b.z - ref.z) ? e.a : e.b;
    };
    const s = startHit.edge.length - startHit.s < startHit.s ? startHit.edge.b : startHit.edge.a;
    const goal = pick(endHit, endHit.point);
    const nodes = g.path(s, goal) || [s];
    const pts = [new THREE.Vector3(car.x, startHit.point.y, car.z), startHit.point.clone()];
    for (let i = 0; i < nodes.length; i++) {
      if (i > 0) {
        const e = g.edgeBetween(nodes[i - 1], nodes[i]);
        if (e) {
          const ep = e.a === nodes[i - 1] ? e.points : [...e.points].reverse();
          for (let k = 1; k < ep.length - 1; k++) pts.push(ep[k].clone());
        }
      }
      pts.push(new THREE.Vector3(nodes[i].x, nodes[i].y, nodes[i].z));
    }
    pts.push(endHit.point.clone(), new THREE.Vector3(t.x, endHit.point.y, t.z));
    this.route = pts;
  }

  update(realDt) {
    const t = this.target;
    if (!t) return;
    const car = this.game.player.position;
    const direct = Math.hypot(t.x - car.x, t.z - car.z);
    if (direct < 18) {
      const cb = t.onArrive;
      this.game.banner.show('ARRIVED', t.label, 'cool', 1.6);
      this.clear();
      if (cb) cb();
      return;
    }
    this.timer -= realDt;
    if (this.timer <= 0 || !this.route.length) {
      this.timer = 1.5;
      this.computeRoute();
    } else if (this.route.length) {
      this.route[0].set(car.x, this.route[1] ? this.route[1].y : car.y, car.z);
    }
    // Remaining length.
    let L = 0;
    for (let i = 1; i < this.route.length; i++) L += this.route[i].distanceTo(this.route[i - 1]);
    this.length = L;
    if (this.distEl) {
      this.distEl.classList.remove('hidden');
      const units = this.game.settings.get('units');
      const d = units === 'kmh' ? (L >= 1000 ? `${(L / 1000).toFixed(1)} KM` : `${Math.round(L / 10) * 10} M`) : (L >= 400 ? `${(L / 1609).toFixed(1)} MI` : `${Math.round(L * 1.094 / 10) * 10} YD`);
      this.distEl.innerHTML = `<i style="background:${this.color}"></i><span>${t.label}</span><b>${d}</b>`;
    }
    this.placeChevrons();
  }

  // Chevrons every 9 m along the route, starting 10 m ahead, out to ~170 m.
  placeChevrons() {
    const pts = this.route;
    let n = 0;
    let acc = 0;
    let next = 10;
    for (let i = 1; i < pts.length && n < CHEVRONS; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const seg = a.distanceTo(b);
      if (seg < 0.01) continue;
      while (next <= acc + seg && n < CHEVRONS) {
        const k = (next - acc) / seg;
        _p.lerpVectors(a, b, k);
        _p.y += 0.14;
        _q.setFromAxisAngle(UP, Math.atan2(-(b.x - a.x), -(b.z - a.z)));
        _m.compose(_p, _q, _s);
        this.mesh.setMatrixAt(n++, _m);
        next += 9;
      }
      acc += seg;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.material.opacity = 0.4 + 0.2 * Math.sin(performance.now() * 0.005);
  }
}
