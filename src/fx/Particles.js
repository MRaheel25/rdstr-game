// Pooled GPU particles: one instanced draw call per system. Billboards (smoke, dust,
// water, frost, fire) and velocity-stretched streaks (sparks, glass, rain splashes).
// Particles are integrated on the CPU and packed into per-instance attributes each frame.
import * as THREE from 'three';

const vert = /* glsl */ `
attribute vec4 aPosSize;   // xyz, size
attribute vec4 aColor;     // rgb, alpha
attribute vec4 aVelRot;    // velocity xyz (stretch mode) , rotation
uniform float uStretch;
varying vec2 vUv;
varying vec4 vColor;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vColor = aColor;
  vec4 mvPosition = modelViewMatrix * vec4(aPosSize.xyz, 1.0);
  vec2 corner = position.xy;
  if (uStretch > 0.5) {
    // Align the quad with the projected velocity.
    vec3 v = (modelViewMatrix * vec4(aVelRot.xyz, 0.0)).xyz;
    vec2 d = v.xy;
    float len = length(d);
    vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    float stretch = aPosSize.w + len * uStretch * 0.016;
    mvPosition.xy += dir * corner.x * stretch + nrm * corner.y * aPosSize.w * 0.35;
  } else {
    float c = cos(aVelRot.w);
    float s = sin(aVelRot.w);
    vec2 r = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y);
    mvPosition.xy += r * aPosSize.w;
  }
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const frag = /* glsl */ `
uniform sampler2D map;
uniform float uUseMap;
uniform vec3 uTint;
varying vec2 vUv;
varying vec4 vColor;
#include <fog_pars_fragment>
void main() {
  float a;
  if (uUseMap > 0.5) {
    a = texture2D(map, vUv).a;
  } else {
    vec2 d = vUv - 0.5;
    a = smoothstep(0.5, 0.0, length(d));
  }
  gl_FragColor = vec4(vColor.rgb * uTint, a * vColor.a);
  if (gl_FragColor.a < 0.003) discard;
  #include <fog_fragment>
}`;

export class ParticleSystem {
  constructor(scene, { max = 1000, map = null, blending = THREE.NormalBlending, stretch = 0, renderOrder = 5, fog = true, name = 'particles' } = {}) {
    this.max = max;
    this.count = 0;
    // CPU state.
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.rot = new Float32Array(max);
    this.rotV = new Float32Array(max);
    this.col = new Float32Array(max * 3);
    this.col1 = new Float32Array(max * 3);
    this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.fadeIn = new Float32Array(max);
    // GPU buffers.
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    this.aPosSize = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aVelRot = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPosSize', this.aPosSize);
    g.setAttribute('aColor', this.aColor);
    g.setAttribute('aVelRot', this.aVelRot);
    g.instanceCount = 0;
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { map: { value: map }, uUseMap: { value: map ? 1 : 0 }, uStretch: { value: stretch }, uTint: { value: new THREE.Color(1, 1, 1) } },
      ]),
      transparent: true,
      depthWrite: false,
      blending,
      fog,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.name = name;
    this.mesh.userData.noCollider = true;
    scene.add(this.mesh);
    this.geometry = g;
  }

  // o: { x,y,z, vx,vy,vz, life, size, size1, color(hex or [r,g,b]), color1, alpha, drag, gravity, rot, rotV, fadeIn }
  spawn(o) {
    let i;
    if (this.count < this.max) i = this.count++;
    else {
      // Replace the oldest-looking particle.
      i = Math.floor(Math.random() * this.max);
    }
    this.p[i * 3] = o.x;
    this.p[i * 3 + 1] = o.y;
    this.p[i * 3 + 2] = o.z;
    this.v[i * 3] = o.vx || 0;
    this.v[i * 3 + 1] = o.vy || 0;
    this.v[i * 3 + 2] = o.vz || 0;
    this.life[i] = o.life || 1;
    this.age[i] = 0;
    this.size0[i] = o.size ?? 1;
    this.size1[i] = o.size1 ?? this.size0[i];
    this.rot[i] = o.rot ?? Math.random() * 6.28;
    this.rotV[i] = o.rotV ?? 0;
    const c = o.color;
    const c1 = o.color1 ?? c;
    setRGB(this.col, i, c);
    setRGB(this.col1, i, c1);
    this.a0[i] = o.alpha ?? 1;
    this.drag[i] = o.drag ?? 0;
    this.grav[i] = o.gravity ?? 0;
    this.fadeIn[i] = o.fadeIn ?? 0.1;
  }

  update(dt) {
    let n = this.count;
    const P = this.aPosSize.array;
    const C = this.aColor.array;
    const V = this.aVelRot.array;
    let i = 0;
    while (i < n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        // Swap-remove with the last live particle.
        n--;
        this.copy(n, i);
        continue;
      }
      const t = this.age[i] / this.life[i];
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.v[i * 3] *= d;
      this.v[i * 3 + 1] = this.v[i * 3 + 1] * d - this.grav[i] * dt;
      this.v[i * 3 + 2] *= d;
      this.p[i * 3] += this.v[i * 3] * dt;
      this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt;
      this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      this.rot[i] += this.rotV[i] * dt;
      P[i * 4] = this.p[i * 3];
      P[i * 4 + 1] = this.p[i * 3 + 1];
      P[i * 4 + 2] = this.p[i * 3 + 2];
      P[i * 4 + 3] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      const fi = this.fadeIn[i] > 0 ? Math.min(1, t / this.fadeIn[i]) : 1;
      C[i * 4] = this.col[i * 3] + (this.col1[i * 3] - this.col[i * 3]) * t;
      C[i * 4 + 1] = this.col[i * 3 + 1] + (this.col1[i * 3 + 1] - this.col[i * 3 + 1]) * t;
      C[i * 4 + 2] = this.col[i * 3 + 2] + (this.col1[i * 3 + 2] - this.col[i * 3 + 2]) * t;
      C[i * 4 + 3] = this.a0[i] * fi * (1 - t) * (1 - t * 0.3);
      V[i * 4] = this.v[i * 3];
      V[i * 4 + 1] = this.v[i * 3 + 1];
      V[i * 4 + 2] = this.v[i * 3 + 2];
      V[i * 4 + 3] = this.rot[i];
      i++;
    }
    this.count = n;
    this.geometry.instanceCount = n;
    this.aPosSize.needsUpdate = true;
    this.aColor.needsUpdate = true;
    this.aVelRot.needsUpdate = true;
  }

  copy(from, to) {
    if (from === to) return;
    for (const arr of [this.p, this.v, this.col, this.col1]) {
      arr[to * 3] = arr[from * 3];
      arr[to * 3 + 1] = arr[from * 3 + 1];
      arr[to * 3 + 2] = arr[from * 3 + 2];
    }
    for (const arr of [this.life, this.age, this.size0, this.size1, this.rot, this.rotV, this.a0, this.drag, this.grav, this.fadeIn]) arr[to] = arr[from];
  }

  clear() {
    this.count = 0;
    this.geometry.instanceCount = 0;
  }
}

const _c = new THREE.Color();
function setRGB(arr, i, c) {
  if (Array.isArray(c)) {
    arr[i * 3] = c[0];
    arr[i * 3 + 1] = c[1];
    arr[i * 3 + 2] = c[2];
  } else {
    _c.set(c ?? 0xffffff);
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
}

// Skid marks: ring buffer of ribbon segments laid on the road, fading over time.
export class SkidMarks {
  constructor(scene, max = 2400) {
    this.max = max;
    const pos = new Float32Array(max * 4 * 3);
    const born = new Float32Array(max * 4);
    const idx = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) {
      idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4 + 1, i * 4 + 2, i * 4 + 3], i * 6);
    }
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.bornAttr = new THREE.BufferAttribute(born, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('aBorn', this.bornAttr);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uNow: { value: 0 }, uFade: { value: 30 } },
      vertexShader: `attribute float aBorn; uniform float uNow; uniform float uFade; varying float vA;
        void main(){ vA = clamp(1.0 - (uNow - aBorn) / uFade, 0.0, 1.0) * step(0.0, aBorn); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(0.015, 0.015, 0.018, vA * 0.75); }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    born.fill(-1000);
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.userData.noCollider = true;
    scene.add(this.mesh);
    this.head = 0;
    this.time = 0;
    this.last = new Map(); // key -> {l, r} previous edge points
  }

  // Adds a segment for a wheel `key` at contact point p with lateral axis `side` and width w.
  add(key, p, side, w, normal) {
    const prev = this.last.get(key);
    const lx = p.x - side.x * w;
    const ly = p.y + 0.02;
    const lz = p.z - side.z * w;
    const rx = p.x + side.x * w;
    const rz = p.z + side.z * w;
    if (prev && Math.hypot(prev.lx - lx, prev.lz - lz) < 6) {
      const i = this.head;
      const P = this.posAttr.array;
      P.set([prev.lx, prev.ly, prev.lz, prev.rx, prev.ry, prev.rz, lx, ly, lz, rx, ly, rz], i * 12);
      const B = this.bornAttr.array;
      B[i * 4] = this.time;
      B[i * 4 + 1] = this.time;
      B[i * 4 + 2] = this.time;
      B[i * 4 + 3] = this.time;
      this.head = (this.head + 1) % this.max;
      this.dirty = true;
    }
    this.last.set(key, { lx, ly, lz, rx, ry: ly, rz });
  }

  break(key) {
    this.last.delete(key);
  }

  update(dt) {
    this.time += dt;
    this.material.uniforms.uNow.value = this.time;
    if (this.dirty) {
      this.posAttr.needsUpdate = true;
      this.bornAttr.needsUpdate = true;
      this.dirty = false;
    }
  }
}
