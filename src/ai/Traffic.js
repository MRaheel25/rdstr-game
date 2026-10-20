// Ambient traffic. Cars follow lanes on the road graph as kinematic bodies (cheap), stop
// at red lights, keep their distance, honk and swerve when the player tears past. Just
// before any dynamic vehicle reaches them they become full dynamic rigid bodies, so they
// get shoved, spun and wrecked realistically. Near misses are detected for scoring.
import * as THREE from 'three';
import { CivilianModel, CAR_COLORS } from '../vehicle/models/CivilianModels.js';
import { G, groups } from '../core/Physics.js';
import { GRID_XS, GRID_ZS } from '../world/Layout.js';
import { clamp } from '../util/math.js';

const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _a = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const TYPES = ['sedan', 'sedan', 'sedan', 'hatch', 'hatch', 'suv', 'suv', 'van'];

function laneOffsets(edge) {
  if (edge.kind === 'highway') return [2.1, 5.8, 9.6];
  if (edge.kind === 'ramp') return [2.2];
  if (edge.lanes <= 1) return [2.6];
  return [2.0, 5.5];
}

export class Traffic {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.graph = game.world.graph;
    this.physics = game.physics;
    this.cars = [];
    this.pool = [];
    this.spawnTimer = 0;
    this.edgeCars = new Map();
    this.drivable = this.graph.edges.filter((e) => e.kind !== 'stunt' && e.length > 25);
    this.R = game.physics.R;
  }

  get maxCars() {
    const q = this.game.settings.get('quality');
    return { low: 10, medium: 18, high: 26, ultra: 32 }[q] ?? 18;
  }

  // ---- spawning -------------------------------------------------------------
  createCar(type) {
    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const model = new CivilianModel(type, color);
    const R = this.R;
    const body = this.physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setCanSleep(true));
    const col = this.physics.world.createCollider(
      R.ColliderDesc.cuboid(model.halfWidth, model.height * 0.4, model.halfLength)
        .setTranslation(0, model.height * 0.42, 0)
        .setMass(1350)
        .setFriction(0.55)
        .setRestitution(0.15)
        .setCollisionGroups(groups(G.TRAFFIC, 0xffff)),
      body,
    );
    const car = { model, body, collider: col, type, active: false, kinematic: true };
    this.physics.meta.set(col.handle, { kind: 'traffic', ref: car, surface: 'metal' });
    this.game.scene.add(model.root);
    car.interp = this.physics.track(body, model.root);
    return car;
  }

  spawn(edge, s, dir, lane) {
    const type = TYPES[Math.floor(Math.random() * TYPES.length)];
    let car = this.pool.find((c) => c.type === type);
    if (car) this.pool.splice(this.pool.indexOf(car), 1);
    else car = this.createCar(type);
    Object.assign(car, {
      active: true, state: 'drive', edge, s, dir, lane, speed: edge.speed * 0.6, target: edge.speed,
      turn: null, honk: 0, swerve: 0, nearMiss: 0, lastLong: null, stillTime: 0, pos: new THREE.Vector3(), yaw: 0,
      vel: new THREE.Vector3(), cruise: (edge.kind === 'highway' ? 26 : 13) + Math.random() * 5,
    });
    if (!car.kinematic) {
      car.body.setBodyType(this.R.RigidBodyType.KinematicPositionBased, true);
      car.kinematic = true;
    }
    car.body.setEnabled(true);
    car.model.root.visible = true;
    this.poseOnEdge(car, car.edge, car.s, car.dir, car.pos);
    car.body.setTranslation(car.pos, true);
    car.body.setRotation(this.yawQuat(car.yaw), true);
    car.interp.snap();
    this.cars.push(car);
    return car;
  }

  despawn(car) {
    car.active = false;
    car.body.setEnabled(false);
    car.model.root.visible = false;
    this.cars.splice(this.cars.indexOf(car), 1);
    this.pool.push(car);
  }

  yawQuat(yaw) {
    _q.setFromAxisAngle(UP, yaw);
    return { x: _q.x, y: _q.y, z: _q.z, w: _q.w };
  }

  // Pose on an edge at distance s in travel direction dir, in lane `car.lane`.
  poseOnEdge(car, edge, s, dir, out) {
    const ss = dir > 0 ? s : edge.length - s;
    this.graph.sample(edge, ss, out, _t);
    if (dir < 0) _t.negate();
    const offs = laneOffsets(edge);
    const off = offs[Math.min(car.lane, offs.length - 1)] + car.swerve;
    out.x += -_t.z * off;
    out.z += _t.x * off;
    car.heading = car.heading || new THREE.Vector3();
    car.heading.copy(_t);
    car.yaw = Math.atan2(-_t.x, -_t.z);
    return out;
  }

  trySpawn(player, camera) {
    for (let tries = 0; tries < 12; tries++) {
      const edge = this.drivable[Math.floor(Math.random() * this.drivable.length)];
      const s = Math.random() * edge.length;
      this.graph.sample(edge, s, _p);
      const d = _p.distanceTo(player.position);
      if (d < 110 || d > 300) continue;
      // Not right in front of the camera when close.
      if (d < 200 && this.inView(_p, camera)) continue;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const lane = Math.floor(Math.random() * laneOffsets(edge).length);
      const sDir = dir > 0 ? s : edge.length - s;
      const crowded = this.cars.some((c) => c.edge === edge && c.dir === dir && Math.abs(c.s - sDir) < 25);
      if (crowded) continue;
      this.spawn(edge, Math.max(8, Math.min(edge.length - 12, sDir)), dir, lane);
      return true;
    }
    return false;
  }

  inView(p, camera) {
    _a.copy(p).project(camera);
    return _a.z < 1 && Math.abs(_a.x) < 1.1 && Math.abs(_a.y) < 1.1;
  }

  // ---- routing --------------------------------------------------------------------
  endNode(car) {
    return car.dir > 0 ? car.edge.b : car.edge.a;
  }

  chooseNext(car) {
    const node = this.endNode(car);
    const options = node.edges.filter((e) => e !== car.edge && e.kind !== 'stunt');
    let next;
    if (!options.length) next = car.edge; // dead end: U-turn
    else next = options[Math.floor(Math.random() * options.length)];
    const nextDir = next.a === node ? 1 : -1;
    const lanes = laneOffsets(next).length;
    return { edge: next, dir: next === car.edge ? -car.dir : nextDir, lane: Math.min(car.lane, lanes - 1) };
  }

  signalStop(car) {
    const node = this.endNode(car);
    if (node.tag !== 'grid') return Infinity;
    const i = GRID_XS.indexOf(Math.round(node.x));
    const j = GRID_ZS.indexOf(Math.round(node.z));
    if (i < 0 || j < 0) return Infinity;
    const axis = Math.abs(car.heading.x) > Math.abs(car.heading.z) ? 'ew' : 'ns';
    const phase = this.world.signalPhase(axis, i * 31 + j * 17);
    if (phase === 'green') return Infinity;
    const toLine = car.edge.length - car.s - 11;
    if (toLine < -0.5) return Infinity; // already past the stop line
    if (phase === 'amber' && toLine < 6) return Infinity;
    return toLine;
  }

  // ---- fixed step --------------------------------------------------------------
  step(h) {
    const player = this.game.player;
    const dyn = [player, ...this.game.npcs.filter((n) => n.kind !== 'traffic').map((n) => n.vehicle)];
    // Index cars per edge for following distance.
    this.edgeCars.clear();
    for (const c of this.cars) {
      if (c.state !== 'drive' || c.turn) continue;
      const k = c.edge.id * 2 + (c.dir > 0 ? 1 : 0);
      if (!this.edgeCars.has(k)) this.edgeCars.set(k, []);
      this.edgeCars.get(k).push(c);
    }
    for (const car of this.cars) {
      if (car.state !== 'drive') continue;
      // Convert to a dynamic body just before anything dynamic reaches it.
      let hit = false;
      for (const v of dyn) {
        const r = car.model.halfLength + 2.6 + Math.min(14, Math.abs(v.speed - car.speed) * 0.08);
        if (v.position.distanceToSquared(car.pos) < r * r && Math.abs(v.position.y - car.pos.y) < 4) {
          hit = true;
          break;
        }
      }
      if (hit) {
        this.makeDynamic(car);
        continue;
      }
      this.drive(car, h, player);
    }
  }

  drive(car, h, player) {
    // Target speed: cruise, signal stops, car ahead, player in the lane.
    let target = Math.min(car.cruise, car.edge.speed);
    const stop = car.turn ? Infinity : this.signalStop(car);
    if (stop < 45) target = Math.min(target, Math.max(0, stop * 0.45));
    if (stop < 0.6) target = 0;
    if (!car.turn) {
      const list = this.edgeCars.get(car.edge.id * 2 + (car.dir > 0 ? 1 : 0));
      if (list) {
        for (const o of list) {
          if (o === car || o.lane !== car.lane || o.s <= car.s) continue;
          const gap = o.s - car.s - 7;
          target = Math.min(target, Math.max(0, gap * 0.5));
        }
      }
    }
    // Player ahead in our lane: slow down; player approaching fast: honk and swerve.
    _a.subVectors(player.position, car.pos);
    const ahead = _a.dot(car.heading);
    const lateral = _a.x * -car.heading.z + _a.z * car.heading.x;
    if (ahead > 0 && ahead < 25 && Math.abs(lateral) < 2.2) target = Math.min(target, Math.max(0, (ahead - 7) * 0.5));
    const dist = _a.length();
    if (dist < 22 && player.speed > 18 && car.honk <= 0) {
      car.honk = 3;
      this.game.events.emit('honk', { car, position: car.pos });
      car.swerveTarget = clamp(-Math.sign(lateral || 1) * 1.2, -1.2, 1.2);
    }
    car.honk -= h;
    car.swerve += ((car.honk > 1.5 ? car.swerveTarget || 0 : 0) - car.swerve) * Math.min(1, h * 2);
    const accel = target > car.speed ? 3.2 : 8;
    car.speed += clamp(target - car.speed, -accel * h, accel * h);
    car.speed = Math.max(0, car.speed);
    const prev = _p.copy(car.pos);
    // Advance along edge / through a turn.
    const turnDist = car.edge.kind === 'street' ? 9 : 4;
    if (car.turn) {
      const t = car.turn;
      t.u += (car.speed * h) / t.len;
      if (t.u >= 1) {
        car.edge = t.next.edge;
        car.dir = t.next.dir;
        car.lane = t.next.lane;
        car.s = Math.min(turnDist, car.edge.length * 0.5);
        car.turn = null;
        this.poseOnEdge(car, car.edge, car.s, car.dir, car.pos);
      } else {
        const u = t.u;
        car.pos.set(0, 0, 0).addScaledVector(t.p0, (1 - u) * (1 - u)).addScaledVector(t.p1, 2 * u * (1 - u)).addScaledVector(t.p2, u * u);
        _t.set(0, 0, 0).addScaledVector(t.p1.clone().sub(t.p0), 2 * (1 - u)).addScaledVector(t.p2.clone().sub(t.p1), 2 * u).normalize();
        car.heading.copy(_t);
        car.yaw = Math.atan2(-_t.x, -_t.z);
      }
    } else {
      car.s += car.speed * h;
      if (car.s > car.edge.length - turnDist) {
        const next = this.chooseNext(car);
        const p0 = this.poseOnEdge(car, car.edge, car.edge.length - turnDist, car.dir, new THREE.Vector3());
        const h0 = car.heading.clone();
        const tmp = { ...car, swerve: 0, lane: next.lane, heading: new THREE.Vector3() };
        const p2 = this.poseOnEdge(tmp, next.edge, Math.min(turnDist, next.edge.length * 0.5), next.dir, new THREE.Vector3());
        const h2 = tmp.heading.clone();
        // Control point: where the incoming and outgoing lane lines meet (fallback: node).
        let p1 = lineIntersect(p0, h0, p2, h2);
        if (!p1 || p1.distanceTo(p0) > 30) {
          const node = this.endNode(car);
          p1 = new THREE.Vector3(node.x, (p0.y + p2.y) / 2, node.z);
          if (next.edge === car.edge) p1.addScaledVector(h0, 8);
        }
        car.turn = { p0, p1, p2, u: 0, len: Math.max(2, p0.distanceTo(p1) + p1.distanceTo(p2)), next };
        car.pos.copy(p0);
        car.yaw = Math.atan2(-h0.x, -h0.z);
      } else this.poseOnEdge(car, car.edge, car.s, car.dir, car.pos);
    }
    car.vel.subVectors(car.pos, prev).divideScalar(h);
    car.body.setNextKinematicTranslation(car.pos);
    car.body.setNextKinematicRotation(this.yawQuat(car.yaw));
  }

  makeDynamic(car) {
    car.state = 'struck';
    car.kinematic = false;
    car.body.setBodyType(this.R.RigidBodyType.Dynamic, true);
    car.body.setLinvel({ x: car.vel.x, y: 0, z: car.vel.z }, true);
    car.body.setAngularDamping(0.8);
    car.body.setLinearDamping(0.15);
    car.struckAt = this.game.time;
  }

  // ---- per frame ----------------------------------------------------------------
  update(dt, realDt) {
    const g = this.game;
    const player = g.player;
    // Spawn / despawn.
    this.spawnTimer -= realDt;
    if (this.spawnTimer <= 0 && this.cars.length < this.maxCars) {
      this.spawnTimer = 0.25;
      this.trySpawn(player, g.camera);
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      if (car.state === 'struck') {
        const t = car.body.translation();
        car.pos.set(t.x, t.y, t.z);
      }
      const d = car.pos.distanceTo(player.position);
      if (d > 340 || (car.state === 'struck' && d > 180 && g.time - car.struckAt > 30) || car.pos.y < -10) {
        if (!this.inView(car.pos, g.camera) || d > 400) this.despawn(car);
      }
    }
    // Visuals, near misses.
    for (const car of this.cars) {
      const d = car.pos.distanceTo(player.position);
      const speed = car.state === 'drive' ? car.speed : 0;
      car.model.update(dt, speed, d < 70);
      if (car.state === 'drive') this.nearMiss(car, player, dt);
    }
  }

  nearMiss(car, player, dt) {
    car.nearMiss -= dt;
    _a.subVectors(player.position, car.pos);
    if (_a.lengthSq() > 100) {
      car.lastLong = null;
      return;
    }
    const long = _a.dot(car.heading);
    const lat = Math.abs(_a.x * -car.heading.z + _a.z * car.heading.x);
    const rel = _t.copy(player.velocity).addScaledVector(car.heading, -car.speed).length();
    const gap = lat - car.model.halfWidth - 1.0;
    if (car.lastLong !== null && Math.sign(long) !== Math.sign(car.lastLong) && rel > 14 && gap > 0.05 && gap < 1.8 && car.nearMiss <= 0) {
      car.nearMiss = 4;
      this.game.events.emit('nearMiss', { car, gap, speed: rel });
    }
    car.lastLong = long;
  }

  // Light sources for wet-road streaks.
  addStreaks(s, camPos) {
    for (const car of this.cars) {
      if (car.state !== 'drive' || car.pos.distanceToSquared(camPos) > 130 * 130) continue;
      const h = car.heading;
      const L = car.model.halfLength;
      for (const side of [-0.6, 0.6]) {
        const rx = -h.z * side;
        const rz = h.x * side;
        s.add(car.pos.x + h.x * L + rx, car.pos.y + 0.7, car.pos.z + h.z * L + rz, car.pos.y + 0.02, 0xfff0d8, 0.45, 0.7);
        s.add(car.pos.x - h.x * L + rx, car.pos.y + 0.8, car.pos.z - h.z * L + rz, car.pos.y + 0.02, 0xff1810, 0.35, 0.6);
      }
    }
  }
}

function lineIntersect(p0, d0, p2, d2) {
  // Solve p0 + d0 t = p2 + d2 u in XZ.
  const det = d0.x * -d2.z - d0.z * -d2.x;
  if (Math.abs(det) < 0.15) return null;
  const rx = p2.x - p0.x;
  const rz = p2.z - p0.z;
  const t = (rx * -d2.z - rz * -d2.x) / det;
  if (t < 0) return null;
  return new THREE.Vector3(p0.x + d0.x * t, (p0.y + p2.y) / 2, p0.z + d0.z * t);
}
