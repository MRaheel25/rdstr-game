// Night sky dome (gradient, stars, moon, clouds lit from below by the city), height fog
// (patched into three's fog chunks), moonlight with a tight shadow frustum, hemisphere
// fill, a PMREM environment map of the night city for reflections, and time-of-day presets.
import * as THREE from 'three';

export const TIME_PRESETS = {
  night: {
    label: 'Night',
    zenith: 0x02050c, horizon: 0x0b1326, glow: 0x4a3036, cloudLit: 0x30262c, cloudCover: 0.55,
    fog: 0x161d30, fogDensity: 0.0012, hemiSky: 0x3a5684, hemiGround: 0x4a3018, hemi: 0.38,
    moon: 0xb4c6ff, moonI: 0.75, stars: 1, rain: false, wet: 1, exposure: 1.0, lampScale: 1,
  },
  dusk: {
    label: 'Dusk',
    zenith: 0x0d1838, horizon: 0x7a4652, glow: 0xff8a4a, cloudLit: 0xb06a5a, cloudCover: 0.45,
    fog: 0x4a3a4a, fogDensity: 0.0009, hemiSky: 0x7a8ab8, hemiGround: 0x6a4028, hemi: 1.2,
    moon: 0xffb27a, moonI: 1.6, stars: 0.25, rain: false, wet: 0.6, exposure: 1.0, lampScale: 0.7,
  },
  rain: {
    label: 'Rainy Night',
    zenith: 0x05070c, horizon: 0x141b28, glow: 0x3a3036, cloudLit: 0x2c2a34, cloudCover: 1.0,
    fog: 0x1a2232, fogDensity: 0.0021, hemiSky: 0x3a5070, hemiGround: 0x3a2a18, hemi: 0.36,
    moon: 0x9fb0d0, moonI: 0.35, stars: 0, rain: true, wet: 1.4, exposure: 1.0, lampScale: 1.1,
  },
};

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const skyFrag = /* glsl */ `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 glow;
uniform vec3 cloudLit;
uniform vec3 moonDir;
uniform vec3 moonColor;
uniform float cloudCover;
uniform float stars;
uniform float time;
uniform vec3 fogCol;
varying vec3 vDir;

float h31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float h21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.42));
  // City light pollution hugging the horizon.
  col += glow * exp(-max(h, 0.0) * 10.0) * 0.8;
  if (h < 0.0) col = mix(horizon * 0.7 + glow * 0.4, horizon * 0.25, clamp(-h * 3.0, 0.0, 1.0));
  // Clouds projected on a dome, lit from below by the city.
  vec2 cuv = d.xz / (max(h, 0.0) + 0.12) * 0.55 + vec2(time * 0.006, time * 0.002);
  float n = fbm(cuv * 1.2);
  float cloud = smoothstep(0.62 - cloudCover * 0.35, 0.95 - cloudCover * 0.2, n) * smoothstep(-0.02, 0.12, h);
  // Stars.
  vec3 sd = d * 420.0;
  vec3 cell = floor(sd);
  float r = h31(cell);
  float star = step(0.9975, r) * smoothstep(0.45, 0.0, length(fract(sd) - 0.5));
  col += vec3(0.8, 0.88, 1.0) * star * (0.4 + 1.6 * h31(cell + 7.0)) * stars * smoothstep(0.02, 0.25, h) * (1.0 - cloud);
  // Moon disc and halo.
  float md = dot(d, normalize(moonDir));
  col += moonColor * smoothstep(0.99955, 0.9998, md) * 6.0;
  col += moonColor * pow(max(md, 0.0), 120.0) * 0.25 + moonColor * pow(max(md, 0.0), 12.0) * 0.04;
  vec3 cc = mix(cloudLit * 1.25, cloudLit * 0.35 + zenith, clamp(h * 2.2, 0.0, 1.0));
  cc += moonColor * pow(max(md, 0.0), 30.0) * 0.25;
  col = mix(col, cc, cloud * 0.9);
  // Melt into the fog at the horizon so distant geometry never meets a hard line.
  col = mix(fogCol, col, smoothstep(-0.01, 0.09, h));
  gl_FragColor = vec4(col, 1.0);
}`;

