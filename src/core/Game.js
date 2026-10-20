// Game orchestrator: owns all systems, runs the fixed-step physics loop with render
// interpolation, time scaling (slow motion / hit stop) and the top-level state machine.
import * as THREE from 'three';
import { Settings, QUALITY_ORDER } from './Settings.js';
import { Input } from './Input.js';
import { Renderer } from './Renderer.js';
import { Physics, G, groups } from './Physics.js';
import { events } from './Events.js';
import { World } from '../world/World.js';
import { setMaxAnisotropy } from '../world/Textures.js';
import { Vehicle, QUERY } from '../vehicle/Vehicle.js';
import { ROADSTER } from '../vehicle/VehicleConfig.js';
import { EnergySystem } from '../vehicle/EnergySystem.js';
import { RoadsterModel } from '../vehicle/models/RoadsterModel.js';
import { CameraController } from '../camera/CameraController.js';
import { HUD } from '../ui/HUD.js';
import { clamp } from '../util/math.js';
import { installTestHooks } from './TestHooks.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();

export class Game {
  constructor() {
    this.ready = false;
    this.state = 'loading';
    this.timeScale = 1;
    this.slowmo = { scale: 1, timer: 0 };
    this.hitStop = 0;
    this.time = 0;
    this.frame = 0;
    this.fps = 60;
    this.fpsAccum = 0;
    this.fpsFrames = 0;
    this.showDebug = false;
    this.showColliders = false;
    this.resetHold = 0;
    this.stuckTime = 0;
    this.events = events;
    this.npcs = [];
    this.params = new URLSearchParams(location.search);
  }

  setLoading(pct, msg) {
    const f = document.querySelector('.load-fill');
    const m = document.querySelector('.load-msg');
    if (f) f.style.width = `${pct}%`;
    if (m) m.textContent = msg;
  }

  async init() {
    this.settings = new Settings();
    this.input = new Input(this.settings);
    this.setLoading(5, 'Starting renderer');
    this.gfx = new Renderer(document.getElementById('game'), this.settings);
    setMaxAnisotropy(Math.min(8, this.gfx.maxAnisotropy));
    this.scene = this.gfx.scene;
    this.camera = this.gfx.camera;
    this.setLoading(15, 'Loading physics');
    this.physics = await Physics.create();
    this.setLoading(30, 'Generating Halcyon Bay');
    await nextFrame();
    const t0 = performance.now();
    this.world = new World({ scene: this.scene, physics: this.physics, renderer: this.gfx, settings: this.settings }).build((msg) => this.setLoading(50, `Generating ${msg}`));
    console.info(`World generated in ${(performance.now() - t0).toFixed(0)} ms`);
    this.setLoading(80, 'Preparing vehicle');
    await nextFrame();

    this.player = new Vehicle(this.physics, ROADSTER, { position: this.world.spawn.position, yaw: this.world.spawn.yaw, kind: 'player', group: G.PLAYER });
    this.player.energy = new EnergySystem({});
    this.playerVisual = new RoadsterModel(ROADSTER, this.settings.get('paint') || 'pearlWhite');
    this.scene.add(this.playerVisual.root);
    this.playerInterp = this.physics.track(this.player.body, this.playerVisual.root);
    this.player.impactListeners.push((v, info) => this.onPlayerImpact(v, info));
    this.player.landListeners.push((v, air, vy) => this.onPlayerLand(v, air, vy));

    this.cameraCtl = new CameraController(this.camera, this.physics, this.settings);
    this.hud = new HUD(this.settings);
    this.hud.show(true);
    this.insideQueryGroups = groups(QUERY, G.STATIC);

    const missing = this.world.selfCheck();
    if (missing) console.warn(`Collider self-check: ${missing} static meshes without colliders`);

    if (this.params.get('test')) {
      installTestHooks(this);
      this.THREE = THREE;
    }
    this.setLoading(100, 'Ready');
    document.getElementById('loading').classList.add('done');
    this.state = 'playing';
    this.ready = true;
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------------------------------------------------------------------------
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const realDt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.tick(realDt);
  }

  tick(realDt) {
    this.frame++;
    this.input.update();
    this.handleGlobalKeys();

    // Time scale: slow motion and hit stop.
    if (this.slowmo.timer > 0) {
      this.slowmo.timer -= realDt;
      if (this.slowmo.timer <= 0) this.slowmo.scale = 1;
    }
    let scale = this.slowmo.scale;
    if (this.hitStop > 0) {
      this.hitStop -= realDt;
      scale = 0;
    }
    this.timeScale = scale;
    const dt = realDt * scale;
    this.time += dt;

    if (this.state === 'playing' && !this.testHold) {
      this.updatePlayerControls(realDt);
      this.physics.advance(dt, (h) => this.prePhysics(h), (h) => this.postPhysics(h));
      this.updateGameplay(dt, realDt);
    }
    this.playerVisual.update(dt, this.player);
    for (const n of this.npcs) n.model.update(dt, n.vehicle, n.ctx || {});
    this.cameraCtl.update(dt, realDt, this.player, this.playerVisual.root, { pursuit: false });
    this.world.update(dt, this.playerVisual.root.position, this.camera, this.player.velocity);
    this.hud.update(realDt, this.player);
    this.updateFx(realDt);
    this.physics.updateDebug();
    this.gfx.render(realDt);
    this.updateDebugOverlay(realDt);
    this.input.endFrame();
  }

