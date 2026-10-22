// V2 pedestrians: low-poly people drawn with one InstancedMesh. The walk cycle (legs and arms
// swinging), falls and the get-up are done in the vertex shader from per-instance values, so
// hundreds of people cost one draw call. They walk sidewalk loops around the city blocks,
// cross at crosswalks, and stand at shops and bus stops. When the car comes close they dive
// out of the way; if touched they stumble, fall and get back up. No injuries, ever. In Kids
// Mode they always dodge in time.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CURB_H } from './CityGenerator.js';

const COUNT_BY_QUALITY = { low: 40, medium: 90, high: 150, ultra: 220 };
const SIDEWALK_IN = 2.7; // walking line inset from the lot edge (sidewalk is 5 m)
const ACTIVE_R = 230; // people live within this distance of the player
const SHIRTS = [0xd23a3a, 0x2a6ad8, 0xf2f2ee, 0x1a1a1e, 0x3a9a5a, 0xf0b020, 0x8a4ac0, 0xe07a9a, 0x5a6a7a, 0x20a0b0, 0xc06a2a, 0x9aa04a];
const PANTS = [0x22252c, 0x2a3a5a, 0x5a4a3a, 0x8a8478, 0x1a1a1a, 0x3a4a3a, 0x6a6a72];
const SKIN = [0xf1c8a6, 0xd9a47e, 0xb07a52, 0x8a5a3a, 0x5e3c26, 0xe8b894];
const HAIR = [0x1a1410, 0x3a2414, 0x6a4a2a, 0xc8a060, 0x2a2a2a, 0x8a3a1a];

// Part ids (aPart.x): 0 torso, 1 left leg, 2 right leg, 3 left arm, 4 right arm, 5 head.
// Material slot (aPart.y): 0 shirt, 1 pants, 2 skin, 3 hair, 4 shoes.
export function personGeometry() {
  const parts = [];
  const add = (geo, part, slot) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const n = g.attributes.position.count;
    const a = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      a[i * 2] = part;
      a[i * 2 + 1] = slot;
    }
    g.setAttribute('aPart', new THREE.BufferAttribute(a, 2));
    g.deleteAttribute('uv');
    parts.push(g);
  };
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  for (const [side, part] of [[-1, 1], [1, 2]]) {
    add(box(0.15, 0.82, 0.17, side * 0.1, 0.49, 0), part, 1);
    add(box(0.16, 0.08, 0.26, side * 0.1, 0.04, 0.04), part, 4);
  }
  add(box(0.4, 0.58, 0.23, 0, 1.19, 0), 0, 0);
  add(box(0.34, 0.12, 0.2, 0, 0.93, 0), 0, 1); // belt / hips
  for (const [side, part] of [[-1, 3], [1, 4]]) {
    add(box(0.1, 0.56, 0.11, side * 0.255, 1.17, 0), part, 0);
    add(box(0.09, 0.1, 0.1, side * 0.255, 0.85, 0), part, 2);
  }
  add(box(0.09, 0.08, 0.09, 0, 1.52, 0), 5, 2); // neck
  add(new THREE.IcosahedronGeometry(0.13, 1).scale(1, 1.15, 1.05).translate(0, 1.66, 0), 5, 2);
  add(new THREE.IcosahedronGeometry(0.135, 1).scale(1.02, 0.6, 1.06).translate(0, 1.74, -0.02), 5, 3);
  return mergeGeometries(parts, false);
}

