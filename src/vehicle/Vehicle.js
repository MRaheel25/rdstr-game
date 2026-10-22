// Raycast vehicle on a Rapier rigid body.
// Four ray-cast wheels with spring/damper suspension and anti-roll bars, a simplified
// Pacejka tire model (slip angle + slip ratio with a friction ellipse), tri-motor AWD with
// torque vectoring, speed-squared downforce, aerodynamic drag and cold-gas thrusters.
// The same class drives the player Roadster, police units and wrecked traffic.
import * as THREE from 'three';
import { G, groups } from '../core/Physics.js';
import { MODES } from './VehicleConfig.js';
import { clamp, sign } from '../util/math.js';

export const QUERY = 0x8000;
const GRAVITY = 9.81;

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _mount = new THREE.Vector3();
const _down = new THREE.Vector3();
const _wf = new THREE.Vector3();
const _ws = new THREE.Vector3();
const _n = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _imp = new THREE.Vector3();
const _pt = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _qinv = new THREE.Quaternion();
const _rv = { x: 0, y: 0, z: 0 };
const _rp = { x: 0, y: 0, z: 0 };

function rv(v) {
  _rv.x = v.x;
  _rv.y = v.y;
  _rv.z = v.z;
  return _rv;
}
function rp(v) {
  _rp.x = v.x;
  _rp.y = v.y;
  _rp.z = v.z;
  return _rp;
}

// Simplified Pacejka "magic formula": peaks at 1 for x = 1, falls off beyond.
function magic(x, C) {
  const B = Math.tan(Math.PI / (2 * C));
  return Math.sin(C * Math.atan(B * x));
}

export class Vehicle {
  constructor(physics, cfg, { position, yaw = 0, kind = 'player', group = G.PLAYER } = {}) {
    this.physics = physics;
    this.cfg = cfg;
    this.kind = kind;
    this.group = group;
    this.mode = MODES.track;
    const R = physics.R;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const desc = R.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setCcdEnabled(true)
      .setCanSleep(false)
      .setAngularDamping(0.12)
      .setLinearDamping(0.0);
    this.body = physics.world.createRigidBody(desc);
    const filter = G.STATIC | G.PLAYER | G.POLICE | G.TRAFFIC | G.PROP | G.DEBRIS | G.RAMP | QUERY;
    this.colliders = [];
    for (const part of cfg.chassis) {
      // Rounded edges let the chassis ride up curbs and kerbs instead of snagging on them.
      const rr = Math.min(0.12, part.half[1] * 0.6);
      const cd = R.ColliderDesc.roundCuboid(part.half[0] - rr, part.half[1] - rr, part.half[2] - rr, rr)
        .setTranslation(part.offset[0], part.offset[1], part.offset[2])
        .setDensity(0)
        .setFriction(0.25)
        .setFrictionCombineRule(R.CoefficientCombineRule.Min)
        .setRestitution(0.12)
        .setCollisionGroups(groups(group, filter));
      const col = physics.world.createCollider(cd, this.body);
      physics.meta.set(col.handle, { kind: 'vehicle', ref: this });
      this.colliders.push(col);
    }
    this.body.setAdditionalMassProperties(
      cfg.mass,
      { x: cfg.com[0], y: cfg.com[1], z: cfg.com[2] },
      { x: cfg.inertia[0], y: cfg.inertia[1], z: cfg.inertia[2] },
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    );
    this.wheelQueryGroups = groups(QUERY, G.STATIC | G.RAMP | G.POLICE | G.TRAFFIC | G.PLAYER);

    this.wheels = cfg.wheels.map((w, i) => ({
      index: i,
      local: new THREE.Vector3(w.x, cfg.mountY, w.z),
      front: w.front,
      left: w.x < 0,
      radius: w.radius,
      compression: 0,
      prevCompression: 0,
      grounded: false,
      load: 0,
      contact: new THREE.Vector3(),
      normal: new THREE.Vector3(0, 1, 0),
      surface: 'asphalt',
      omega: 0,
      angle: 0,
      steer: 0,
      slide: 0, // sliding speed m/s for smoke, skid marks, squeal
      spin: false,
      locked: false,
      popped: false,
      longForce: 0,
      latForce: 0,
    }));

    this.controls = { throttle: 0, brake: 0, steer: 0, handbrake: 0, rocket: false, hover: false, pitch: 0, yaw: 0, roll: 0 };
    this.steerAngle = 0;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.armor = 1;
    this.gripMul = 1;
    this.powerScale = 1;
    this.speedCap = Infinity;
    this.energy = null; // player only: EnergySystem
    this.groundedCount = 0;
    this.airTime = 0;
    this.groundTime = 0;
    this.lastAirTime = 0;
    this.maxAirHeight = 0;
    this.launchY = 0;
    this.speed = 0;
    this.fwdSpeed = 0;
    this.slipAngle = 0;
    this.drifting = false;
    this.reversing = false;
    this.braking = false;
    this.wrecked = false;
    this.vBefore = new THREE.Vector3();
    this.lastImpact = { strength: 0, time: -10, normal: new THREE.Vector3(), point: new THREE.Vector3(), other: null };
    this.impactListeners = [];
    this.landListeners = [];
    this.scrape = 0;
    this.launch = { charge: 0, ready: false, boost: 0 };
    this.thrust = { rocket: 0, hover: 0, air: 0, pitch: 0, yaw: 0, roll: 0 };
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.velocity = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, -1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.right = new THREE.Vector3(1, 0, 0);
    this.time = 0;
    this.lastHitBy = null;
    this.lastHitTime = -10;
    this.readState();
  }