  handleGlobalKeys() {
    const i = this.input;
    if (i.pressed('fps')) {
      this.showDebug = !this.showDebug;
      document.getElementById('debug').classList.toggle('hidden', !this.showDebug);
    }
    if (i.pressed('colliders')) {
      this.showColliders = !this.showColliders;
      this.physics.setDebug(this.scene, this.showColliders);
    }
    if (this.state !== 'playing') return;
    if (i.pressed('camera')) this.cameraCtl.cycle();
    if (i.pressed('doors')) this.playerVisual.toggleDoors();
    if (i.pressed('modeTrack')) this.player.setMode('track');
    if (i.pressed('modeDrift')) this.player.setMode('drift');
    if (i.pressed('modeFlight')) this.player.setMode('flight');
  }

  updatePlayerControls(realDt) {
    const a = this.input.axes;
    const c = this.player.controls;
    const i = this.input;
    c.throttle = a.throttle;
    c.brake = a.brake;
    c.steer = a.steer;
    c.handbrake = i.down('handbrake') ? 1 : 0;
    c.rocket = i.down('rocket');
    c.hover = i.down('hover');
    c.pitch = a.pitch;
    c.yaw = a.yaw;
    c.roll = a.roll;
    const e = this.player.energy;
    e.ghost = i.down('ghost') && e.battery > 0.5;

    // Self-righting: upside down or stuck for 2 s -> "Hold R to Reset".
    const p = this.player;
    const stuck = (p.up.y < 0.3 && p.speed < 3) || (p.controls.throttle > 0.5 && p.speed < 0.6 && p.groundedCount < 3);
    this.stuckTime = stuck ? this.stuckTime + realDt : 0;
    const showPrompt = this.stuckTime > 2;
    this.hud.prompt(showPrompt ? 'HOLD  R  TO RESET' : null);
    if (i.down('reset')) {
      this.resetHold += realDt;
      if (this.resetHold > (showPrompt ? 0.5 : 1.0)) {
        this.resetPlayer();
        this.resetHold = 0;
      }
    } else this.resetHold = 0;
  }

  resetPlayer() {
    const p = this.player;
    const r = this.world.nearestRoad(p.position, p.forward);
    p.reset(r.position, r.yaw);
    this.playerInterp.snap();
    this.stuckTime = 0;
    this.cameraCtl.initialized = false;
  }

  prePhysics(h) {
    this.world.step(h);
    this.player.energy.update(h, this.player);
    this.player.physicsStep(h);
    this.world.props.checkVehicle(this.player, h);
    for (const n of this.npcs) {
      if (n.ai) n.ai(h, n);
      n.vehicle.physicsStep(h);
      if (n.vehicle.speed > 2) this.world.props.checkVehicle(n.vehicle, h);
    }
  }

  postPhysics(h) {
    this.player.afterStep(h, this);
    this.safetyNet(this.player);
    for (const n of this.npcs) {
      n.vehicle.afterStep(h, this);
      this.safetyNet(n.vehicle);
    }
  }

  // Adds a physics vehicle with a visual model (police, traffic, rivals).
  addNpc(cfg, model, { position, yaw = 0, kind = 'police', group = G.POLICE, ai = null } = {}) {
    const vehicle = new Vehicle(this.physics, cfg, { position, yaw, kind, group });
    this.scene.add(model.root);
    const interp = this.physics.track(vehicle.body, model.root);
    const npc = { vehicle, model, interp, ai, kind };
    this.npcs.push(npc);
    return npc;
  }

  removeNpc(npc) {
    const i = this.npcs.indexOf(npc);
    if (i >= 0) this.npcs.splice(i, 1);
    this.physics.untrack(npc.interp);
    this.scene.remove(npc.model.root);
    npc.vehicle.destroy();
  }

