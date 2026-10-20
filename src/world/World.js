// World: owns the city, environment (sky, fog, lights), and world queries.
import * as THREE from 'three';
import { CityGenerator, addRamp } from './CityGenerator.js';
import * as M from './Materials.js';

export class World {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.physics = ctx.physics;
    this.time = 0;
  }

  build() {
    this.buildEnvironment();
    const xs = [-240, -120, 0, 120, 240];
    const zs = [-240, -120, 0, 120, 240];
    this.city = new CityGenerator(this.ctx).build({
      groundSize: 1400,
      xs,
      zs,
      lotFn: (x, z) => ({ kind: 'downtown', height: [18, 60], tallChance: Math.hypot(x, z) < 200 ? 0.35 : 0.1, neon: 0.6 }),
      extras: (gen) => {
        // Test features for the vehicle: ramps on the avenues.
        addRamp(gen, 0, -60, Math.PI, { width: 7, length: 16, height: 3.6 });
        addRamp(gen, 60, 120, -Math.PI / 2, { width: 7, length: 20, height: 5.5 });
      },
    });
    this.graph = this.city.graph;
    this.spawn = { position: new THREE.Vector3(0, 0.9, 40), yaw: 0 };
    return this;
  }

  buildEnvironment() {
    const s = this.scene;
    s.background = new THREE.Color(0x0b1322);
    s.fog = new THREE.FogExp2(0x101828, 0.0022);
    this.hemi = new THREE.HemisphereLight(0x3a5578, 0x2a1c12, 0.9);
    s.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0xa8bcff, 1.1);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    const sc = this.moon.shadow.camera;
    sc.left = -60;
    sc.right = 60;
    sc.top = 60;
    sc.bottom = -60;
    sc.near = 1;
    sc.far = 400;
    this.moon.shadow.bias = -0.0004;
    this.moon.shadow.normalBias = 0.04;
    this.moonOffset = new THREE.Vector3(-90, 160, -60);
    s.add(this.moon);
    s.add(this.moon.target);
  }

  // Fit the shadow frustum tightly around the player.
  update(dt, focus) {
    this.time += dt;
    M.updateMaterials(this.time);
    if (focus) {
      const snap = 2;
      const fx = Math.round(focus.x / snap) * snap;
      const fz = Math.round(focus.z / snap) * snap;
      this.moon.position.set(fx + this.moonOffset.x, focus.y + this.moonOffset.y, fz + this.moonOffset.z);
      this.moon.target.position.set(fx, focus.y, fz);
    }
  }

  // Nearest road position + heading for resets.
  nearestRoad(pos, preferDir) {
    const r = this.graph.nearest(pos);
    if (!r) return { position: this.spawn.position.clone(), yaw: this.spawn.yaw };
    let dir = r.dir.clone();
    if (preferDir && dir.dot(preferDir) < 0) dir.negate();
    // Drive on the right-hand lanes.
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    const p = r.point.clone().addScaledVector(right, 3.8);
    p.y += 0.9;
    return { position: p, yaw: Math.atan2(-dir.x, -dir.z) };
  }

  // Dev self-check: every solid static mesh should have a collider.
  selfCheck() {
    let missing = 0;
    for (const m of this.city.staticMeshes) {
      if (!m.userData.hasCollider && !m.userData.decal && !m.userData.noCollider) {
        missing++;
        console.warn('Static mesh without collider:', m.name || m.uuid);
      }
    }
    return missing;
  }
}
