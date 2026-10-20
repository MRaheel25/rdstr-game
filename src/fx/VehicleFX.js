// Per-vehicle effect emission: tyre smoke, skid marks, rim sparks, wet spray, dirt dust,
// scraping sparks and low-health battery smoke. Works for the player and AI vehicles.
import * as THREE from 'three';

const _side = new THREE.Vector3();
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();
let nextId = 1;

export class VehicleFX {
  constructor(vfx, vehicle, { smokeTint = null, isPlayer = false } = {}) {
    this.vfx = vfx;
    this.v = vehicle;
    this.id = nextId++;
    this.acc = [0, 0, 0, 0];
    this.isPlayer = isPlayer;
    this.smokeTint = smokeTint;
    this.batterySmoke = null;
  }

  update(dt, { wet = false, near = true } = {}) {
    const v = this.v;
    const vfx = this.vfx;
    if (dt <= 0) return;
    v.wheels.forEach((w, i) => {
      const key = this.id * 10 + i;
      if (!w.grounded) {
        vfx.skids.break(key);
        return;
      }
      const slide = w.slide;
      // Skid marks while sliding hard on paved surfaces.
      if (slide > 2.2 && w.surface !== 'dirt' && w.surface !== 'grass') {
        _side.copy(v.right);
        vfx.skids.add(key, w.contact, _side, w.front ? 0.13 : 0.15);
      } else vfx.skids.break(key);
      if (!near) return;
      // Tyre smoke: rate rises with slide speed.
      if (slide > 2.5 && w.surface !== 'dirt') {
        this.acc[i] += (slide - 2) * dt * (v.drifting ? 9 : 6);
        while (this.acc[i] >= 1) {
          this.acc[i] -= 1;
          vfx.tireSmoke(w.contact, v.velocity, 1, this.smokeTint);
        }
      }
      // Dust on dirt.
      if (w.surface === 'dirt' && v.speed > 6 && Math.random() < 0.5 * vfx.quality()) {
        vfx.dust.spawn({
          x: w.contact.x, y: w.contact.y + 0.2, z: w.contact.z, vx: -v.velocity.x * 0.1, vy: 0.8, vz: -v.velocity.z * 0.1,
          life: 1.4, size: 0.6, size1: 3.6, color: [0.48, 0.4, 0.32], alpha: 0.3, drag: 1.5,
        });
      }
      // Wet roads: spray behind the wheels.
      if (wet && v.speed > 14 && !w.front && Math.random() < 0.6 * vfx.quality()) {
        vfx.water.spawn({
          x: w.contact.x, y: w.contact.y + 0.15, z: w.contact.z,
          vx: v.velocity.x * 0.55 + (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2.5, vz: v.velocity.z * 0.55 + (Math.random() - 0.5) * 2,
          life: 0.6, size: 0.3, size1: 2.4, color: [0.62, 0.68, 0.76], alpha: 0.28, drag: 2.5, gravity: 4,
        });
      }
      // Driving on rims after a spike strip: constant sparks.
      if (w.popped && v.speed > 4 && Math.random() < 0.8) {
        _d.copy(v.velocity).normalize().multiplyScalar(-1).setY(0.3);
        vfx.sparksAt(w.contact, _d, 2, 8);
      }
    });
    // Scraping along walls.
    if (v.scrape > 0.3 && v.scrapePoint && near) {
      _d.copy(v.velocity).multiplyScalar(-1 / Math.max(1, v.speed)).setY(0.4);
      vfx.sparksAt(v.scrapePoint, _d, 3 * v.scrape, 10);
    }
    // Battery smoke when the chassis is badly damaged.
    const low = v.hp / v.maxHp < 0.3;
    if (low && !this.batterySmoke) {
      const vv = v;
      this.batterySmoke = vfx.addEmitter({
        type: 'smoke', duration: 1e9, rate: 0.7, sparks: true, color: [0.16, 0.16, 0.17],
        pos: () => _p.set(0, 0.15, 0.4).applyQuaternion(vv.quaternion).add(vv.position),
        alive: () => vv.hp / vv.maxHp < 0.3,
      });
    } else if (!low) this.batterySmoke = null;
  }
}
