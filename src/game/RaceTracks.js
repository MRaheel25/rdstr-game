// V3 race tracks and track dressing. Extra circuits are defined by a few waypoints and routed
// over the road graph (so they always follow real roads). Every race is dressed from data at
// start and removed afterwards: a start / finish gantry with start lights, tyre walls and
// arrow boards on the outside of corners, cones at the apexes, and obstacles per track
// (cones, barrels, construction barriers, oil slicks, water puddles, shortcut ramps, slow
// trucks, sliding barriers). Checkpoints are invisible lines; nothing floats over the road.
import * as THREE from 'three';
import { G, groups } from '../core/Physics.js';
import { textTexture } from '../world/Textures.js';

const V = (x, z) => new THREE.Vector3(x, 0, z);

// Route a closed loop through the waypoints over the road graph.
export function roadLoop(world, wps) {
  const g = world.graph;
  const pts = [];
  const push = (p) => {
    if (!pts.length || pts[pts.length - 1].distanceTo(p) > 2) pts.push(new THREE.Vector3(p.x, p.y, p.z));
  };
  for (let i = 0; i < wps.length; i++) {
    const a = g.nearestNode(wps[i]);
    const b = g.nearestNode(wps[(i + 1) % wps.length]);
    const path = g.path(a, b) || [a, b];
    for (let k = 0; k < path.length; k++) {
      if (k > 0) {
        const e = g.edgeBetween(path[k - 1], path[k]);
        if (e) {
          const ep = e.a === path[k - 1] ? e.points : [...e.points].reverse();
          for (let j = 1; j < ep.length - 1; j++) push(ep[j]);
        }
      }
      push(path[k]);
    }
  }
  if (pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < 3) pts.pop();
  return pts;
}

// New V3 tracks (the three V1 races keep their own lines).
export const EXTRA_TRACKS = [
  {
    id: 'harbor-loop', name: 'Harbor Loop', district: 'harbor', rep: 0, scoring: 'time', laps: 2,
    brief: 'A wet loop between the container yards and the waterfront boulevard. Puddles everywhere, oil by the cranes, slow trucks on the docks.',
    reward: { cash: 3800, rep: 280 }, speed: 44, lineOffset: 2.6, closed: true, cpSpacing: 170,
    waypoints: [V(-360, 480), V(240, 480), V(240, 700), V(-360, 700)],
  },
  {
    id: 'park-speedway', name: 'Park Speedway', district: 'downtown', rep: 0, scoring: 'time', laps: 3,
    brief: 'Three fast laps around City Park in the morning sun. Wide boulevards, tight park corners and cones at every apex.',
    reward: { cash: 3200, rep: 240 }, speed: 48, lineOffset: 2.6, closed: true, cpSpacing: 160,
    waypoints: [V(-480, -360), V(-240, -360), V(-240, -120), V(-480, -120)],
  },
  {
    id: 'neon-circuit', name: 'Night Neon Circuit', district: 'downtown', rep: 0, scoring: 'time', laps: 2,
    brief: 'The hardest one: a zig-zag through the neon core in a thunderstorm, with sliding barriers, oil and a shortcut ramp for the brave.',
    reward: { cash: 5500, rep: 420 }, speed: 44, lineOffset: 2.6, closed: true, cpSpacing: 170,
    waypoints: [V(0, -360), V(240, -360), V(240, 120), V(0, 120), V(0, 360), V(-240, 360), V(-240, -120), V(0, -120)],
  },
];

