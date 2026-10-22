// Visual effects director: owns the particle systems and one-shot effects, and exposes a
// small API (smoke, sparks, splash, explosion, ring, jets...) used by gameplay systems.
import * as THREE from 'three';
import { ParticleSystem, SkidMarks } from './Particles.js';
import * as Tex from '../world/Textures.js';
import { G, groups } from '../core/Physics.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// Cold-gas / rocket jet: additive cone with a bright core, shock diamonds and flicker.
const jetVert = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const jetFrag = /* glsl */ `
uniform float uTime; uniform float uPower; uniform vec3 uCore; uniform vec3 uEdge; uniform float uDiamonds;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() {
  float y = 1.0 - vUv.y; // 0 at nozzle, 1 at tip
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float core = pow(facing, 2.5);
  float len = pow(1.0 - y, 1.6);
  float diamonds = 0.65 + 0.35 * sin(y * uDiamonds - uTime * 70.0) * (1.0 - y);
  float flicker = 0.85 + 0.15 * sin(uTime * 113.0 + y * 7.0);
  vec3 col = mix(uEdge, uCore, core) * len * diamonds * flicker * uPower;
  float a = clamp(len * core * uPower, 0.0, 1.0);
  gl_FragColor = vec4(col * 3.0, a);
}`;

class Jet {
  constructor(parent, localPos, localDir, { length = 1.2, radius = 0.12, core = 0xffffff, edge = 0x7fc8ff, diamonds = 22 } = {}) {
    const g = new THREE.CylinderGeometry(radius * 0.35, radius, 1, 14, 1, true);
    g.translate(0, -0.5, 0); // nozzle at origin, extends along -y
    this.mat = new THREE.ShaderMaterial({
      vertexShader: jetVert,
      fragmentShader: jetFrag,
      uniforms: {
        uTime: { value: 0 }, uPower: { value: 0 }, uCore: { value: new THREE.Color(core) }, uEdge: { value: new THREE.Color(edge) }, uDiamonds: { value: diamonds },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.position.copy(localPos);
    // Point local -y along localDir.
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), localDir.clone().normalize());
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.length = length;
    this.power = 0;
    this.target = 0;
    parent.add(this.mesh);
    this.localPos = localPos.clone();
    this.localDir = localDir.clone().normalize();
  }

  update(dt, t) {
    this.power += (this.target - this.power) * Math.min(1, dt * 25);
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uPower.value = this.power;
    this.mesh.visible = this.power > 0.02;
    const L = this.length * (0.6 + 0.4 * this.power) * (0.92 + Math.random() * 0.16);
    this.mesh.scale.set(1, L, 1);
  }
}

export class VFX {
  constructor(game) {
    this.game = game;
    this.onExplosion = null; // (position, power) hook used by the audio system
    this.scene = game.scene;
    this.physics = game.physics;
    const q = () => game.settings.preset.particles * (game.settings.get('particleAmount') ?? 1);
    this.quality = q;
    const scene = this.scene;
    this.smoke = new ParticleSystem(scene, { max: 900, map: Tex.smokeSprite(), name: 'smoke', renderOrder: 6 });
    this.dust = new ParticleSystem(scene, { max: 500, map: Tex.smokeSprite(), name: 'dust', renderOrder: 6 });
    this.water = new ParticleSystem(scene, { max: 700, name: 'water', renderOrder: 7 });
    this.frost = new ParticleSystem(scene, { max: 700, blending: THREE.AdditiveBlending, name: 'frost', renderOrder: 8 });
    this.fire = new ParticleSystem(scene, { max: 400, map: Tex.smokeSprite(), blending: THREE.AdditiveBlending, name: 'fire', renderOrder: 8 });
    this.sparks = new ParticleSystem(scene, { max: 700, blending: THREE.AdditiveBlending, stretch: 2.2, name: 'sparks', renderOrder: 9 });
    this.shards = new ParticleSystem(scene, { max: 300, stretch: 0.6, name: 'shards', renderOrder: 7 });
    this.skids = new SkidMarks(scene);
    this.skids.material.side = THREE.DoubleSide;
    this.rings = [];
    this.flashes = [];
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xffa040, 0, 60, 1.6);
      scene.add(l);
      this.flashes.push({ light: l, t: 0, dur: 1, peak: 0 });
    }
    this.emitters = []; // timed emitters (hydrants, burning wrecks)
    this.time = 0;
    this.jets = null;
    this.debris = [];
    this.crackEl = document.getElementById('crack-overlay');
    this.crackOpacity = 0;
  }

  // ---- thruster jets on the player car ------------------------------------------------
  attachPlayerJets(model) {
    const root = model.root;
    const back = new THREE.Vector3(0, 0, 1);
    const down = new THREE.Vector3(0, -1, 0);
    this.jets = {
      rocket: model.rocketNozzles.map((p) => new Jet(root, p, back, { length: 3.2, radius: 0.14, core: 0xffffff, edge: 0x6fb8ff, diamonds: 26 })),
      cold: model.coldGasNozzles.map((p) => new Jet(root, p, back, { length: 1.4, radius: 0.06, core: 0xe8f6ff, edge: 0x9fd8ff, diamonds: 30 })),
      hover: model.hoverNozzles.map((p) => new Jet(root, p, down, { length: 1.6, radius: 0.16, core: 0xffffff, edge: 0x8fd0ff, diamonds: 18 })),
      rcs: model.rcsNozzles.map((p) => new Jet(root, p, new THREE.Vector3(Math.sign(p.x), 0.2, 0), { length: 0.8, radius: 0.05, core: 0xffffff, edge: 0xbfe6ff, diamonds: 30 })),
    };
    this.playerModel = model;
  }

  updateJets(dt, v) {
    if (!this.jets) return;
    const th = v.thrust;
    const t = this.time;
    const root = this.playerModel.root;
    for (const j of this.jets.rocket) j.target = th.rocket ? 1 : 0;
    for (const j of this.jets.cold) j.target = th.rocket ? 0.7 : 0;
    for (const j of this.jets.hover) j.target = th.hover ? 1 : 0;
    // RCS ports fire according to requested rotation.
    const r = this.jets.rcs;
    const any = th.air ? 1 : 0;
    r[0].target = any * Math.max(0, th.yaw, -th.roll, th.pitch) ; // front-left
    r[1].target = any * Math.max(0, -th.yaw, th.roll, th.pitch);
    r[2].target = any * Math.max(0, -th.yaw, -th.roll, -th.pitch);
    r[3].target = any * Math.max(0, th.yaw, th.roll, -th.pitch);
    for (const group of Object.values(this.jets)) for (const j of group) j.update(dt, t);
    // Frost / vapour particles from active jets.
    const pq = this.quality();
    for (const group of [this.jets.rocket, this.jets.hover, this.jets.rcs, this.jets.cold]) {
      for (const j of group) {
        if (j.power < 0.3 || Math.random() > pq) continue;
        _v.copy(j.localPos).applyMatrix4(root.matrixWorld);
        _v2.copy(j.localDir).applyQuaternion(root.quaternion);
        const speed = group === this.jets.rocket ? 30 : group === this.jets.hover ? 14 : 8;
        this.frost.spawn({
          x: _v.x, y: _v.y, z: _v.z,
          vx: _v2.x * speed + v.velocity.x * 0.6 + (Math.random() - 0.5) * 3,
          vy: _v2.y * speed + v.velocity.y * 0.6 + (Math.random() - 0.5) * 3,
          vz: _v2.z * speed + v.velocity.z * 0.6 + (Math.random() - 0.5) * 3,
          life: 0.35 + Math.random() * 0.3, size: 0.25, size1: 1.4, color: [0.75, 0.88, 1], color1: [0.3, 0.45, 0.6], alpha: 0.5, drag: 3,
        });
      }
    }
    // Hover blast kicks up dust / water from the ground below.
    if (th.hover && v.groundedCount < 4) {
      const hit = this.game.physics.raycast(v.position, _v.set(0, -1, 0), 8, groups(0x8000, G.STATIC | G.RAMP), v.body);
      if (hit && Math.random() < pq * 0.9) {
        const gy = v.position.y - hit.timeOfImpact;
        const wet = this.game.isWet();
        for (let k = 0; k < 3; k++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 8 + Math.random() * 8;
          (wet ? this.water : this.dust).spawn({
            x: v.position.x, y: gy + 0.15, z: v.position.z, vx: Math.cos(a) * sp, vy: 0.5 + Math.random(), vz: Math.sin(a) * sp,
            life: 0.7, size: 0.6, size1: 3, color: wet ? [0.6, 0.68, 0.78] : [0.45, 0.42, 0.38], alpha: wet ? 0.5 : 0.35, drag: 2.5,
          });
        }
      }
    }
  }

  // ---- generic effects -----------------------------------------------------------------
  tireSmoke(p, vel, amount, tint) {
    if (Math.random() > amount * this.quality()) return;
    const c = tint || [0.8, 0.8, 0.83];
    this.smoke.spawn({
      x: p.x + (Math.random() - 0.5) * 0.4, y: p.y + 0.25, z: p.z + (Math.random() - 0.5) * 0.4,
      vx: vel.x * 0.25 + (Math.random() - 0.5) * 1.5, vy: 0.5 + Math.random() * 1.0, vz: vel.z * 0.25 + (Math.random() - 0.5) * 1.5,
      life: 2.2 + Math.random() * 1.8, size: 1.0, size1: 6 + Math.random() * 3, color: c, alpha: 0.55, drag: 1.4, gravity: -0.2, rotV: (Math.random() - 0.5) * 0.8,
      fadeIn: 0.12,
    });
  }

  sparksAt(p, dir, count = 10, speed = 12) {
    const n = Math.ceil(count * this.quality());
    for (let i = 0; i < n; i++) {
      this.sparks.spawn({
        x: p.x, y: p.y, z: p.z,
        vx: dir.x * speed + (Math.random() - 0.5) * speed * 0.8,
        vy: Math.abs(dir.y) * speed + Math.random() * speed * 0.5,
        vz: dir.z * speed + (Math.random() - 0.5) * speed * 0.8,
        life: 0.25 + Math.random() * 0.45, size: 0.06, color: [1, 0.75, 0.35], color1: [1, 0.3, 0.05], alpha: 1, gravity: 9.8, drag: 0.6,
      });
    }
  }

  glassBurst(p, vel, count = 30) {
    const n = Math.ceil(count * this.quality());
    for (let i = 0; i < n; i++) {
      this.shards.spawn({
        x: p.x + (Math.random() - 0.5), y: p.y + Math.random(), z: p.z + (Math.random() - 0.5),
        vx: vel.x * 0.4 + (Math.random() - 0.5) * 8, vy: Math.random() * 6, vz: vel.z * 0.4 + (Math.random() - 0.5) * 8,
        life: 0.8 + Math.random() * 0.6, size: 0.08, color: [0.8, 0.9, 1], alpha: 0.9, gravity: 9.8, drag: 0.3,
      });
    }
  }

  dustBurst(p, count = 12, radius = 6, color = [0.5, 0.47, 0.42]) {
    const n = Math.ceil(count * this.quality());
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sp = radius * (1 + Math.random());
      this.dust.spawn({
        x: p.x, y: p.y + 0.2, z: p.z, vx: Math.cos(a) * sp, vy: 0.4 + Math.random() * 1.2, vz: Math.sin(a) * sp,
        life: 1.0 + Math.random() * 0.6, size: 0.8, size1: 4, color, alpha: 0.35, drag: 2.6,
      });
    }
  }

  splash(p, power = 1) {
    const n = Math.ceil(60 * power * this.quality());
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (2 + Math.random() * 6) * power;
      this.water.spawn({
        x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * sp, vy: (4 + Math.random() * 8) * power, vz: Math.sin(a) * sp,
        life: 1.0 + Math.random() * 0.6, size: 0.35, size1: 1.6, color: [0.75, 0.85, 0.95], alpha: 0.75, gravity: 9.8, drag: 0.4,
      });
    }
    this.ring(p, 0xbfe6ff, 7 * power, 0.9);
  }

  // Expanding ring decal (landings, frost shockwave, explosion shockwave).
  ring(p, color, radius, duration = 0.8, y = null) {
    let r = this.rings.find((x) => !x.active);
    if (!r) {
      if (this.rings.length > 10) r = this.rings[0];
      else {
        const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }));
        m.rotation.x = -Math.PI / 2;
        m.frustumCulled = false;
        m.userData.noCollider = true;
        this.scene.add(m);
        r = { mesh: m };
        this.rings.push(r);
      }
    }
    r.active = true;
    r.t = 0;
    r.dur = duration;
    r.radius = radius;
    r.mesh.material.color.set(color).multiplyScalar(2);
    r.mesh.position.set(p.x, (y ?? p.y) + 0.1, p.z);
    r.mesh.visible = true;
  }

  flash(p, color = 0xffa040, peak = 4000, dur = 0.6) {
    const f = this.flashes.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    f.light.position.copy(p);
    f.light.color.set(color);
    f.t = 0;
    f.dur = dur;
    f.peak = peak;
  }

  explosion(p, power = 1) {
    if (this.onExplosion) this.onExplosion(p, power);
    const q = this.quality();
    for (let i = 0; i < 40 * q * power; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 0.8;
      const sp = (4 + Math.random() * 10) * power;
      this.fire.spawn({
        x: p.x, y: p.y + 0.5, z: p.z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp + 3, vz: Math.sin(a) * Math.cos(e) * sp,
        life: 0.6 + Math.random() * 0.5, size: 1.5, size1: 5 * power, color: [1, 0.75, 0.3], color1: [0.6, 0.1, 0.02], alpha: 0.9, drag: 3, gravity: -2,
      });
    }
    for (let i = 0; i < 30 * q * power; i++) {
      this.smoke.spawn({
        x: p.x + (Math.random() - 0.5) * 2, y: p.y + 1, z: p.z + (Math.random() - 0.5) * 2,
        vx: (Math.random() - 0.5) * 6, vy: 3 + Math.random() * 6, vz: (Math.random() - 0.5) * 6,
        life: 3 + Math.random() * 2, size: 2, size1: 9 * power, color: [0.12, 0.11, 0.1], alpha: 0.6, drag: 1.2, gravity: -1.2, fadeIn: 0.05,
      });
    }
    this.sparksAt(_v.copy(p).setY(p.y + 0.5), UP, 40 * power, 18);
    this.ring(p, 0xffa040, 14 * power, 0.7);
    this.flash(_v.copy(p).setY(p.y + 2), 0xff9a40, 9000 * power, 0.9);
  }

  // Persistent emitters: burning wrecks, broken hydrants, battery smoke.
  addEmitter(e) {
    this.emitters.push({ t: 0, ...e });
    return this.emitters[this.emitters.length - 1];
  }

  updateEmitters(dt) {
    const q = this.quality();
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.t += dt;
      if (e.t > e.duration || (e.alive && !e.alive())) {
        this.emitters.splice(i, 1);
        continue;
      }
      const p = e.pos.isVector3 ? e.pos : e.pos();
      if (e.type === 'hydrant' && Math.random() < q) {
        for (let k = 0; k < 3; k++) {
          this.water.spawn({
            x: p.x, y: p.y + 0.6, z: p.z, vx: (Math.random() - 0.5) * 2.5, vy: 11 + Math.random() * 4, vz: (Math.random() - 0.5) * 2.5,
            life: 1.6, size: 0.3, size1: 1.4, color: [0.75, 0.86, 1], alpha: 0.7, gravity: 9.8, drag: 0.2,
          });
        }
      } else if (e.type === 'fire') {
        if (Math.random() < q * 0.8) {
          this.fire.spawn({
            x: p.x + (Math.random() - 0.5) * 1.2, y: p.y + 0.6, z: p.z + (Math.random() - 0.5) * 1.6,
            vx: (Math.random() - 0.5), vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5),
            life: 0.6 + Math.random() * 0.4, size: 0.8, size1: 2.2, color: [1, 0.6, 0.2], color1: [0.5, 0.08, 0.02], alpha: 0.8, drag: 1, gravity: -1,
          });
        }
        if (Math.random() < q * 0.35) {
          this.smoke.spawn({
            x: p.x, y: p.y + 1.5, z: p.z, vx: (Math.random() - 0.5), vy: 2.5 + Math.random() * 2, vz: (Math.random() - 0.5),
            life: 4 + Math.random() * 2, size: 1.5, size1: 8, color: [0.09, 0.09, 0.09], alpha: 0.5, drag: 0.6, gravity: -0.6,
          });
        }
      } else if (e.type === 'smoke' && Math.random() < q * (e.rate ?? 0.5)) {
        this.smoke.spawn({
          x: p.x + (Math.random() - 0.5) * 0.6, y: p.y, z: p.z + (Math.random() - 0.5) * 0.6,
          vx: (Math.random() - 0.5), vy: 1.5 + Math.random(), vz: (Math.random() - 0.5),
          life: 2 + Math.random(), size: 0.5, size1: 3.5, color: e.color || [0.2, 0.2, 0.2], alpha: 0.45, drag: 1, gravity: -0.5,
        });
        if (e.sparks && Math.random() < 0.08) this.sparksAt(p, UP, 4, 4);
      }
    }
  }

  // Short-lived physics debris (glass shards, metal parts, concrete chunks), cleaned after 8 s.
  spawnDebris(p, vel, kind = 'metal', count = 4) {
    const R = this.physics.R;
    if (!this.debrisMats) this.debrisMats = {
      metal: new THREE.MeshStandardMaterial({ color: 0x4a4e54, metalness: 0.8, roughness: 0.4 }),
      concrete: new THREE.MeshStandardMaterial({ color: 0x8a8680, roughness: 0.9 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x9fc4d8, metalness: 0.3, roughness: 0.05, transparent: true, opacity: 0.6 }),
      paint: this.playerModel ? this.playerModel.paint : new THREE.MeshStandardMaterial({ color: 0xdddddd }),
      carbon: new THREE.MeshStandardMaterial({ color: 0x151618, roughness: 0.3 }),
    };
    const mats = this.debrisMats;
    for (let i = 0; i < Math.ceil(count * this.quality()); i++) {
      let d = this.debris.find((x) => !x.active);
      if (!d) {
        if (this.debris.length >= 36) d = this.debris.reduce((a, b) => (a.t > b.t ? a : b));
        else {
          const s = 0.12 + Math.random() * 0.3;
          const body = this.physics.world.createRigidBody(R.RigidBodyDesc.dynamic().setCanSleep(true).setAngularDamping(0.3));
          this.physics.world.createCollider(
            R.ColliderDesc.cuboid(s, s * 0.4, s * 0.8).setDensity(400).setFriction(0.7).setRestitution(0.3)
              .setCollisionGroups(groups(G.DEBRIS, G.STATIC | G.RAMP | G.DEBRIS)),
            body,
          );
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(s * 2, s * 0.8, s * 1.6), mats.metal);
          mesh.castShadow = true;
          this.scene.add(mesh);
          d = { body, mesh, interp: null, active: false, t: 0 };
          this.debris.push(d);
        }
      }
      d.mesh.material = this.debrisMats[kind] || this.debrisMats.metal;
      d.active = true;
      d.t = 0;
      d.body.setEnabled(true);
      d.body.setTranslation({ x: p.x + (Math.random() - 0.5), y: p.y + 0.3 + Math.random() * 0.5, z: p.z + (Math.random() - 0.5) }, true);
      d.body.setLinvel({ x: vel.x * 0.6 + (Math.random() - 0.5) * 6, y: 2 + Math.random() * 5, z: vel.z * 0.6 + (Math.random() - 0.5) * 6 }, true);
      d.body.setAngvel({ x: Math.random() * 10 - 5, y: Math.random() * 10 - 5, z: Math.random() * 10 - 5 }, true);
      d.mesh.visible = true;
      if (!d.interp) d.interp = this.physics.track(d.body, d.mesh);
      else this.physics.interp.add(d.interp);
      d.interp.snap();
    }
  }

  // Screen crack overlay after big hits.
  screenCrack(strength = 1) {
    if (!this.crackEl) return;
    if (!this.crackCanvas) {
      this.crackCanvas = document.createElement('canvas');
      this.crackCanvas.width = 1024;
      this.crackCanvas.height = 576;
    }
    const c = this.crackCanvas;
    const x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    const cx = c.width * (0.25 + Math.random() * 0.5);
    const cy = c.height * (0.2 + Math.random() * 0.5);
    x.strokeStyle = 'rgba(230,240,255,0.85)';
    x.shadowColor = 'rgba(0,0,0,0.8)';
    x.shadowBlur = 3;
    for (let r = 0; r < 16; r++) {
      const a = Math.random() * Math.PI * 2;
      let px = cx;
      let py = cy;
      x.lineWidth = 0.6 + Math.random() * 1.4;
      x.beginPath();
      x.moveTo(px, py);
      const len = 80 + Math.random() * 360 * strength;
      for (let s = 0; s < len; s += 12) {
        px += Math.cos(a + (Math.random() - 0.5) * 0.6) * 12;
        py += Math.sin(a + (Math.random() - 0.5) * 0.6) * 12;
        x.lineTo(px, py);
      }
      x.stroke();
    }
    for (let ring = 1; ring < 4; ring++) {
      x.beginPath();
      x.arc(cx, cy, ring * 18 + Math.random() * 10, 0, Math.PI * 2);
      x.lineWidth = 0.7;
      x.stroke();
    }
    this.crackEl.style.backgroundImage = `url(${c.toDataURL()})`;
    this.crackOpacity = Math.min(1, 0.5 + strength * 0.5);
  }

  // Smoke and dust are lit by the environment (dark at night, warmer under street lamps).
  setAmbient(color) {
    this.smoke.material.uniforms.uTint.value.copy(color);
    this.dust.material.uniforms.uTint.value.copy(color);
  }

  update(dt, realDt) {
    this.time += dt;
    for (const s of [this.smoke, this.dust, this.water, this.frost, this.fire, this.sparks, this.shards]) s.update(dt);
    this.skids.update(dt);
    this.updateEmitters(dt);
    for (const r of this.rings) {
      if (!r.active) continue;
      r.t += dt;
      const u = r.t / r.dur;
      if (u >= 1) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const s = r.radius * (0.2 + u * 0.8);
      r.mesh.scale.set(s, s, s);
      r.mesh.material.opacity = (1 - u) * 0.9;
    }
    for (const f of this.flashes) {
      f.t += dt;
      const u = Math.min(1, f.t / f.dur);
      f.light.intensity = f.peak * (1 - u) * (1 - u);
    }
    for (const d of this.debris) {
      if (!d.active) continue;
      d.t += dt;
      if (d.t > 8) {
        d.active = false;
        d.mesh.visible = false;
        d.body.setEnabled(false);
        this.physics.untrack(d.interp);
      }
    }
    if (this.crackEl) {
      this.crackOpacity = Math.max(0, this.crackOpacity - realDt * 0.25);
      this.crackEl.style.opacity = this.crackOpacity.toFixed(3);
    }
  }
}
