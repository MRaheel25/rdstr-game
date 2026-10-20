// Street-race rival coupes: low lofted bodies in loud candy paint with racing numbers,
// a rear wing, neon under-glow and their own head/tail lamps.
import * as THREE from 'three';
import { sedanDesign, LoftedCar, decal, radialTex, CruiserModel } from './PoliceModels.js';
import { makeWheel } from './Wheels.js';
import { carMat } from './CarMaterials.js';

export const RIVALS = [
  { name: 'NOVA', color: 0xd0186a, glow: 0xff2a9a, number: 7 },
  { name: 'KESTREL', color: 0x5fae12, glow: 0x9cff3a, number: 22 },
  { name: 'RAZOR', color: 0xe0670c, glow: 0xffa040, number: 46 },
];

export class RivalModel extends LoftedCar {
  constructor(cfg, rival) {
    const paint = new THREE.MeshPhysicalMaterial({ color: rival.color, metalness: 0.6, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04 });
    const dark = new THREE.MeshPhysicalMaterial({ color: 0x0d0e10, metalness: 0.5, roughness: 0.35, clearcoat: 1 });
    const design = sedanDesign({ length: 4.6, roof: 1.2, hood: 0.8, trunk: 0.9, halfWidth: 0.98, windshieldBase: -0.62, windshieldTop: 0.02, rearWindowTop: 0.5, rearWindowBase: 1.25, clearance: 0.14 });
    const G = -0.5;
    super(cfg, design, { body: paint, hood: paint, roof: dark, door: paint, trim: carMat('black'), glass: carMat('glassDark') }, G);
    const S = this.sampler;
    const shell = this.shell;
    const zMid = (design.door.z0 + design.door.z1) / 2;
    for (const side of [1, -1]) {
      const n = decal(String(rival.number), 0.55, 0.42, { color: '#ffffff', font: 'bold 300px Arial' });
      n.position.set(side * (S.max.w(zMid) + 0.015), 0.6, zMid);
      n.rotation.y = side * Math.PI / 2;
      shell.add(n);
      const name = decal(rival.name, 0.9, 0.14, { color: '#f4f4f4', font: 'italic bold 120px Arial' });
      name.position.set(side * (S.max.w(1.6) + 0.012), 0.55, 1.6);
      name.rotation.y = side * Math.PI / 2;
      shell.add(name);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 3.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(rival.glow).multiplyScalar(3) }));
      strip.position.set(side * (S.sill.w(0) - 0.05), 0.2, 0);
      shell.add(strip);
    }
    // Rear wing.
    const wing = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.34), dark);
    blade.position.set(0, 1.18, 2.05);
    blade.rotation.x = -0.12;
    wing.add(blade);
    for (const x of [-0.55, 0.55]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.16), dark);
      post.position.set(x, 1.02, 2.0);
      wing.add(post);
    }
    shell.add(wing);
    // Under-glow pool.
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.2), new THREE.MeshBasicMaterial({
      color: new THREE.Color(rival.glow).multiplyScalar(0.55), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, map: radialTex(),
    }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.03;
    shell.add(pool);
    CruiserModel.prototype.addLamps.call(this, shell, -2.3, 2.3, 0.62);
    this.setupWheels((i, w) => makeWheel(w.radius, 0.3, 'aero'));
    this.makeLOD();
  }

  update(dt, v) {
    super.update(dt, v);
    if (this.tail) this.tail.color.setRGB(1, 0.05, 0.05).multiplyScalar(v.braking ? 7 : 2.5);
  }
}
