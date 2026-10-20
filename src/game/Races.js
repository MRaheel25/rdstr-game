// Street races built into the open world: Highway Ring Sprint, Downtown Circuit and the
// Canyon Drift Run. Rival AI drivers follow the racing line (rubber-banded around the player),
// checkpoints are glowing gates, laps and best laps are timed, police can join mid-race.
import * as THREE from 'three';
import { Driver } from '../ai/Driver.js';
import { RIVAL } from '../vehicle/VehicleConfig.js';
import { RivalModel, RIVALS } from '../vehicle/models/RivalModels.js';
import { VehicleFX } from '../fx/VehicleFX.js';
import { G, groups } from '../core/Physics.js';
import { clamp } from '../util/math.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

// Resample a polyline at a fixed spacing.
function resample(points, step, closed) {
  const pts = closed ? [...points, points[0]] : points;
  const out = [pts[0].clone()];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = a.distanceTo(b);
    let s = step - carry;
    while (s <= len) {
      out.push(a.clone().lerp(b, s / len));
      s += step;
    }
    carry = len - (s - step);
  }
  if (!closed) out.push(pts[pts.length - 1].clone());
  return out;
}

// Offset a polyline sideways (positive = right of travel).
function offsetLine(points, d, closed) {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)] || p;
    const b = points[Math.min(points.length - 1, i + 1)];
    const prev = closed && i === 0 ? points[points.length - 1] : a;
    const next = closed && i === points.length - 1 ? points[0] : b;
    _v.subVectors(next, prev).setY(0).normalize();
    return new THREE.Vector3(p.x - _v.z * d, p.y, p.z + _v.x * d);
  });
}

export const RACES = [
  {
    id: 'ring-sprint', name: 'Highway Ring Sprint', district: 'highway', rep: 0, scoring: 'time', laps: 2,
    brief: 'Two laps of the elevated Ring, clockwise. Long straights, sweeping corners, traffic at 250 mph. Rockets win races; batteries lose them.',
    reward: { cash: 4000, rep: 300 },
    speed: 80,
    lineOffset: 5.5,
    line(world) {
      // Concatenate the four Ring quarters (clockwise) starting on the south straight.
      const ring = world.graph.edges.filter((e) => e.kind === 'highway');
      const pts = [];
      for (const e of ring) for (const p of e.points) if (!pts.length || pts[pts.length - 1].distanceTo(p) > 1) pts.push(p.clone());
      let k = 0;
      let best = Infinity;
      pts.forEach((p, i) => {
        const d = Math.hypot(p.x - 60, p.z - 600);
        if (d < best) {
          best = d;
          k = i;
        }
      });
      return [...pts.slice(k), ...pts.slice(0, k)];
    },
    closed: true,
    cpSpacing: 360,
  },
  {
    id: 'downtown-circuit', name: 'Downtown Circuit', district: 'downtown', rep: 200, scoring: 'time', laps: 2,
    brief: 'A tight checkpoint circuit through the Downtown grid. Ninety-degree corners, cross traffic and signal lights. Brake late, power out, and do not clip the hydrants.',
    reward: { cash: 3500, rep: 260 },
    speed: 46,
    lineOffset: 2.6,
    line: () => [V(-120, 0, -240), V(240, 0, -240), V(240, 0, 0), V(120, 0, 0), V(120, 0, 240), V(-240, 0, 240), V(-240, 0, -240)],
    closed: true,
    cpSpacing: 170,
  },
  {
    id: 'canyon-drift', name: 'Canyon Drift Run', district: 'canyon', rep: 1800, scoring: 'drift', laps: 1,
    brief: 'Point to point over the Hillside Canyon: up the hairpins to the Summit and back down the far side. Scored on drift style, not time: hold long slides, link corners, keep it off the rails. Drift mode recommended.',
    reward: { cash: 6000, rep: 450 },
    speed: 36,
    lineOffset: 2.2,
    line: (world) => [...world.gen.canyon.up, ...world.gen.canyon.down.slice(1)].map((p) => p.clone()),
    closed: false,
    cpSpacing: 140,
  },
];

class Racer {
  constructor(race, game, rival, index, line, isPlayer = false) {
    this.game = game;
    this.race = race;
    this.name = isPlayer ? 'VOLT' : rival.name;
    this.isPlayer = isPlayer;
    this.cp = 0; // checkpoints passed in total
    this.finished = false;
    this.finishTime = null;
    this.drift = 0;
    this.driftChain = 0;
    this.skill = isPlayer ? 1 : 0.9 + index * 0.04;
    if (!isPlayer) {
      const model = new RivalModel(RIVAL, rival);
      const start = race.grid[index + 1];
      this.npc = game.addNpc(RIVAL, model, { position: start.pos, yaw: start.yaw, kind: 'rival', group: G.POLICE });
      this.v = this.npc.vehicle;
      this.fx = new VehicleFX(game.vfx, this.v);
      this.driver = new Driver(this.v);
      this.line = line;
      this.driver.setPath(line, race.def.speed);
      this.npc.ai = (h) => this.step(h);
      this.probe = 0;
      this.obstacle = Infinity;
      this.probeGroups = groups(0x8000, G.STATIC | G.TRAFFIC | G.POLICE);
    } else this.v = game.player;
  }

