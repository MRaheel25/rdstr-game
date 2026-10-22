// Sky dome (gradient, sun / moon disc with halo, clouds, stars), height fog (patched into
// three's fog chunks), a sun / moon directional light with a tightly fitted shadow frustum,
// hemisphere fill, a PMREM environment map of the sky + city for reflections, and a
// time of day x weather lighting model (V2: Morning / Noon / Golden Hour / Sunset / Night
// x Clear / Cloudy / Rain / Fog / Storm).
import * as THREE from 'three';

// Time of day. elev / az in degrees (az 0 = north (-z), 90 = east (+x)). night = 1 lights
// windows, street lamps and stars; the "sun" is the moon at night.
export const TODS = {
  morning: {
    label: 'Morning', elev: 16, az: 105, sun: 0xffdcb4, sunI: 3.6, disk: 1,
    zenith: 0x3c72c2, horizon: 0xc2d4e8, glow: 0xffc49a, cloudLit: 0xf4ece6,
    fog: 0xb8c8da, fogDensity: 0.0009, hemiSky: 0xbccfee, hemiGround: 0x76644e, hemi: 1.4,
    night: 0.1, stars: 0, exposure: 1.0, lampScale: 0, envI: 1.0,
  },
  noon: {
    label: 'Noon', elev: 64, az: 160, sun: 0xfff4e4, sunI: 4.4, disk: 1,
    zenith: 0x2a60be, horizon: 0xaccbec, glow: 0xdfe9f6, cloudLit: 0xffffff,
    fog: 0xb0c6e0, fogDensity: 0.0008, hemiSky: 0xc6d6f0, hemiGround: 0x7a6a58, hemi: 1.6,
    night: 0, stars: 0, exposure: 1.0, lampScale: 0, envI: 1.0,
  },
  golden: {
    label: 'Golden Hour', elev: 9, az: 255, sun: 0xffb46a, sunI: 3.4, disk: 1,
    zenith: 0x34589a, horizon: 0xf0c48e, glow: 0xffa458, cloudLit: 0xffd2a4,
    fog: 0xd8b49a, fogDensity: 0.0009, hemiSky: 0x92a8dc, hemiGround: 0x7a5a3c, hemi: 1.15,
    night: 0.25, stars: 0, exposure: 1.0, lampScale: 0.25, envI: 1.0,
  },
  sunset: {
    label: 'Sunset', elev: 2.5, az: 270, sun: 0xff8448, sunI: 1.8, disk: 1,
    zenith: 0x1e2e66, horizon: 0xff9460, glow: 0xff6030, cloudLit: 0xff9a78,
    fog: 0x9a6a6a, fogDensity: 0.001, hemiSky: 0x7a86c0, hemiGround: 0x6a4630, hemi: 0.75,
    night: 0.65, stars: 0.15, exposure: 1.08, lampScale: 0.85, envI: 0.9,
  },
  night: {
    // Readable night: brighter moon / fill, lifted exposure, stronger street lighting.
    label: 'Night', elev: 38, az: 220, sun: 0xb4c8ff, sunI: 1.0, disk: 0,
    zenith: 0x060c1c, horizon: 0x1c2846, glow: 0x5a3a44, cloudLit: 0x3a3040,
    fog: 0x1e2840, fogDensity: 0.0011, hemiSky: 0x5a7ab4, hemiGround: 0x5a3a20, hemi: 0.75,
    night: 1, stars: 1, exposure: 1.3, lampScale: 1.35, envI: 0.8,
  },
};

// Weather modifies a time of day: cloud cover, fog, how much direct light gets through,
// how grey the sky turns, rain, wet roads (only when it rains) and lightning.
export const WEATHERS = {
  clear: { label: 'Clear', cloud: 0.22, fogMul: 1, sunMul: 1, grey: 0, rain: false, wet: 0 },
  cloudy: { label: 'Cloudy', cloud: 0.8, fogMul: 1.5, sunMul: 0.45, grey: 0.45, rain: false, wet: 0, hemiMul: 1.1 },
  rain: { label: 'Rain', cloud: 1, fogMul: 2.3, sunMul: 0.22, grey: 0.7, rain: true, wet: 1.3, hemiMul: 0.95 },
  fog: { label: 'Fog', cloud: 0.7, fogMul: 4.8, sunMul: 0.35, grey: 0.6, rain: false, wet: 0, hemiMul: 1.15 },
  storm: { label: 'Storm', cloud: 1, fogMul: 2.8, sunMul: 0.12, grey: 0.82, rain: true, wet: 1.5, hemiMul: 0.85, lightning: true },
};