export function personMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec2 aPart;
attribute vec4 iAnim;   // phase, swing, fall (rad, forward), crouch
attribute vec3 iShirt;
attribute vec3 iPants;
attribute vec3 iSkin;
varying vec3 vPedCol;
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  float part = aPart.x;
  float sw = sin(iAnim.x) * iAnim.y;
  // Limb swing around hip / shoulder pivots.
  if (part > 0.5 && part < 2.5) {
    float a = part < 1.5 ? sw : -sw;
    vec3 piv = vec3(0.0, 0.9, 0.0);
    transformed = rotX(a) * (transformed - piv) + piv;
    objectNormal = rotX(a) * objectNormal;
  } else if (part > 2.5 && part < 4.5) {
    float a = (part < 3.5 ? -sw : sw) * 0.8 - iAnim.w * 1.2;
    vec3 piv = vec3(0.0, 1.45, 0.0);
    transformed = rotX(a) * (transformed - piv) + piv;
    objectNormal = rotX(a) * objectNormal;
  }
  // Bob while walking, crouch.
  transformed.y += abs(cos(iAnim.x)) * iAnim.y * 0.06 - iAnim.w * 0.25 * step(0.5, part) * step(part, 2.5) * 0.0;
  // Fall forward around the feet (dive / stumble), lifting slightly so the body lies on the ground.
  float f = iAnim.z;
  transformed = rotX(f) * transformed;
  objectNormal = rotX(f) * objectNormal;
  transformed.y += sin(min(f, 1.5)) * 0.12;
}`)
      .replace('#include <color_vertex>', `#include <color_vertex>
{
  float slot = aPart.y;
  vPedCol = slot < 0.5 ? iShirt : slot < 1.5 ? iPants : slot < 2.5 ? iSkin : slot < 3.5 ? iSkin * 0.25 : vec3(0.06);
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vPedCol;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= vPedCol;`);
  };
  m.customProgramCacheKey = () => 'ped-v1';
  return m;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

export class Pedestrians {
  constructor(game) {
    this.game = game;
    const gen = game.world.gen;
    this.max = 240;
    this.lots = gen.lots.filter((l) => l.info.i !== undefined && l.x1 - l.x0 > 30);
    this.lotIndex = new Map(this.lots.map((l) => [`${l.info.i}_${l.info.j}`, l]));
    // Places people stand: shop fronts and bus stops.
    this.spots = [];
    for (const s of gen.shops || []) this.spots.push({ x: s.x, z: s.z, yaw: Math.atan2(-s.nx, -s.nz), y: CURB_H });
    for (const it of gen.props.items) if (it.typeName === 'busStop') this.spots.push({ x: it.x, z: it.z, yaw: it.rot, y: it.y, bus: true });
    const geo = personGeometry();
    this.anim = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const col = (arr) => new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3);
    this.shirt = col();
    this.pants = col();
    this.skin = col();
    geo.setAttribute('iAnim', this.anim);
    geo.setAttribute('iShirt', this.shirt);
    geo.setAttribute('iPants', this.pants);
    geo.setAttribute('iSkin', this.skin);
    this.mesh = new THREE.InstancedMesh(geo, personMaterial(), this.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.userData.noCollider = true;
    this.mesh.count = 0;
    game.scene.add(this.mesh);
    this.peds = [];
    this.seed = 99;
    for (let i = 0; i < this.max; i++) this.peds.push(this.makePed(i));
    this.respawnTimer = 0;
    this.applyQuality();
  }

  rnd() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  pick(a) {
    return a[Math.floor(this.rnd() * a.length)];
  }

  makePed(i) {
    const p = { i, alive: false, x: 0, z: 0, y: CURB_H, yaw: 0, speed: 1.3, phase: this.rnd() * 6, state: 'walk', t: 0, fall: 0, vx: 0, vz: 0, lot: null, s: 0, dir: 1, cross: null, idle: false };
    _c.set(this.pick(SHIRTS)).toArray(this.shirt.array, i * 3);
    _c.set(this.pick(PANTS)).toArray(this.pants.array, i * 3);
    _c.set(this.pick(SKIN)).toArray(this.skin.array, i * 3);
    return p;
  }

  applyQuality() {
    this.count = Math.min(this.max, COUNT_BY_QUALITY[this.game.settings.get('quality')] ?? 90);
    for (let i = this.count; i < this.max; i++) this.peds[i].alive = false;
    this.mesh.count = this.count;
  }

  // Walking loop around a lot: rectangle inset from the lot edge.
  rect(l) {
    return { x0: l.x0 + SIDEWALK_IN, z0: l.z0 + SIDEWALK_IN, x1: l.x1 - SIDEWALK_IN, z1: l.z1 - SIDEWALK_IN };
  }

  perimeterPoint(l, s, out) {
    const r = this.rect(l);
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const L = 2 * (w + d);
    s = ((s % L) + L) % L;
    if (s < w) out.set(r.x0 + s, 0, r.z0);
    else if (s < w + d) out.set(r.x1, 0, r.z0 + (s - w));
    else if (s < 2 * w + d) out.set(r.x1 - (s - w - d), 0, r.z1);
    else out.set(r.x0, 0, r.z1 - (s - 2 * w - d));
    return L;
  }

  spawn(p, center) {
    // A lot near the player, preferring ones not right on top of the camera.
    const near = this.lots.filter((l) => {
      const d = Math.hypot((l.x0 + l.x1) / 2 - center.x, (l.z0 + l.z1) / 2 - center.z);
      return d < ACTIVE_R - 30;
    });
    if (!near.length) {
      p.alive = false;
      return;
    }
    p.alive = true;
    p.state = 'walk';
    p.fall = 0;
    p.cross = null;
    p.t = 0;
    p.y = CURB_H;
    p.speed = 1.0 + this.rnd() * 0.7;
    if (this.spots.length && this.rnd() < 0.22) {
      // Standing at a shop window or waiting at a bus stop.
      const nearSpots = this.spots.filter((s) => Math.hypot(s.x - center.x, s.z - center.z) < ACTIVE_R - 20);
      if (nearSpots.length) {
        const s = this.pick(nearSpots);
        p.idle = true;
        p.x = s.x + (this.rnd() - 0.5) * 3;
        p.z = s.z + (this.rnd() - 0.5) * 3;
        p.y = s.y;
        p.yaw = s.yaw + (this.rnd() - 0.5) * 0.8;
        p.idleT = 8 + this.rnd() * 25;
        p.lot = null;
        return;
      }
    }
    p.idle = false;
    p.lot = this.pick(near);
    p.dir = this.rnd() < 0.5 ? 1 : -1;
    p.s = this.rnd() * 400;
    p.side = (this.rnd() - 0.5) * 1.6; // lateral offset on the sidewalk
  }

  update(dt, realDt) {
    const g = this.game;
    if (g.state !== 'playing' && g.state !== 'paused') return;
    if (this.count !== Math.min(this.max, COUNT_BY_QUALITY[g.settings.get('quality')] ?? 90)) this.applyQuality();
    const car = g.player;
    const cp = car.position;
    const kids = !!g.kidsMode;
    const vx = car.velocity.x;
    const vz = car.velocity.z;
    const speed = Math.hypot(vx, vz);
    const anim = this.anim.array;
    for (let k = 0; k < this.count; k++) {
      const p = this.peds[k];
      if (!p.alive || Math.hypot(p.x - cp.x, p.z - cp.z) > ACTIVE_R + 30) {
        this.spawn(p, cp);
        if (!p.alive) {
          anim[k * 4 + 2] = 0;
          this.write(k, p, true);
          continue;
        }
        this.place(p);
      }
      this.react(p, cp, vx, vz, speed, kids, car);
      this.step(p, dt);
      this.write(k, p);
      const a = k * 4;
      anim[a] = p.phase;
      anim[a + 1] = p.state === 'walk' && !p.idle ? 0.55 : p.state === 'cross' ? 0.6 : p.state === 'dive' ? 0.9 : 0.03;
      anim[a + 2] = p.fall;
      anim[a + 3] = p.state === 'dive' ? 1 : p.idle ? 0.1 * (1 + Math.sin(p.phase * 0.3)) : 0;
    }
    this.anim.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!this.colorsSent) {
      this.shirt.needsUpdate = this.pants.needsUpdate = this.skin.needsUpdate = true;
      this.colorsSent = true;
    }
  }

  place(p) {
    if (!p.lot) return;
    this.perimeterPoint(p.lot, p.s, _p);
    p.x = _p.x;
    p.z = _p.z;
  }

  // Car danger: dive out of the way; if hit, stumble and fall, then get up.
  react(p, cp, vx, vz, speed, kids, car) {
    if (p.state === 'dive' || p.state === 'down' || p.state === 'getup') return;
    const dx = p.x - cp.x;
    const dz = p.z - cp.z;
    const d = Math.hypot(dx, dz);
    if (d > 30 || Math.abs((car.position.y - 0.5) - p.y) > 3) return;
    if (d < 1.5 && speed > 1.5 && !kids) {
      // Touched: shoved along the car's motion, falls over, gets back up.
      p.state = 'down';
      p.t = 0;
      p.vx = vx * 0.35 + (dx / (d || 1)) * 2;
      p.vz = vz * 0.35 + (dz / (d || 1)) * 2;
      p.yaw = Math.atan2(p.vx, p.vz);
      this.game.events.emit('pedBump', { x: p.x, z: p.z });
      return;
    }
    if (speed < 3) return;
    // Closest approach of the car's path.
    const t = (dx * vx + dz * vz) / (speed * speed);
    const horizon = kids ? 2.2 : 1.1;
    if (t < 0 || t > horizon) return;
    const mx = dx - vx * t;
    const mz = dz - vz * t;
    const miss = Math.hypot(mx, mz);
    if (miss > (kids ? 4 : 2.6)) return;
    // Dive perpendicular to the car's path, away from it.
    let nx = -vz / speed;
    let nz = vx / speed;
    if (nx * mx + nz * mz < 0) {
      nx = -nx;
      nz = -nz;
    }
    p.state = 'dive';
    p.t = 0;
    const v = kids ? 7 : 5.2;
    p.vx = nx * v;
    p.vz = nz * v;
    p.yaw = Math.atan2(nx, nz);
  }

  step(p, dt) {
    p.t += dt;
    switch (p.state) {
      case 'dive': {
        const k = Math.max(0, 1 - p.t / 0.75);
        p.x += p.vx * dt * k;
        p.z += p.vz * dt * k;
        p.fall = Math.min(1.45, p.t * 3.2);
        p.phase += dt * 10;
        if (p.t > 0.75) {
          p.state = 'down';
          p.t = 0.6;
          p.vx = p.vz = 0;
        }
        return;
      }
      case 'down': {
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.vx *= Math.max(0, 1 - dt * 4);
        p.vz *= Math.max(0, 1 - dt * 4);
        p.fall = Math.min(1.5, p.fall + dt * 4.5);
        if (p.t > 1.8) {
          p.state = 'getup';
          p.t = 0;
        }
        return;
      }
      case 'getup':
        p.fall = Math.max(0, 1.5 - p.t * 1.6);
        if (p.fall <= 0) {
          p.state = 'walk';
          // Rejoin the nearest point of the loop.
          if (p.lot) p.s = this.nearestS(p.lot, p.x, p.z);
          p.y = this.onRoad(p.x, p.z) ? 0.02 : CURB_H;
        }
        return;
      default:
        break;
    }
    if (p.idle) {
      p.phase += dt;
      p.idleT -= dt;
      if (p.idleT <= 0) {
        p.idle = false;
        p.lot = this.lots.reduce((a, l) => (Math.hypot((l.x0 + l.x1) / 2 - p.x, (l.z0 + l.z1) / 2 - p.z) < Math.hypot((a.x0 + a.x1) / 2 - p.x, (a.z0 + a.z1) / 2 - p.z) ? l : a), this.lots[0]);
        p.s = this.nearestS(p.lot, p.x, p.z);
        p.dir = 1;
        p.side = 0;
      }
      return;
    }
    if (p.cross) {
      // Crossing the street on the crosswalk.
      const c = p.cross;
      const dx = c.x - p.x;
      const dz = c.z - p.z;
      const d = Math.hypot(dx, dz);
      const v = p.speed * 1.25;
      p.yaw = Math.atan2(dx, dz);
      p.phase += dt * v * 4.2;
      p.y = this.onRoad(p.x, p.z) ? 0.02 : CURB_H;
      p.state = 'cross';
      if (d < 0.3) {
        p.lot = c.lot;
        p.s = this.nearestS(c.lot, c.x, c.z);
        p.cross = null;
        p.state = 'walk';
        p.y = CURB_H;
      } else {
        p.x += (dx / d) * v * dt;
        p.z += (dz / d) * v * dt;
      }
      return;
    }
    if (!p.lot) return;
    const prevS = p.s;
    p.s += p.dir * p.speed * dt;
    p.phase += dt * p.speed * 4.2;
    const L = this.perimeterPoint(p.lot, p.s, _p);
    const r = this.rect(p.lot);
    // Offset sideways on the sidewalk (towards the road for positive side).
    const ox = _p.x <= r.x0 + 0.01 ? -1 : _p.x >= r.x1 - 0.01 ? 1 : 0;
    const oz = _p.z <= r.z0 + 0.01 ? -1 : _p.z >= r.z1 - 0.01 ? 1 : 0;
    const nx = _p.x + ox * p.side * 0.5;
    const nz = _p.z + oz * p.side * 0.5;
    if (Math.abs(nx - p.x) + Math.abs(nz - p.z) > 1e-4) p.yaw = Math.atan2(nx - p.x, nz - p.z);
    p.x = nx;
    p.z = nz;
    p.y = CURB_H;
    // At a corner: sometimes cross to the neighbouring block.
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const corners = [0, w, w + d, 2 * w + d];
    for (const cs of corners) {
      const a = ((prevS % L) + L) % L;
      const b = ((p.s % L) + L) % L;
      const passed = p.dir > 0 ? a < cs && b >= cs : a > cs && b <= cs;
      if (passed && this.rnd() < 0.35) this.startCross(p, r);
    }
  }

  startCross(p, r) {
    const l = p.lot;
    const i = l.info.i;
    const j = l.info.j;
    const atX = Math.abs(p.x - r.x0) < 1 ? -1 : 1;
    const atZ = Math.abs(p.z - r.z0) < 1 ? -1 : 1;
    const opts = [];
    const nbX = this.lotIndex.get(`${i + atX}_${j}`);
    const nbZ = this.lotIndex.get(`${i}_${j + atZ}`);
    if (nbX) {
      const nr = this.rect(nbX);
      opts.push({ lot: nbX, x: atX > 0 ? nr.x0 : nr.x1, z: p.z });
    }
    if (nbZ) {
      const nr = this.rect(nbZ);
      opts.push({ lot: nbZ, x: p.x, z: atZ > 0 ? nr.z0 : nr.z1 });
    }
    if (opts.length) {
      // Cross on the crosswalk, 2.5 m off the corner.
      const c = this.pick(opts);
      if (c.x === p.x) {
        c.x += -atX * 2.6;
        p.x += -atX * 2.6;
      } else {
        c.z += -atZ * 2.6;
        p.z += -atZ * 2.6;
      }
      p.cross = c;
    }
  }

  nearestS(l, x, z) {
    const r = this.rect(l);
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const cx = Math.min(r.x1, Math.max(r.x0, x));
    const cz = Math.min(r.z1, Math.max(r.z0, z));
    const dl = [Math.abs(cz - r.z0), Math.abs(cx - r.x1), Math.abs(cz - r.z1), Math.abs(cx - r.x0)];
    const m = dl.indexOf(Math.min(...dl));
    if (m === 0) return cx - r.x0;
    if (m === 1) return w + (cz - r.z0);
    if (m === 2) return w + d + (r.x1 - cx);
    return 2 * w + d + (r.z1 - cz);
  }

  onRoad(x, z) {
    return !this.lots.some((l) => x > l.x0 && x < l.x1 && z > l.z0 && z < l.z1);
  }

  write(k, p, hide = false) {
    _q.setFromAxisAngle(UP, p.yaw);
    _s.setScalar(hide ? 0 : 1);
    _m.compose(_p.set(p.x, p.y, p.z), _q, _s);
    this.mesh.setMatrixAt(k, _m);
  }
}
