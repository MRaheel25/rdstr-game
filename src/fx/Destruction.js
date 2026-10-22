// V3 destruction: parts that break off with real physics (the visual part is cloned into a
// dynamic body that bounces and slides on the road; the original is hidden until repair),
// and a generic dent for any car model (vertex displacement at the impact point) used for
// police and traffic in a lighter form.
import * as THREE from 'three';
import { G, groups } from '../core/Physics.js';

const MAX_PARTS = 14;
const LIFE = 20;
const _b = new THREE.Box3();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

export class Destruction {
  constructor(game) {
    this.game = game;
    this.parts = [];
  }

  // Break `obj` (a mesh or group of the car) off `vehicle` and throw it.
  detach(obj, vehicle, { kick = 1 } = {}) {
    if (!obj || !obj.visible) return null;
    const ph = this.game.physics;
    const R = ph.R;
    obj.updateWorldMatrix(true, true);
    const clone = obj.clone(true);
    obj.matrixWorld.decompose(_v, _q, _s);
    clone.position.copy(_v);
    clone.quaternion.copy(_q);
    clone.scale.copy(_s);
    clone.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.userData.noCollider = true;
      }
    });
    // Collider from the part's bounds in its own frame.
    const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
    _b.makeEmpty();
    obj.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      _b.union(bb);
    });
    if (_b.isEmpty()) return null;
    const size = _b.getSize(new THREE.Vector3()).multiply(_s);
    const center = _b.getCenter(new THREE.Vector3()).multiply(_s);
    obj.visible = false;
    const body = ph.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(_v.x, _v.y, _v.z).setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
      .setLinearDamping(0.15).setAngularDamping(0.4).setCanSleep(true));
    ph.world.createCollider(R.ColliderDesc.cuboid(Math.max(0.04, size.x / 2), Math.max(0.03, size.y / 2), Math.max(0.04, size.z / 2))
      .setTranslation(center.x, center.y, center.z).setDensity(350).setFriction(0.55).setRestitution(0.25)
      .setCollisionGroups(groups(G.DEBRIS, G.STATIC | G.RAMP | G.DEBRIS)), body);
    const vel = vehicle.velocity;
    const away = _v.clone().sub(vehicle.position).setY(0);
    if (away.lengthSq() < 1e-4) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    away.normalize().multiplyScalar(2.5 * kick);
    body.setLinvel({ x: vel.x * 0.85 + away.x, y: Math.max(1.5, vel.y) + 2 * kick, z: vel.z * 0.85 + away.z }, true);
    body.setAngvel({ x: (Math.random() - 0.5) * 9, y: (Math.random() - 0.5) * 9, z: (Math.random() - 0.5) * 9 }, true);
    this.game.scene.add(clone);
    const interp = ph.track(body, clone);
    interp.snap();
    this.parts.push({ body, mesh: clone, interp, t: 0, original: obj });
    while (this.parts.length > MAX_PARTS) this.remove(this.parts[0]);
    this.game.vfx.sparksAt(_v.clone(), new THREE.Vector3(0, 1, 0), 14, 7);
    return clone;
  }

  remove(p) {
    const i = this.parts.indexOf(p);
    if (i >= 0) this.parts.splice(i, 1);
    this.game.physics.untrack(p.interp);
    this.game.physics.world.removeRigidBody(p.body);
    this.game.scene.remove(p.mesh);
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt;
      // Sparks while a metal part scrapes along the road.
      if (p.t < 4 && Math.random() < dt * 6) {
        const lv = p.body.linvel();
        if (Math.hypot(lv.x, lv.z) > 6 && Math.abs(lv.y) < 1) {
          const t = p.body.translation();
          this.game.vfx.sparksAt(new THREE.Vector3(t.x, t.y, t.z), new THREE.Vector3(-lv.x, 2, -lv.z).normalize(), 4, 5);
        }
      }
      if (p.t > LIFE) this.remove(p);
    }
  }

  clear() {
    while (this.parts.length) this.remove(this.parts[0]);
  }
}

// Push vertices of every (non-glass) mesh under `root` inward around a world point.
export function dentModel(root, worldPoint, strength, { maxVerts = 8000 } = {}) {
  const r = 0.35 + strength * 0.22;
  const depth = Math.min(0.07, strength * 0.018);
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.material.transparent) return;
    const geo = o.geometry;
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    if (!pos || !nrm || pos.count > maxVerts) return;
    // Traffic models share geometry per type: give this car its own copy before denting.
    if (!o.userData.ownGeo) {
      o.geometry = o.geometry.clone();
      o.userData.ownGeo = true;
      return dentMesh(o, worldPoint, r, depth);
    }
    dentMesh(o, worldPoint, r, depth);
  });
}

function dentMesh(o, worldPoint, r, depth) {
  {
    const geo = o.geometry;
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const lp = o.worldToLocal(worldPoint.clone());
    geo.computeBoundingSphere();
    const bs = geo.boundingSphere;
    if (bs.center.distanceTo(lp) > bs.radius + r) return;
    let moved = false;
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i) - lp.x;
      const dy = pos.getY(i) - lp.y;
      const dz = pos.getZ(i) - lp.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r * r) continue;
      const f = 1 - Math.sqrt(d2) / r;
      const k = depth * f * f;
      pos.setXYZ(i, pos.getX(i) - nrm.getX(i) * k, pos.getY(i) - nrm.getY(i) * k, pos.getZ(i) - nrm.getZ(i) * k);
      moved = true;
    }
    if (moved) {
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    }
  }
}