// V1 presets map onto the new model (old saves / scenarios).
const LEGACY = { night: ['night', 'clear'], dusk: ['sunset', 'clear'], rain: ['night', 'rain'] };
// Kept for older callers that list the presets.
export const TIME_PRESETS = TODS;

const _c = new THREE.Color();
const _g = new THREE.Color();
const STORM_GREY = new THREE.Color(0x5c6470);
const NIGHT_GREY = new THREE.Color(0x161a22);

// Combine time of day and weather into the flat preset the rest of the game reads.
export function makePreset(todId, weatherId) {
  const t = TODS[todId] || TODS.noon;
  const w = WEATHERS[weatherId] || WEATHERS.clear;
  const grey = t.night > 0.5 ? NIGHT_GREY : STORM_GREY;
  // Pull a colour towards overcast grey (keeping roughly its brightness).
  const mixC = (hex, amt) => {
    _c.set(hex);
    const l = 0.2126 * _c.r + 0.7152 * _c.g + 0.0722 * _c.b;
    _g.copy(grey).multiplyScalar(t.night > 0.5 ? 1 : 0.55 + l * 1.4);
    return '#' + _c.lerp(_g, amt).getHexString();
  };
  const sunI = t.sunI * w.sunMul;
  return {
    tod: todId, weather: weatherId, label: `${t.label} · ${w.label}`,
    zenith: mixC(t.zenith, w.grey), horizon: mixC(t.horizon, w.grey * 0.8), glow: mixC(t.glow, w.grey * 0.7),
    cloudLit: mixC(t.cloudLit, w.grey * 0.55), cloudCover: w.cloud,
    fog: mixC(t.fog, w.grey * 0.6), fogDensity: t.fogDensity * w.fogMul,
    hemiSky: mixC(t.hemiSky, w.grey * 0.5), hemiGround: t.hemiGround, hemi: t.hemi * (w.hemiMul || 1),
    sun: t.sun, sunI, disk: t.disk * (1 - w.grey), elev: t.elev, az: t.az,
    // Old field names (moon = the key light) so existing code keeps working.
    moon: t.sun, moonI: sunI,
    stars: t.stars * (1 - w.cloud * 0.9), night: t.night, day: 1 - t.night,
    rain: w.rain, wet: w.wet, lightning: !!w.lightning,
    exposure: t.exposure, lampScale: Math.max(t.lampScale, w.grey > 0.6 && t.night < 0.5 ? 0.35 : 0) * (w.rain ? 1.1 : 1),
    envI: t.envI,
  };
}

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
uniform float disk;
uniform float day;
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
  vec3 sd0 = normalize(moonDir);
  float md = dot(d, sd0);
  vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), mix(0.42, 0.55, day)));
  // Horizon glow: city light pollution at night, warm forward scattering towards the sun by day.
  float sunSide = pow(max(md, 0.0) * 0.5 + 0.5, 3.0);
  col += glow * exp(-max(h, 0.0) * mix(10.0, 4.0, day)) * mix(0.8, 0.9 * sunSide, day);
  if (h < 0.0) col = mix(horizon * 0.7 + glow * 0.4, horizon * mix(0.25, 0.6, day), clamp(-h * 3.0, 0.0, 1.0));
  // Clouds projected on a dome.
  vec2 cuv = d.xz / (max(h, 0.0) + 0.12) * 0.55 + vec2(time * 0.006, time * 0.002);
  float n = fbm(cuv * 1.2);
  float cloud = smoothstep(0.62 - cloudCover * 0.35, 0.95 - cloudCover * 0.2, n) * smoothstep(-0.02, 0.12, h);
  // Stars.
  vec3 sd = d * 420.0;
  vec3 cell = floor(sd);
  float r = h31(cell);
  float star = step(0.9975, r) * smoothstep(0.45, 0.0, length(fract(sd) - 0.5));
  col += vec3(0.8, 0.88, 1.0) * star * (0.4 + 1.6 * h31(cell + 7.0)) * stars * smoothstep(0.02, 0.25, h) * (1.0 - cloud);
  // Sun (big disc + Mie halo) or moon (small disc + soft halo).
  float discIn = mix(0.99955, 0.99965, disk);
  col += moonColor * smoothstep(discIn, discIn + 0.00025, md) * mix(6.0, 40.0, disk);
  col += moonColor * (pow(max(md, 0.0), mix(120.0, 600.0, disk)) * mix(0.25, 4.0, disk) + pow(max(md, 0.0), mix(12.0, 8.0, disk)) * mix(0.04, 0.35, disk));
  // Cloud shading: night clouds lit from below by the city; day clouds bright with a darker
  // core and a silver lining towards the sun.
  vec3 ccN = mix(cloudLit * 1.25, cloudLit * 0.35 + zenith, clamp(h * 2.2, 0.0, 1.0));
  vec3 ccD = cloudLit * mix(1.05, 0.62, smoothstep(0.7, 1.0, n) * cloudCover) + horizon * 0.12;
  vec3 cc = mix(ccN, ccD, day);
  cc += moonColor * pow(max(md, 0.0), 30.0) * mix(0.25, 0.9, day);
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
        disk: { value: 0 },
        day: { value: 0 },
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
    // Key light: the sun by day, the moon at night. `moon` stays as an alias for older code.
    this.sun = this.moon = new THREE.DirectionalLight(0xb4c6ff, 0.75);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.moonOffset = new THREE.Vector3();
    this.shadowFwd = new THREE.Vector3();
    scene.fog = new THREE.FogExp2(0x141c2e, 0.0019);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTarget = null;
    this.lightning = { t: 4, flash: 0, strikes: 0 };
    this.onLightning = null; // (strength) => void, set by the game (screen flash + thunder)
    this.setConditions(settings.get('tod') || 'noon', settings.get('weather') || 'clear');
  }

  get preset() {
    return this.current;
  }

  // V1 entry point: 'night' | 'dusk' | 'rain' or a tod id.
  apply(name) {
    const l = LEGACY[name];
    if (l) this.setConditions(l[0], l[1]);
    else this.setConditions(name, this.current ? this.current.weather : 'clear');
  }

  setConditions(todId, weatherId) {
    const p = makePreset(TODS[todId] ? todId : 'noon', WEATHERS[weatherId] ? weatherId : 'clear');
    this.current = p;
    const u = this.skyMat.uniforms;
    u.zenith.value.set(p.zenith);
    u.horizon.value.set(p.horizon);
    u.glow.value.set(p.glow);
    u.cloudLit.value.set(p.cloudLit);
    u.moonColor.value.set(p.sun);
    u.cloudCover.value = p.cloudCover;
    u.stars.value = p.stars;
    u.disk.value = p.disk;
    u.day.value = p.day;
    const el = THREE.MathUtils.degToRad(p.elev);
    const az = THREE.MathUtils.degToRad(p.az);
    u.moonDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    // Fog colour = the sky at the horizon (plus glow), blended with the preset's fog tint.
    const fogC = new THREE.Color(p.horizon).add(new THREE.Color(p.glow).multiplyScalar(0.32 * p.night)).lerp(new THREE.Color(p.fog), 0.5);
    this.scene.fog.color.copy(fogC);
    u.fogCol.value.copy(fogC);
    this.scene.fog.density = p.fogDensity;
    this.hemi.color.set(p.hemiSky);
    this.hemi.groundColor.set(p.hemiGround);
    this.hemi.intensity = p.hemi;
    this.sun.color.set(p.sun);
    this.sun.intensity = p.sunI;
    // Keep the light above the horizon so low suns still cast long shadows on the street.
    const ld = u.moonDir.value.clone();
    ld.y = Math.max(ld.y, 0.09);
    this.moonOffset.copy(ld.normalize()).multiplyScalar(300);
    this.renderer.toneMappingExposure = p.exposure;
    if (this.onConditions) this.onConditions(p);
    this.applyShadowQuality();
    this.buildEnvMap();
  }

  applyShadowQuality() {
    const q = this.settings.preset;
    const size = q.shadowMapSize;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
    // Tightly fitted frustum around the view: smaller (sharper) on higher presets.
    const half = size >= 4096 ? 55 : size >= 2048 ? 62 : 75;
    this.shadowHalf = half;
    const sc = this.sun.shadow.camera;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 10;
    sc.far = 700;
    sc.updateProjectionMatrix();
    this.sun.castShadow = q.shadows;
  }

  // Environment map: the sky plus the city around it, so paint and glass reflect the same
  // sky the player sees. By day: grey / glass facades and sunlit asphalt; at night: neon,
  // sodium lamps and dark ground.
  buildEnvMap() {
    const p = this.current;
    const night = p.night;
    const envScene = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.skyMat);
    envScene.add(sky);
    const colors = [0xff9a4a, 0xffc070, 0x3fe0ff, 0xff3fd0, 0xffffff, 0x7c8cff, 0xff5a3a];
    const dayFacades = [0x8a919c, 0x6a7686, 0xa8a296, 0x4e5a6a, 0x9aa6b4, 0x76726c];
    const skyLight = new THREE.Color(p.horizon).lerp(new THREE.Color(p.hemiSky), 0.5);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2;
      const w = 1 + rnd() * 4;
      const h = 1 + rnd() * 8;
      const neon = new THREE.Color(colors[i % colors.length]).multiplyScalar(0.25 + rnd() * 0.8);
      const facade = new THREE.Color(dayFacades[i % dayFacades.length]).multiply(skyLight).multiplyScalar(0.9 + rnd() * 0.5);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w * (1 + 3 * (1 - night)), h * (1 + 2 * (1 - night))),
        new THREE.MeshBasicMaterial({ color: facade.lerp(neon, night), side: THREE.DoubleSide }),
      );
      const r = 60 + rnd() * 30;
      m.position.set(Math.cos(a) * r, h / 2 + rnd() * 18 - 4, Math.sin(a) * r);
      m.lookAt(0, m.position.y, 0);
      envScene.add(m);
    }
    // Overhead street-light strips (night only).
    if (p.lampScale > 0.2) {
      for (let i = 0; i < 12; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb36a).multiplyScalar(1.4 * Math.min(1, p.lampScale)), side: THREE.DoubleSide }));
        m.position.set((i - 6) * 9, 18, 0);
        m.rotation.x = Math.PI / 2;
        envScene.add(m);
      }
    }
    const groundC = new THREE.Color(0x07080b).lerp(new THREE.Color(0x3a3c40).multiply(skyLight).multiplyScalar(1.6), 1 - night);
    if (p.wet) groundC.multiplyScalar(0.6);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: groundC }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    envScene.add(ground);
    if (this.envTarget) this.envTarget.dispose();
    this.envTarget = this.pmrem.fromScene(envScene, 0.02);
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = p.envI;
    envScene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material !== this.skyMat) o.material.dispose();
    });
  }

  update(dt, focus, camera) {
    this.skyMat.uniforms.time.value += dt;
    if (camera) this.sky.position.copy(camera.position);
    if (focus) {
      // Centre the shadow frustum a little ahead of the camera so what you look at is covered.
      if (camera) {
        camera.getWorldDirection(this.shadowFwd);
        this.shadowFwd.y = 0;
        if (this.shadowFwd.lengthSq() > 1e-6) this.shadowFwd.normalize().multiplyScalar(this.shadowHalf * 0.35);
      }
      const snap = 4;
      const fx = Math.round((focus.x + this.shadowFwd.x) / snap) * snap;
      const fz = Math.round((focus.z + this.shadowFwd.z) / snap) * snap;
      this.sun.position.set(fx + this.moonOffset.x, focus.y + this.moonOffset.y, fz + this.moonOffset.z);
      this.sun.target.position.set(fx, focus.y, fz);
    }
    this.updateLightning(dt);
  }

  // Storm: random lightning strikes (double flicker), lighting the scene and the sky.
  updateLightning(dt) {
    const L = this.lightning;
    const p = this.current;
    if (!p.lightning) {
      if (L.flash) {
        L.flash = 0;
        this.sun.intensity = p.sunI;
        this.hemi.intensity = p.hemi;
      }
      return;
    }
    L.t -= dt;
    if (L.t <= 0) {
      L.strikes = 1 + (Math.random() < 0.5 ? 1 : 0);
      L.t = 5 + Math.random() * 11;
      L.flash = 1;
      L.next = 0.12;
      if (this.onLightning) this.onLightning(0.6 + Math.random() * 0.4);
    }
    if (L.flash > 0) {
      L.flash = Math.max(0, L.flash - dt * 4.5);
      L.next -= dt;
      if (L.next <= 0 && L.strikes > 1) {
        L.strikes--;
        L.flash = 0.8;
        L.next = 0.1;
      }
      const f = L.flash * L.flash;
      this.sun.intensity = p.sunI + f * 5;
      this.hemi.intensity = p.hemi + f * 2.5;
    }
  }
}
