// Lightweight collider-shaped visual used for distant/LOD vehicles and as the debug model.
import * as THREE from 'three';
import { CarVisual } from './CarVisual.js';

const wheelGeo = new THREE.CylinderGeometry(1, 1, 0.3, 20);
wheelGeo.rotateZ(Math.PI / 2);
const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

export class ProxyModel extends CarVisual {
  constructor(cfg, color = 0xdddddd) {
    super(cfg);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.4 });
    for (const part of cfg.chassis) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(part.half[0] * 2, part.half[1] * 2, part.half[2] * 2), mat);
      m.position.set(...part.offset);
      m.castShadow = true;
      this.body.add(m);
    }
    this.setupWheels((i, w) => {
      const m = new THREE.Mesh(wheelGeo, tireMat);
      m.scale.set(1, w.radius, w.radius);
      m.castShadow = true;
      return m;
    });
  }
}
