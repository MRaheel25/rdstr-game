// Destructible street furniture. Every prop type renders as InstancedMesh parts; solid
// props get a static collider. A fast vehicle snaps props off: the static collider is
// disabled, the instance hidden and a pooled dynamic debris body takes its place.
import * as THREE from 'three';
import { buildPropTypes, propMaterial, lightPoolMaterial, lightConeMaterial } from './PropModels.js';
import { G, groups } from '../core/Physics.js';
import { events } from '../core/Events.js';

const CELL = 24;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
// How far away each prop type is drawn (metres, scaled by quality).
const VIEW_DIST = {
  pine: 1100, palm: 650, tree: 420, highwayLamp: 650, lamp: 420, signal: 340, busStop: 300, stall: 300,
  parkedCar: 360, airStation: 500, jersey: 400, fence: 200, bench: 170, bin: 150, hydrant: 150, newsBox: 150,
  cone: 170, barrier: 200, vent: 160,
};

export class Props {
  constructor(ctx) {
    this.scene = ctx.scene;
    this.physics = ctx.physics;
    this.types = buildPropTypes();
    this.items = []; // { type, x, y, z, rot, index, collider, broken, brokenAt, color }
    this.byType = new Map();
    this.grid = new Map();
    this.meshes = [];
    this.debris = []; // active debris
    this.pool = new Map(); // type -> [ {body, group} ]
    this.lamps = []; // items with lights, for light pools / streaks / dynamic lights
    this.signals = [];
    this.group = new THREE.Group();
    this.group.name = 'props';
    this.scene.add(this.group);
    this.time = 0;
  }

  add(typeName, x, y, z, rot = 0, opts = {}) {
    const type = this.types[typeName];
    const item = { type, x, y, z, rot, index: -1, collider: null, broken: false, brokenAt: 0, color: opts.color ?? null, data: opts };
    if (!this.byType.has(typeName)) this.byType.set(typeName, []);
    item.index = this.byType.get(typeName).length;
    this.byType.get(typeName).push(item);
    this.items.push(item);
    if (type.collider && !type.decor) {
      this.createCollider(item);
      const key = this.cellKey(x, z);
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push(item);
    }
    if (type.light) this.lamps.push(item);
    if (typeName === 'signal') this.signals.push(item);
    return item;
  }

  cellKey(x, z) {
    return `${Math.floor(x / CELL)}_${Math.floor(z / CELL)}`;
  }

  createCollider(item) {
    const c = item.type.collider;
    const R = this.physics.R;
    if (!item.type.solid) return; // breakaway-only props are handled by proximity
    const desc = c.type === 'cyl' ? R.ColliderDesc.cylinder(c.h / 2, c.r) : R.ColliderDesc.cuboid(c.hx, c.hy, c.hz);
    const cy = c.type === 'cyl' ? c.h / 2 : (c.y ?? c.hy);
    _q.setFromAxisAngle(UP, item.rot);
    desc.setTranslation(item.x, item.y + cy, item.z).setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
      .setFriction(0.5).setCollisionGroups(groups(G.PROP, 0xffff));
    item.collider = this.physics.world.createCollider(desc, this.physics.staticBody);
    this.physics.meta.set(item.collider.handle, { kind: 'prop', ref: item, surface: 'metal' });
  }

  // Build instanced meshes after all props are placed. Only props near the camera are
  // written into the instance buffers (refreshed a few times per second).
  build() {
    for (const [name, list] of this.byType) {
      const type = this.types[name];
      type.meshes = [];
      type.viewDist = VIEW_DIST[name] ?? 180;
      for (const part of type.parts) {
        const mat = propMaterial(part.mat);
        const mesh = new THREE.InstancedMesh(part.geo, mat, list.length);
        mesh.name = `prop_${name}_${part.mat}`;
        const castShadow = !['lampLight', 'lampLightCool', 'glass', 'emissiveAd', 'emissiveRed', 'airGlow'].includes(part.mat) && name !== 'vent';
        mesh.castShadow = castShadow;
        mesh.receiveShadow = true;
        mesh.userData.static = true;
        mesh.userData.hasCollider = true;
        mesh.userData.instancedProp = true;
        mesh.frustumCulled = false;
        mesh.count = 0;
        if (part.color !== undefined || list.some((it) => it.color !== null)) {
          mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
        }
        mesh.userData.partColor = part.color;
        this.group.add(mesh);
        type.meshes.push(mesh);
        this.meshes.push(mesh);
      }
    }
    this.buildLightDecor();
    this.buildSignalBulbs();
    this.dirty = true;
  }