  step(h) {
    const c = this.v.controls;
    if (this.race.state !== 'running' || this.finished) {
      c.throttle = 0;
      c.brake = this.finished ? 0.4 : 1;
      c.handbrake = this.finished ? 0 : 1;
      c.steer = 0;
      return;
    }
    this.probe -= h;
    if (this.probe <= 0) {
      this.probe = 0.1;
      const v = this.v;
      _v.copy(v.forward).multiplyScalar(2.6).add(v.position);
      _v.y += 0.2;
      const hit = this.game.physics.raycast(_v, v.forward, 40, this.probeGroups, v.body);
      this.obstacle = hit ? hit.timeOfImpact : Infinity;
    }
    // Rubber band around the player's progress.
    const gap = this.race.progressOf(this) - this.race.progressOf(this.race.player);
    const band = clamp(1 - gap * 0.06, 0.82, 1.18);
    this.driver.targetSpeed = this.race.def.speed * this.skill * band;
    // Blocked (car stopped at a light, wreck in the lane): swing out and pass.
    const v = this.v;
    if (this.obstacle < 12 && v.speed < 4) this.blocked = (this.blocked || 0) + h;
    else if (!this.passing) this.blocked = 0;
    if (this.blocked > 1.2 && !this.passing) {
      this.passing = 2.2;
      this.passSide = this.passSide === 1 ? -1 : 1;
    }
    if (this.passing) {
      this.passing = Math.max(0, this.passing - h);
      this.driver.avoid = this.passSide * 0.55 * (this.passing > 1.2 ? 1 : this.passing / 1.2);
      this.driver.targetSpeed = Math.min(this.driver.targetSpeed, 12);
      this.driver.drive(h, Infinity);
      if (!this.passing) this.driver.avoid = 0;
    } else this.driver.drive(h, this.obstacle);
    // Hopelessly stuck and out of the player's sight: put the car back on its line further on.
    this.stuckTime = v.speed < 1.5 ? (this.stuckTime || 0) + h : 0;
    if (this.stuckTime > 7 && v.position.distanceTo(this.game.player.position) > 70) this.recover();
  }

  recover() {
    const d = this.driver;
    const i = Math.min(d.path.length - 2, d.pathIndex + 4);
    const p = d.path[i];
    const q = d.path[i + 1];
    this.v.reset({ x: p.x, y: p.y + 0.6, z: p.z }, Math.atan2(-(q.x - p.x), -(q.z - p.z)));
    d.pathIndex = i;
    this.stuckTime = 0;
    this.blocked = 0;
    this.passing = 0;
    d.avoid = 0;
  }

  remove() {
    if (this.npc) this.game.removeNpc(this.npc);
  }
}

// Running race instance (created by the activity manager).
export class Race {
  constructor(game, def, ctx) {
    this.game = game;
    this.def = def;
    this.ctx = ctx;
    this.state = 'countdown';
    this.time = 0;
    this.countdown = 3.6;
    const raw = def.line(game.world);
    this.center = resample(raw, 8, def.closed);
    // Ground the line (raycast down) so checkpoint heights are right.
    for (const p of this.center) p.y = ctx.groundY(p);
    // Checkpoints along the line.
    this.cps = [];
    const n = this.center.length;
    const step = Math.max(4, Math.round(def.cpSpacing / 8));
    for (let i = step; i < n; i += step) this.cps.push(i);
    if (def.closed) this.cps.push(0);
    else if (this.cps[this.cps.length - 1] !== n - 1) this.cps.push(n - 1);
    this.cpPerLap = this.cps.length;
    this.totalCps = this.cpPerLap * def.laps;
    // Grid: 2 x 2 behind the start line.
    const p0 = this.center[0];
    const dir = _w.subVectors(this.center[3], p0).setY(0).normalize().clone();
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    const yaw = Math.atan2(-dir.x, -dir.z);
    const lane = def.lineOffset;
    this.grid = [
      { pos: p0.clone().addScaledVector(dir, -8).addScaledVector(right, lane - 1.8), yaw },
      { pos: p0.clone().addScaledVector(dir, -2).addScaledVector(right, lane + 1.8), yaw },
      { pos: p0.clone().addScaledVector(dir, -14).addScaledVector(right, lane + 1.8), yaw },
      { pos: p0.clone().addScaledVector(dir, -20).addScaledVector(right, lane - 1.8), yaw },
    ];
    for (const g of this.grid) g.pos.y = ctx.groundY(g.pos) + 0.7;
    // Racing lines for rivals (slightly different lanes), repeated for every lap.
    const lines = [lane - 1.6, lane + 1.6, lane].map((d) => {
      const l = offsetLine(this.center, d, def.closed);
      const out = [];
      for (let k = 0; k < def.laps + 1; k++) out.push(...l.map((p) => p.clone().setY(p.y + 0.4)));
      return out;
    });
    this.player = new Racer(this, game, null, -1, null, true);
    this.racers = [this.player];
    RIVALS.forEach((r, i) => this.racers.push(new Racer(this, game, r, i, lines[i])));
    this.lapStart = 0;
    this.lapTimes = [];
    this.bestLap = null;
    this.policeJoined = false;
  }

