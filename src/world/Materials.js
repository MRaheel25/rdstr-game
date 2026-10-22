// Shared world materials. Buildings use a MeshStandardMaterial extended with a procedural
// window-grid shader (lit / dark windows, shop fronts, curtain walls) so a whole city
// chunk renders in one draw call with real PBR lighting, fog and shadows.
import * as THREE from 'three';
import * as Tex from './Textures.js';

const materials = {};

// Facade styles (aFacade.y): 0 plain concrete (no windows), 1 office grid, 2 glass curtain wall,
// 3 residential (balcony-ish), 4 industrial (sparse windows), -1 roof.
export function buildingMaterial() {
  if (materials.building) return materials.building;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.1, vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uNight = { value: nightLevel };
    m.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aFacade;
flat varying vec4 vFacade;
varying vec2 vMeters;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
vFacade = aFacade;
vMeters = uv;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
flat varying vec4 vFacade;
varying vec2 vMeters;
uniform float uTime;
uniform float uNight;
float fh(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 gWinEmissive = vec3(0.0);
float gGlass = 0.0;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  float style = vFacade.y;
  float seed = vFacade.x;
  vec2 m = vMeters;
  vec3 wall = diffuseColor.rgb;
  if (style > 0.5) {
    float floorH = vFacade.z;
    float cellW = style > 1.5 && style < 2.5 ? 1.6 : (style > 3.5 ? 4.5 : 2.7);
    vec2 cell = vec2(m.x / cellW, m.y / floorH);
    vec2 id = floor(cell);
    vec2 f = fract(cell);
    float lodW = fwidth(cell.x) + fwidth(cell.y);
    float groundFloor = step(m.y, 4.6);
    // window rectangle within the cell
    vec2 lo = style > 1.5 && style < 2.5 ? vec2(0.06, 0.08) : vec2(0.16, 0.2);
    vec2 hi = style > 1.5 && style < 2.5 ? vec2(0.94, 0.92) : vec2(0.84, 0.82);
    if (style > 3.5) { lo = vec2(0.3, 0.45); hi = vec2(0.7, 0.75); }
    float aa = clamp(lodW * 1.5, 0.002, 0.2);
    float win = smoothstep(lo.x - aa, lo.x + aa, f.x) * smoothstep(hi.x + aa, hi.x - aa, f.x) *
                smoothstep(lo.y - aa, lo.y + aa, f.y) * smoothstep(hi.y + aa, hi.y - aa, f.y);
    float rnd = fh(id + seed * 13.17);
    float lit = step(rnd, vFacade.w);
    // Some floors are entirely dark/lit (offices after hours)
    float floorRnd = fh(vec2(id.y, seed * 3.1));
    lit *= step(0.18, floorRnd);
    float hue = fh(id * 1.7 + seed);
    vec3 warm = vec3(1.0, 0.72, 0.42);
    vec3 cool = vec3(0.62, 0.8, 1.0);
    vec3 tv = vec3(0.5, 0.6, 1.0);
    vec3 lc = hue < 0.6 ? warm : (hue < 0.9 ? cool : tv);
    float ir = fh(id + 7.3 + seed);
    float intensity = ir > 0.93 ? 2.2 : mix(0.25, 0.9, ir);
    // Fade window detail at distance to an average glow to avoid shimmering.
    float far = smoothstep(0.18, 0.55, lodW);
    vec3 glassCol = vec3(0.03, 0.045, 0.06);
    // Shop fronts: big bright glazing on the ground floor.
    if (groundFloor > 0.5 && style < 3.5) {
      float shop = smoothstep(0.6, 0.75, m.y) * smoothstep(4.1, 3.9, m.y);
      float mull = step(0.06, fract(m.x / 5.0));
      win = shop * mull;
      lit = step(0.35, fh(vec2(floor(m.x / 10.0), seed)));
      lc = mix(vec3(1.0, 0.85, 0.6), vec3(0.9, 0.95, 1.0), fh(vec2(floor(m.x / 10.0), seed + 2.0)));
      intensity = 1.1;
    }
    vec3 emis = lc * lit * win * intensity;
    vec3 avgEmis = vec3(0.85, 0.7, 0.5) * vFacade.w * 0.24;
    if (groundFloor < 0.5) {
      emis = mix(emis, avgEmis, far);
      win = mix(win, 0.4, far);
    }
    diffuseColor.rgb = mix(wall, glassCol, win) * (1.0 - far * 0.35);
    gGlass = win * (1.0 - far);
    gWinEmissive = emis;
  } else if (style < -0.5) {
    // Roof: dark gravel/membrane.
    diffuseColor.rgb = wall * 0.55;
  }
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.08, gGlass);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.85, gGlass * 0.8);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
// Daylight: lit windows barely show; the glass reflects the sky instead.
totalEmissiveRadiance += gWinEmissive * mix(0.06, 1.0, uNight);
#ifdef DEBUG_FACADE
totalEmissiveRadiance = vec3(fract(vMeters.x / 2.7), fract(vMeters.y / 3.4), 0.0);
#endif`);
  };
  if (new URLSearchParams(location.search).get('dbgfacade')) m.defines = { DEBUG_FACADE: 1 };
  m.customProgramCacheKey = () => 'building-v1';
  materials.building = m;
  return m;
}

