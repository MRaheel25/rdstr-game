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
import { VFX } from '../fx/VFX.js';
import { VehicleFX } from '../fx/VehicleFX.js';
import { Stunts } from '../game/Stunts.js';
import { PhotoMode } from '../camera/PhotoMode.js';
import { WATER_Y } from '../world/Layout.js';
import { Traffic } from '../ai/Traffic.js';
import { Heat } from '../ai/Heat.js';
import { Radio } from '../ai/Radio.js';
import { PoliceSystem } from '../ai/PoliceAI.js';
import { Minimap } from '../ui/Minimap.js';
import { Banner } from '../ui/Banner.js';

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
    this.vfx = new VFX(this);
    this.vfx.attachPlayerJets(this.playerVisual);
    this.playerFX = new VehicleFX(this.vfx, this.player, { isPlayer: true });
    this.stunts = new Stunts(this);
    this.photo = new PhotoMode(this);
    this.player.onLaunch = () => this.onLaunch();
    this.player.onHop = () => this.vfx.dustBurst(this.player.position.clone().setY(this.player.position.y - 0.5), 14, 7);
    this.playerVisual.onPartLost = (name, mesh) => {
      const p = mesh.getWorldPosition(new THREE.Vector3());
      this.vfx.spawnDebris(p, this.player.velocity, 'carbon', 3);
    };
    this.water = { submerged: 0, splashed: false };
    this.takedownCam = { cooldown: 0 };
    this.hintsTimer = 60;
    this.showHints = true;
    this.events.on('propBreak', (e) => this.onPropBreak(e));
    this.world.extraStreaks = (s) => this.addCarStreaks(s);
    // AI: traffic, heat, police, radio, minimap.
    this.traffic = new Traffic(this);
    this.heat = new Heat(this);
    this.radio = new Radio(this);
    this.police = new PoliceSystem(this, this.heat, this.radio);
    this.minimap = new Minimap(this.world);
    this.banner = new Banner();
    this.systems = [this.traffic, this.police];
    this.extraCarStreaks = (s) => {
      this.traffic.addStreaks(s, this.camera.position);
      this.police.addStreaks(s);
    };
    this.setupPursuitEvents();

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

    // Time scale: slow motion and hit stop (paused in photo mode / menus).
    if (this.slowmo.timer > 0) {
      this.slowmo.timer -= realDt;
      if (this.slowmo.timer <= 0) this.slowmo.scale = 1;
    }
    let scale = this.slowmo.scale;
    if (this.hitStop > 0) {
      this.hitStop -= realDt;
      scale = 0;
    }
    if (this.state !== 'playing') scale = 0;
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
    if (this.state === 'photo') this.photo.update(realDt);
    else this.cameraCtl.update(dt, realDt, this.player, this.playerVisual.root, { pursuit: this.pursuitActive || false });
    this.world.update(dt, this.playerVisual.root.position, this.camera, this.player.velocity);
    this.playerVisual.root.updateMatrixWorld();
    this.vfx.updateJets(dt, this.player);
    this.playerFX.update(dt, { wet: this.isWet() });
    this.updateSmokeLighting(realDt);
    this.vfx.update(dt, realDt);
    this.hud.update(realDt, this.player);
    this.hud.updateHeat(this.heat);
    this.radio.update(realDt);
    if (this.frame % 2 === 0) this.minimap.update(this.player, this.police, this.heat, this.world.gen.airStations);
    this.banner.update(realDt);
    this.updateHints(realDt);
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
    if (i.pressed('photo') && (this.state === 'playing')) {
      this.photo.toggle();
      return;
    }
    if (this.state !== 'playing') return;
    if (i.pressed('help')) {
      this.showHints = !this.showHints;
      this.hintsTimer = this.showHints ? 1e9 : 0;
    }
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
    this.traffic.step(h);
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
    // Sparks and debris at the contact point.
    _v.copy(info.normal).setY(Math.abs(info.normal.y) + 0.3);
    this.vfx.sparksAt(info.point, _v, clamp(s * 1.5, 6, 50), clamp(s * 0.6, 6, 20));
    if (s > 10) this.vfx.spawnDebris(info.point, v.velocity, s > 25 ? 'paint' : 'metal', Math.min(6, Math.floor(s / 8)));
    if (s > 18) this.vfx.glassBurst(info.point, v.velocity, s);
    if (s > 14) this.hitStop = Math.max(this.hitStop, 0.06);
    if (s > 22) {
      this.vfx.screenCrack(clamp(s / 40, 0.4, 1));
      this.gfx.setFlash(0.25, 0xffffff);
    }
    if (info.headOn) {
      // Wreck: short slow motion and heavy damage.
      this.slowmo.scale = 0.3;
      this.slowmo.timer = 0.6;
      v.damage(25);
      this.vfx.spawnDebris(info.point, v.velocity, 'paint', 6);
      this.events.emit('wreck', { vehicle: v });
    }
    this.events.emit('impact', { vehicle: v, info, damage: dmg });
  }

  onPlayerLand(v, airTime, vy) {
    this.cameraCtl.dip = clamp(-vy / 12, 0.2, 1.5);
    this.cameraCtl.addShake(clamp(-vy / 30, 0.05, 0.6));
    this.input.rumble(clamp(-vy / 20, 0.2, 1), 160);
    const gp = v.position.clone().setY(v.position.y - 0.5);
    if (airTime > 0.6) {
      if (this.isWet()) this.vfx.splash(gp, clamp(-vy / 25, 0.3, 0.9));
      else this.vfx.dustBurst(gp, 18, clamp(-vy / 2, 4, 10));
      this.vfx.ring(gp, this.isWet() ? 0x9fd0ff : 0xb0a090, clamp(-vy / 1.5, 4, 12), 0.6);
    }
    if (vy < -12) this.vfx.sparksAt(gp, new THREE.Vector3(0, 1, 0), 20, 8);
    this.stunts.onLand(v, airTime, vy);
    this.events.emit('land', { vehicle: v, airTime });
  }

  updateGameplay(dt, realDt) {
    this.stunts.update(dt, realDt, this.player, this.input);
    this.updateWater(realDt);
    this.updateAirStations();
    this.pursuitActive = this.heat.phase !== 'none';
    if (this.player.hp <= 0 && !this.player.wrecked) this.onPlayerWrecked();
    this.takedownCam.cooldown = Math.max(0, this.takedownCam.cooldown - realDt);
    if (this.systems) for (const s of this.systems) s.update(dt, realDt);
  }

  // Pursuit radio chatter and consequences.
  setupPursuitEvents() {
    const ev = this.events;
    const radio = this.radio;
    ev.on('pursuitStart', () => {
      const d = this.police.describePlayer();
      radio.say(`All units, white Roadster speeding ${d.dir} on ${d.street}. Pursuit authorized.`, { priority: true });
    });
    ev.on('heatUp', (e) => {
      const lines = {
        2: 'Interceptors are cleared to engage. Ram him off the road.',
        3: 'Air One and spike strips authorized. Set up roadblocks ahead of the suspect.',
        4: 'SWAT is responding. Box him in, rolling blocks on the Ring.',
        5: 'All units, use any means necessary. EMP drones are in the air.',
      };
      if (lines[e.level]) radio.say(lines[e.level], { priority: true });
    });
    ev.on('lostVisual', () => {
      const d = this.police.describePlayer();
      radio.say(`We've lost visual. Last seen heading ${d.dir} near ${d.street}.`, { key: 'lost', every: 12 });
    });
    ev.on('reacquired', () => radio.say('Visual re-acquired! Stay on him!', { key: 'reacq', every: 10 }));
    ev.on('cooldown', () => radio.say('No sign of the suspect. Widen the search pattern.', { key: 'cool', every: 15 }));
    ev.on('pursuitEnd', (e) => {
      if (e.reason === 'evaded') {
        radio.say('Suspect is gone. All units, return to patrol.', { priority: true });
        this.banner.show('EVADED', 'Heat cleared', 'cool');
      }
    });
    ev.on('busted', () => this.onBusted());
    ev.on('nearMiss', () => {
      this.player.energy.charge(1.5);
    });
    ev.on('pit', () => radio.say('Executing PIT!', { key: 'pit', every: 12 }));
  }

  // Air Stations refill the COPV instantly and fix popped tyres.
  updateAirStations() {
    const p = this.player.position;
    for (const a of this.world.gen.airStations) {
      if (Math.abs(a.x - p.x) < 3.5 && Math.abs(a.z - p.z) < 3.5 && Math.abs(a.y - p.y) < 3) {
        const e = this.player.energy;
        if (e.pressure < e.pressureMax - 1 || this.player.wheels.some((w) => w.popped)) {
          e.refillPressure();
          for (const w of this.player.wheels) w.popped = false;
          this.vfx.ring(a, 0x40e8ff, 6, 0.6);
          this.banner.show('AIR STATION', 'COPV refilled', 'cool', 1.4);
          this.events.emit('airStation', {});
        }
      }
    }
  }

  onBusted() {
    if (this.state !== 'playing') return;
    this.player.wrecked = true;
    this.slowmo.scale = 0.35;
    this.slowmo.timer = 2;
    this.banner.show('BUSTED', 'Suspect in custody', 'busted', 4);
    this.events.emit('gameOver', { reason: 'busted' });
    setTimeout(() => this.respawnAfter('busted'), 4200);
  }

  onPlayerWrecked() {
    const p = this.player;
    p.wrecked = true;
    this.vfx.explosion(p.position, 1.3);
    this.slowmo.scale = 0.3;
    this.slowmo.timer = 1.8;
    this.cameraCtl.addShake(1);
    this.banner.show('PURSUIT TERMINATED', 'Chassis destroyed', 'busted', 4);
    this.events.emit('gameOver', { reason: 'wrecked' });
    setTimeout(() => this.respawnAfter('wrecked'), 4200);
  }

  respawnAfter(reason) {
    if (this.onGameOver && this.onGameOver(reason)) return;
    this.police.clearAll();
    this.heat.clear(reason);
    const p = this.player;
    p.hp = p.maxHp;
    p.wrecked = false;
    for (const w of p.wheels) w.popped = false;
    p.energy.refillPressure();
    p.energy.battery = Math.max(p.energy.battery, 60);
    this.playerVisual.repair();
    this.resetPlayer();
  }

  isWet() {
    const p = this.world.env.preset;
    return (p.rain && this.settings.get('rain')) || (p.wet ?? 1) > 1.2;
  }

  // Driving into the bay or the canal: splash, sink, reset to the nearest road.
  updateWater(realDt) {
    const p = this.player;
    const w = this.water;
    if (p.position.y < WATER_Y + 0.1) {
      if (!w.splashed) {
        w.splashed = true;
        this.vfx.splash(new THREE.Vector3(p.position.x, WATER_Y, p.position.z), clamp(p.speed / 20, 0.6, 2));
        this.cameraCtl.addShake(0.4);
        this.events.emit('splash', { vehicle: p });
      }
      w.submerged += realDt;
      // Water drag.
      const lv = p.body.linvel();
      p.body.setLinvel({ x: lv.x * 0.96, y: Math.max(lv.y * 0.9, -3), z: lv.z * 0.96 }, true);
      this.hud.prompt('IN THE WATER');
      if (w.submerged > 1.6) {
        p.damage(10);
        this.resetPlayer();
      }
    } else {
      w.submerged = 0;
      w.splashed = false;
    }
  }

  onLaunch() {
    const p = this.player;
    this.cameraCtl.kick = 1.2;
    this.cameraCtl.fovPunch = 6;
    this.cameraCtl.addShake(0.25);
    for (const w of p.wheels) if (!w.front) for (let k = 0; k < 10; k++) this.vfx.tireSmoke(w.contact, p.velocity, 1);
    this.events.emit('launch', { vehicle: p });
  }

  onPropBreak(e) {
    const t = e.item.type.name;
    const v = e.vehicle;
    const p = e.position;
    if (t === 'hydrant') this.vfx.addEmitter({ type: 'hydrant', pos: p.clone().setY(p.y - 0.4), duration: 14 });
    if (t === 'lamp' || t === 'highwayLamp' || t === 'signal') {
      this.vfx.sparksAt(p.clone().setY(p.y + 0.5), new THREE.Vector3(0, 1, 0), 18, 9);
      this.vfx.glassBurst(p.clone().setY(p.y + 6), e.velocity, 16);
    }
    if (t === 'busStop' || t === 'stall') this.vfx.glassBurst(p.clone().setY(p.y + 1), e.velocity, 40);
    if (t === 'barrier' || t === 'fence' || t === 'bench') this.vfx.spawnDebris(p, e.velocity, 'metal', 2);
    if (v === this.player) {
      this.cameraCtl.addShake(Math.min(0.35, e.item.type.mass / 600));
      this.input.rumble(0.3, 90);
    }
  }

  // Player tail/brake lights and headlights on the wet road.
  addCarStreaks(s) {
    const v = this.player;
    if (v.energy.ghost) return;
    const m = this.playerVisual;
    const gy = v.position.y - 0.55;
    const tail = v.braking ? 1.4 : 0.55;
    for (const side of [-0.7, 0.7]) {
      _v.set(side, 0.35, 2.1).applyQuaternion(v.quaternion).add(v.position);
      s.add(_v.x, _v.y, _v.z, gy, 0xff1020, tail, 0.7);
      _v.set(side * 0.9, 0.12, -2.0).applyQuaternion(v.quaternion).add(v.position);
      s.add(_v.x, _v.y, _v.z, gy, 0xfff0dd, 0.7, 0.8);
    }
    if (this.extraCarStreaks) this.extraCarStreaks(s);
    void m;
  }

  // Burnout-style slow-motion crash shot of a police unit. Max once every 6 s.
  startTakedownCam(target) {
    if (this.takedownCam.cooldown > 0 || this.stunts.coldSnap.active || this.state !== 'playing') return false;
    this.takedownCam.cooldown = 6;
    const tp = target.position.clone();
    const side = new THREE.Vector3(-target.velocity.z, 0, target.velocity.x).normalize();
    if (side.lengthSq() < 0.5) side.set(1, 0, 0);
    const camPos = tp.clone().addScaledVector(side, 7).add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(target.velocity, 0.25);
    this.cameraCtl.collide(tp.clone().setY(tp.y + 1), camPos, camPos);
    this.slowmo.scale = 0.22;
    this.slowmo.timer = 1.2;
    this.hitStop = Math.max(this.hitStop, 0.06);
    this.cameraCtl.playShot({ type: 'fixed', position: camPos, target, fov: 40, lookY: 0.4, duration: 1.2 * 0.22 });
    // Duration is in game time (scaled) so it ends with the slow motion.
    this.cameraCtl.shot.duration = 0.27;
    this.events.emit('takedownCam', { target });
    return true;
  }

  // Tint smoke by ambient light plus nearby street lamps (sodium orange).
  updateSmokeLighting(realDt) {
    this.smokeLightTimer = (this.smokeLightTimer || 0) - realDt;
    if (this.smokeLightTimer > 0) return;
    this.smokeLightTimer = 0.3;
    const env = this.world.env;
    const c = new THREE.Color().copy(env.hemi.color).multiplyScalar(env.hemi.intensity * 0.55);
    const near = this.world.props.nearestLamps(this.player.position, 3);
    for (const l of near) {
      const d = Math.hypot(l.x - this.player.position.x, l.z - this.player.position.z);
      c.add(new THREE.Color(l.type.cool ? 0x8fb0ff : 0xffa050).multiplyScalar(0.35 * Math.max(0, 1 - d / 30) * env.preset.lampScale));
    }
    this.vfx.setAmbient(c);
  }

  updateHints(realDt) {
    this.hintsTimer -= realDt;
    const show = this.showHints && this.hintsTimer > 0 && this.state === 'playing';
    if (show !== this.hintsShown) {
      this.hintsShown = show;
      this.hud.setHints(show ? HINTS_HTML : null);
    }
  }

  updateFx(realDt) {
    const fx = this.gfx.fx;
    const p = this.player;
    const boost = p.thrust.rocket ? 1 : 0;
    fx.speedBlur += ((boost ? 0.55 : 0) + Math.max(0, (p.speed - 70) / 140) * 0.25 - fx.speedBlur) * Math.min(1, realDt * 4);
    fx.aberration += ((boost ? 1 : 0) - fx.aberration) * Math.min(1, realDt * 5);
    fx.ghost += ((p.energy.ghost ? 1 : 0) - fx.ghost) * Math.min(1, realDt * 4);
    fx.lines += ((boost ? 1 : Math.max(0, (p.speed - 85) / 40)) - fx.lines) * Math.min(1, realDt * 4);
    const raining = this.world.env.preset.rain && this.settings.get('rain');
    fx.rainLens += ((raining && p.speed > 12 ? Math.min(1, p.speed / 60) : 0) - fx.rainLens) * Math.min(1, realDt * 2);
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

const HINTS_HTML = [
  ['W / S', 'Throttle / Brake'], ['A / D', 'Steer'], ['Shift', 'Rear Rockets'], ['Space', 'Hover Jets (tap mid-air: Cold Snap)'],
  ['Ctrl', 'Handbrake'], ['Q / E', 'Air roll'], ['F', 'Ghost Mode (hold)'], ['1 2 3', 'Track / Drift / Flight'],
  ['C', 'Camera'], ['G', 'Doors'], ['R', 'Reset'], ['P', 'Photo mode'], ['H', 'Hide controls'],
].map(([k, d]) => `<b>${k}</b>${d}`).join('<br>');

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
