// Camera system: Chase Near / Chase Far / Bumper / Cinematic, plus scripted shots
// (intro flyover, takedown cam, Cold Snap orbit, mission-complete orbit, photo mode).
// The chase arm sphere-casts against static geometry so it never clips into buildings.
import * as THREE from 'three';
import { clamp, damp, lerp, wrapAngle } from '../util/math.js';
import { G, groups } from '../core/Physics.js';

const MODES = ['chaseNear', 'chaseFar', 'bumper', 'cinematic'];
export const CAMERA_LABELS = { chaseNear: 'CHASE NEAR', chaseFar: 'CHASE FAR', bumper: 'BUMPER', cinematic: 'CINEMATIC' };

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _target = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
const _cFrom = new THREE.Vector3();
const _cTo = new THREE.Vector3();
const _cDir = new THREE.Vector3();

export class CameraController {
  constructor(camera, physics, settings) {
    this.camera = camera;
    this.physics = physics;
    this.settings = settings;
    this.modeIndex = 0;
    this.yaw = 0;
    this.pitch = 0.18;
    this.dist = 6.5;
    this.armLen = 6.5;
    this.fov = 65;
    this.shake = 0; // trauma 0..1
    this.shakeTime = 0;
    this.rumble = 0;
    this.kick = 0; // launch kick / landing dip
    this.dip = 0;
    this.fovPunch = 0;
    this.lookAhead = new THREE.Vector3();
    this.shot = null; // scripted shot
    this.cine = { timer: 0, index: 0, pos: new THREE.Vector3(), anchor: new THREE.Vector3() };
    this.ball = new physics.R.Ball(0.35);
    this.castGroups = groups(0x8000, G.STATIC | G.RAMP);
    this.smoothPos = new THREE.Vector3();
    this.smoothLook = new THREE.Vector3();
    this.initialized = false;
  }

  get mode() {
    return MODES[this.modeIndex];
  }

  cycle() {
    this.modeIndex = (this.modeIndex + 1) % MODES.length;
    this.cine.timer = 0;
    return this.mode;
  }

  addShake(amount) {
    this.shake = clamp(this.shake + amount * (this.settings.get('cameraShake') ?? 1), 0, 1);
  }

  // Scripted shots ----------------------------------------------------------------
  // type: 'orbit' (around a target), 'fixed' (static position looking at target), 'path'
  playShot(shot) {
    this.shot = { t: 0, ...shot };
  }

  clearShot() {
    this.shot = null;
  }

  // Sphere cast from `from` toward `to`; writes the safe point into `out` (may alias `to`).
  collide(from, to, out) {
    _cFrom.copy(from);
    _cTo.copy(to);
    _cDir.subVectors(_cTo, _cFrom);
    const len = _cDir.length();
    if (len < 0.01) return out.copy(_cTo);
    _cDir.divideScalar(len);
    const hit = this.physics.world.castShape(
      _cFrom, { x: 0, y: 0, z: 0, w: 1 }, _cDir, this.ball, 0, len, true,
      this.physics.R.QueryFilterFlags.EXCLUDE_SENSORS, this.castGroups,
    );
    if (hit) {
      const d = Math.max(0.5, hit.time_of_impact - 0.15);
      return out.copy(_cFrom).addScaledVector(_cDir, d);
    }
    return out.copy(_cTo);
  }