  // If a vehicle's centre ever ends up inside a building collider, push it out along the
  // shortest normal and apply crash damage.
  safetyNet(v) {
    const t = v.body.translation();
    let inside = null;
    this.physics.world.intersectionsWithPoint(t, (col) => {
      const meta = this.physics.meta.get(col.handle);
      if (meta && meta.kind === 'building') {
        inside = col;
        return false;
      }
      return true;
    }, undefined, this.insideQueryGroups);
    if (!inside) return false;
    // Shortest exit in the box's local frame: through a side wall or the roof (never the floor).
    const he = inside.halfExtents();
    const c = inside.translation();
    const r = inside.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    _v.set(t.x - c.x, t.y - c.y, t.z - c.z).applyQuaternion(_qi.copy(_q).invert());
    const margin = 1.5;
    const ex = he.x - Math.abs(_v.x);
    const ez = he.z - Math.abs(_v.z);
    const ey = he.y - _v.y;
    if (ex <= ez && ex <= ey) _v.x = Math.sign(_v.x || 1) * (he.x + margin);
    else if (ez <= ex && ez <= ey) _v.z = Math.sign(_v.z || 1) * (he.z + margin);
    else _v.y = he.y + margin;
    const dir = _v2.copy(_v).sub(_v3.set(t.x - c.x, t.y - c.y, t.z - c.z).applyQuaternion(_qi)).applyQuaternion(_q).normalize();
    _v.applyQuaternion(_q);
    const out = { x: c.x + _v.x, y: c.y + _v.y, z: c.z + _v.z };
    v.body.setTranslation(out, true);
    const lv = v.body.linvel();
    const vn = lv.x * dir.x + lv.y * dir.y + lv.z * dir.z;
    if (vn < 0) v.body.setLinvel({ x: lv.x - vn * dir.x, y: lv.y - vn * dir.y, z: lv.z - vn * dir.z }, true);
    console.warn('Safety net: pushed vehicle out of building at', t.x.toFixed(1), t.y.toFixed(1), t.z.toFixed(1));
    v.damage(8);
    return true;
  }

  onPlayerImpact(v, info) {
    const s = info.strength;
    let dmg = Math.max(0, s - 5) * 1.25;
    if (info.other && info.other.kind === 'vehicle') dmg *= 0.6;
    if (info.roof) dmg += 12;
    v.damage(dmg);
    // Dent the body panel nearest the contact point.
    if (s > 6 && this.playerVisual.dent) {
      const local = this.playerVisual.root.worldToLocal(info.point.clone());
      this.playerVisual.dent(local, clamp(s / 12, 0.3, 3));
    }
    this.cameraCtl.addShake(clamp(s / 30, 0.15, 1));
    this.input.rumble(clamp(s / 25, 0.2, 1), 200);
    if (s > 14) this.hitStop = Math.max(this.hitStop, 0.06);
    if (info.headOn) {
      this.slowmo.scale = 0.3;
      this.slowmo.timer = 0.6;
      v.damage(25);
    }
    this.events.emit('impact', { vehicle: v, info, damage: dmg });
  }

  onPlayerLand(v, airTime, vy) {
    this.cameraCtl.dip = clamp(-vy / 12, 0.2, 1.5);
    this.cameraCtl.addShake(clamp(-vy / 30, 0.05, 0.6));
    this.events.emit('land', { vehicle: v, airTime });
  }

  updateGameplay(dt, realDt) {
    // Filled in by later systems (police, missions, scoring).
  }

  updateFx(realDt) {
    const fx = this.gfx.fx;
    const p = this.player;
    const boost = p.thrust.rocket ? 1 : 0;
    fx.speedBlur += ((boost ? 0.55 : 0) + Math.max(0, (p.speed - 70) / 140) * 0.25 - fx.speedBlur) * Math.min(1, realDt * 4);
    fx.aberration += ((boost ? 1 : 0) - fx.aberration) * Math.min(1, realDt * 5);
    fx.ghost += ((p.energy.ghost ? 1 : 0) - fx.ghost) * Math.min(1, realDt * 4);
    const hpFrac = p.hp / p.maxHp;
    fx.damage = hpFrac < 0.3 ? (0.25 + 0.25 * Math.sin(this.time * 6)) * (1 - hpFrac / 0.3) : 0;
  }

  // Automatic quality drop if FPS stays under 45 for 5 seconds.
  autoQuality(dt) {
    if (!this.settings.get('autoQuality') || this.params.get('test') || this.state !== 'playing') return;
    this.lowFpsTime = this.fps < 45 ? (this.lowFpsTime || 0) + dt : 0;
    if (this.lowFpsTime > 5) {
      this.lowFpsTime = 0;
      const order = QUALITY_ORDER;
      const i = order.indexOf(this.settings.get('quality'));
      if (i > 0) {
        this.settings.set('quality', order[i - 1]);
        this.applyQuality();
        this.events.emit('notice', { text: `Quality lowered to ${this.settings.preset.label}` });
      }
    }
  }

  applyQuality() {
    this.gfx.applyQuality();
    this.world.applyQuality();
  }

  updateDebugOverlay(realDt) {
    this.fpsAccum += realDt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAccum;
      this.autoQuality(this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
      if (this.showDebug) {
        const info = this.gfx.renderer.info;
        const p = this.player;
        document.getElementById('debug').textContent =
          `FPS ${this.fps.toFixed(0)}  draw calls ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k\n` +
          `quality ${this.settings.get('quality')}  bodies ${this.physics.world.bodies.len()}  colliders ${this.physics.world.colliders.len()}\n` +
          `pos ${p.position.x.toFixed(1)} ${p.position.y.toFixed(1)} ${p.position.z.toFixed(1)}  v ${p.speed.toFixed(1)} m/s  slip ${(p.slipAngle * 57.3).toFixed(0)}°`;
      }
    }
  }
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