// Default time / weather and obstacles per track (at = fraction of the lap, side = metres
// right of the centre line, n = count spread along 30 m).
export const TRACK_SETUP = {
  'downtown-circuit': { tod: 'noon', weather: 'clear', obstacles: [{ type: 'cones', at: 0.18, side: 4, n: 6 }, { type: 'barrels', at: 0.42, side: -4, n: 4 }, { type: 'construction', at: 0.63, side: 5, n: 3 }, { type: 'truck', at: 0.3 }] },
  'ring-sprint': { tod: 'golden', weather: 'clear', obstacles: [{ type: 'construction', at: 0.22, side: 9, n: 4 }, { type: 'cones', at: 0.48, side: 4, n: 8 }, { type: 'truck', at: 0.6, side: 2 }, { type: 'truck', at: 0.85, side: 9 }] },
  'canyon-drift': { tod: 'morning', weather: 'fog', obstacles: [{ type: 'cones', at: 0.2, side: 2, n: 5 }, { type: 'barrels', at: 0.55, side: -2, n: 3 }, { type: 'puddle', at: 0.72 }] },
  'harbor-loop': { tod: 'golden', weather: 'rain', obstacles: [{ type: 'puddle', at: 0.12 }, { type: 'puddle', at: 0.38, side: -3 }, { type: 'oil', at: 0.55, side: 2 }, { type: 'truck', at: 0.25 }, { type: 'truck', at: 0.7 }, { type: 'barrels', at: 0.82, side: 5, n: 5 }] },
  'park-speedway': { tod: 'morning', weather: 'clear', obstacles: [{ type: 'cones', at: 0.1, side: 5, n: 6 }, { type: 'cones', at: 0.6, side: -5, n: 6 }, { type: 'ramp', at: 0.35, side: -3 }, { type: 'construction', at: 0.8, side: 4, n: 3 }] },
  'neon-circuit': { tod: 'night', weather: 'storm', obstacles: [{ type: 'slider', at: 0.16 }, { type: 'oil', at: 0.3, side: -2 }, { type: 'ramp', at: 0.45, side: 3 }, { type: 'slider', at: 0.58 }, { type: 'puddle', at: 0.7 }, { type: 'barrels', at: 0.86, side: -4, n: 5 }, { type: 'truck', at: 0.5 }] },
};

const mats = {};
function mat(key) {
  if (mats[key]) return mats[key];
  const M = {
    tire: () => new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.9 }),
    tireBand: () => new THREE.MeshStandardMaterial({ color: 0xe02828, roughness: 0.6 }),
    steel: () => new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.45, metalness: 0.8 }),
    cone: () => new THREE.MeshStandardMaterial({ color: 0xff5a10, roughness: 0.5 }),
    barrel: () => new THREE.MeshStandardMaterial({ color: 0x1f5ad0, roughness: 0.5, metalness: 0.3 }),
    construct: () => new THREE.MeshStandardMaterial({ color: 0xffffff, map: stripes(), roughness: 0.6 }),
    arrow: () => new THREE.MeshBasicMaterial({ map: textTexture('››››', { w: 256, h: 64, bg: '#101114', color: '#ffd23f', font: 'bold 56px Arial' }), color: new THREE.Color(1.4, 1.4, 1.4) }),
    banner: () => new THREE.MeshBasicMaterial({ map: textTexture('START  ·  FINISH', { w: 1024, h: 128, bg: '#0b0e14', color: '#ffffff', font: 'bold 80px Arial' }), color: new THREE.Color(1.4, 1.4, 1.4) }),
    lightOff: () => new THREE.MeshBasicMaterial({ color: 0x220808 }),
    red: () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2020).multiplyScalar(4) }),
    green: () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0x20ff60).multiplyScalar(4) }),
    oil: () => new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -3 }),
    puddle: () => new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.02, metalness: 0.9, transparent: true, opacity: 0.7, polygonOffset: true, polygonOffsetFactor: -3 }),
    truck: () => new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.6 }),
    ramp: () => new THREE.MeshStandardMaterial({ color: 0xffb020, roughness: 0.5, metalness: 0.4 }),
  }[key];
  mats[key] = M();
  return mats[key];
}

