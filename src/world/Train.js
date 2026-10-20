// Elevated train: three lit cars shuttling along the downtown line on a kinematic body
// (solid: you can hit it or land on it). Stops at stations, eases in and out.
import * as THREE from 'three';
import { G, groups } from '../core/Physics.js';
import { textTexture } from './Textures.js';

export class Train {
  constructor(ctx, line) {
    this.line = line;
    this.physics = ctx.physics;
    const R = ctx.physics.R;
    this.group = new THREE.Group();
    this.group.name = 'train';
    const carL = 17;
    this.length = carL * 3 + 1.2;
    const body = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.3, metalness: 0.7 });
    const stripe = new THREE.MeshStandardMaterial({ color: 0x1a7fd0, roughness: 0.4, metalness: 0.4 });
    const win = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.92, 0.75).multiplyScalar(2.2) });
    const label = new THREE.MeshBasicMaterial({ map: textTexture('HALCYON METRO', { w: 512, h: 64, bg: '#0c3a68', color: '#ffffff', font: 'bold 40px Arial' }) });
    for (let k = 0; k < 3; k++) {
      const x = (k - 1) * (carL + 0.6);
      const car = new THREE.Mesh(new THREE.BoxGeometry(carL, 3.4, 3.0), body);
      car.position.set(x, 2.1, 0);
      car.castShadow = true;
      this.group.add(car);
      const s = new THREE.Mesh(new THREE.BoxGeometry(carL + 0.02, 0.35, 3.04), stripe);
      s.position.set(x, 1.2, 0);
      this.group.add(s);
      for (const side of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(carL - 2, 1.0), win);
        w.position.set(x, 2.6, side * 1.52);
        if (side < 0) w.rotation.y = Math.PI;
        this.group.add(w);
        const l = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.5), label);
        l.position.set(x, 1.55, side * 1.53);
        if (side < 0) l.rotation.y = Math.PI;
        this.group.add(l);
      }
    }
    ctx.scene.add(this.group);
    this.body = ctx.physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(line.x0, line.y, line.z));
    const col = ctx.physics.world.createCollider(
      R.ColliderDesc.cuboid(this.length / 2, 1.9, 1.5).setTranslation(0, 2.1, 0).setCollisionGroups(groups(G.STATIC, 0xffff)),
      this.body,
    );
    ctx.physics.meta.set(col.handle, { kind: 'building', surface: 'metal' });
    this.interp = ctx.physics.track(this.body, this.group);
    this.x = line.x0 + this.length / 2;
    this.dir = 1;
    this.speed = 0;
    this.wait = 3;
    this.lights = [];
  }

  // Fixed-step update.
  step(dt) {
    const line = this.line;
    const minX = line.x0 + this.length / 2;
    const maxX = line.x1 - this.length / 2;
    const vmax = 22;
    if (this.wait > 0) {
      this.wait -= dt;
      this.speed = 0;
    } else {
      // Next stop: station or terminus in the travel direction.
      const stops = [minX, ...line.stations, maxX].sort((a, b) => a - b);
      let target = this.dir > 0 ? stops.find((s) => s > this.x + 0.5) : [...stops].reverse().find((s) => s < this.x - 0.5);
      if (target === undefined) {
        this.dir *= -1;
        this.wait = 4;
        return;
      }
      const dist = Math.abs(target - this.x);
      const brake = Math.sqrt(2 * 1.1 * dist);
      this.speed = Math.min(vmax, this.speed + 1.2 * dt, brake);
      this.x += this.dir * this.speed * dt;
      if (Math.abs(target - this.x) < 0.3) {
        this.x = target;
        this.speed = 0;
        this.wait = target === minX || target === maxX ? 6 : 8;
        if (target === minX || target === maxX) this.dir *= -1;
      }
    }
    this.body.setNextKinematicTranslation({ x: this.x, y: line.y, z: line.z });
  }
}