  matrixFor(item) {
    _q.setFromAxisAngle(UP, item.rot);
    _v.set(item.x, item.y, item.z);
    _s.set(1, 1, 1);
    return _m.compose(_v, _q, _s);
  }

  setVisible() {
    this.dirty = true;
  }

  // Rebuild the instance buffers with the props within view distance of `pos`.
  refresh(pos, distScale = 1) {
    this.lastRefresh = pos.clone();
    this.dirty = false;
    for (const [name, list] of this.byType) {
      const type = this.types[name];
      const d2 = (type.viewDist * distScale) ** 2;
      let n = 0;
      for (const item of list) {
        if (item.broken) continue;
        const dx = item.x - pos.x;
        const dz = item.z - pos.z;
        if (dx * dx + dz * dz > d2) continue;
        this.matrixFor(item);
        for (const mesh of type.meshes) {
          mesh.setMatrixAt(n, _m);
          if (mesh.instanceColor) mesh.setColorAt(n, _c.set(item.color ?? mesh.userData.partColor ?? 0xffffff));
        }
        item.slot = n;
        n++;
      }
      for (const mesh of type.meshes) {
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
    // Light pools / cones near the camera.
    if (this.poolMesh) {
      let n = 0;
      let c = 0;
      for (const item of this.lamps) {
        if (item.broken) continue;
        const d2 = (item.x - pos.x) ** 2 + (item.z - pos.z) ** 2;
        if (d2 > (260 * distScale) ** 2) continue;
        this.poolMesh.setMatrixAt(n, this.poolMatrix(item));
        this.poolMesh.setColorAt(n, _c.set(item.type.cool ? 0xa8c8ff : 0xffb066));
        n++;
        if (d2 < 170 * 170) {
          this.coneMesh.setMatrixAt(c, this.coneMatrix(item));
          c++;
        }
      }
      this.poolMesh.count = n;
      this.coneMesh.count = c;
      this.poolMesh.instanceMatrix.needsUpdate = true;
      this.poolMesh.instanceColor.needsUpdate = true;
      this.coneMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.bulbMesh) {
      const b = this.types.signal.bulbs;
      let n = 0;
      this.visibleSignals = [];
      for (const item of this.signals) {
        if (item.broken) continue;
        if ((item.x - pos.x) ** 2 + (item.z - pos.z) ** 2 > (350 * distScale) ** 2) continue;
        for (let k = 0; k < 3; k++) {
          _v.set(b.x, b.ys[k], b.z).applyAxisAngle(UP, item.rot).add(_s.set(item.x, item.y, item.z));
          _m.makeTranslation(_v.x, _v.y, _v.z);
          this.bulbMesh.setMatrixAt(n * 3 + k, _m);
        }
        this.visibleSignals.push(item);
        n++;
      }
      this.bulbMesh.count = n * 3;
      this.bulbMesh.instanceMatrix.needsUpdate = true;
    }
  }

  lightWorldPos(item, out) {
    const l = item.type.light;
    out.set(l.x, l.y, l.z).applyAxisAngle(UP, item.rot);
    return out.add(_s.set(item.x, item.y, item.z));
  }

  poolMatrix(item) {
    this.lightWorldPos(item, _v);
    const groundY = item.data.groundY ?? item.y - 0.12;
    _v.y = groundY + 0.06;
    _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    _s.set(15, 15, 1);
    return _m.compose(_v, _q, _s);
  }

  coneMatrix(item) {
    this.lightWorldPos(item, _v);
    const groundY = item.data.groundY ?? item.y - 0.12;
    const h = _v.y - groundY;
    _v.y = groundY + h / 2;
    _q.identity();
    _s.set(1, h, 1);
    return _m.compose(_v, _q, _s);
  }

  // Light pools on the ground and soft volumetric cones under lamps.
  buildLightDecor() {
    if (!this.lamps.length) return;
    const plane = new THREE.PlaneGeometry(1, 1);
    this.poolMesh = new THREE.InstancedMesh(plane, lightPoolMaterial(0xffffff, 0.42), this.lamps.length);
    this.poolMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.lamps.length * 3), 3);
    this.poolMesh.name = 'lightPools';
    this.poolMesh.userData.noCollider = true;
    const coneGeo = new THREE.CylinderGeometry(0.25, 3.2, 1, 16, 1, true);
    this.coneMesh = new THREE.InstancedMesh(coneGeo, lightConeMaterial(0xffc890), this.lamps.length);
    this.coneMesh.name = 'lightCones';
    this.coneMesh.userData.noCollider = true;
    this.poolMesh.frustumCulled = false;
    this.coneMesh.frustumCulled = false;
    this.poolMesh.count = 0;
    this.coneMesh.count = 0;
    this.group.add(this.poolMesh, this.coneMesh);
  }

