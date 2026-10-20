// Base class for vehicle visuals: positions wheels from suspension state, spins and
// steers them. Subclasses build the body.
import * as THREE from 'three';

export class CarVisual {
  constructor(cfg) {
    this.cfg = cfg;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // sprung mass
    this.root.add(this.body);
    this.wheelPivots = [];
    this.wheelSpinners = [];
  }

  // makeWheel(i, w) returns an Object3D (spins) or { spin, fixed } (fixed = calipers etc.).
  // Left wheels are mirrored so their outer face points outward.
  setupWheels(makeWheel) {
    this.cfg.wheels.forEach((w, i) => {
      const pivot = new THREE.Group();
      pivot.position.set(w.x, this.cfg.mountY - this.cfg.suspension.rest * 0.7, w.z);
      const side = new THREE.Group();
      if (w.x < 0) side.scale.x = -1;
      pivot.add(side);
      const spinner = new THREE.Group();
      side.add(spinner);
      const made = makeWheel(i, w);
      if (made.spin) {
        spinner.add(made.spin);
        if (made.fixed) side.add(made.fixed);
      } else spinner.add(made);
      this.root.add(pivot);
      this.wheelPivots.push(pivot);
      this.wheelSpinners.push(spinner);
    });
  }

  updateWheels(vehicle) {
    const rest = this.cfg.suspension.rest;
    vehicle.wheels.forEach((w, i) => {
      const pivot = this.wheelPivots[i];
      if (!pivot) return;
      const ext = rest - w.compression;
      pivot.position.y = this.cfg.mountY - ext;
      pivot.rotation.y = -w.steer;
      this.wheelSpinners[i].rotation.x = -w.angle * (vehicle.wheels[i].left ? 1 : 1);
    });
  }

  update(dt, vehicle) {
    this.updateWheels(vehicle);
  }
}