  update(dt, realDt, car, visual, state) {
    const cam = this.camera;
    // Shake decay.
    this.shake = Math.max(0, this.shake - realDt * 1.6);
    this.shakeTime += realDt;
    this.kick = damp(this.kick, 0, 4, realDt);
    this.dip = damp(this.dip, 0, 5, realDt);
    this.fovPunch = damp(this.fovPunch, 0, 3, realDt);

    if (this.shot) {
      this.updateShot(realDt, car, visual);
      this.applyShake(realDt, car);
      return;
    }

    const pos = visual.position;
    const speed = car.speed;
    const speedN = clamp(speed / 112, 0, 1.3);
    const carYaw = Math.atan2(-car.forward.x, -car.forward.z);

    // FOV: 65 at rest -> 90 at top speed, +8 punch with Rear Rockets.
    const targetFov = 65 + 25 * Math.pow(Math.min(speedN, 1.15), 1.2) + (car.thrust.rocket ? 8 : 0) + this.fovPunch;
    this.fov = damp(this.fov, targetFov, 3, realDt);
    cam.fov = this.fov;

    const mode = this.mode;
    if (mode === 'bumper') {
      _q.copy(visual.quaternion);
      _v.set(0, 0.42, -0.35).applyQuaternion(_q).add(pos);
      cam.position.copy(_v);
      cam.quaternion.copy(_q);
      cam.updateProjectionMatrix();
      this.applyShake(realDt, car);
      this.initialized = false;
      return;
    }
    if (mode === 'cinematic' && state && state.pursuit) {
      this.updateCinematic(realDt, car, visual);
      this.applyShake(realDt, car);
      return;
    }

    // Chase cameras: yaw follows velocity heading (looks slightly ahead in travel direction).
    const far = mode === 'chaseFar';
    let headingYaw = carYaw;
    const hv = _v.set(car.velocity.x, 0, car.velocity.z);
    if (hv.length() > 4 && car.fwdSpeed > -2) {
      const velYaw = Math.atan2(-hv.x, -hv.z);
      // Blend toward velocity; swing outward during drifts.
      headingYaw = carYaw + wrapAngle(velYaw - carYaw) * 0.55;
    }
    if (car.fwdSpeed < -3) headingYaw = carYaw;
    const airborne = car.groundedCount === 0 && car.airTime > 0.3;
    const yawRate = airborne ? 2 : 5.5;
    if (!this.initialized) {
      this.yaw = headingYaw;
      this.initialized = true;
    }
    this.yaw += wrapAngle(headingYaw - this.yaw) * (1 - Math.exp(-yawRate * realDt));

    // Distance pulls back and height lowers as speed increases.
    const baseDist = far ? 9.5 : 6.2;
    const baseH = far ? 3.2 : 2.0;
    const dist = baseDist + speedN * (far ? 3.5 : 2.6) + this.kick * 1.2 + (airborne ? 1.5 : 0);
    const height = baseH - speedN * 0.55 + (airborne ? 0.8 : 0) - this.dip * 0.6;
    this.dist = damp(this.dist, dist, 3, realDt);

    _target.copy(pos).addScaledVector(_up, 0.9);
    _desired.set(Math.sin(this.yaw) * this.dist, height, Math.cos(this.yaw) * this.dist).add(_target);
    // Keep the camera above ground level near the car.
    _desired.y = Math.max(_desired.y, pos.y + 0.6);
    // Collision: snap in at once (never a frame inside a wall), ease back out slowly.
    this.collide(_target, _desired, _v2);
    const safeLen = _v2.distanceTo(_target);
    const wantLen = _desired.distanceTo(_target);
    if (safeLen < this.armLen) this.armLen = safeLen;
    else this.armLen = lerp(this.armLen, safeLen, 1 - Math.exp(-2.5 * realDt));
    this.armLen = Math.min(this.armLen, wantLen);
    _v.subVectors(_desired, _target).normalize();
    cam.position.copy(_target).addScaledVector(_v, this.armLen);

    // Look slightly ahead of the car in the travel direction.
    this.lookAhead.lerp(_v2.copy(car.velocity).multiplyScalar(0.06), 1 - Math.exp(-4 * realDt));
    _v.copy(pos).addScaledVector(_up, 1.0).add(this.lookAhead);
    cam.lookAt(_v);
    cam.updateProjectionMatrix();
    this.applyShake(realDt, car);
  }