  setConesVisible(on) {
    if (this.coneMesh) this.coneMesh.visible = on;
  }

  // Red / amber / green bulbs for traffic signals; colours switched per phase.
  buildSignalBulbs() {
    if (!this.signals.length) return;
    const geo = new THREE.SphereGeometry(0.13, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.bulbMesh = new THREE.InstancedMesh(geo, mat, this.signals.length * 3);
    this.bulbMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.signals.length * 9), 3);
    this.bulbMesh.name = 'signalBulbs';
    this.bulbMesh.userData.noCollider = true;
    this.bulbMesh.frustumCulled = false;
    this.bulbMesh.count = 0;
    this.visibleSignals = [];
    this.group.add(this.bulbMesh);
  }

  // phaseFn(item) -> 'red' | 'amber' | 'green'
  updateSignals(phaseFn) {
    if (!this.bulbMesh) return;
    const off = 0x141414;
    this.visibleSignals.forEach((item, i) => {
      const p = item.broken ? 'off' : phaseFn(item);
      this.bulbMesh.setColorAt(i * 3, _c.set(p === 'red' ? 0xff1a10 : off).multiplyScalar(p === 'red' ? 6 : 1));
      this.bulbMesh.setColorAt(i * 3 + 1, _c.set(p === 'amber' ? 0xffa010 : off).multiplyScalar(p === 'amber' ? 6 : 1));
      this.bulbMesh.setColorAt(i * 3 + 2, _c.set(p === 'green' ? 0x20ff70 : off).multiplyScalar(p === 'green' ? 5 : 1));
    });
    this.bulbMesh.instanceColor.needsUpdate = true;
  }

  // Called each physics step for each moving vehicle.
  checkVehicle(v, dt) {
    const speed = v.speed;
    if (speed < 0.4) return;
    const p = v.position;
    const reach = 3.2 + speed * dt * 3;
    const x0 = Math.floor((p.x - reach) / CELL);
    const x1 = Math.floor((p.x + reach) / CELL);
    const z0 = Math.floor((p.z - reach) / CELL);
    const z1 = Math.floor((p.z + reach) / CELL);
    const half = v.cfg.chassis[0].half;
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.grid.get(`${cx}_${cz}`);
        if (!list) continue;
        for (const item of list) {
          if (item.broken) continue;
          const t = item.type;
          if (speed < t.breakSpeed && t.solid) continue;
          // Prop position in vehicle-local frame, with the box swept along velocity.
          _v.set(item.x - p.x, 0, item.z - p.z);
          const lx = _v.dot(v.right);
          const lz = -_v.dot(v.forward);
          const sweep = speed * dt * 2.5;
          const r = t.radius;
          const fz = v.fwdSpeed >= 0 ? -half[2] - sweep - r : -half[2] - r;
          const bz = v.fwdSpeed < 0 ? half[2] + sweep + r : half[2] + r;
          if (Math.abs(lx) < half[0] + r + 0.1 && lz > fz && lz < bz && Math.abs(item.y - (p.y - 0.5)) < 4) {
            this.breakProp(item, v);
          }
        }
      }
    }
  }

  breakProp(item, v) {
    item.broken = true;
    item.brokenAt = this.time;
    if (item.collider) item.collider.setEnabled(false);
    this.setVisible(item, false);
    const t = item.type;
    // Momentum exchange: the car loses a little speed, the prop flies.
    const mv = v.mass;
    const share = t.mass / (mv + t.mass);
    const lv = v.body.linvel();
    v.body.applyImpulse({ x: -lv.x * t.mass * 0.6, y: 0, z: -lv.z * t.mass * 0.6 }, true);
    const vel = _v.set(lv.x, lv.y, lv.z).multiplyScalar(1.15 - share);
    this.spawnDebris(item, vel, v);
    events.emit('propBreak', { item, vehicle: v, position: new THREE.Vector3(item.x, item.y + 0.5, item.z), velocity: vel.clone() });
  }

  // Pooled dynamic debris for a broken prop.
  spawnDebris(item, vel, v) {
    const t = item.type;
    let list = this.pool.get(t.name);
    if (!list) this.pool.set(t.name, (list = []));
    let d = list.find((x) => !x.active);
    const R = this.physics.R;
    if (!d) {
      if (list.length >= 10) {
        // Recycle the oldest of this type.
        d = list.reduce((a, b) => (a.spawned < b.spawned ? a : b));
      } else {
        const c = t.collider;
        const body = this.physics.world.createRigidBody(R.RigidBodyDesc.dynamic().setCanSleep(true).setEnabled(false).setLinearDamping(0.1).setAngularDamping(0.4));
        const cy = c.type === 'cyl' ? c.h / 2 : (c.y ?? c.hy);
        const desc = (c.type === 'cyl' ? R.ColliderDesc.cylinder(c.h / 2, c.r) : R.ColliderDesc.cuboid(c.hx, c.hy, c.hz))
          .setTranslation(0, cy, 0).setMass(Math.max(t.mass, 5)).setFriction(0.7).setRestitution(0.2)
          .setCollisionGroups(groups(G.DEBRIS, G.STATIC | G.RAMP | G.DEBRIS));
        this.physics.world.createCollider(desc, body);
        const group = new THREE.Group();
        for (const part of t.parts) {
          const m = new THREE.Mesh(part.geo, propMaterial(part.mat));
          if (part.color !== undefined || item.color !== null) {
            m.material = m.material.clone();
            m.material.color.set(item.color ?? part.color);
          }
          m.castShadow = true;
          group.add(m);
        }
        d = { body, group, active: false, spawned: 0, interp: null };
        list.push(d);
      }
    }
    if (d.active && d.item) d.item.debris = null;
    d.active = true;
    d.spawned = this.time;
    d.item = item;
    _q.setFromAxisAngle(UP, item.rot);
    d.body.setEnabled(true);
    d.body.setTranslation({ x: item.x, y: item.y + 0.05, z: item.z }, true);
    d.body.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
    d.body.setLinvel({ x: vel.x, y: vel.y + 2.5 + Math.random() * 3, z: vel.z }, true);
    const spin = Math.min(8, vel.length() * 0.4);
    d.body.setAngvel({ x: (Math.random() - 0.5) * spin, y: (Math.random() - 0.5) * spin, z: (Math.random() - 0.5) * spin }, true);
    if (!d.group.parent) this.group.add(d.group);
    d.group.visible = true;
    if (!d.interp) d.interp = this.physics.track(d.body, d.group);
    d.interp.snap();
    this.physics.interp.add(d.interp);
    if (!this.debris.includes(d)) this.debris.push(d);
  }

  update(dt, playerPos) {
    this.time += dt;
    // Debris is cleaned after 8 s.
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      if (this.time - d.spawned > 8) {
        d.active = false;
        d.body.setEnabled(false);
        d.group.visible = false;
        this.physics.untrack(d.interp);
        this.debris.splice(i, 1);
      }
    }
    // Respawn broken props when the player is away.
    if (Math.floor(this.time) !== Math.floor(this.time - dt)) {
      for (const item of this.items) {
        if (!item.broken || this.time - item.brokenAt < 45) continue;
        if (playerPos && Math.hypot(item.x - playerPos.x, item.z - playerPos.z) < 140) continue;
        item.broken = false;
        if (item.collider) item.collider.setEnabled(true);
        this.setVisible(item, true);
      }
    }
  }

  // Nearest unbroken lamps to a point (for the pooled dynamic spot lights).
  nearestLamps(pos, count, out = []) {
    out.length = 0;
    const cands = [];
    for (const item of this.lamps) {
      if (item.broken) continue;
      const d = (item.x - pos.x) ** 2 + (item.z - pos.z) ** 2;
      if (d < 140 * 140) cands.push([d, item]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < Math.min(count, cands.length); i++) out.push(cands[i][1]);
    return out;
  }
}