  get mass() {
    return this.cfg.mass;
  }

  setMode(id) {
    this.mode = MODES[id] || MODES.track;
  }

  reset(position, yaw) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.body.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (const w of this.wheels) {
      w.compression = 0;
      w.prevCompression = 0;
      w.omega = 0;
    }
    this.steerAngle = 0;
    this.airTime = 0;
    this.readState();
  }

  readState() {
    const t = this.body.translation();
    const r = this.body.rotation();
    const v = this.body.linvel();
    this.position.set(t.x, t.y, t.z);
    this.quaternion.set(r.x, r.y, r.z, r.w);
    this.velocity.set(v.x, v.y, v.z);
    this.up.set(0, 1, 0).applyQuaternion(this.quaternion);
    this.forward.set(0, 0, -1).applyQuaternion(this.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.quaternion);
    this.speed = this.velocity.length();
    this.fwdSpeed = this.velocity.dot(this.forward);
  }

  get yaw() {
    return Math.atan2(-this.forward.x, -this.forward.z);
  }

  // ---------------------------------------------------------------------------
  // Fixed step: called before world.step().
  physicsStep(dt) {
    this.time += dt;
    const cfg = this.cfg;
    const mode = this.mode;
    const body = this.body;
    const c = this.controls;
    this.readState();
    // Lying on the roof or side: the low-friction chassis would slide forever, so scrub speed.
    let scrub = false;
    if (this.up.y < 0.35 && this.groundedCount === 0) {
      _tmp.set(0, -1, 0);
      scrub = !!this.physics.raycast(this.position, _tmp, 1.7, this.wheelQueryGroups, body);
    }
    const damping = scrub ? 2.2 : 0;
    if (damping !== this.linDamping) {
      this.linDamping = damping;
      body.setLinearDamping(damping);
      body.setAngularDamping(scrub ? 1.2 : 0.12);
    }
    _pos.copy(this.position);
    _quat.copy(this.quaternion);
    _up.copy(this.up);
    _fwd.copy(this.forward);
    _right.copy(this.right);
    _down.copy(_up).negate();
    const fwdSpeed = this.fwdSpeed;
    const absFwd = Math.abs(fwdSpeed);
    const latVel = this.velocity.dot(_right);

    // Body slip angle (for drift detection and countersteer assist).
    this.slipAngle = this.speed > 3 ? Math.atan2(latVel, Math.max(absFwd, 0.5)) * sign(fwdSpeed || 1) : 0;

    // --- steering --------------------------------------------------------------
    const steerMax = (cfg.steer.max * mode.steerMul) / (1 + absFwd / cfg.steer.speedRef);
    let target = c.steer * Math.min(steerMax, 0.75);
    if (mode.countersteer > 0 && this.groundedCount >= 2 && absFwd > 6) {
      const assist = clamp(this.slipAngle * mode.countersteer, -0.45, 0.45);
      // Only assist when the player isn't steering hard into the slide.
      if (sign(c.steer) !== -sign(assist) || Math.abs(c.steer) < 0.3) target += assist;
    }
    if (fwdSpeed < -1) target = c.steer * steerMax;
    const rate = Math.abs(target) > Math.abs(this.steerAngle) ? cfg.steer.rate : cfg.steer.returnRate;
    const ds = target - this.steerAngle;
    this.steerAngle += clamp(ds, -rate * dt, rate * dt);

    // --- energy / power ---------------------------------------------------------
    const energy = this.energy;
    let powerScale = this.powerScale;
    if (energy) powerScale *= energy.powerScale;
    const ghostCap = energy && energy.ghost ? energy.ghostSpeedCap : Infinity;
    const cap = Math.min(this.speedCap, ghostCap);

    // --- drive / brake demand ---------------------------------------------------
    let driveForce = 0;
    let brakeForce = 0;
    const throttle = this.wrecked ? 0 : c.throttle;
    const brake = this.wrecked ? 0.4 : c.brake;
    this.reversing = false;
    if (brake > 0.1 && throttle < 0.1 && fwdSpeed < 1.2) {
      // Reverse.
      this.reversing = true;
      driveForce = fwdSpeed > -cfg.drive.reverseSpeed ? -cfg.drive.maxForce * 0.45 * brake : 0;
    } else {
      const fmax = cfg.drive.maxForce * (this.launch.boost > 0 ? 1.18 : 1);
      driveForce = throttle * Math.min(fmax, (cfg.drive.power * powerScale) / Math.max(absFwd, 1));
      if (fwdSpeed > cap) driveForce = Math.min(driveForce, 0);
      brakeForce = brake * cfg.drive.brakeForce;
      if (throttle < 0.05 && brake < 0.05 && absFwd > 1) brakeForce = cfg.drive.regenForce; // regen drag
    }
    this.braking = brake > 0.1 && !this.reversing;

    // Launch control: hold brake + throttle at standstill for 1 s, release brake.
    const L = this.launch;
    if (this.kind === 'player') {
      if (c.brake > 0.5 && c.throttle > 0.5 && absFwd < 1) {
        L.charge += dt;
        L.ready = L.charge > 1;
        driveForce = 0;
        brakeForce = cfg.drive.brakeForce;
      } else {
        if (L.ready && c.throttle > 0.5 && c.brake < 0.2) {
          L.boost = 1.4;
          if (this.onLaunch) this.onLaunch();
        }
        L.charge = 0;
        L.ready = false;
      }
      if (L.boost > 0) L.boost -= dt;
    }

    // --- suspension -------------------------------------------------------------
    const susp = cfg.suspension;
    let grounded = 0;
    for (const w of this.wheels) {
      _mount.copy(w.local).applyQuaternion(_quat).add(_pos);
      w.mountWorld = w.mountWorld || new THREE.Vector3();
      w.mountWorld.copy(_mount);
      const maxLen = susp.rest + w.radius;
      const hit = this.physics.raycast(_mount, _down, maxLen, this.wheelQueryGroups, body);
      w.prevCompression = w.compression;
      if (!hit) {
        w.grounded = false;
        w.compression = Math.max(0, w.compression - dt * 2.5);
        w.load = 0;
        w.slide = 0;
        continue;
      }
      grounded++;
      w.grounded = true;
      const comp = clamp(maxLen - hit.timeOfImpact, 0, susp.rest);
      w.compression = comp;
      w.contact.copy(_down).multiplyScalar(hit.timeOfImpact).add(_mount);
      w.normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
      const meta = this.physics.meta.get(hit.collider.handle);
      w.surface = (meta && meta.surface) || 'asphalt';
      w.hitKind = meta ? meta.kind : 'static';
      const axle = w.front ? 0 : 1;
      const compVel = (w.compression - w.prevCompression) / dt;
      let f = susp.k[axle] * comp + susp.c[axle] * compVel;
      if (comp > susp.rest * 0.82) f += susp.bumpK * (comp - susp.rest * 0.82);
      w.load = clamp(f, 0, susp.maxForce);
    }
    // Anti-roll bars.
    for (let axle = 0; axle < 2; axle++) {
      const l = this.wheels[axle * 2];
      const r = this.wheels[axle * 2 + 1];
      if (l.grounded && r.grounded) {
        const ar = (l.compression - r.compression) * susp.antiRoll[axle];
        l.load = clamp(l.load + ar, 0, susp.maxForce);
        r.load = clamp(r.load - ar, 0, susp.maxForce);
      }
    }
    const wasGrounded = this.groundedCount;
    this.groundedCount = grounded;

    // --- tires ------------------------------------------------------------------
    const frontShare = mode.frontShare;
    const tvBias = clamp(this.steerAngle * 3 * mode.torqueVector, -0.3, 0.3);
    const tc = mode.tc && this.kind === 'player';
    let slideTotal = 0;
    for (const w of this.wheels) {
      if (!w.grounded) {
        // Free-spinning wheel in the air.
        const target = throttle > 0.1 ? 60 : w.omega * 0.98;
        w.omega += (target - w.omega) * Math.min(1, dt * 2);
        w.angle += w.omega * dt;
        w.longForce = 0;
        w.latForce = 0;
        continue;
      }
      const axle = w.front ? 0 : 1;
      const steer = w.front ? this.steerAngle : 0;
      w.steer = steer;
      _n.copy(w.normal);
      // Wheel heading, projected on contact plane.
      _wf.copy(_fwd).multiplyScalar(Math.cos(steer)).addScaledVector(_right, Math.sin(steer));
      _wf.addScaledVector(_n, -_wf.dot(_n)).normalize();
      _ws.crossVectors(_wf, _n).normalize(); // points right
      const v = body.velocityAtPoint(rp(w.contact));
      _vel.set(v.x, v.y, v.z);
      const vL = _vel.dot(_wf);
      const vS = _vel.dot(_ws);
      const fz = w.load;
      const massShare = fz / GRAVITY;
      const wet = this.wetGrip !== undefined && (w.surface === 'asphalt' || !w.surface) ? this.wetGrip : 1;
      const grip = cfg.tire.mu * mode.grip[axle] * this.gripMul * surfaceGrip(w.surface) * wet * (w.popped ? 0.45 : 1) *
        (L.boost > 0 ? 1.2 : 1);
      const fxMax = grip * fz;
      const fyMax = grip * fz;

      // Longitudinal demand.
      let share;
      if (w.front) share = frontShare * 0.5;
      else share = (1 - frontShare) * 0.5 * (1 + (w.left ? tvBias : -tvBias));
      let fx = driveForce * share;
      const handbrake = c.handbrake > 0.5 && !w.front;
      // Brakes oppose rolling direction and never reverse it.
      let bf = brakeForce * (w.front ? cfg.drive.brakeFront : 1 - cfg.drive.brakeFront) * 0.5;
      if (handbrake) bf = Math.max(bf, cfg.drive.brakeForce * 0.5);
      const stopLimit = (Math.abs(vL) * massShare) / dt;
      fx -= sign(vL) * Math.min(bf, stopLimit);
      // Hold the car still when idle at very low speed.
      if (throttle < 0.05 && !this.reversing && Math.abs(vL) < 0.6) fx = -vL * massShare / dt * 0.5;
      // Rolling resistance.
      fx -= sign(vL) * Math.min(cfg.tire.rollRes * fz, stopLimit);

      w.spin = false;
      w.locked = false;
      let slideLong = 0;
      // Pure lateral force from slip angle (simplified Pacejka).
      const alphaPeak = cfg.tire.alphaPeak * mode.alphaPeakMul[axle];
      const alpha = Math.atan2(vS, Math.max(Math.abs(vL), 1.2));
      const fy0 = -fyMax * magic(alpha / alphaPeak, mode.falloff[axle]);
      let fy;
      const slideMu = 0.92; // sliding friction relative to peak
      if (handbrake && Math.abs(vL) > 1.5) {
        // Locked wheel: friction opposes the whole contact-patch velocity.
        w.locked = true;
        const S = Math.hypot(vL, vS) || 1;
        const F = fxMax * slideMu;
        fx = Math.max(-stopLimit, Math.min(stopLimit, (-F * vL) / S));
        fy = (-F * vS) / S;
        slideLong = Math.abs(vL);
      } else if (tc) {
        // Traction/stability control: cap drive and brake to what's left of the friction
        // ellipse after the lateral demand, so the car never breaks traction.
        const uy = Math.min(1, Math.abs(fy0) / Math.max(fyMax, 1));
        const fxCap = fxMax * Math.sqrt(Math.max(0.12, 1 - uy * uy));
        if (Math.abs(fx) > fxCap) fx = sign(fx) * fxCap;
        const ux = Math.min(1, Math.abs(fx) / Math.max(fxMax, 1));
        fy = fy0 * Math.sqrt(Math.max(0, 1 - ux * ux));
      } else if (Math.abs(fx) > fxMax) {
        // Wheelspin: the tire slides; friction acts along the slip-velocity vector
        // (spin speed vs lateral slide). More throttle -> more spin -> less side grip,
        // which makes the drift angle balance against throttle.
        w.spin = true;
        const excess = Math.abs(fx) / fxMax - 1;
        const sx = sign(fx) * Math.min(16, 2.5 + excess * 14);
        const S = Math.hypot(sx, vS) || 1;
        const F = fxMax * slideMu;
        fx = (F * sx) / S;
        fy = (-F * vS) / S;
        // Blend with the pure lateral curve so small slides still feel grippy.
        if (Math.abs(fy0) > Math.abs(fy)) fy = fy + (fy0 - fy) * 0.25;
        slideLong = Math.abs(sx);
      } else {
        const ux = Math.min(1, Math.abs(fx) / Math.max(fxMax, 1));
        fy = fy0 * Math.sqrt(Math.max(0.04, 1 - ux * ux));
      }
      // Never push more than needed to cancel the lateral velocity this step (stability at low speed).
      const latLimit = (Math.abs(vS) * massShare) / dt * 0.9;
      fy = clamp(fy, -latLimit, latLimit);

      const slideLat = Math.abs(alpha) > alphaPeak * 1.25 ? Math.abs(vS) : 0;
      w.slide = slideLat + slideLong;
      slideTotal += w.slide;
      w.longForce = fx;
      w.latForce = fy;

      _imp.copy(_wf).multiplyScalar(fx * dt).addScaledVector(_ws, fy * dt);
      // Apply slightly above the contact patch to tame roll-over tendency.
      _pt.copy(w.contact).addScaledVector(_up, 0.12);
      body.applyImpulseAtPoint(rv(_imp), rp(_pt), true);
      // Suspension force along the body up axis.
      _imp.copy(_up).multiplyScalar(w.load * dt);
      body.applyImpulseAtPoint(rv(_imp), rp(w.mountWorld), true);

      // Wheel rotation for visuals.
      if (w.locked) w.omega = 0;
      else w.omega = (vL + (w.spin ? sign(fx) * slideLong : 0)) / w.radius;
      w.angle += w.omega * dt;
    }
    this.slide = slideTotal;
    this.drifting = grounded >= 3 && this.speed > 11 && Math.abs(this.slipAngle) > 0.26;

    // Drift assist: keeps slides catchable by resisting over-rotation past the mode's
    // maximum slip angle (a stability system, not a hard limit).
    if (grounded >= 3 && this.speed > 5 && this.kind === 'player') {
      const beta = this.slipAngle;
      const betaMax = mode.id === 'drift' ? 0.7 : 0.38;
      const av = body.angvel();
      const yawRate = av.x * _up.x + av.y * _up.y + av.z * _up.z;
      const excess = Math.abs(beta) - betaMax;
      if (excess > 0 && sign(yawRate) === sign(beta)) {
        const k = mode.id === 'drift' ? 7 : 10;
        const tau = -yawRate * Math.min(1, excess * k) * cfg.inertia[1] * 6 * dt;
        body.applyTorqueImpulse(rv(_tmp.copy(_up).multiplyScalar(tau)), true);
      }
      // Catch: lifting off and centring the wheel straightens the car out.
      if (Math.abs(beta) > 0.12 && Math.abs(c.steer) < 0.25 && throttle < 0.55) {
        const tau = -beta * 4.5 * cfg.inertia[1] * dt * (1 - throttle);
        body.applyTorqueImpulse(rv(_tmp.copy(_up).multiplyScalar(tau)), true);
      }
    }

    // --- aerodynamics -------------------------------------------------------------
    const sp2 = this.speed * this.speed;
    if (this.speed > 0.5) {
      _imp.copy(this.velocity).multiplyScalar(-cfg.aero.dragK * this.speed * dt);
      body.applyImpulse(rv(_imp), true);
    }
    if (grounded >= 2 && cfg.aero.downforceK > 0) {
      const df = cfg.aero.downforceK * Math.min(sp2, 120 * 120);
      const front = this.wheels[0].local.z;
      const rear = this.wheels[2].local.z;
      _pt.set(0, 0, front).applyQuaternion(_quat).add(_pos);
      _imp.copy(_down).multiplyScalar(df * cfg.aero.downforceFront * dt);
      body.applyImpulseAtPoint(rv(_imp), rp(_pt), true);
      _pt.set(0, 0, rear).applyQuaternion(_quat).add(_pos);
      _imp.copy(_down).multiplyScalar(df * (1 - cfg.aero.downforceFront) * dt);
      body.applyImpulseAtPoint(rv(_imp), rp(_pt), true);
    }

    // V2: off-road rolling resistance (grass / dirt slow the car), so the road is the fast line.
    let soft = 0;
    for (const w of this.wheels) if (w.grounded && (w.surface === 'grass' || w.surface === 'dirt')) soft++;
    this.offroad = soft / 4;
    if (soft && this.speed > 1) {
      const k = (w0) => (w0 === 'grass' ? 0.55 : 0.4);
      const drag = this.mass * k(this.wheels.find((w) => w.grounded && (w.surface === 'grass' || w.surface === 'dirt')).surface) * (soft / 4) * Math.min(1, this.speed / 8);
      _imp.set(this.velocity.x, 0, this.velocity.z).normalize().multiplyScalar(-drag * dt * 1.6);
      body.applyImpulse(rv(_imp), true);
    }

    // --- thrusters (Roadster SpaceX package) ---------------------------------------
    this.thrust.rocket = 0;
    this.thrust.hover = 0;
    this.thrust.air = 0;
    this.thrust.pitch = 0;
    this.thrust.yaw = 0;
    this.thrust.roll = 0;
    if (cfg.thrusters && energy) this.applyThrusters(dt, c, energy, grounded);

    // V2 air stabilisation: hold the car level (Assisted Flight), gently in Pro Flight, and
    // harder in the last second before landing so landings are usually clean.
    const aa = this.airAssist;
    if (grounded === 0 && aa && aa.on && aa.strength > 0 && !this.wrecked && !(energy && energy.emp)) {
      const s = aa.strength * (aa.landing > 0 && aa.landing < 0.9 ? 2.2 : 1);
      _tmp.set(0, 1, 0);
      const err = _tmp2.crossVectors(_up, _tmp); // axis * sin(angle) that rotates up -> world up
      if (_up.y < 0) {
        // Upside down: full push, rolling about the nose if exactly inverted.
        const l = err.length();
        if (l < 0.05) err.copy(_fwd);
        else err.divideScalar(l);
      }
      const av = body.angvel();
      const w = _vel.set(av.x, av.y, av.z);
      w.addScaledVector(_tmp, -w.dot(_tmp)); // leave yaw alone
      const I = cfg.inertia ? (cfg.inertia[0] + cfg.inertia[2]) / 2 : this.mass;
      const tq = err.multiplyScalar(9).addScaledVector(w, -3.2).multiplyScalar(I * s * dt);
      body.applyTorqueImpulse(rv(tq), true);
    }

    // Airborne bookkeeping.
    if (grounded === 0) {
      if (this.airTime === 0) {
        this.launchY = _pos.y;
        this.maxAirHeight = 0;
      }
      this.airTime += dt;
      this.groundTime = 0;
      this.maxAirHeight = Math.max(this.maxAirHeight, _pos.y - this.launchY);
    } else {
      if (this.airTime > 0.35 && wasGrounded === 0) {
        this.lastAirTime = this.airTime;
        for (const fn of this.landListeners) fn(this, this.airTime, this.velocity.y);
      }
      if (this.airTime > 0) this.airTime = 0;
      this.groundTime += dt;
    }

    // Keep rotations sane on the ground (prevents numerical spin-ups after hard contacts).
    if (grounded >= 2) {
      const av = body.angvel();
      const m = Math.hypot(av.x, av.y, av.z);
      if (m > 6) body.setAngvel({ x: (av.x * 6) / m, y: (av.y * 6) / m, z: (av.z * 6) / m }, true);
    }

    const lv = body.linvel();
    this.vBefore.set(lv.x, lv.y, lv.z);
  }

  applyThrusters(dt, c, energy, grounded) {
    const body = this.body;
    const mode = this.mode;
    const canFire = !energy.emp && !this.wrecked;
    // Rear Rockets: strong forward thrust.
    if (c.rocket && canFire && energy.usePressure(energy.cost.rocket * dt)) {
      const force = 21000 * energy.thrusterPower;
      _imp.copy(_fwd).multiplyScalar(force * dt);
      body.applyImpulse(rv(_imp), true);
      this.thrust.rocket = 1;
      energy.heat(dt * 6.5);
    }
    // Hover Jets: tap on ground to hop, hold in the air to slow the fall or hover.
    if (c.hover && canFire) {
      if (grounded >= 2 && this.groundTime > 0.15 && !this.hopLatch) {
        if (energy.usePressure(energy.cost.hop)) {
          const hop = 6.4 * mode.hover;
          _imp.copy(_up).multiplyScalar(this.mass * hop);
          body.applyImpulse(rv(_imp), true);
          this.thrust.hover = 1;
          this.hopLatch = true;
          if (this.onHop) this.onHop();
        }
      } else if (grounded < 2 && energy.usePressure(energy.cost.hover * dt)) {
        // Thrust along body up but always enough to fight gravity when upright.
        const force = this.mass * GRAVITY * 1.12 * mode.hover * energy.thrusterPower;
        _imp.copy(_up).multiplyScalar(force * dt);
        body.applyImpulse(rv(_imp), true);
        // Bleed horizontal speed a touch for control.
        this.thrust.hover = 1;
      }
    }
    if (!c.hover) this.hopLatch = false;

    // Air control: pitch / yaw / roll only through cold-gas thrusters.
    if (grounded === 0 && canFire && this.airTime > 0.08) {
      const want = Math.abs(c.pitch) + Math.abs(c.yaw) + Math.abs(c.roll);
      if (want > 0.05 && energy.usePressure(energy.cost.air * dt)) {
        const rate = mode.airRate;
        const accel = mode.airAccel;
        const av = body.angvel();
        // Angular velocity in local frame.
        _qinv.copy(this.quaternion).invert();
        _tmp.set(av.x, av.y, av.z).applyQuaternion(_qinv);
        // Targets: pitch (local X, nose down for +pitch), yaw (local Y, right turn for +yaw), roll (local Z).
        const targets = [-c.pitch * rate, -c.yaw * rate, -c.roll * rate * 1.2];
        const inertia = this.cfg.inertia;
        const torque = _tmp2.set(0, 0, 0);
        const comps = ['x', 'y', 'z'];
        for (let i = 0; i < 3; i++) {
          const input = i === 0 ? c.pitch : i === 1 ? c.yaw : c.roll;
          if (Math.abs(input) < 0.05) continue;
          const cur = _tmp[comps[i]];
          const err = targets[i] - cur;
          const a = clamp(err * 6, -accel, accel);
          torque[comps[i]] = a * inertia[i];
        }
        torque.applyQuaternion(this.quaternion);
        body.applyTorqueImpulse(rv(torque.multiplyScalar(dt)), true);
        this.thrust.air = 1;
        this.thrust.pitch = c.pitch;
        this.thrust.yaw = c.yaw;
        this.thrust.roll = c.roll;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Fixed step: called after world.step(). Detects impacts from the velocity change
  // the solver applied (beyond what our own forces and gravity did).
  afterStep(dt, game) {
    const lv = this.body.linvel();
    _tmp.set(lv.x, lv.y - this.vBefore.y + GRAVITY * dt, lv.z);
    _tmp.x -= this.vBefore.x;
    _tmp.z -= this.vBefore.z;
    const dv = _tmp.length();
    this.scrape = Math.max(0, this.scrape - dt * 4);
    if (dv > 2.2) {
      // Ignore pure suspension bottoming on flat landings: those are reported by landing events.
      const vertical = Math.abs(_tmp.y) / dv;
      const upright = this.up.y;
      const landing = vertical > 0.8 && upright > 0.75;
      const other = this.findContact(_pt, _n);
      if (!landing || dv > 14) {
        const info = this.lastImpact;
        info.strength = dv;
        info.time = this.time;
        info.normal.copy(_tmp).normalize();
        info.point.copy(other ? _pt : this.position);
        info.other = other;
        info.speedBefore = this.vBefore.length();
        info.headOn = info.speedBefore > 53.6 && info.normal.dot(this.forward) < -0.55 && dv > 22;
        info.roof = upright < 0.2 && vertical > 0.6;
        for (const fn of this.impactListeners) fn(this, info);
      }
    } else if (dv > 0.35 && this.speed > 4) {
      // Light continuous contact: scraping along a wall.
      const other = this.findContact(_pt, _n);
      if (other && other.kind !== 'terrain' && other.kind !== 'road') {
        this.scrape = Math.min(1, this.scrape + dt * 12);
        this.scrapePoint = this.scrapePoint || new THREE.Vector3();
        this.scrapePoint.copy(_pt);
      }
    }
  }

  // Finds a collider currently touching the chassis; writes contact point and normal.
  findContact(outPoint, outNormal) {
    const world = this.physics.world;
    let found = null;
    for (const col of this.colliders) {
      world.contactPairsWith(col, (other) => {
        if (found) return;
        world.contactPair(col, other, (manifold, flipped) => {
          if (found || manifold.numSolverContacts() === 0) return;
          const p = manifold.solverContactPoint(0);
          if (p) outPoint.set(p.x, p.y, p.z);
          const n = manifold.normal();
          if (n) outNormal.set(n.x, n.y, n.z).multiplyScalar(flipped ? -1 : 1);
          found = this.physics.meta.get(other.handle) || { kind: 'static' };
          found.collider = other;
        });
      });
      if (found) break;
    }
    return found;
  }

  damage(amount, source) {
    if (amount <= 0) return;
    this.hp = Math.max(0, this.hp - amount * this.armor);
    if (source) {
      this.lastHitBy = source;
      this.lastHitTime = this.time;
    }
  }

  destroy() {
    this.physics.removeBody(this.body);
  }
}

export function surfaceGrip(surface) {
  switch (surface) {
    case 'dirt': return 0.78;
    case 'metal': return 0.85;
    case 'grass': return 0.65;
    case 'wet': return 0.9;
    default: return 1;
  }
}