function stripes() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 ? '#ffffff' : '#e8401c';
    x.beginPath();
    x.moveTo(i * 16 - 16, 32);
    x.lineTo(i * 16, 0);
    x.lineTo(i * 16 + 16, 0);
    x.lineTo(i * 16, 32);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export class TrackDressing {
  constructor(race) {
    this.race = race;
    this.game = race.game;
    this.group = new THREE.Group();
    this.group.name = 'race_dressing';
    this.game.scene.add(this.group);
    const ph = this.game.physics;
    this.fixed = ph.world.createRigidBody(ph.R.RigidBodyDesc.fixed());
    this.dynamic = [];
    this.movers = [];
    this.zones = []; // oil / puddle
    this.build();
  }

  // Centre-line helpers.
  at(frac) {
    const c = this.race.center;
    const i = Math.floor(((frac % 1) + 1) % 1 * c.length);
    const p = c[i];
    const q = c[(i + 2) % c.length];
    const dir = new THREE.Vector3().subVectors(q, p).setY(0).normalize();
    return { i, p, dir, right: new THREE.Vector3(-dir.z, 0, dir.x) };
  }

  add(mesh, x, y, z, yaw = 0) {
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.noCollider = true;
    this.group.add(mesh);
    return mesh;
  }

  solid(hx, hy, hz, x, y, z, yaw = 0) {
    const ph = this.game.physics;
    _q.setFromAxisAngle(UP, yaw);
    const c = ph.world.createCollider(ph.R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
      .setCollisionGroups(groups(G.STATIC, 0xffff)), this.fixed);
    ph.meta.set(c.handle, { kind: 'barrier', surface: 'metal' });
  }

  build() {
    const race = this.race;
    const c = race.center;
    const ground = (p) => race.ctx.groundY(p);
    // Start / finish gantry with five start lights.
    const s = this.at(0);
    const yaw = Math.atan2(s.dir.x, s.dir.z);
    const W = 26;
    const gy = ground(s.p);
    for (const side of [-1, 1]) {
      const px = s.p.x + s.right.x * side * W / 2;
      const pz = s.p.z + s.right.z * side * W / 2;
      this.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 7.5, 0.8), mat('steel')), px, gy + 3.75, pz, yaw);
      this.solid(0.4, 3.75, 0.4, px, gy + 3.75, pz, yaw);
    }
    this.add(new THREE.Mesh(new THREE.BoxGeometry(W + 1, 1.4, 0.7), mat('steel')), s.p.x, gy + 7.6, s.p.z, yaw);
    const banner = this.add(new THREE.Mesh(new THREE.PlaneGeometry(W - 4, 1.2), mat('banner')), s.p.x - s.dir.x * 0.4, gy + 7.6, s.p.z - s.dir.z * 0.4, yaw + Math.PI);
    banner.castShadow = false;
    this.lights = [];
    for (let k = 0; k < 5; k++) {
      const u = (k - 2) * 1.3;
      const m = this.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), mat('lightOff')), s.p.x + s.right.x * u - s.dir.x * 0.45, gy + 6.3, s.p.z + s.right.z * u - s.dir.z * 0.45, yaw);
      this.lights.push(m);
    }
    // Corners: tyre walls + arrow boards on the outside, cones at the apex.
    const n = c.length;
    let last = -99;
    for (let i = 0; i < n; i++) {
      const a = c[(i - 3 + n) % n];
      const p = c[i];
      const b = c[(i + 3) % n];
      const d1 = new THREE.Vector3().subVectors(p, a).setY(0).normalize();
      const d2 = new THREE.Vector3().subVectors(b, p).setY(0).normalize();
      const turn = Math.atan2(d1.x * d2.z - d1.z * d2.x, d1.dot(d2));
      if (Math.abs(turn) < 0.55 || i - last < 6 || (!race.def.closed && (i < 4 || i > n - 4))) continue;
      last = i;
      const right = new THREE.Vector3(-d1.z, 0, d1.x);
      const outside = turn > 0 ? -1 : 1; // turning left -> outside is right
      const off = race.def.lineOffset * 2 + 6.5;
      const ox = p.x + right.x * outside * off + d1.x * 6;
      const oz = p.z + right.z * outside * off + d1.z * 6;
      const oy = ground(V(ox, oz));
      const wyaw = Math.atan2(d1.x, d1.z);
      // Tyre wall: 5 stacks across the run-off.
      for (let k = -2; k <= 2; k++) {
        const tx = ox + d2.x * k * 1.3;
        const tz = oz + d2.z * k * 1.3;
        for (let h = 0; h < 3; h++) {
          const t = this.add(new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.17, 6, 12), h === 1 ? mat('tireBand') : mat('tire')), tx, oy + 0.17 + h * 0.34, tz, 0);
          t.rotation.x = Math.PI / 2;
        }
      }
      this.solid(3.4, 0.55, 0.6, ox, oy + 0.55, oz, Math.atan2(d2.x, d2.z) + Math.PI / 2);
      // Arrow board facing the approaching cars.
      const ab = this.add(new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), mat('arrow')), ox - d1.x * 1.2, oy + 1.9, oz - d1.z * 1.2, wyaw + Math.PI);
      ab.scale.x = turn > 0 ? -1 : 1;
      this.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.12), mat('steel')), ox - d1.x * 1.3, oy + 0.7, oz - d1.z * 1.3, 0);
      // Apex cones.
      for (let k = 0; k < 3; k++) {
        const q = c[(i + k) % n];
        this.cone(q.x - right.x * outside * (race.def.lineOffset * 2 + 2), q.z - right.z * outside * (race.def.lineOffset * 2 + 2));
      }
    }
    // Data-driven obstacles.
    const setup = TRACK_SETUP[race.def.id] || { obstacles: [] };
    for (const o of setup.obstacles) this.obstacle(o);
  }

  cone(x, z) {
    this.dyn(new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 10).translate(0, 0.35, 0), mat('cone')), x, z, { hx: 0.2, hy: 0.35, hz: 0.2, density: 60 });
  }

  // Knockable obstacle: a light dynamic body.
  dyn(mesh, x, z, { hx, hy, hz, density = 120, yaw = 0, oy = 0 }) {
    const ph = this.game.physics;
    const R = ph.R;
    const y = this.race.ctx.groundY(V(x, z));
    const body = ph.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x, y + hy + 0.02, z).setCanSleep(true).setLinearDamping(0.3).setAngularDamping(0.5));
    _q.setFromAxisAngle(UP, yaw);
    body.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, false);
    ph.world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setDensity(density).setFriction(0.6).setRestitution(0.2)
      .setCollisionGroups(groups(G.DEBRIS, G.STATIC | G.RAMP | G.DEBRIS | G.PLAYER | G.POLICE | G.TRAFFIC)), body);
    mesh.position.y = -hy + oy;
    const holder = new THREE.Group();
    holder.add(mesh);
    mesh.castShadow = true;
    this.group.add(holder);
    const interp = ph.track(body, holder);
    interp.snap();
    this.dynamic.push({ body, interp, holder });
  }

  obstacle(o) {
    const { p, dir, right } = this.at(o.at);
    const side = o.side || 0;
    const base = p.clone().addScaledVector(right, side);
    const yaw = Math.atan2(dir.x, dir.z);
    const n = o.n || 1;
    for (let k = 0; k < n; k++) {
      const q = base.clone().addScaledVector(dir, (k - (n - 1) / 2) * (30 / Math.max(1, n)));
      if (o.type === 'cones') this.cone(q.x, q.z);
      else if (o.type === 'barrels') this.dyn(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.95, 12).translate(0, 0.475, 0), mat('barrel')), q.x, q.z, { hx: 0.32, hy: 0.475, hz: 0.32, density: 180 });
      else if (o.type === 'construction') this.dyn(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.25).translate(0, 0.45, 0), mat('construct')), q.x, q.z, { hx: 1.1, hy: 0.45, hz: 0.12, density: 90, yaw: yaw + Math.PI / 2 });
    }
    if (o.type === 'oil' || o.type === 'puddle') {
      const r = o.type === 'oil' ? 2.6 : 4;
      const y = this.race.ctx.groundY(base) + 0.04;
      const m = this.add(new THREE.Mesh(new THREE.CircleGeometry(r, 28).rotateX(-Math.PI / 2), mat(o.type)), base.x, y, base.z, 0);
      m.scale.set(1, 1, 1.6);
      m.rotation.y = yaw;
      m.castShadow = false;
      this.zones.push({ type: o.type, x: base.x, z: base.z, r: r * 1.2 });
    } else if (o.type === 'ramp') {
      // Shortcut ramp: a wedge you can launch off.
      const L = 9;
      const H = 1.6;
      const Wd = 4.2;
      const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(L, 0), new THREE.Vector2(L, H)]);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: Wd, bevelEnabled: false }).translate(0, 0, -Wd / 2).rotateY(-Math.PI / 2);
      const y = this.race.ctx.groundY(base);
      const m = this.add(new THREE.Mesh(geo, mat('ramp')), base.x, y, base.z, yaw);
      m.updateMatrixWorld();
      const pos = geo.attributes.position;
      const verts = [];
      for (let k = 0; k < pos.count; k++) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, k).applyMatrix4(m.matrixWorld);
        verts.push(v.x, v.y, v.z);
      }
      const ph = this.game.physics;
      const c = ph.world.createCollider(ph.R.ColliderDesc.convexHull(new Float32Array(verts)).setCollisionGroups(groups(G.RAMP, 0xffff)), this.fixed);
      ph.meta.set(c.handle, { kind: 'ramp', surface: 'metal' });
    } else if (o.type === 'truck' || o.type === 'slider') {
      // Kinematic movers: a slow truck along the lane, or a barrier sliding across it.
      const ph = this.game.physics;
      const R = ph.R;
      const truck = o.type === 'truck';
      const size = truck ? [1.25, 1.6, 4] : [2.2, 0.6, 0.3];
      const body = ph.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(base.x, base.y + size[1], base.z));
      ph.world.createCollider(R.ColliderDesc.cuboid(...size).setCollisionGroups(groups(G.STATIC, 0xffff)), body);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0] * 2, size[1] * 2, size[2] * 2), truck ? mat('truck') : mat('construct'));
      mesh.castShadow = true;
      this.group.add(mesh);
      this.movers.push({ type: o.type, body, mesh, idx: this.at(o.at).i, side: truck ? (o.side ?? this.race.def.lineOffset) : 0, t: Math.random() * 6, base, right, dir, hy: size[1] });
    }
  }

  // Start lights: lit = 0..5 red, 'go' = all green.
  setLights(state) {
    this.lights.forEach((m, k) => {
      m.material = state === 'go' ? mat('green') : k < state ? mat('red') : mat('lightOff');
    });
  }

  update(dt) {
    const race = this.race;
    const c = race.center;
    for (const m of this.movers) {
      m.t += dt;
      let x;
      let y;
      let z;
      let yaw;
      if (m.type === 'truck') {
        // 9 m/s along the racing line (samples are 8 m apart).
        if (race.state === 'running') m.idx = (m.idx + dt * 9 / 8) % c.length;
        const i = Math.floor(m.idx);
        const a = c[i];
        const b = c[(i + 1) % c.length];
        const f = m.idx - i;
        const dir = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
        const right = new THREE.Vector3(-dir.z, 0, dir.x);
        x = a.x + (b.x - a.x) * f + right.x * m.side;
        z = a.z + (b.z - a.z) * f + right.z * m.side;
        y = a.y + (b.y - a.y) * f + m.hy + 0.05;
        yaw = Math.atan2(dir.x, dir.z);
      } else {
        const u = Math.sin(m.t * 0.9) * 5.5;
        x = m.base.x + m.right.x * u;
        z = m.base.z + m.right.z * u;
        y = m.base.y + m.hy + 0.05;
        yaw = Math.atan2(m.dir.x, m.dir.z) + Math.PI / 2;
      }
      _q.setFromAxisAngle(UP, yaw);
      m.body.setNextKinematicTranslation({ x, y, z });
      m.body.setNextKinematicRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
      m.mesh.position.set(x, y, z);
      m.mesh.quaternion.copy(_q);
    }
    // Oil: grip drops; puddles: spray and a slight slide.
    for (const r of race.racers) {
      const v = r.v;
      let grip = 1;
      for (const zn of this.zones) {
        if (Math.hypot(v.position.x - zn.x, v.position.z - zn.z) > zn.r) continue;
        if (zn.type === 'oil') grip = Math.min(grip, 0.45);
        else {
          grip = Math.min(grip, 0.78);
          if (v.speed > 8 && Math.random() < dt * 20) this.game.vfx.splash(v.position.clone().setY(v.position.y - 0.4), 0.35);
        }
      }
      v.surfaceGrip = grip;
    }
  }

  dispose() {
    const ph = this.game.physics;
    for (const d of this.dynamic) {
      ph.untrack(d.interp);
      ph.world.removeRigidBody(d.body);
    }
    for (const m of this.movers) ph.world.removeRigidBody(m.body);
    ph.world.removeRigidBody(this.fixed);
    this.game.scene.remove(this.group);
    this.group.traverse((o) => o.geometry && o.geometry.dispose());
    for (const r of this.race.racers) r.v.surfaceGrip = 1;
  }
}
