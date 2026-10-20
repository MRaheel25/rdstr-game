// Rapier physics wrapper: fixed 1/120 s step with accumulator, collision groups,
// collider metadata registry, render-transform interpolation and debug drawing.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export const STEP = 1 / 120;
export const MAX_SUBSTEPS = 4;

// Collision group bits.
export const G = {
  STATIC: 0x0001,
  PLAYER: 0x0002,
  POLICE: 0x0004,
  TRAFFIC: 0x0008,
  PROP: 0x0010,
  DEBRIS: 0x0020,
  SENSOR: 0x0040,
  RAMP: 0x0080,
};
export const ALL = 0xffff;
export function groups(member, filter = ALL) {
  return ((member & 0xffff) << 16) | (filter & 0xffff);
}

export class Physics {
  static async create() {
    await RAPIER.init();
    return new Physics();
  }

  constructor() {
    this.R = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = STEP;
    this.world.integrationParameters.numSolverIterations = 6;
    this.eventQueue = new RAPIER.EventQueue(true);
    this.meta = new Map(); // collider handle -> { kind, ref, ... }
    this.interp = new Set(); // objects with { body, object3d, prev/curr transforms }
    this.accumulator = 0;
    this.alpha = 0;
    this.stepCount = 0;
    this.debugMesh = null;
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  }

  // ---- creation helpers -------------------------------------------------
  fixedBox(cx, cy, cz, hx, hy, hz, opts = {}) {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz);
    if (opts.rotation) bodyDesc.setRotation(opts.rotation);
    const body = this.world.createRigidBody(bodyDesc);
    const r = opts.round ? Math.min(opts.round, hx * 0.5, hy * 0.9, hz * 0.5) : 0;
    const desc = (r > 0 ? RAPIER.ColliderDesc.roundCuboid(hx - r, hy - r, hz - r, r) : RAPIER.ColliderDesc.cuboid(hx, hy, hz))
      .setFriction(opts.friction ?? 0.7)
      .setRestitution(opts.restitution ?? 0.05)
      .setCollisionGroups(groups(opts.group ?? G.STATIC));
    if (opts.sensor) desc.setSensor(true);
    const col = this.world.createCollider(desc, body);
    this.meta.set(col.handle, { kind: opts.kind || 'static', ref: opts.ref || null });
    return col;
  }

  fixedTrimesh(vertices, indices, opts = {}) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const desc = RAPIER.ColliderDesc.trimesh(vertices, indices)
      .setFriction(opts.friction ?? 0.9)
      .setRestitution(0.02)
      .setCollisionGroups(groups(opts.group ?? G.STATIC));
    const col = this.world.createCollider(desc, body);
    this.meta.set(col.handle, { kind: opts.kind || 'static', ref: opts.ref || null });
    return col;
  }

  fixedHeightfield(nrows, ncols, heights, scale, center, opts = {}) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z),
    );
    const desc = RAPIER.ColliderDesc.heightfield(nrows, ncols, heights, scale)
      .setFriction(opts.friction ?? 0.9)
      .setCollisionGroups(groups(opts.group ?? G.STATIC));
    const col = this.world.createCollider(desc, body);
    this.meta.set(col.handle, { kind: opts.kind || 'terrain', ref: null });
    return col;
  }

  removeCollider(col) {
    if (!col) return;
    this.meta.delete(col.handle);
    const body = col.parent();
    this.world.removeCollider(col, false);
    if (body && body.numColliders() === 0) this.world.removeRigidBody(body);
  }

  removeBody(body) {
    if (!body) return;
    for (let i = 0; i < body.numColliders(); i++) this.meta.delete(body.collider(i).handle);
    this.world.removeRigidBody(body);
  }

  // ---- queries ------------------------------------------------------------
  // Raycast returning {toi, normal, collider} or null.
  raycast(origin, dir, maxDist, filterGroups, excludeBody, solid = true) {
    this.ray.origin.x = origin.x;
    this.ray.origin.y = origin.y;
    this.ray.origin.z = origin.z;
    this.ray.dir.x = dir.x;
    this.ray.dir.y = dir.y;
    this.ray.dir.z = dir.z;
    return this.world.castRayAndGetNormal(
      this.ray, maxDist, solid, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, filterGroups, undefined, excludeBody,
    );
  }

  // ---- stepping -----------------------------------------------------------
  // Runs fixed steps for the elapsed (time-scaled) dt. pre/post are called per step.
  advance(dt, pre, post) {
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= STEP && steps < MAX_SUBSTEPS) {
      for (const o of this.interp) o.savePrev();
      pre(STEP);
      this.world.step(this.eventQueue);
      post(STEP);
      for (const o of this.interp) o.saveCurr();
      this.accumulator -= STEP;
      steps++;
      this.stepCount++;
    }
    if (steps === MAX_SUBSTEPS && this.accumulator > STEP) this.accumulator = STEP * 0.5;
    this.alpha = this.accumulator / STEP;
    for (const o of this.interp) o.apply(this.alpha);
    return steps;
  }

  track(body, object3d, offset) {
    const o = new InterpolatedBody(body, object3d, offset);
    this.interp.add(o);
    return o;
  }

  untrack(o) {
    this.interp.delete(o);
  }

  // ---- debug ----------------------------------------------------------------
  setDebug(scene, on) {
    if (on) {
      if (!this.debugMesh) {
        const g = new THREE.BufferGeometry();
        const m = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: true, toneMapped: false });
        this.debugMesh = new THREE.LineSegments(g, m);
        this.debugMesh.frustumCulled = false;
        this.debugMesh.renderOrder = 999;
      }
      scene.add(this.debugMesh);
    } else if (this.debugMesh) {
      scene.remove(this.debugMesh);
    }
    this.debugOn = on;
  }

  updateDebug() {
    if (!this.debugOn || !this.debugMesh) return;
    const { vertices, colors } = this.world.debugRender();
    const g = this.debugMesh.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  }
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

// Stores previous/current physics transforms and interpolates the render object.
export class InterpolatedBody {
  constructor(body, object3d, offset) {
    this.body = body;
    this.object = object3d;
    this.offset = offset || null; // local offset of visual from body origin
    this.prevP = new THREE.Vector3();
    this.currP = new THREE.Vector3();
    this.prevQ = new THREE.Quaternion();
    this.currQ = new THREE.Quaternion();
    this.saveCurr();
    this.prevP.copy(this.currP);
    this.prevQ.copy(this.currQ);
  }
  savePrev() {
    this.prevP.copy(this.currP);
    this.prevQ.copy(this.currQ);
  }
  saveCurr() {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.currP.set(t.x, t.y, t.z);
    this.currQ.set(r.x, r.y, r.z, r.w);
  }
  snap() {
    this.saveCurr();
    this.prevP.copy(this.currP);
    this.prevQ.copy(this.currQ);
  }
  apply(alpha) {
    if (!this.object) return;
    this.object.position.lerpVectors(this.prevP, this.currP, alpha);
    _q.slerpQuaternions(this.prevQ, this.currQ, alpha);
    this.object.quaternion.copy(_q);
    if (this.offset) {
      _v.copy(this.offset).applyQuaternion(_q);
      this.object.position.add(_v);
    }
  }
}
