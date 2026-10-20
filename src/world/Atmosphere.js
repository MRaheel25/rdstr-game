// Rain (camera-local streak volume), steam vents and water surfaces.
import * as THREE from 'three';
import * as Tex from './Textures.js';

export class Rain {
  constructor(scene) {
    this.count = 9000;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(this.count * 2 * 3);
    const seeds = new Float32Array(this.count * 2);
    this.box = { x: 70, y: 40, z: 70 };
    for (let i = 0; i < this.count; i++) {
      const x = (Math.random() - 0.5) * this.box.x;
      const y = Math.random() * this.box.y;
      const z = (Math.random() - 0.5) * this.box.z;
      pos.set([x, y, z, x, y, z], i * 6);
      seeds[i * 2] = 0;
      seeds[i * 2 + 1] = 1;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(seeds, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        center: { value: new THREE.Vector3() },
        box: { value: new THREE.Vector3(this.box.x, this.box.y, this.box.z) },
        wind: { value: new THREE.Vector3(2, 0, 1) },
        carVel: { value: new THREE.Vector3() },
        density: { value: 1 },
      },
      vertexShader: /* glsl */ `
        uniform float time;
        uniform vec3 center;
        uniform vec3 box;
        uniform vec3 wind;
        uniform vec3 carVel;
        attribute float aEnd;
        varying float vA;
        void main() {
          vec3 p = position;
          float fall = 24.0;
          p.y = mod(p.y - time * fall, box.y);
          p.xz += wind.xz * (box.y - p.y) * 0.04;
          // Wrap around the camera.
          p.x = mod(p.x - center.x + box.x * 0.5, box.x) - box.x * 0.5 + center.x;
          p.z = mod(p.z - center.z + box.z * 0.5, box.z) - box.z * 0.5 + center.z;
          p.y += center.y - box.y * 0.35;
          // Streak direction: fall + relative motion of the camera (rain slants at speed).
          vec3 rel = vec3(0.0, -fall, 0.0) + wind - carVel;
          p += normalize(rel) * aEnd * clamp(length(rel) * 0.035, 0.5, 2.2);
          vA = (1.0 - aEnd * 0.7);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA *= smoothstep(60.0, 5.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float density;
        varying float vA;
        void main() {
          gl_FragColor = vec4(vec3(0.62, 0.7, 0.82) * 0.5, vA * 0.42 * density);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.lines = new THREE.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.userData.noCollider = true;
    this.lines.visible = false;
    scene.add(this.lines);
  }

  update(dt, camera, carVel, on, density) {
    this.lines.visible = on;
    if (!on) return;
    const u = this.mat.uniforms;
    u.time.value += dt;
    u.center.value.copy(camera.position);
    u.carVel.value.copy(carVel);
    u.density.value = density;
    this.lines.geometry.drawRange.count = Math.floor(this.count * 2 * Math.min(1.3, density) / 1.3);
  }
}

// Rising steam from manholes / vents: a few billboards per vent, recycled.
export class SteamVents {
  constructor(scene) {
    this.vents = [];
    this.perVent = 6;
    this.mat = new THREE.MeshBasicMaterial({
      map: Tex.smokeSprite(), color: 0x9aa4b2, transparent: true, opacity: 0.18, depthWrite: false, fog: true,
    });
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.mesh = null;
    this.scene = scene;
  }

  add(x, y, z) {
    this.vents.push({ x, y, z, phase: Math.random() * 10 });
  }

  build() {
    const n = this.vents.length * this.perVent;
    if (!n) return;
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.userData.noCollider = true;
    this.mesh.renderOrder = 3;
    this.scene.add(this.mesh);
  }

  update(dt, camera, time) {
    if (!this.mesh) return;
    const m = new THREE.Matrix4();
    const q = camera.quaternion;
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    let k = 0;
    for (const v of this.vents) {
      const d = Math.hypot(v.x - camera.position.x, v.z - camera.position.z);
      for (let i = 0; i < this.perVent; i++, k++) {
        if (d > 160) {
          m.makeScale(0, 0, 0);
          this.mesh.setMatrixAt(k, m);
          continue;
        }
        const life = ((time * 0.35 + v.phase + i / this.perVent) % 1);
        p.set(v.x + Math.sin(time * 0.7 + i) * 0.3 + life * 1.2, v.y + life * 6, v.z + Math.cos(time * 0.5 + i) * 0.3);
        const sc = 1.2 + life * 4.5;
        s.set(sc, sc, sc);
        m.compose(p, q, s);
        this.mesh.setMatrixAt(k, m);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Procedural water normal map + reflective material.
let waterNormal = null;
function makeWaterNormal() {
  if (waterNormal) return waterNormal;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const x = c.getContext('2d');
  const img = x.createImageData(S, S);
  const hgt = new Float32Array(S * S);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      let h = 0;
      for (let k = 1; k <= 6; k++) {
        const a = k * 1.7;
        h += Math.sin(((i * Math.cos(a) + j * Math.sin(a)) / S) * Math.PI * 2 * (k + 2)) / (k + 1);
      }
      hgt[j * S + i] = h;
    }
  }
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const hx = hgt[j * S + ((i + 1) % S)] - hgt[j * S + ((i - 1 + S) % S)];
      const hy = hgt[((j + 1) % S) * S + i] - hgt[((j - 1 + S) % S) * S + i];
      const n = new THREE.Vector3(-hx * 2, -hy * 2, 1).normalize();
      const o = (j * S + i) * 4;
      img.data[o] = (n.x * 0.5 + 0.5) * 255;
      img.data[o + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[o + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  waterNormal = new THREE.CanvasTexture(c);
  waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping;
  return waterNormal;
}

export function waterMaterial() {
  const n = makeWaterNormal();
  const m = new THREE.MeshStandardMaterial({
    color: 0x040a0e, roughness: 0.14, metalness: 0.2, normalMap: n, normalScale: new THREE.Vector2(0.3, 0.3), envMapIntensity: 0.55,
  });
  n.repeat.set(60, 60);
  m.userData.tick = (t) => {
    n.offset.set(t * 0.004, t * 0.0025);
  };
  return m;
}