  updateCinematic(dt, car, visual) {
    const c = this.cine;
    const pos = visual.position;
    c.timer -= dt;
    if (c.timer <= 0) {
      // Cut to a new angle: low trackside, drone overhead, or chase-low.
      c.index = (c.index + 1) % 3;
      c.timer = 3.5 + Math.random() * 2;
      const ahead = _v.copy(car.velocity).setY(0);
      if (ahead.lengthSq() < 1) ahead.copy(car.forward);
      ahead.normalize();
      const side = _v2.set(-ahead.z, 0, ahead.x).multiplyScalar(Math.random() < 0.5 ? -1 : 1);
      if (c.index === 0) {
        c.anchor.copy(pos).addScaledVector(ahead, 25 + car.speed * 1.2).addScaledVector(side, 6).setY(pos.y + 0.5);
      } else if (c.index === 1) {
        c.anchor.copy(pos).addScaledVector(ahead, 10).setY(pos.y + 28);
      } else {
        c.anchor.copy(pos).addScaledVector(ahead, -8).addScaledVector(side, 3).setY(pos.y + 1.0);
      }
      this.collide(_target.copy(pos).setY(pos.y + 1), c.anchor, c.anchor);
      c.pos.copy(c.anchor);
    }
    if (c.index === 1) {
      // Drone follows overhead.
      c.pos.lerp(_v.copy(pos).setY(pos.y + 26).addScaledVector(car.velocity, 0.15), 1 - Math.exp(-1.5 * dt));
    } else if (c.index === 2) {
      _v.copy(pos).addScaledVector(car.forward, -7).setY(pos.y + 1.1);
      c.pos.lerp(_v, 1 - Math.exp(-6 * dt));
    }
    if (c.pos.distanceTo(pos) > 160) c.timer = 0;
    this.camera.position.copy(c.pos);
    this.camera.lookAt(pos.x, pos.y + 0.6, pos.z);
    this.camera.fov = damp(this.camera.fov, c.index === 0 ? 38 : 60, 3, dt);
    this.camera.updateProjectionMatrix();
  }

  updateShot(dt, car, visual) {
    const s = this.shot;
    s.t += dt;
    const cam = this.camera;
    const target = s.target ? (s.target.isVector3 ? s.target : s.target.position) : visual.position;
    if (s.type === 'orbit') {
      const a = (s.startAngle ?? 0) + s.t * (s.speed ?? 0.5);
      _v.set(Math.sin(a) * s.radius, s.height, Math.cos(a) * s.radius).add(target);
      if (s.collide !== false) this.collide(_target.copy(target).setY(target.y + 1), _v, _v);
      cam.position.copy(_v);
      cam.lookAt(target.x, target.y + (s.lookY ?? 0.6), target.z);
      cam.fov = s.fov ?? 50;
    } else if (s.type === 'fixed') {
      cam.position.copy(s.position);
      cam.lookAt(target.x, target.y + (s.lookY ?? 0.5), target.z);
      cam.fov = s.fov ?? 45;
    } else if (s.type === 'path') {
      const u = clamp(s.t / s.duration, 0, 1);
      const e = u * u * (3 - 2 * u);
      s.curve.getPoint(e, _v);
      cam.position.copy(_v);
      if (s.lookCurve) s.lookCurve.getPoint(e, _v2);
      else _v2.copy(target);
      cam.lookAt(_v2);
      cam.fov = s.fov ?? 55;
    } else if (s.type === 'free') {
      // Photo mode free camera is driven externally.
    }
    cam.updateProjectionMatrix();
    if (s.duration && s.t >= s.duration && s.type !== 'free') {
      const done = s.onDone;
      this.shot = null;
      this.initialized = false;
      if (done) done();
    }
  }

  applyShake(dt, car) {
    const speedRumble = clamp((car.speed - 50) / 70, 0, 1) * 0.12 + (car.thrust.rocket ? 0.12 : 0);
    const trauma = this.shake * this.shake + speedRumble * speedRumble;
    if (trauma < 0.0005) return;
    const t = this.shakeTime;
    const amp = trauma * 0.9;
    const n1 = Math.sin(t * 37.1) * 0.5 + Math.sin(t * 61.7) * 0.5;
    const n2 = Math.sin(t * 43.3 + 1.7) * 0.5 + Math.sin(t * 71.9 + 0.3) * 0.5;
    const n3 = Math.sin(t * 29.3 + 2.1);
    this.camera.position.x += n1 * amp * 0.25;
    this.camera.position.y += n2 * amp * 0.2;
    this.camera.rotateZ(n3 * amp * 0.035);
  }
}