  // Progress in checkpoints (fractional) for ranking and rubber-banding.
  progressOf(r) {
    if (r.finished) return this.totalCps + 1 - (r.finishTime || 0) * 1e-4;
    const next = this.center[this.cps[r.cp % this.cpPerLap]];
    const prevIdx = r.cp % this.cpPerLap === 0 ? (this.def.closed ? 0 : 0) : this.cps[(r.cp % this.cpPerLap) - 1];
    const prev = this.center[prevIdx];
    const seg = Math.max(1, prev.distanceTo(next));
    const d = r.v.position.distanceTo(next);
    return r.cp + clamp(1 - d / seg, 0, 0.99);
  }

  nextCheckpoint(r) {
    return this.center[this.cps[r.cp % this.cpPerLap]];
  }

  standings() {
    return [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      return this.progressOf(b) - this.progressOf(a);
    });
  }

  // Drift run: rivals still on the road are ranked by their projected final score.
  driftScore(r) {
    if (r.isPlayer || r.finished) return r.drift;
    return r.drift + (this.totalCps - r.cp) * this.cpBonus(r);
  }

  cpBonus(r) {
    return 60 + 45 * (r.skill - 0.9) * 10;
  }

  positionOf(r) {
    if (this.def.scoring === 'drift') {
      const sorted = [...this.racers].sort((a, b) => this.driftScore(b) - this.driftScore(a));
      return sorted.indexOf(r) + 1;
    }
    return this.standings().indexOf(r) + 1;
  }

  update(dt) {
    const g = this.game;
    if (this.state === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      const now = Math.ceil(this.countdown);
      if (now !== before && now > 0 && now <= 3) this.ctx.countdown(String(now));
      if (this.countdown <= 0) {
        this.state = 'running';
        g.inputLock = false;
        this.ctx.countdown('GO');
        this.lapStart = 0;
      }
      return null;
    }
    this.time += dt;
    const wet = g.isWet();
    for (const r of this.racers) {
      if (r.isPlayer) continue;
      const d = r.v.position.distanceTo(g.player.position);
      r.fx.update(dt, { wet, near: d < 120 });
      r.npc.model.setDetail(d < 75);
    }
    // Checkpoints for every racer.
    for (const r of this.racers) {
      if (r.finished) continue;
      const c = this.nextCheckpoint(r);
      const p = r.v.position;
      const radius = this.def.id === 'ring-sprint' ? 16 : 14;
      if (Math.hypot(p.x - c.x, p.z - c.z) < radius && Math.abs(p.y - c.y) < 9) {
        r.cp++;
        if (r.isPlayer) this.onPlayerCheckpoint();
        else if (this.def.scoring === 'drift') r.drift += this.cpBonus(r);
        if (r.cp >= this.totalCps) {
          r.finished = true;
          r.finishTime = this.time;
          if (!r.isPlayer) this.ctx.notice(`${r.name} finished`);
        }
      }
      // Drift scoring (player: style system of its own, rivals: slip while cornering).
      const v = r.v;
      if (this.def.scoring === 'drift') {
        const slip = Math.abs(v.slipAngle);
        if (slip > 0.22 && v.speed > 9 && v.groundedCount >= 3) {
          r.driftChain += dt;
          const mult = Math.min(5, 1 + Math.floor(r.driftChain / 1.5));
          r.drift += 10 * (1 + slip * 2) * mult * dt * (r.isPlayer ? 1 : 0.6);
        } else r.driftChain = Math.max(0, r.driftChain - dt * 3);
      }
    }
    if (!this.policeJoined && this.time > 40 && g.heat.level === 0 && this.def.id !== 'canyon-drift') {
      this.policeJoined = true;
      g.heat.setLevel(1);
      g.radio.say('Street race reported. Units, intercept the racers.', { priority: true });
    }
    if (this.player.finished) return this.result();
    return null;
  }

  onPlayerCheckpoint() {
    const r = this.player;
    this.ctx.sound('checkpoint');
    if (r.cp % this.cpPerLap === 0) {
      const lap = this.time - this.lapStart;
      this.lapStart = this.time;
      this.lapTimes.push(lap);
      if (this.bestLap == null || lap < this.bestLap) this.bestLap = lap;
      if (r.cp < this.totalCps) this.ctx.banner(`LAP ${r.cp / this.cpPerLap + 1}/${this.def.laps}`, `Lap ${fmt(lap)}`);
    }
    this.ctx.showCheckpoint();
  }

  result() {
    const pos = this.positionOf(this.player);
    return { ok: pos <= 3, position: pos, time: this.time, bestLap: this.bestLap, drift: Math.round(this.player.drift), reason: pos <= 3 ? null : 'Finished last' };
  }

  cleanup() {
    for (const r of this.racers) r.remove();
    this.game.inputLock = false;
  }
}

export function fmt(t) {
  if (t == null) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
