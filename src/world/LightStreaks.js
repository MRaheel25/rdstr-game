// Wet-road light reflections: long anisotropic streaks under every bright light source
// (street lamps, neon, signals, police strobes, car lights), oriented toward the camera
// like real reflections on rain-soaked asphalt. One instanced draw call.
import * as THREE from 'three';

const MAX = 320;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

export class LightStreaks {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2); // lies on ground, local -z = "along"
    this.mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, wet: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vColor;
        varying vec3 vWorld;
        void main() {
          vUv = uv;
          vColor = instanceColor;
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float time;
        uniform float wet;
        varying vec2 vUv;
        varying vec3 vColor;
        varying vec3 vWorld;
        float h21(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
        }
        void main() {
          float x = (vUv.x - 0.5) * 2.0;
          float y = vUv.y; // 0 = far end (toward light), 1 = toward camera
          float across = exp(-x * x * 5.0);
          float along = smoothstep(0.0, 0.25, y) * smoothstep(1.0, 0.55, y);
          // Broken up by puddles and ripples.
          float n = noise(vWorld.xz * 0.9 + vec2(0.0, time * 0.6)) * 0.6 + noise(vWorld.xz * 3.1) * 0.4;
          float a = across * along * (0.35 + 0.9 * n) * wet;
          gl_FragColor = vec4(vColor * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, MAX);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'lightStreaks';
    this.mesh.userData.noCollider = true;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.count = 0;
    this.cam = new THREE.Vector3();
  }

  begin(camera, time, wet) {
    this.count = 0;
    this.cam.copy(camera.position);
    this.mat.uniforms.time.value = time;
    this.mat.uniforms.wet.value = wet;
  }

  // Light at (x,y,z) above ground level gy, colour hex, intensity ~1.
  add(x, y, z, gy, color, intensity = 1, widthScale = 1) {
    if (this.count >= MAX) return;
    const h = y - gy;
    if (h < 0.2) return;
    const dx = this.cam.x - x;
    const dz = this.cam.z - z;
    const D = Math.hypot(dx, dz);
    if (D < 2 || D > 170) return;
    const hc = Math.max(0.5, this.cam.y - gy);
    // Mirror reflection point on the ground between light and camera.
    const t = h / (h + hc);
    const rx = x + dx * t;
    const rz = z + dz * t;
    const len = Math.min(45, Math.max(3, D * (0.3 + h * 0.02)));
    const width = (0.4 + Math.min(0.9, h * 0.07)) * widthScale;
    const fade = Math.min(1, (170 - D) / 50);
    const dirx = dx / D;
    const dirz = dz / D;
    // Center the quad so the bright part sits around the reflection point.
    _p.set(rx + dirx * len * 0.2, gy + 0.035, rz + dirz * len * 0.2);
    _q.setFromAxisAngle(UP, Math.atan2(-dirx, -dirz));
    _s.set(width, 1, len);
    _m.compose(_p, _q, _s);
    this.mesh.setMatrixAt(this.count, _m);
    _c.set(color).multiplyScalar(intensity * fade);
    this.mesh.setColorAt(this.count, _c);
    this.count++;
  }

  end() {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}
