// World: assembles Halcyon Bay (all districts), owns the environment and per-frame world
// systems (lamp lights near the player, wet-road light streaks, traffic signals, rain,
// steam, train, beacons) and answers world queries (nearest road, signals, water, cover).
import * as THREE from 'three';
import { CityGenerator } from './CityGenerator.js';
import { Props } from './Props.js';
import { Environment } from './Environment.js';
import { LightStreaks } from './LightStreaks.js';
import { Rain, SteamVents } from './Atmosphere.js';
import { Train } from './Train.js';
import { buildDecor } from './Decor.js';
import { buildBase, buildWaterfront } from './districts/Base.js';
import { buildDowntown } from './districts/Downtown.js';
import { buildConnectors } from './districts/Roads.js';
import { buildHighway } from './districts/Highway.js';
import { buildHarbor } from './districts/Harbor.js';
import { buildConstruction } from './districts/Construction.js';
import { buildCanyon } from './districts/Canyon.js';
import { districtAt, WATER_Y } from './Layout.js';
import * as M from './Materials.js';
import { placeChargingHubs } from './districts/Landmarks.js';
import { G, groups } from '../core/Physics.js';

const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class World {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.physics = ctx.physics;
    this.settings = ctx.settings;
    this.time = 0;
    this.lampLights = [];
    this.lampTimer = 0;
    this.propTimer = 0;
    this.cullTimer = 0;
    this.signalTimer = 0;
  }

  build(progress = () => {}) {
    this.env = new Environment(this.scene, this.ctx.renderer.renderer, this.settings);
    this.env.onConditions = (p) => {
      M.setConditions(p.night, p.wet);
      if (this.props && this.props.poolMesh) this.props.poolMesh.visible = p.lampScale > 0.2;
    };
    M.setConditions(this.env.preset.night, this.env.preset.wet);
    const gen = new CityGenerator(this.ctx);
    gen.props = new Props(this.ctx);
    this.gen = gen;
    this.city = gen;
    this.props = gen.props;
    buildBase(gen);
    progress('Downtown Core');
    buildDowntown(gen);
    buildConnectors(gen);
    progress('Highway Ring');
    buildHighway(gen);
    progress('Harbor & Docks');
    buildHarbor(gen);
    progress('Construction Zone');
    buildConstruction(gen);
    progress('Hillside Canyon');
    buildCanyon(gen);
    buildWaterfront(gen);
    // V3: charging hubs in every district outside the grid (at least 8 stations in total).
    this.hubs = placeChargingHubs(gen, ['harbor', 'construction', 'canyon', 'waterfront', 'highway', 'construction', 'harbor'], districtAt);
    buildDecor(gen);
    gen.finalize();
    gen.props.build();
    this.graph = gen.graph;
    this.streaks = new LightStreaks(this.scene);
    this.rain = new Rain(this.scene);
    this.steam = new SteamVents(this.scene);
    for (const p of gen.steamSpots) this.steam.add(p.x, p.y, p.z);
    this.steam.build();
    this.train = gen.trainLine ? new Train(this.ctx, gen.trainLine) : null;
    this.buildLampLights();
    this.spawn = { position: new THREE.Vector3(2.6, 0.7, 70), yaw: 0 };
    this.coverGroups = groups(0x8000, G.STATIC | G.RAMP);
    return this;
  }

  // Pool of real spot lights moved to the lamps nearest the player.
  buildLampLights() {
    for (const l of this.lampLights) {
      this.scene.remove(l);
      this.scene.remove(l.target);
    }
    this.lampLights = [];
    const n = this.settings.preset.lampLights;
    for (let i = 0; i < n; i++) {
      const l = new THREE.SpotLight(0xffb36a, 0, 30, 0.95, 0.7, 2);
      l.castShadow = false;
      this.scene.add(l);
      this.scene.add(l.target);
      this.lampLights.push(l);
    }
  }

  applyQuality() {
    this.buildLampLights();
    this.env.applyShadowQuality();
    this.props.dirty = true;
  }

  // Traffic signal phase for an intersection/axis at the current time.
  signalPhase(axis, id) {
    const T = 24;
    const t = (this.time + ((id * 3.7) % T)) % T;
    const ns = t < 9 ? 'green' : t < 11.5 ? 'amber' : 'red';
    const ew = t >= 12 && t < 21 ? 'green' : t >= 21 && t < 23.5 ? 'amber' : 'red';
    return axis === 'ns' ? ns : ew;
  }

  // Fixed-step world physics (train).
  step(dt) {
    if (this.train) this.train.step(dt);
  }

  update(dt, focus, camera, carVel) {
    this.time += dt;
    M.updateMaterials(this.time);
    const env = this.env;
    env.update(dt, focus, camera);
    const preset = this.settings.preset;
    const tod = env.preset;
    if (this.gen.water.material.userData.tick) this.gen.water.material.userData.tick(this.time);

    // Props near the camera.
    this.propTimer -= dt;
    const camPos = camera.position;
    if (this.props.dirty || this.propTimer <= 0 || !this.props.lastRefresh || this.props.lastRefresh.distanceTo(camPos) > 25) {
      this.props.refresh(camPos, preset.propDistance / 240);
      this.propTimer = 0.5;
    }
    this.props.update(dt, focus);
    this.props.setConesVisible(preset.bloom && tod.lampScale > 0.8);
    if (this.props.poolMesh) this.props.poolMesh.visible = tod.lampScale > 0.2;

    // Traffic signals.
    this.signalTimer -= dt;
    if (this.signalTimer <= 0) {
      this.signalTimer = 0.2;
      this.props.updateSignals((item) => this.signalPhase(item.data.axis, item.data.intersection));
    }

    // Dynamic lamp lights.
    this.lampTimer -= dt;
    if (this.lampTimer <= 0 && this.lampLights.length) {
      this.lampTimer = 0.25;
      const near = this.props.nearestLamps(focus, this.lampLights.length);
      this.lampLights.forEach((l, i) => {
        const item = near[i];
        if (!item) {
          l.intensity = 0;
          return;
        }
        this.props.lightWorldPos(item, l.position);
        l.target.position.set(l.position.x, item.data.groundY ?? 0, l.position.z);
        l.color.set(item.type.cool ? 0xbfd6ff : 0xffb36a);
        l.intensity = 260 * tod.lampScale;
      });
    }

    // Wet-road light streaks.
    // Wet-road reflections only when it rains.
    const wet = tod.rain ? tod.wet * (this.settings.get('rain') ? 1.25 : 1) : 0;
    this.streaks.begin(camera, this.time, wet);
    this.collectStreaks(camPos, tod);
    if (this.extraStreaks) this.extraStreaks(this.streaks);
    this.streaks.end();

    // Rain and steam.
    const raining = tod.rain && this.settings.get('rain');
    this.rain.update(dt, camera, carVel || _v.set(0, 0, 0), raining, preset.rainDensity);
    this.steam.update(dt, camera, this.time);

    // Beacons blink.
    if (this.gen.beaconMesh) this.gen.beaconMesh.visible = this.time % 1.4 < 0.35;

    // Distance culling of static chunk meshes.
    this.cullTimer -= dt;
    if (this.cullTimer <= 0) {
      this.cullTimer = 0.3;
      const maxD = preset.drawDistance;
      for (const m of this.gen.staticMeshes) {
        const bs = m.geometry.boundingSphere;
        if (!bs || m.name === 'terrain' || m.name === 'land') continue;
        const d = _v.copy(bs.center).applyMatrix4(m.matrixWorld).distanceTo(camPos) - bs.radius;
        m.visible = d < maxD;
      }
    }
  }

  collectStreaks(camPos, tod) {
    const s = this.streaks;
    const lampI = 0.42 * tod.lampScale;
    for (const item of this.props.lamps) {
      if (item.broken) continue;
      const dx = item.x - camPos.x;
      const dz = item.z - camPos.z;
      if (dx * dx + dz * dz > 150 * 150) continue;
      this.props.lightWorldPos(item, _v);
      s.add(_v.x, _v.y, _v.z, item.data.groundY ?? 0.02, item.type.cool ? 0x9fbfff : 0xffa050, lampI);
    }
    for (const n of this.gen.neonLights) {
      const dx = n.x - camPos.x;
      const dz = n.z - camPos.z;
      if (dx * dx + dz * dz > 160 * 160 || n.high) continue;
      s.add(n.x, n.y, n.z, 0.02, n.color, 0.55, Math.min(1.6, n.w * 0.1));
    }
    for (const item of this.props.visibleSignals || []) {
      const p = this.signalPhase(item.data.axis, item.data.intersection);
      const b = item.type.bulbs;
      _v.set(b.x, b.ys[p === 'red' ? 0 : p === 'amber' ? 1 : 2], b.z).applyAxisAngle(UP, item.rot);
      s.add(item.x + _v.x, item.y + _v.y, item.z + _v.z, 0.02, p === 'red' ? 0xff2010 : p === 'amber' ? 0xffa010 : 0x20ff70, 0.45, 0.45);
    }
  }

  // Nearest road position + heading for resets (drive on the right).
  nearestRoad(pos, preferDir) {
    const r = this.graph.nearest(pos, (e) => e.kind !== 'stunt');
    if (!r) return { position: this.spawn.position.clone(), yaw: this.spawn.yaw };
    const dir = r.dir.clone();
    if (preferDir && dir.dot(preferDir) < 0) dir.negate();
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    const e = r.edge;
    const lane = e.kind === 'highway' ? 7.5 : e.lanes > 1 ? (e.laneWidth > 3.6 ? 0.35 + e.laneWidth * 0.5 : 3.8) : 2.6;
    const p = r.point.clone().addScaledVector(right, lane);
    p.y += 0.75;
    return { position: p, yaw: Math.atan2(-dir.x, -dir.z) };
  }

  // V2 play setup: a start point on a road inside a district (anchor = preferred spot).
  districtStart(id) {
    if (id === 'downtown') return { position: this.spawn.position.clone(), yaw: this.spawn.yaw };
    const anchors = { highway: [0, 12, 600], harbor: [-60, 0, 700], construction: [760, 0, 40], canyon: [0, 0, -760], waterfront: [-660, 0, 0] };
    const a = anchors[id] || [0, 0, 0];
    const r = this.graph.nearest(_v.set(a[0], a[1], a[2]), (e) => {
      if (e.kind === 'stunt') return false;
      const m = e.points[e.points.length >> 1];
      return districtAt(m.x, m.z).id === id;
    });
    if (!r) return { position: this.spawn.position.clone(), yaw: this.spawn.yaw };
    return this.nearestRoad(new THREE.Vector3(r.x, r.y, r.z));
  }

  district(pos) {
    return districtAt(pos.x, pos.z);
  }

  isOverWater(pos) {
    return pos.y < WATER_Y + 0.3;
  }

  // Is something solid overhead (tunnel, bridge, garage)? Used for hiding from air units.
  underCover(pos) {
    _v.set(pos.x, pos.y + 1.5, pos.z);
    const hit = this.physics.raycast(_v, UP, 60, this.coverGroups, null);
    return !!hit;
  }

  // Dev self-check: every solid static mesh should have a collider.
  selfCheck() {
    let missing = 0;
    for (const m of this.gen.staticMeshes) {
      if (!m.userData.hasCollider && !m.userData.decal && !m.userData.noCollider) {
        missing++;
        console.warn('Static mesh without collider:', m.name || m.uuid);
      }
    }
    return missing;
  }
}
