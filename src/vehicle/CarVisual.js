// Base class for vehicle visuals: positions wheels from suspension state, spins and
// steers them. Subclasses build the body.
import * as THREE from 'three';

export class CarVisual {
  constructor(cfg) {
    this.cfg = cfg;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // sprung mass (can tilt slightly for extra weight feel)
    this.root.add(this.body);
    this.wheelPivots = [];
    this.wheelSpinners = [];
  }

  // Creates pivot (steer) + spinner (roll) groups for each wheel and fills them with `makeWheel(i)`.
  setupWheels(makeWheel) {
    this.cfg.wheels.forEach((w, i) => {
      const pivot = new THREE.Group();
      pivot.position.set(w.x, this.cfg.mountY - this.cfg.suspension.rest * 0.7, w.z);
      const spinner = new THREE.Group();
      pivot.add(spinner);
      const mesh = makeWheel(i, w);
      spinner.add(mesh);
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
      this.wheelSpinners[i].rotation.x = -w.angle;
    });
  }

  update(dt, vehicle) {
    this.updateWheels(vehicle);
  }
}
