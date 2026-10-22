// V2 service stations. Drive into a bay and stop:
// - Charging Station: battery fills with a light ring around the car, cable glow, hum (costs cash).
// - Repair Shop: roller door closes, sparks + tool sounds, chassis HP restored, COPV refilled.
// - Garage / Tuning Shop: opens the Garage menu (paint and upgrades).
import * as THREE from 'three';

const COST = { chargePerPct: 3, repairPerHp: 4, repairMin: 150 };
const STOP_TIME = 0.7; // s stopped in a bay before the service starts

export class Services {
  constructor(game) {
    this.game = game;
    this.points = game.world.gen.services || [];
    this.active = null; // { s, t, kind, ... }
    this.stopped = 0;
    this.cooldown = 0;
    // Charging ring (shown around the car while charging).
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.9, 0.07, 6, 48).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x40e8ff).multiplyScalar(2.5), transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.ring.visible = false;
    this.ring.userData.noCollider = true;
    game.scene.add(this.ring);
    // Roller doors over the workshop bays.
    this.doors = [];
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.5, metalness: 0.7 });
    for (const s of this.points) {
      if (!s.door) continue;
      const d = s.door;
      const m = new THREE.Mesh(new THREE.BoxGeometry(d.w, d.h, 0.12), doorMat);
      m.rotation.y = d.yaw;
      m.position.set(d.x, 0.12 + d.h * 1.5 - 0.3, d.z); // rolled up (hidden in the header)
      m.userData.open = 1;
      m.userData.base = 0.12 + d.h / 2;
      m.userData.h = d.h;
      m.castShadow = true;
      m.userData.noCollider = true;
      game.scene.add(m);
      s.doorMesh = m;
      this.doors.push(m);
    }
  }

  nearest(p) {
    let best = null;
    let bd = Infinity;
    for (const s of this.points) {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < s.r && Math.abs(p.y - s.y) < 2.5 && d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  update(dt) {
    const g = this.game;
    const car = g.player;
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (const m of this.doors) {
      // Door height: open = 1 (rolled up), 0 = closed.
      const target = this.active && this.active.s.doorMesh === m && this.active.t > 0.3 && this.active.t < this.active.dur - 0.6 ? 0 : 1;
      m.userData.open += (target - m.userData.open) * Math.min(1, dt * 3);
      m.position.y = m.userData.base + m.userData.open * (m.userData.h - 0.4);
      m.scale.y = 1 - m.userData.open * 0.92;
    }
    if (g.state !== 'playing') return;
    if (this.active) return this.run(dt);
    const s = this.nearest(car.position);
    if (!s || this.cooldown > 0 || car.wrecked) {
      this.stopped = 0;
      if (this.prompting) {
        g.hud.prompt(null);
        this.prompting = false;
      }
      return;
    }
    const need = this.needs(s);
    if (!need.ok) {
      g.hud.prompt(need.msg);
      this.prompting = true;
      return;
    }
    if (car.speed < 1.2) this.stopped += dt;
    else this.stopped = 0;
    g.hud.prompt(car.speed < 1.2 ? `${need.label}…` : `STOP IN THE BAY · ${need.label}`);
    this.prompting = true;
    if (this.stopped > STOP_TIME) this.start(s, need);
  }

  needs(s) {
    const g = this.game;
    const car = g.player;
    const e = car.energy;
    const cash = g.progress.cash;
    if (s.type === 'charge') {
      const pct = 100 - e.battery;
      if (pct < 2) return { ok: false, msg: 'BATTERY FULL' };
      const cost = Math.ceil(pct * COST.chargePerPct);
      if (cash < 1) return { ok: false, msg: 'NO CASH FOR CHARGING' };
      return { ok: true, label: `CHARGE $${Math.min(cash, cost)}`, cost: Math.min(cash, cost), pct: Math.min(pct, cash / COST.chargePerPct) };
    }
    if (s.type === 'repair') {
      const dmg = car.maxHp - car.hp;
      const low = e.pressure < e.pressureMax - 1 || car.wheels.some((w) => w.popped);
      if (dmg < 1 && !low) return { ok: false, msg: 'REPAIR SHOP · NOTHING TO FIX' };
      const cost = Math.max(COST.repairMin, Math.ceil(dmg * COST.repairPerHp));
      if (cash < cost) return { ok: false, msg: `REPAIR $${cost} · NOT ENOUGH CASH` };
      return { ok: true, label: `REPAIR $${cost}`, cost };
    }
    return { ok: true, label: 'GARAGE · TUNING', cost: 0 };
  }

  start(s, need) {
    const g = this.game;
    this.stopped = 0;
    if (s.type === 'tuning') {
      this.cooldown = 4;
      g.hud.prompt(null);
      g.state = 'paused';
      g.menu.showGarage('pause');
      return;
    }
    const car = g.player;
    this.active = { s, need, t: 0, dur: s.type === 'charge' ? 2.5 + need.pct * 0.03 : 3.2, from: car.energy.battery };
    g.inputLock = true;
    if (s.type === 'charge') this.ring.visible = true;
  }

  run(dt) {
    const g = this.game;
    const a = this.active;
    const car = g.player;
    a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    const p = car.position;
    if (a.s.type === 'charge') {
      g.hud.charging = true;
      car.energy.battery = a.from + a.need.pct * k;
      this.ring.position.set(p.x, p.y - 0.45 + Math.sin(a.t * 3) * 0.35 + 0.4, p.z);
      this.ring.scale.setScalar(1 + 0.08 * Math.sin(a.t * 8));
      this.ring.material.opacity = 0.5 + 0.4 * Math.sin(a.t * 6);
      if (Math.random() < dt * 10 && a.s.cable) g.vfx.sparksAt(new THREE.Vector3(a.s.cable.x, a.s.cable.y, a.s.cable.z), new THREE.Vector3(0, 1, 0), 2, 2);
      g.audio && g.audio.sfx.charging(p);
      g.hud.prompt(`CHARGING ${Math.round(car.energy.battery)}%`);
    } else {
      if (a.t > 0.8 && a.t < a.dur - 0.5 && Math.random() < dt * 14) {
        const sp = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 3));
        g.vfx.sparksAt(sp, new THREE.Vector3(Math.random() - 0.5, 1, Math.random() - 0.5), 8, 6);
        g.audio && g.audio.sfx.tools(p);
      }
      g.hud.prompt(`REPAIRING ${Math.round(k * 100)}%`);
    }
    if (a.t >= a.dur) this.finish();
  }

  finish() {
    const g = this.game;
    const a = this.active;
    const car = g.player;
    g.progress.spend(a.need.cost);
    if (a.s.type === 'repair') {
      car.hp = car.maxHp;
      car.zoneDamage = { front: 0, rear: 0, left: 0, right: 0 };
      car.energy.refillPressure();
      for (const w of car.wheels) w.popped = false;
      g.playerVisual.repair();
      g.banner.show('REPAIRED', `Chassis 100% · COPV refilled · -$${a.need.cost}`, 'cool', 2);
    } else {
      g.vfx.ring(car.position, 0x40e8ff, 6, 0.6);
      g.banner.show('CHARGED', `Battery ${Math.round(car.energy.battery)}% · -$${a.need.cost}`, 'cool', 2);
    }
    g.audio && g.audio.sfx.serviceDone();
    this.ring.visible = false;
    g.hud.charging = false;
    this.active = null;
    this.cooldown = 3;
    g.inputLock = false;
    g.hud.prompt(null);
  }

  cancel() {
    if (!this.active) return;
    this.ring.visible = false;
    this.game.hud.charging = false;
    this.active = null;
    this.game.inputLock = false;
  }
}
