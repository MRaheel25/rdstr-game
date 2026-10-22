// Halcyon Bay Police: spawning by heat level, per-unit behaviours (patrol, chase, ram, PIT,
// box-in, intercept via road-graph path-finding, search), line of sight, roadblocks with
// spike strips, rolling highway blocks, helicopter searchlight, EMP drones, busting,
// wrecks and takedowns, and real red/blue light spill from the nearest units.
import * as THREE from 'three';
import { Driver } from './Driver.js';
import { compass } from './Radio.js';
import { POLICE_CRUISER, POLICE_INTERCEPTOR, SWAT_TRUCK } from '../vehicle/VehicleConfig.js';
import { CruiserModel, InterceptorModel, SwatModel, HelicopterModel, DroneModel } from '../vehicle/models/PoliceModels.js';
import { VehicleFX } from '../fx/VehicleFX.js';
import { G, groups } from '../core/Physics.js';
import { WATER_Y } from '../world/Layout.js';
import { clamp } from '../util/math.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const MAX_CHASE_UNITS = 8;
const MAX_TOTAL = 12;

const TYPE = {
  cruiser: { cfg: POLICE_CRUISER, Model: CruiserModel, maxSpeed: 62, label: 'cruiser' },
  interceptor: { cfg: POLICE_INTERCEPTOR, Model: InterceptorModel, maxSpeed: 85, label: 'interceptor' },
  swat: { cfg: SWAT_TRUCK, Model: SwatModel, maxSpeed: 45, label: 'SWAT truck' },
};