export function roadMaterial() {
  if (materials.road) return materials.road;
  const t = Tex.asphalt();
  const m = new THREE.MeshStandardMaterial({
    map: t.map, roughnessMap: t.roughnessMap, roughness: 1, metalness: 0.0, color: 0x9a9aa0, envMapIntensity: 0.7,
  });
  materials.road = m;
  return m;
}

export function markingMaterial() {
  if (materials.marking) return materials.marking;
  const m = new THREE.MeshStandardMaterial({
    map: Tex.markings(), transparent: true, roughness: 0.55, metalness: 0, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, color: 0xd8d8d0,
  });
  materials.marking = m;
  return m;
}

export function sidewalkMaterial() {
  if (materials.sidewalk) return materials.sidewalk;
  const m = new THREE.MeshStandardMaterial({ map: Tex.concrete(), roughness: 0.62, metalness: 0, color: 0x8e8a86 });
  materials.sidewalk = m;
  return m;
}

export function groundMaterial(kind = 'concrete') {
  const key = 'ground_' + kind;
  if (materials[key]) return materials[key];
  const tex = Tex.groundTex(kind);
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: kind === 'concrete' ? 0.7 : 0.95, metalness: 0, color: 0xffffff });
  materials[key] = m;
  return m;
}

export function concreteMaterial() {
  if (materials.concrete) return materials.concrete;
  const m = new THREE.MeshStandardMaterial({ map: Tex.groundTex('concrete'), roughness: 0.78, metalness: 0.0, color: 0xb0aca6, side: THREE.DoubleSide });
  materials.concrete = m;
  return m;
}

export function metalMaterial(color = 0x6a6e74) {
  const key = 'metal_' + color;
  if (materials[key]) return materials[key];
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.85, side: THREE.DoubleSide });
  materials[key] = m;
  return m;
}

export function containerMaterial() {
  if (materials.container) return materials.container;
  const m = new THREE.MeshStandardMaterial({ map: Tex.corrugated(), roughness: 0.55, metalness: 0.55, vertexColors: true });
  materials.container = m;
  return m;
}

export function emissiveMaterial(color, intensity = 3) {
  const key = `emis_${color}_${intensity}`;
  if (materials[key]) return materials[key];
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: true });
  materials[key] = m;
  return m;
}

export function paintedMaterial() {
  if (materials.painted) return materials.painted;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.45, side: THREE.DoubleSide });
  materials.painted = m;
  return m;
}

let nightLevel = 1;
export function updateMaterials(time) {
  const s = materials.building && materials.building.userData.shader;
  if (s) {
    s.uniforms.uTime.value = time;
    s.uniforms.uNight.value = nightLevel;
  }
}

// V2 lighting: how "night" it is (window glow) and how wet the roads are (only in rain).
export function setConditions(night, wet) {
  nightLevel = night;
  const r = roadMaterial();
  // Puddles (low-roughness areas of the roughness map) only exist when it rains.
  if (!r.userData.puddles) r.userData.puddles = r.roughnessMap;
  const map = wet > 0 ? r.userData.puddles : null;
  if (r.roughnessMap !== map) {
    r.roughnessMap = map;
    r.needsUpdate = true;
  }
  r.roughness = wet > 0 ? 0.55 : 0.92;
  r.color.set(wet > 0 ? 0x74747a : 0x9a9aa0);
  r.envMapIntensity = wet > 0 ? 1.3 : 0.7;
  const sw = sidewalkMaterial();
  sw.roughness = wet > 0 ? 0.4 : 0.62;
}
