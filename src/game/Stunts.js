// Stunt tracker: air time, height, flips, barrel rolls and spins (from integrated body
// rotation), landing quality, and the Cold Snap aerial bullet-time mechanic.
import * as THREE from 'three';
import { G, groups } from '../core/Physics.js';
import { clamp } from '../util/math.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);
const TWO_PI = Math.PI * 2;

export class Stunts {
  constructor(game) {
    this.game = game;
    this.air = null;
    this.groundGroups = groups(0x8000, G.STATIC | G.RAMP);
    this.coldSnap = { active: false, timer: 0, cooldown: 0, pending: false, landWindow: 0 };
    this.heightTimer = 0;
    this.heightAboveGround = 0;
  }

  // Height of the car above whatever is below it.
  measureHeight(v) {
    const hit = this.game.physics.raycast(v.position, DOWN, 300, this.groundGroups, v.body);
    this.heightAboveGround = hit ? hit.timeOfImpact - 0.55 : 300;
    return this.heightAboveGround;
  }

  update(dt, realDt, v, input) {
    const g = this.game;
    const airborne = v.groundedCount === 0;
    if (airborne) {
      if (!this.air) this.air = { t: 0, pitch: 0, roll: 0, yaw: 0, maxH: 0, coldSnap: false, startSpeed: v.speed };
      const a = this.air;
      a.t += dt;
      // Integrate rotation about body axes.
      const av = v.body.angvel();
      _q.copy(v.quaternion).invert();
      _v.set(av.x, av.y, av.z).applyQuaternion(_q);
      a.pitch += _v.x * dt;
      a.yaw += _v.y * dt;
      a.roll += _v.z * dt;
      this.heightTimer -= realDt;
      if (this.heightTimer <= 0) {
        this.heightTimer = 0.08;
        a.maxH = Math.max(a.maxH, this.measureHeight(v));
      }
    }
    // Cold Snap: tap the thruster key while more than 8 m in the air.
    const cs = this.coldSnap;
    cs.cooldown = Math.max(0, cs.cooldown - realDt);
    if (!cs.active && airborne && input.pressed('hover') && cs.cooldown <= 0 && this.heightAboveGround > 8 && v.energy && !v.energy.emp) {
      if (v.energy.usePressure(v.energy.cost.coldSnap)) this.startColdSnap(v);
    }
    if (cs.active) {
      cs.timer -= realDt;
      g.gfx.fx.frost = Math.min(1, g.gfx.fx.frost + realDt * 6);
      if (cs.timer <= 0 || !airborne) this.endColdSnap();
    } else {
      g.gfx.fx.frost = Math.max(0, g.gfx.fx.frost - realDt * 2.5);
    }
    if (cs.landWindow > 0 && !airborne) cs.landWindow = 0;
    if (airborne && this.air && this.air.coldSnap) cs.landWindow = 1;
  }

  startColdSnap(v) {
    const g = this.game;
    const cs = this.coldSnap;
    cs.active = true;
    cs.timer = 1.5;
    cs.cooldown = 3;
    if (this.air) this.air.coldSnap = true;
    g.slowmo.scale = 0.25;
    g.slowmo.timer = 1.5;
    g.cameraCtl.playShot({ type: 'orbit', target: g.playerVisual.root, startAngle: Math.atan2(-v.forward.x, -v.forward.z) + 1.2, speed: 0.9, radius: 10, height: 2.5, lookY: 0, fov: 55, duration: 1.5 });
    g.events.emit('coldSnap', { vehicle: v });
  }

  endColdSnap() {
    const g = this.game;
    this.coldSnap.active = false;
    if (g.slowmo.scale < 1) {
      g.slowmo.scale = 1;
      g.slowmo.timer = 0;
    }
    if (g.cameraCtl.shot && g.cameraCtl.shot.type === 'orbit') g.cameraCtl.clearShot();
  }

  // Called by the vehicle's landing listener.
  onLand(v, airTime, vy) {
    const a = this.air;
    this.air = null;
    if (!a || airTime < 0.4) return null;
    const flips = Math.floor((Math.abs(a.pitch) + 0.6) / TWO_PI);
    const rolls = Math.floor((Math.abs(a.roll) + 0.6) / TWO_PI);
    const spins = Math.floor((Math.abs(a.yaw) + 0.5) / TWO_PI);
    const upright = v.up.y;
    const clean = upright > 0.85 && v.hp > 0;
    const perfect = clean && airTime > 1.0 && Math.abs(vy) < 22;
    const res = { airTime, height: a.maxH, flips, rolls, spins, upright, clean, perfect, coldSnap: a.coldSnap, vy };
    if (a.coldSnap && clean) this.frostShockwave(v);
    if (this.coldSnap.active) this.endColdSnap();
    this.game.events.emit('stuntLanding', res);
    return res;
  }

  // Cold Snap landing: frost ring that shoves nearby police away and can wreck them.
  frostShockwave(v) {
    const g = this.game;
    const p = v.position;
    g.vfx.ring(p, 0x9fe4ff, 24, 1.0, p.y - 0.5);
    g.vfx.ring(p, 0xffffff, 14, 0.6, p.y - 0.5);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TWO_PI;
      g.vfx.frost.spawn({
        x: p.x, y: p.y - 0.3, z: p.z, vx: Math.cos(a) * 22, vy: 1 + Math.random() * 2, vz: Math.sin(a) * 22,
        life: 0.9, size: 0.6, size1: 3, color: [0.8, 0.95, 1], color1: [0.3, 0.5, 0.7], alpha: 0.8, drag: 2,
      });
    }
    g.gfx.setFlash(0.35, 0xbfe8ff);
    g.cameraCtl.addShake(0.6);
    g.events.emit('frostShockwave', { position: p.clone(), radius: 24 });
    for (const n of g.npcs) {
      const d = n.vehicle.position.distanceTo(p);
      if (d > 24 || n.kind === 'traffic') continue;
      const f = clamp(1 - d / 24, 0, 1);
      _v.subVectors(n.vehicle.position, p).setY(0).normalize();
      const m = n.vehicle.mass;
      n.vehicle.body.applyImpulse({ x: _v.x * m * 22 * f, y: m * 7 * f, z: _v.z * m * 22 * f }, true);
      n.vehicle.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * m * 6 * f, y: 0, z: (Math.random() - 0.5) * m * 6 * f }, true);
      n.vehicle.damage(45 * f, v);
    }
  }
}