export class PoliceSystem {
  constructor(game, heat, radio) {
    this.game = game;
    this.heat = heat;
    this.radio = radio;
    this.world = game.world;
    this.graph = game.world.graph;
    this.physics = game.physics;
    this.units = [];
    this.roadblocks = [];
    this.spikes = [];
    this.heli = null;
    this.drones = [];
    this.unitCounter = 3;
    this.spawnTimer = 0;
    this.decideIndex = 0;
    this.roadblockTimer = 18;
    this.rollingTimer = 10;
    this.losGroups = groups(0x8000, G.STATIC);
    this.probeGroups = groups(0x8000, G.STATIC | G.TRAFFIC | G.POLICE | G.RAMP);
    this.drivable = this.graph.edges.filter((e) => e.kind !== 'stunt' && e.length > 30);
    this.lights = [];
    this.cones = [];
    this.bustedFired = false;
    this.typeOverride = null; // missions can force unit types
    const n = 4;
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(i % 2 ? 0x2040ff : 0xff2020, 0, 45, 1.6);
      game.scene.add(l);
      this.lights.push(l);
    }
    game.events.on('impact', (e) => this.onPlayerImpact(e));
    game.events.on('propBreak', (e) => {
      if (e.vehicle === game.player) this.heat.add(this.anySeesPlayer() ? 14 : 4, 'destruction');
    });
    game.events.on('frostShockwave', (e) => this.onFrost(e));
    // Dispatch: the first units of a new pursuit come from closer.
    game.events.on('pursuitStart', () => {
      this.spawnTimer = 0;
      this.quickSpawn = 3;
    });
  }

  get chaseUnits() {
    return this.units.filter((u) => !u.v.wrecked && u.role !== 'roadblock');
  }

  // ---- spawning --------------------------------------------------------------
  // center: spawn around this point instead of the player (search units sent to the
  // last known position), while still keeping well clear of the player.
  findSpawn(minD, maxD, { ahead = false, notInView = true, center = null } = {}) {
    const player = this.game.player;
    const c = center || player.position;
    for (let tries = 0; tries < 40; tries++) {
      const e = this.drivable[Math.floor(Math.random() * this.drivable.length)];
      const s = Math.random() * e.length;
      this.graph.sample(e, s, _p, _w);
      const d = Math.hypot(_p.x - c.x, _p.z - c.z);
      if (d < minD || d > maxD || Math.abs(_p.y - c.y) > 25) continue;
      if (center && Math.hypot(_p.x - player.position.x, _p.z - player.position.z) < this.viewRange() + 40) continue;
      if (ahead && player.speed > 10) {
        _v.subVectors(_p, player.position).normalize();
        if (_v.dot(player.velocity) / player.speed < 0.3) continue;
      }
      if (notInView && d < 240 && this.game.traffic.inView(_p, this.game.camera)) continue;
      // Face toward the player.
      _v.subVectors(player.position, _p);
      const dir = _w.dot(_v) >= 0 ? _w.clone() : _w.clone().negate();
      const right = new THREE.Vector3(-dir.z, 0, dir.x);
      const pos = _p.clone().addScaledVector(right, 2.2);
      pos.y += 1.0;
      return { pos, yaw: Math.atan2(-dir.x, -dir.z), edge: e };
    }
    return null;
  }

  spawnUnit(type, pos, yaw, role = 'chase') {
    const T = TYPE[type];
    const num = this.unitCounter++;
    const model = new T.Model(T.cfg, num);
    const unit = { type, role, num, model, los: false, losTimer: Math.random() * 0.2, decide: 0, obstacle: Infinity, probe: 0, flipTime: 0, ramUntil: 0, pitTurn: 0, parked: role === 'roadblock' };
    const npc = this.game.addNpc(T.cfg, model, { position: pos, yaw, kind: 'police', group: G.POLICE, ai: (h) => this.unitStep(h, unit) });
    unit.npc = npc;
    unit.v = npc.vehicle;
    unit.driver = new Driver(unit.v);
    unit.driver.targetSpeed = 20;
    unit.fx = new VehicleFX(this.game.vfx, unit.v);
    unit.pitSide = Math.random() < 0.5 ? -1 : 1;
    npc.ctx = { sirens: this.heat.phase !== 'none' };
    unit.v.impactListeners.push((veh, info) => this.onUnitImpact(unit, info));
    this.units.push(unit);
    return unit;
  }

  removeUnit(u) {
    this.units.splice(this.units.indexOf(u), 1);
    if (u.smoke) u.smoke.duration = 0;
    this.game.removeNpc(u.npc);
  }

  // ---- per physics step ------------------------------------------------------------
  unitStep(h, u) {
    const v = u.v;
    const c = v.controls;
    if (v.wrecked || u.parked) {
      c.throttle = 0;
      c.brake = 1;
      c.steer = 0;
      c.handbrake = 1;
      return;
    }
    u.probe -= h;
    if (u.probe <= 0) {
      u.probe = 0.1;
      u.obstacle = this.probeAhead(u);
    }
    // Obstacles beyond the player (e.g. the wall they are pinned against) don't count.
    const obstacle = u.ramming || u.obstacle > u.dist - 5 ? Infinity : u.obstacle;
    u.driver.drive(h, obstacle);
    if (u.pitTurn > 0) {
      u.pitTurn -= h;
      c.steer = -u.pitSide;
      c.throttle = 1;
      c.brake = 0;
    }
  }

  probeAhead(u) {
    const v = u.v;
    _v.copy(v.forward).multiplyScalar(2.6).add(v.position);
    _v.y += 0.2;
    const hit = this.physics.raycast(_v, v.forward, 40, this.probeGroups, v.body);
    return hit ? hit.timeOfImpact : Infinity;
  }

  // ---- perception --------------------------------------------------------------
  viewRange() {
    const e = this.game.player.energy;
    let r = 140 + this.heat.level * 18;
    if (e && e.ghost) r *= 0.45;
    return r;
  }

  canSee(from, forward, range, fov = 1.25) {
    const player = this.game.player;
    _v.subVectors(player.position, from);
    const d = _v.length();
    if (d > range) return false;
    if (d > 28 && forward && _v.dot(forward) / d < Math.cos(fov)) return false;
    _w.copy(from).addScaledVector(UP, 1.3);
    _v.subVectors(player.position, _w);
    const dd = _v.length();
    _v.divideScalar(dd);
    const hit = this.physics.raycast(_w, _v, dd - 1.5, this.losGroups, null);
    return !hit;
  }

  anySeesPlayer() {
    return this.units.some((u) => u.los && !u.v.wrecked) || (this.heli && this.heli.sees) || this.drones.some((d) => d.sees);
  }

  // ---- per frame ----------------------------------------------------------------
  update(dt, realDt) {
    const g = this.game;
    const player = g.player;
    const heat = this.heat;
    const cfg = heat.config;
    const pursuit = heat.phase !== 'none';
    // Wrecks, despawns, line of sight.
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      const v = u.v;
      const d = v.position.distanceTo(player.position);
      u.dist = d;
      if (!v.wrecked) this.checkWreck(u, dt);
      if (v.wrecked) {
        if (g.time - u.wreckedAt > 50 || d > 320) this.removeUnit(u);
        continue;
      }
      if (d > (pursuit ? 340 : 420) && !u.los) {
        this.removeUnit(u);
        continue;
      }
      u.losTimer -= dt;
      if (u.losTimer <= 0) {
        u.losTimer = 0.2;
        u.los = this.canSee(v.position, v.forward, this.viewRange());
      }
      u.fx.update(dt, { wet: g.isWet(), near: d < 120 });
      u.npc.ctx.sirens = pursuit && u.role !== 'patrol';
      if (u.model.setDetail) u.model.setDetail(d < 75);
    }
    // Offences seen by police.
    const seen = this.anySeesPlayer();
    const nearSeen = this.units.some((u) => u.los && !u.v.wrecked && u.v.position.distanceTo(player.position) < 90);
    if (nearSeen && player.speed > 31) heat.add(dt * (heat.phase === 'none' ? 40 : 6), 'speeding');
    if (seen && heat.phase === 'pursuit') heat.add(dt * 4.5, 'pursuit');
    // Spawning.
    this.spawnTimer -= dt;
    const active = this.units.filter((u) => !u.v.wrecked);
    if (this.spawnTimer <= 0) {
      this.spawnTimer = pursuit ? 1.6 : 3;
      if (!pursuit) {
        const patrols = active.filter((u) => u.role === 'patrol').length;
        if (patrols < 2) {
          const s = this.findSpawn(150, 320);
          if (s) this.spawnUnit('cruiser', s.pos, s.yaw, 'patrol');
        }
      } else {
        // While the player is out of sight, reinforcements join the search around the
        // last known position (and fewer of them) instead of homing in on the player.
        const searching = heat.phase !== 'pursuit';
        const chasing = this.chaseUnits.length;
        const want = Math.min(cfg.units, MAX_CHASE_UNITS) - (searching ? 1 : 0);
        if (chasing < want && active.length < MAX_TOTAL) {
          // Heat 3+: every other unit visibly rolls out of the Police Station when it is near.
          const st = this.game.world.gen.policeStation;
          this.stationToggle = !this.stationToggle;
          const fromStation = st && heat.level >= 3 && this.stationToggle && Math.hypot(st.x - player.position.x, st.z - player.position.z) < 900;
          const ex = fromStation ? st.exits[Math.floor(Math.random() * st.exits.length)] : null;
          const s = ex
            ? { pos: new THREE.Vector3(ex.x, 1.0, ex.z), yaw: ex.yaw }
            : searching
            ? this.findSpawn(40, 220, { center: heat.lastKnown || player.position })
            : this.quickSpawn > 0
              ? this.findSpawn(80, 170, { ahead: Math.random() < 0.5 })
              : this.findSpawn(130, 300, { ahead: Math.random() < 0.4 });
          if (s && this.quickSpawn > 0) this.quickSpawn--;
          if (s) {
            const types = this.typeOverride || cfg.types;
            const type = types[Math.floor(Math.random() * types.length)];
            const u = this.spawnUnit(type, s.pos, s.yaw, 'chase');
            u.v.body.setLinvel({ x: -Math.sin(s.yaw) * 15, y: 0, z: -Math.cos(s.yaw) * 15 }, true);
          }
        }
      }
    }
    // Behaviour decisions (staggered).
    if (active.length) {
      const per = Math.max(1, Math.ceil(active.length * dt * 5));
      for (let k = 0; k < per; k++) {
        const u = active[this.decideIndex++ % active.length];
        this.decide(u);
      }
    }
    if (pursuit) {
      this.updateRoadblocks(dt);
      this.updateHeli(dt, cfg.heli);
      this.updateDrones(dt, cfg.drones || 0);
    } else {
      if (this.heli) this.updateHeli(dt, false);
      this.updateDrones(dt, 0);
      for (const rb of this.roadblocks) rb.expire = true;
      this.updateRoadblocks(dt);
    }
    this.updateSpikes(dt);
    this.updateBusted(dt);
    this.updateLights();
    // Search cones for evade logic + minimap.
    this.cones.length = 0;
    const range = this.viewRange();
    for (const u of active) {
      if (u.role === 'roadblock' && !pursuit) continue;
      this.cones.push({ x: u.v.position.x, z: u.v.position.z, dirx: u.v.forward.x, dirz: u.v.forward.z, range: range * 0.8, half: 0.75 });
    }
    let inCone = this.cones.some((c) => {
      const dx = player.position.x - c.x;
      const dz = player.position.z - c.z;
      const d = Math.hypot(dx, dz);
      return d < c.range && (d < 20 || (dx * c.dirx + dz * c.dirz) / d > Math.cos(c.half));
    });
    if (this.heli && this.heli.spot) {
      const s = this.heli.spot;
      if (Math.hypot(player.position.x - s.x, player.position.z - s.z) < 28 && !this.world.underCover(player.position)) inCone = true;
    }
    heat.update(dt, { seen, inCone, hidden: this.world.underCover(player.position), ghost: player.energy.ghost });
    if (seen) heat.lastKnown = player.position.clone();
  }

  // Behaviour selection for one unit.
  decide(u) {
    const g = this.game;
    const player = g.player;
    const heat = this.heat;
    const cfg = heat.config;
    const v = u.v;
    const drv = u.driver;
    const T = TYPE[u.type];
    const d = v.position.distanceTo(player.position);
    u.ramming = false;
    if (u.role === 'roadblock') {
      // Release roadblock units once the player passes or is very close.
      if (d < 14 || (u.block && u.block.passed) || heat.phase !== 'pursuit') {
        if (heat.phase === 'pursuit') {
          u.role = 'chase';
          u.parked = false;
        }
      }
      if (u.parked) return;
    }
    if (heat.phase === 'none' || u.role === 'patrol') {
      if (heat.phase !== 'none') u.role = 'chase';
      else {
        // Patrol: wander the road graph at a relaxed pace.
        if (drv.pathDone || !drv.path.length) {
          const route = this.randomRoute(v.position, 6);
          drv.setPath(route, 15);
        }
        drv.targetSpeed = 15;
        return;
      }
    }
    if (u.role === 'rolling') {
      if (d < 25 || drv.pathDone) u.role = 'chase';
      else return;
    }
    const pv = player.velocity;
    const seenRecently = g.time - heat.lastSeen < 3;
    if ((u.los || (seenRecently && d < 70)) && d < 95) {
      // Close pursuit.
      const fwd = player.forward;
      const right = player.right;
      const ps = player.speed;
      if (u.boxRole) {
        const offs = { front: [0, 9], left: [-3.4, 0], right: [3.4, 0], back: [0, -8] }[u.boxRole];
        _p.copy(player.position).addScaledVector(right, offs[0]).addScaledVector(fwd, offs[1]).addScaledVector(pv, 0.3);
        const spd = u.boxRole === 'front' ? Math.max(0, ps - 5) : ps + (_v.subVectors(_p, v.position).dot(v.forward) > 0 ? 8 : -3);
        drv.setPoint(_p, Math.min(T.maxSpeed, spd));
        return;
      }
      if (u.type === 'interceptor' && cfg.pit && d < 16) {
        // PIT manoeuvre: line up on the rear quarter, then turn in.
        _p.copy(player.position).addScaledVector(fwd, -1.6).addScaledVector(right, u.pitSide * 1.9);
        _v.subVectors(v.position, player.position);
        const lat = _v.dot(right) * u.pitSide;
        const lon = _v.dot(fwd);
        if (lat > 0.8 && lat < 3 && lon > -3.5 && lon < 0.5 && Math.abs(v.fwdSpeed - ps) < 6 && ps > 8) {
          u.pitTurn = 0.6;
          g.events.emit('pit', { unit: u });
        }
        drv.setPoint(_p, Math.min(T.maxSpeed, ps + 6));
        return;
      }
      if (cfg.ram && d < 45 && u.type !== 'interceptor') {
        // Ram cycle: after ~1.5 s of bumper contact, drop back and line up another hit.
        if (u.ramBack > g.time) {
          _p.copy(player.position).addScaledVector(fwd, -16);
          drv.setPoint(_p, Math.max(0, ps - 5));
          return;
        }
        if (d < 6.5) {
          u.ramContact = (u.ramContact || 0) + 0.2;
          if (u.ramContact > 1.5) {
            u.ramContact = 0;
            u.ramBack = g.time + 1.3;
          }
        } else u.ramContact = 0;
        u.ramming = true;
        _p.copy(player.position).addScaledVector(pv, 0.25);
        drv.setPoint(_p, Math.min(T.maxSpeed, ps + 14));
        return;
      }
      // Follow / pull-over attempt (low heat): stay right behind.
      const lead = clamp(d / Math.max(10, v.speed), 0, 1.0);
      _p.copy(player.position).addScaledVector(pv, lead);
      if (heat.level <= 1) _p.addScaledVector(fwd, -6);
      drv.setPoint(_p, Math.min(T.maxSpeed, ps + (d > 25 ? 12 : 3)));
      return;
    }
    if (seenRecently || heat.phase === 'pursuit') {
      // Intercept via the road graph toward where the player is heading.
      u.pathAge = (u.pathAge || 0) + 0.2;
      if (!drv.path.length || u.pathAge > 1.5 || drv.pathDone || drv.mode !== 'path') {
        u.pathAge = 0;
        const T2 = clamp(d / Math.max(20, T.maxSpeed * 0.7), 0, 6);
        _p.copy(heat.lastKnown || player.position).addScaledVector(pv, seenRecently ? T2 * (u.num % 2 ? 1 : 0.5) : 0);
        const route = this.routeTo(v.position, _p, v.speed > 6 ? v.velocity : null);
        if (route) drv.setPath(route, T.maxSpeed);
        else drv.setPoint(player.position, T.maxSpeed * 0.7);
      }
      drv.targetSpeed = T.maxSpeed;
      return;
    }
    // Searching: sweep around the last known position.
    if (!drv.path.length || drv.pathDone || drv.mode !== 'path') {
      const lk = heat.lastKnown || player.position;
      _p.set(lk.x + (Math.random() - 0.5) * 220, lk.y, lk.z + (Math.random() - 0.5) * 220);
      const route = this.routeTo(v.position, _p, v.speed > 6 ? v.velocity : null);
      if (route) drv.setPath(route, 22);
    }
    drv.targetSpeed = 24;
  }

  // Road-graph path as lane points (drive on the right). With `fwd` (the unit's travel
  // direction) the route starts with the rest of the road it is on, toward the node
  // ahead, so a re-plan never makes a moving car double back.
  routeTo(from, to, fwd = null) {
    let a = null;
    const pts = [];
    if (fwd) {
      const n = this.graph.nearest(from, (e) => e.kind !== 'stunt', 6);
      if (n && n.dist < 12) {
        const forward = n.dir.dot(fwd) >= 0;
        a = forward ? n.edge.b : n.edge.a;
        const list = n.edge.points;
        this.pushLane(pts, forward ? list.slice(n.seg) : list.slice(0, n.seg + 2).reverse(), 1);
      }
    }
    if (!a) a = this.graph.nearestNode(from);
    const b = this.graph.nearestNode(to);
    if (!a || !b) return null;
    const nodes = a === b ? [a] : this.graph.path(a, b, 1500);
    if (!nodes) return null;
    for (let i = 0; i < nodes.length - 1; i++) {
      const e = this.graph.edgeBetween(nodes[i], nodes[i + 1]);
      if (!e) continue;
      this.pushLane(pts, e.a === nodes[i] ? e.points : [...e.points].reverse(), 0);
    }
    pts.push(to.clone());
    return pts;
  }

  // Append centre-line points offset into the right-hand lane (skipping `skip` leading points).
  pushLane(pts, list, skip) {
    for (let k = skip; k < list.length; k++) {
      const p = list[k];
      const q = list[Math.min(list.length - 1, k + 1)];
      const r = list[Math.max(0, k - 1)];
      _v.subVectors(q, r).setY(0).normalize();
      const pt = new THREE.Vector3(p.x - _v.z * 2.4, p.y + 0.5, p.z + _v.x * 2.4);
      // Edges share their end nodes: skip duplicates (zero-length segments read as sharp turns).
      if (pts.length && pts[pts.length - 1].distanceToSquared(pt) < 1) continue;
      pts.push(pt);
    }
  }

  randomRoute(from, steps) {
    let node = this.graph.nearestNode(from);
    const nodes = [node];
    let prev = null;
    for (let i = 0; i < steps; i++) {
      const opts = node.edges.filter((e) => e.kind !== 'stunt' && this.graph.other(e, node) !== prev);
      if (!opts.length) break;
      const e = opts[Math.floor(Math.random() * opts.length)];
      prev = node;
      node = this.graph.other(e, node);
      nodes.push(node);
    }
    const last = nodes[nodes.length - 1];
    return this.routeTo(from, new THREE.Vector3(last.x, last.y, last.z));
  }

  // ---- wrecks & takedowns -----------------------------------------------------------
  checkWreck(u, dt) {
    const v = u.v;
    if (v.up.y < 0.3 && v.speed < 4) u.flipTime += dt;
    else u.flipTime = 0;
    let reason = null;
    if (v.hp <= 0) reason = 'destroyed';
    else if (u.flipTime > 2.5) reason = 'flipped';
    else if (v.position.y < WATER_Y - 0.5) reason = 'water';
    if (reason) this.wreck(u, reason);
  }

  wreck(u, reason) {
    const g = this.game;
    const v = u.v;
    v.wrecked = true;
    u.wreckedAt = g.time;
    u.npc.ctx.sirens = false;
    if (u.model.setDetail) u.model.setDetail(true);
    const player = g.player;
    const recentHit = v.lastHitBy === player && v.time - v.lastHitTime < 4;
    const near = v.position.distanceTo(player.position) < 45 && this.heat.phase !== 'none';
    const byPlayer = recentHit || u.frostHit || (near && (reason === 'water' || (u.wallCrash && g.time - u.wallCrash < 3)));
    const explode = reason === 'destroyed' && (v.hp < -15 || Math.random() < 0.45);
    if (explode) {
      g.vfx.explosion(v.position, u.type === 'swat' ? 1.6 : 1.2);
      // Shockwave shoves nearby bodies.
      for (const n of g.npcs) {
        if (n.vehicle === v) continue;
        const dd = n.vehicle.position.distanceTo(v.position);
        if (dd < 14) {
          _v.subVectors(n.vehicle.position, v.position).normalize();
          const f = (1 - dd / 14) * n.vehicle.mass * 9;
          n.vehicle.body.applyImpulse({ x: _v.x * f, y: f * 0.4, z: _v.z * f }, true);
        }
      }
      v.body.applyImpulse({ x: 0, y: v.mass * 6, z: 0 }, true);
      v.body.applyTorqueImpulse({ x: v.mass * 2, y: 0, z: v.mass * 1.5 }, true);
      u.smoke = g.vfx.addEmitter({ type: 'fire', duration: 45, pos: () => _w.copy(v.position) });
    } else {
      u.smoke = g.vfx.addEmitter({ type: 'smoke', duration: 45, rate: 0.6, color: [0.15, 0.15, 0.16], pos: () => _w.copy(v.position).setY(v.position.y + 0.6) });
    }
    if (byPlayer) {
      this.heat.add(120, 'takedown');
      g.events.emit('takedown', { unit: u, type: u.type, reason, explode });
      g.startTakedownCam(v);
      this.radio.say(`Unit ${u.num} is down! Unit ${u.num} is down!`, { priority: true });
    } else {
      g.events.emit('policeWreck', { unit: u });
    }
  }

  onUnitImpact(u, info) {
    const v = u.v;
    const s = info.strength;
    const other = info.other;
    let dmg = Math.max(0, s - 4) * 2.4 * (u.type === 'swat' ? 0.45 : 1);
    if (other && other.kind === 'vehicle' && other.ref === this.game.player) {
      v.damage(dmg * 1.2, this.game.player);
    } else {
      v.damage(dmg);
      if (s > 12 && v.position.distanceTo(this.game.player.position) < 60) u.wallCrash = this.game.time;
    }
    if (s > 8 && v.position.distanceTo(this.game.player.position) < 120) {
      this.game.vfx.sparksAt(info.point, _v.copy(info.normal).setY(0.4), Math.min(30, s * 1.5), 10);
    }
    // The player's own hits are voiced by the player impact handler.
    if (s > 5 && !(other && other.ref === this.game.player)) this.game.events.emit('npcImpact', { position: info.point, strength: s });
    if (u.role === 'roadblock' && s > 3) {
      if (other && other.ref === this.game.player && u.block && !u.block.smashed) {
        u.block.smashed = true;
        this.game.events.emit('roadblockSmash', { position: v.position.clone() });
      }
      u.parked = false;
      u.role = 'chase';
    }
  }

  onPlayerImpact(e) {
    const other = e.info.other;
    if (!other || other.kind !== 'vehicle' || !other.ref) return;
    const unit = this.units.find((u) => u.v === other.ref);
    if (!unit) return;
    unit.v.lastHitBy = this.game.player;
    unit.v.lastHitTime = unit.v.time;
    this.heat.add(this.heat.phase === 'none' ? 90 : 40, 'assault');
  }

  onFrost(e) {
    for (const u of this.units) if (u.v.position.distanceTo(e.position) < e.radius) u.frostHit = true;
    for (const d of this.drones) {
      if (d.pos.distanceTo(e.position) < e.radius + 6 && !d.dead) this.destroyDrone(d);
    }
  }

  // ---- roadblocks & spikes ------------------------------------------------------------
  updateRoadblocks(dt) {
    const g = this.game;
    const heat = this.heat;
    const cfg = heat.config;
    const player = g.player;
    if (heat.phase === 'pursuit' && cfg.roadblocks) {
      this.roadblockTimer -= dt;
      if (this.roadblockTimer <= 0 && this.roadblocks.length < 2) {
        // A failed placement (no road far enough ahead, player crawling) retries soon.
        this.roadblockTimer = this.placeRoadblock() ? (heat.level >= 5 ? 14 : heat.level >= 4 ? 18 : 24) : 3;
      }
      if (cfg.box) {
        this.rollingTimer -= dt;
        const r = this.graph.nearest(player.position);
        if (this.rollingTimer <= 0 && r && r.edge.kind === 'highway' && player.speed > 20) {
          this.rollingTimer = 30;
          this.rollingBlock(r);
        }
      }
      this.assignBoxRoles();
    }
    for (let i = this.roadblocks.length - 1; i >= 0; i--) {
      const rb = this.roadblocks[i];
      _v.subVectors(player.position, rb.pos);
      const along = _v.dot(rb.dir);
      if (along > 6) rb.passed = true;
      rb.age += dt;
      if (rb.expire || rb.age > 45 || _v.length() > 420) {
        for (const u of rb.units) {
          if (this.units.includes(u) && u.role === 'roadblock') {
            if (u.v.position.distanceTo(player.position) > 150) this.removeUnit(u);
            else {
              u.role = 'chase';
              u.parked = false;
            }
          }
        }
        if (rb.spike) rb.spike.expire = true;
        this.roadblocks.splice(i, 1);
      }
    }
  }

  // Walk the road graph ahead of the player and block the road ~220 m away.
  placeRoadblock() {
    const g = this.game;
    const player = g.player;
    const r = this.graph.nearest(player.position, (e) => e.kind !== 'stunt');
    if (!r || player.speed < 6) return false;
    let edge = r.edge;
    let forward = r.dir.dot(player.velocity) >= 0;
    let node = forward ? edge.b : edge.a;
    let dist = forward ? edge.length - r.s : r.s;
    let heading = new THREE.Vector3().copy(player.velocity).setY(0).normalize();
    const want = 200 + Math.random() * 60;
    let guard = 0;
    while (dist < want && guard++ < 8) {
      const opts = node.edges.filter((e) => e !== edge && e.kind !== 'stunt');
      if (!opts.length) return false;
      let best = null;
      let bd = -Infinity;
      for (const e of opts) {
        const o = this.graph.other(e, node);
        _v.set(o.x - node.x, 0, o.z - node.z).normalize();
        const dd = _v.dot(heading);
        if (dd > bd) {
          bd = dd;
          best = e;
        }
      }
      edge = best;
      forward = edge.a === node;
      heading = _v.set(this.graph.other(edge, node).x - node.x, 0, this.graph.other(edge, node).z - node.z).normalize().clone();
      node = this.graph.other(edge, node);
      dist += edge.length;
    }
    // Position: some way along the last edge.
    const s = clamp(edge.length * 0.5, 12, edge.length - 12);
    const pos = new THREE.Vector3();
    const dir = new THREE.Vector3();
    this.graph.sample(edge, forward ? s : edge.length - s, pos, dir);
    if (!forward) dir.negate();
    if (pos.distanceTo(player.position) < 120) return false;
    const width = edge.kind === 'highway' ? 22 : edge.kind === 'canyon' || edge.kind === 'ramp' ? 9 : 15;
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    const heavy = this.heat.config.heavy;
    const units = [];
    const count = Math.min(edge.kind === 'highway' ? 4 : 3, MAX_TOTAL - this.units.filter((u) => !u.v.wrecked).length);
    if (count < 2) return false;
    const spacing = width / count;
    const gapIndex = heavy ? Math.floor(Math.random() * count) : -1;
    const yaw = Math.atan2(-right.x, -right.z);
    for (let k = 0; k < count; k++) {
      if (k === gapIndex) continue;
      const off = -width / 2 + spacing * (k + 0.5);
      const p = pos.clone().addScaledVector(right, off);
      p.y += 1.2;
      const type = heavy && k % 2 === 0 ? 'swat' : 'cruiser';
      const u = this.spawnUnit(type, p, yaw + (k % 2 ? Math.PI : 0), 'roadblock');
      u.parked = true;
      units.push(u);
    }
    const rb = { pos, dir, units, age: 0, passed: false, street: edge.name || 'the road' };
    for (const u of units) u.block = rb;
    if (this.heat.config.spikes) rb.spike = this.placeSpikes(pos.clone().addScaledVector(dir, -16), dir, width * (heavy ? 0.55 : 0.8));
    this.roadblocks.push(rb);
    const nums = units.slice(0, 2).map((u) => u.num).join(' and ');
    this.radio.say(`Units ${nums}, set a roadblock on ${rb.street}.${rb.spike ? ' Spike strips are down.' : ''}`, { priority: true });
    g.events.emit('roadblock', { rb });
    return true;
  }

  rollingBlock(r) {
    const g = this.game;
    const player = g.player;
    const free = MAX_TOTAL - this.units.filter((u) => !u.v.wrecked).length;
    if (free < 3) return;
    const dir = r.dir.clone();
    if (dir.dot(player.velocity) < 0) dir.negate();
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    const base = player.position.clone().addScaledVector(dir, 180);
    const near = this.graph.nearest(base, (e) => e.kind === 'highway');
    if (!near) return;
    for (let k = 0; k < 3; k++) {
      const p = near.point.clone().addScaledVector(right, 2.1 + k * 3.8);
      p.y += 1.2;
      const u = this.spawnUnit(k === 1 ? 'swat' : 'cruiser', p, Math.atan2(-dir.x, -dir.z), 'rolling');
      u.v.body.setLinvel({ x: dir.x * 22, y: 0, z: dir.z * 22 }, true);
      const pts = [];
      for (let s = 0; s < 600; s += 20) pts.push(p.clone().addScaledVector(dir, s));
      u.driver.setPath(pts, 20);
    }
    this.radio.say('Rolling roadblock on the Highway Ring. Box him in!', { priority: true });
  }

  placeSpikes(center, dir, width) {
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    const geo = new THREE.BoxGeometry(width, 0.06, 0.55);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.6, metalness: 0.5 });
    const mesh = new THREE.Mesh(geo, mat);
    // Metal spikes on top.
    const spikeGeo = new THREE.ConeGeometry(0.03, 0.14, 4);
    const spikes = new THREE.InstancedMesh(spikeGeo, new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 1, roughness: 0.3 }), Math.floor(width / 0.25) * 2);
    let k = 0;
    const m4 = new THREE.Matrix4();
    for (let x = -width / 2 + 0.12; x < width / 2; x += 0.25) {
      for (const z of [-0.14, 0.14]) {
        if (k >= spikes.count) break;
        m4.makeTranslation(x, 0.1, z);
        spikes.setMatrixAt(k++, m4);
      }
    }
    mesh.add(spikes);
    const ground = this.game.world.gen.groundHeight(center.x, center.z);
    mesh.position.set(center.x, Math.max(center.y, ground) + 0.04, center.z);
    mesh.rotation.y = Math.atan2(right.x, right.z) - Math.PI / 2;
    mesh.userData.noCollider = true;
    this.game.scene.add(mesh);
    const strip = { mesh, center: mesh.position.clone(), dir: dir.clone(), right, half: width / 2, depth: 0.45, age: 0 };
    this.spikes.push(strip);
    return strip;
  }

  updateSpikes(dt) {
    const g = this.game;
    const vehicles = [g.player, ...this.units.map((u) => u.v)];
    for (let i = this.spikes.length - 1; i >= 0; i--) {
      const s = this.spikes[i];
      s.age += dt;
      for (const v of vehicles) {
        if (v.position.distanceToSquared(s.center) > 36) continue;
        for (const w of v.wheels) {
          if (!w.grounded || w.popped) continue;
          _v.subVectors(w.contact, s.center);
          if (Math.abs(_v.dot(s.right)) < s.half && Math.abs(_v.dot(s.dir)) < s.depth && Math.abs(_v.y) < 0.6) {
            w.popped = true;
            if (v === g.player) {
              g.events.emit('spiked', {});
              this.radio.say('Spikes got him! Suspect is on the rims!', { key: 'spiked', every: 10 });
              g.cameraCtl.addShake(0.3);
              g.vfx.sparksAt(w.contact, UP, 25, 8);
            }
          }
        }
      }
      if ((s.expire && s.mesh.position.distanceTo(g.player.position) > 80) || s.age > 70) {
        g.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        this.spikes.splice(i, 1);
      }
    }
  }

  // Box-in at Heat 4+: front / left / right / back roles for the four closest seeing units.
  assignBoxRoles() {
    const player = this.game.player;
    const seenRecently = this.game.time - this.heat.lastSeen < 2;
    const cands = this.chaseUnits.filter((u) => (u.los || seenRecently) && u.v.position.distanceTo(player.position) < 90 && u.role === 'chase');
    for (const u of this.units) u.boxRole = null;
    // Two units already make a box (one behind, one alongside); more fill the other slots.
    if (!this.heat.config.box || cands.length < 2) return;
    cands.sort((a, b) => a.v.position.distanceTo(player.position) - b.v.position.distanceTo(player.position));
    const roles = ['back', 'left', 'right', 'front'];
    // Give each role to the unit best positioned for it.
    const free = cands.slice(0, 4);
    for (const role of roles) {
      if (!free.length) break;
      let best = 0;
      let bs = -Infinity;
      free.forEach((u, i) => {
        _v.subVectors(u.v.position, player.position);
        const lon = _v.dot(player.forward);
        const lat = _v.dot(player.right);
        const score = role === 'front' ? lon : role === 'back' ? -lon : role === 'left' ? -lat : lat;
        if (score > bs) {
          bs = score;
          best = i;
        }
      });
      free[best].boxRole = role;
      free.splice(best, 1);
    }
  }

  // ---- helicopter -----------------------------------------------------------------
  updateHeli(dt, wanted) {
    const g = this.game;
    const player = g.player;
    if (wanted && !this.heli) {
      const model = new HelicopterModel();
      const start = player.position.clone().add(new THREE.Vector3(220, 90, 120));
      model.root.position.copy(start);
      g.scene.add(model.root);
      this.heli = { model, pos: start, vel: new THREE.Vector3(), sees: false, angle: 0, spot: new THREE.Vector3().copy(player.position), leaving: false, seeTimer: 0 };
      this.radio.say('Air One on scene. I have the suspect in sight.', { priority: true });
      g.events.emit('heliArrive', {});
    }
    const h = this.heli;
    if (!h) return;
    if (!wanted) h.leaving = true;
    h.angle += dt * 0.25;
    const lk = this.heat.lastKnown || player.position;
    const target = h.leaving ? h.pos.clone().add(new THREE.Vector3(300, 60, -300)) : (h.sees ? player.position : lk).clone().add(new THREE.Vector3(Math.cos(h.angle) * 40, 68, Math.sin(h.angle) * 40));
    if (h.sees && !h.leaving) target.addScaledVector(player.velocity, 1.2);
    _v.subVectors(target, h.pos);
    const desired = _v.clampLength(0, 58);
    h.vel.lerp(desired, 1 - Math.exp(-1.2 * dt));
    h.pos.addScaledVector(h.vel, dt);
    const m = h.model;
    m.root.position.copy(h.pos);
    m.root.rotation.y = Math.atan2(-h.vel.x, -h.vel.z) || 0;
    m.root.rotation.x = -clamp(h.vel.length() / 60, 0, 1) * 0.25;
    m.update(dt);
    // Line of sight and searchlight.
    h.seeTimer -= dt;
    if (h.seeTimer <= 0) {
      h.seeTimer = 0.25;
      const horiz = Math.hypot(player.position.x - h.pos.x, player.position.z - h.pos.z);
      h.sees = !h.leaving && horiz < 160 && !this.world.underCover(player.position);
    }
    if (h.sees) h.spot.lerp(player.position, 1 - Math.exp(-6 * dt));
    else h.spot.lerp(_v.copy(lk).add(new THREE.Vector3(Math.cos(h.angle * 3) * 30, 0, Math.sin(h.angle * 2.3) * 30)), 1 - Math.exp(-1.5 * dt));
    _w.copy(h.spot);
    _w.y = this.world.gen.groundHeight(_w.x, _w.z);
    m.aim(_w, h.leaving ? 0 : 1);
    if (h.leaving && h.pos.distanceTo(player.position) > 500) {
      g.scene.remove(m.root);
      this.heli = null;
    }
  }

  // ---- drones (Heat 5): follow into tunnels, EMP the thrusters --------------------------
  updateDrones(dt, wanted) {
    const g = this.game;
    const player = g.player;
    while (this.drones.filter((d) => !d.dead).length < wanted) {
      const model = new DroneModel();
      const pos = player.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 120, 30, (Math.random() - 0.5) * 120));
      model.root.position.copy(pos);
      g.scene.add(model.root);
      const side = this.drones.length % 2 ? 1 : -1;
      this.drones.push({ model, pos, vel: new THREE.Vector3(), side, sees: false, charge: 0, cooldown: 4 + Math.random() * 3, dead: false, seeTimer: 0 });
      if (this.drones.length === 1) this.radio.say('Pursuit drones deployed. EMP authorized.', { priority: true });
    }
    for (let i = this.drones.length - 1; i >= 0; i--) {
      const d = this.drones[i];
      if (d.dead) {
        d.vel.y -= 9.8 * dt;
        d.pos.addScaledVector(d.vel, dt);
        d.model.root.position.copy(d.pos);
        d.model.root.rotation.x += dt * 4;
        if (d.pos.y < g.world.gen.groundHeight(d.pos.x, d.pos.z) + 0.3) {
          g.vfx.explosion(d.pos, 0.4);
          g.scene.remove(d.model.root);
          this.drones.splice(i, 1);
        }
        continue;
      }
      if (wanted === 0) d.leaving = true;
      const target = d.leaving
        ? d.pos.clone().add(new THREE.Vector3(0, 40, 0))
        : player.position.clone().addScaledVector(player.forward, -11).addScaledVector(player.right, d.side * 5).add(new THREE.Vector3(0, 4.5, 0)).addScaledVector(player.velocity, 0.35);
      _v.subVectors(target, d.pos);
      d.vel.lerp(_v.clampLength(0, 90), 1 - Math.exp(-2.5 * dt));
      d.pos.addScaledVector(d.vel, dt);
      d.model.root.position.copy(d.pos);
      d.model.root.rotation.y = Math.atan2(-d.vel.x, -d.vel.z) || 0;
      d.model.root.rotation.z = -clamp(d.vel.x * 0.01, -0.3, 0.3);
      d.model.update(dt);
      d.seeTimer -= dt;
      if (d.seeTimer <= 0) {
        d.seeTimer = 0.25;
        d.sees = !d.leaving && this.canSee(d.pos.clone().setY(d.pos.y - 1.3), null, 70);
      }
      const dist = d.pos.distanceTo(player.position);
      d.cooldown -= dt;
      if (d.charge > 0) {
        d.charge += dt / 1.4;
        d.model.charge = d.charge;
        if (d.charge >= 1) {
          d.charge = 0;
          d.model.charge = 0;
          d.cooldown = 9;
          if (dist < 26 && d.sees) this.fireEmp(d);
        }
      } else if (d.cooldown <= 0 && dist < 22 && d.sees) d.charge = 0.01;
      if (d.leaving && d.pos.distanceTo(player.position) > 300) {
        g.scene.remove(d.model.root);
        this.drones.splice(i, 1);
      }
    }
  }

  fireEmp(d) {
    const g = this.game;
    g.player.energy.emp = 3;
    g.vfx.ring(g.player.position, 0x40c8ff, 16, 0.6, g.player.position.y - 0.4);
    g.vfx.sparksAt(g.player.position.clone().setY(g.player.position.y + 0.8), UP, 30, 6);
    g.gfx.setFlash(0.3, 0x80d8ff);
    g.cameraCtl.addShake(0.4);
    g.events.emit('emp', {});
    this.radio.say("EMP hit! His thrusters are down!", { key: 'emp', every: 8 });
  }

  destroyDrone(d) {
    d.dead = true;
    d.vel.y = 4;
    this.game.vfx.sparksAt(d.pos, UP, 20, 8);
    this.game.events.emit('droneDown', { position: d.pos });
  }

  // ---- busted -----------------------------------------------------------------------
  updateBusted(dt) {
    const g = this.game;
    const player = g.player;
    const heat = this.heat;
    if (heat.phase === 'none') {
      heat.busted = 0;
      return;
    }
    let close = 0;
    for (const u of this.units) {
      if (u.v.wrecked) continue;
      if (u.v.position.distanceTo(player.position) < 7.5) close++;
    }
    const stopped = player.speed < 2.5;
    const pinned = stopped && (close >= 2 || (close >= 1 && player.controls.throttle > 0.5));
    if (pinned) heat.busted += dt;
    else heat.busted = Math.max(0, heat.busted - dt * 1.5);
    if (heat.busted >= 3 && !this.bustedFired) {
      this.bustedFired = true;
      g.events.emit('busted', {});
      this.radio.say('Suspect in custody. Nice work, units.', { priority: true });
    }
    if (heat.busted < 0.1) this.bustedFired = false;
  }

  // ---- lights -------------------------------------------------------------------------
  updateLights() {
    const g = this.game;
    const player = g.player;
    const n = g.settings.preset.policeLights;
    const live = this.units.filter((u) => !u.v.wrecked && u.npc.ctx.sirens).sort((a, b) => a.v.position.distanceToSquared(player.position) - b.v.position.distanceToSquared(player.position));
    this.lights.forEach((l, i) => {
      const u = live[Math.floor(i / 2)];
      if (!u || i >= n * 2) {
        l.intensity = 0;
        return;
      }
      const bar = u.model.lightBar;
      const red = i % 2 === 0;
      l.position.copy(u.v.position).addScaledVector(u.v.up, u.type === 'swat' ? 2.2 : 1.3).addScaledVector(u.v.right, red ? -0.4 : 0.4);
      l.intensity = (red ? bar.redLevel : bar.blueLevel) * 900;
    });
  }

  // Wet-road reflections of light bars.
  addStreaks(s) {
    for (const u of this.units) {
      if (u.v.wrecked || !u.npc.ctx.sirens) continue;
      const bar = u.model.lightBar;
      const p = u.v.position;
      const gy = p.y - 0.5;
      if (bar.redLevel > 0) s.add(p.x - u.v.right.x * 0.4, p.y + 1, p.z - u.v.right.z * 0.4, gy, 0xff1010, 1.2, 1.2);
      if (bar.blueLevel > 0) s.add(p.x + u.v.right.x * 0.4, p.y + 1, p.z + u.v.right.z * 0.4, gy, 0x1030ff, 1.4, 1.2);
    }
  }

  // Minimap markers.
  markers() {
    const out = [];
    for (const u of this.units) {
      out.push({ x: u.v.position.x, z: u.v.position.z, kind: u.v.wrecked ? 'wreck' : 'police', heading: u.v.yaw, flash: u.model.lightBar.redLevel > 0 });
    }
    if (this.heli) out.push({ x: this.heli.pos.x, z: this.heli.pos.z, kind: 'heli', spot: this.heli.spot });
    for (const d of this.drones) if (!d.dead) out.push({ x: d.pos.x, z: d.pos.z, kind: 'drone' });
    return out;
  }

  // Remove every unit (mission restarts, bust/wreck resets).
  clearAll() {
    for (const u of [...this.units]) this.removeUnit(u);
    for (const rb of this.roadblocks) if (rb.spike) rb.spike.expire = true;
    this.roadblocks.length = 0;
    for (const s of this.spikes) this.game.scene.remove(s.mesh);
    this.spikes.length = 0;
    if (this.heli) this.game.scene.remove(this.heli.model.root);
    this.heli = null;
    for (const d of this.drones) this.game.scene.remove(d.model.root);
    this.drones.length = 0;
  }

  describePlayer() {
    const p = this.game.player;
    const r = this.graph.nearest(p.position);
    const street = r && r.edge.name ? r.edge.name : this.game.world.district(p.position).name;
    return { dir: compass(p.velocity.x, p.velocity.z), street };
  }
}