let fogPatched = false;
// Height fog: denser near the ground, thinning with altitude. Patched into all materials.
function patchFogChunks() {
  if (fogPatched) return;
  fogPatched = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth;
  varying float vFogWorldY;
#endif`;
  C.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorldY = (inverse(viewMatrix) * mvPosition).y;
#endif`;
  C.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying float vFogWorldY;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  C.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogH = exp(-max(vFogWorldY - 2.0, 0.0) / 70.0);
    float fogD = fogDensity * (0.55 + 0.75 * fogH);
    float fogFactor = 1.0 - exp(- fogD * fogD * vFogDepth * vFogDepth);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif`;
}

export class Environment {
  constructor(scene, renderer, settings) {
    this.scene = scene;
    this.renderer = renderer;
    this.settings = settings;
    patchFogChunks();
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      uniforms: {
        zenith: { value: new THREE.Color() },
        horizon: { value: new THREE.Color() },
        glow: { value: new THREE.Color() },
        cloudLit: { value: new THREE.Color() },
        moonDir: { value: new THREE.Vector3(-0.45, 0.42, -0.6).normalize() },
        moonColor: { value: new THREE.Color() },
        cloudCover: { value: 0.5 },
        stars: { value: 1 },
        time: { value: 0 },
        fogCol: { value: new THREE.Color() },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.sky.userData.noCollider = true;
    scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(0x40608f, 0x4a3018, 0.55);
    scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0xb4c6ff, 0.75);
    this.moon.castShadow = true;
    const sc = this.moon.shadow.camera;
    sc.left = -70;
    sc.right = 70;
    sc.top = 70;
    sc.bottom = -70;
    sc.near = 10;
    sc.far = 600;
    this.moon.shadow.bias = -0.0005;
    this.moon.shadow.normalBias = 0.05;
    scene.add(this.moon);
    scene.add(this.moon.target);
    this.moonOffset = new THREE.Vector3();
    scene.fog = new THREE.FogExp2(0x141c2e, 0.0019);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTarget = null;
    this.apply(settings.get('timeOfDay') || 'night');
  }

  get preset() {
    return this.current;
  }

  apply(name) {
    const p = TIME_PRESETS[name] || TIME_PRESETS.night;
    this.current = p;
    const u = this.skyMat.uniforms;
    u.zenith.value.set(p.zenith);
    u.horizon.value.set(p.horizon);
    u.glow.value.set(p.glow);
    u.cloudLit.value.set(p.cloudLit);
    u.moonColor.value.set(p.moon);
    u.cloudCover.value = p.cloudCover;
    u.stars.value = p.stars;
    // Fog colour = what the sky looks like at the horizon (horizon + city glow).
    const fogC = new THREE.Color(p.horizon).add(new THREE.Color(p.glow).multiplyScalar(0.32));
    this.scene.fog.color.copy(fogC);
    u.fogCol.value.copy(fogC);
    this.scene.fog.density = p.fogDensity;
    this.hemi.color.set(p.hemiSky);
    this.hemi.groundColor.set(p.hemiGround);
    this.hemi.intensity = p.hemi;
    this.moon.color.set(p.moon);
    this.moon.intensity = p.moonI;
    this.moonOffset.copy(u.moonDir.value).multiplyScalar(300);
    this.applyShadowQuality();
    this.buildEnvMap();
  }

  applyShadowQuality() {
    const q = this.settings.preset;
    const size = q.shadowMapSize;
    if (this.moon.shadow.mapSize.x !== size) {
      this.moon.shadow.mapSize.set(size, size);
      if (this.moon.shadow.map) {
        this.moon.shadow.map.dispose();
        this.moon.shadow.map = null;
      }
    }
    this.moon.castShadow = q.shadows;
  }

  // Environment map: the sky plus a ring of emissive "city lights" so car paint and
  // wet asphalt pick up colourful neon/sodium reflections.
  buildEnvMap() {
    const envScene = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.skyMat);
    envScene.add(sky);
    const colors = [0xff9a4a, 0xffc070, 0x3fe0ff, 0xff3fd0, 0xffffff, 0x7c8cff, 0xff5a3a];
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2;
      const w = 1 + rnd() * 4;
      const h = 1 + rnd() * 8;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(colors[i % colors.length]).multiplyScalar(0.25 + rnd() * 0.8), side: THREE.DoubleSide }),
      );
      const r = 60 + rnd() * 30;
      m.position.set(Math.cos(a) * r, h / 2 + rnd() * 18 - 4, Math.sin(a) * r);
      m.lookAt(0, m.position.y, 0);
      envScene.add(m);
    }
    // Overhead street-light strips.
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb36a).multiplyScalar(1.4), side: THREE.DoubleSide }));
      m.position.set((i - 6) * 9, 18, 0);
      m.rotation.x = Math.PI / 2;
      envScene.add(m);
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x07080b }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    envScene.add(ground);
    if (this.envTarget) this.envTarget.dispose();
    this.envTarget = this.pmrem.fromScene(envScene, 0.02);
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = 0.75;
    envScene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material !== this.skyMat) o.material.dispose();
    });
  }

  update(dt, focus, camera) {
    this.skyMat.uniforms.time.value += dt;
    if (camera) this.sky.position.copy(camera.position);
    if (focus) {
      const snap = 4;
      const fx = Math.round(focus.x / snap) * snap;
      const fz = Math.round(focus.z / snap) * snap;
      this.moon.position.set(fx + this.moonOffset.x, focus.y + this.moonOffset.y, fz + this.moonOffset.z);
      this.moon.target.position.set(fx, focus.y, fz);
    }
  }
}
