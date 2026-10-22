// Vehicle materials: clear-coated metallic paint with flake, tinted glass, gloss black,
// carbon weave, rubber, copper, chrome and emissive LED materials. Paint presets for the garage.
import * as THREE from 'three';
import { RNG } from '../../util/math.js';

// Daylight level (0 night .. 1 noon), set by the world when conditions change: car lamps and
// paint reflections are toned down in the sun so the car reads as glossy paint, not a glow.
export const CAR_LIGHTING = { day: 0 };

export const PAINTS = {
  pearlWhite: { label: 'Pearl White', color: 0xe9e7e1, metalness: 0.35, roughness: 0.3, clearcoat: 1, flake: 0.25 },
  redMulti: { label: 'Red Multi-Coat', color: 0x9a0b10, metalness: 0.55, roughness: 0.28, clearcoat: 1, flake: 0.5 },
  midnightSilver: { label: 'Midnight Silver', color: 0x464b52, metalness: 0.85, roughness: 0.3, clearcoat: 1, flake: 0.6 },
  matteBlack: { label: 'Matte Black', color: 0x121315, metalness: 0.3, roughness: 0.62, clearcoat: 0, flake: 0 },
  deepBlue: { label: 'Deep Blue', color: 0x10296a, metalness: 0.7, roughness: 0.28, clearcoat: 1, flake: 0.55 },
  neonCyan: { label: 'Neon Cyan', color: 0x0fd8ff, metalness: 0.5, roughness: 0.25, clearcoat: 1, flake: 0.4, glow: 0x0a6a80, unlock: 'neon' },
  neonMagenta: { label: 'Neon Magenta', color: 0xff1aa8, metalness: 0.5, roughness: 0.25, clearcoat: 1, flake: 0.4, glow: 0x80104a, unlock: 'neon' },
  neonLime: { label: 'Neon Lime', color: 0x8cff1a, metalness: 0.5, roughness: 0.25, clearcoat: 1, flake: 0.4, glow: 0x3a7008, unlock: 'neon' },
};

let flakeTex = null;
function flakeNormal() {
  if (flakeTex) return flakeTex;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const x = c.getContext('2d');
  const img = x.createImageData(S, S);
  const rng = new RNG(77);
  for (let i = 0; i < S * S; i++) {
    const nx = rng.float(-1, 1) * 0.6;
    const ny = rng.float(-1, 1) * 0.6;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    img.data[i * 4] = (nx * 0.5 + 0.5) * 255;
    img.data[i * 4 + 1] = (ny * 0.5 + 0.5) * 255;
    img.data[i * 4 + 2] = nz * 255;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  flakeTex = new THREE.CanvasTexture(c);
  flakeTex.wrapS = flakeTex.wrapT = THREE.RepeatWrapping;
  flakeTex.repeat.set(30, 30);
  return flakeTex;
}

let carbonTex = null;
export function carbonTexture() {
  if (carbonTex) return carbonTex;
  const S = 64;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#0c0d0f';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const g = x.createLinearGradient(i * 8, j * 8, i * 8 + 8, j * 8 + 8);
      const on = (i + j) % 2 === 0;
      g.addColorStop(0, on ? '#24262a' : '#141518');
      g.addColorStop(1, on ? '#141518' : '#24262a');
      x.fillStyle = g;
      x.fillRect(i * 8, j * 8, 8, 8);
    }
  }
  carbonTex = new THREE.CanvasTexture(c);
  carbonTex.colorSpace = THREE.SRGBColorSpace;
  carbonTex.wrapS = carbonTex.wrapT = THREE.RepeatWrapping;
  carbonTex.repeat.set(12, 12);
  return carbonTex;
}

let crackTex = null;
export function crackTexture() {
  if (crackTex) return crackTex;
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const x = c.getContext('2d');
  x.clearRect(0, 0, S, S);
  const rng = new RNG(5);
  x.strokeStyle = 'rgba(255,255,255,0.9)';
  for (let k = 0; k < 5; k++) {
    const cx = rng.float(80, 430);
    const cy = rng.float(80, 430);
    for (let r = 0; r < 14; r++) {
      const a = rng.float(0, Math.PI * 2);
      let px = cx;
      let py = cy;
      x.lineWidth = rng.float(0.8, 2);
      x.beginPath();
      x.moveTo(px, py);
      const len = rng.float(40, 160);
      for (let s = 0; s < len; s += 8) {
        px += Math.cos(a + rng.float(-0.4, 0.4)) * 8;
        py += Math.sin(a + rng.float(-0.4, 0.4)) * 8;
        x.lineTo(px, py);
      }
      x.stroke();
    }
    for (let ring = 1; ring < 4; ring++) {
      x.beginPath();
      x.arc(cx, cy, ring * rng.float(10, 22), 0, Math.PI * 2);
      x.lineWidth = 0.8;
      x.stroke();
    }
  }
  crackTex = new THREE.CanvasTexture(c);
  return crackTex;
}

export function makePaint(preset = PAINTS.pearlWhite) {
  const m = new THREE.MeshPhysicalMaterial({
    color: preset.color,
    metalness: preset.metalness,
    roughness: preset.roughness,
    clearcoat: preset.clearcoat,
    // V2: glassier clearcoat so the sun and street lights leave sharp highlights.
    clearcoatRoughness: 0.025,
    specularIntensity: 1,
    normalMap: preset.flake > 0 ? flakeNormal() : null,
    normalScale: new THREE.Vector2(preset.flake * 0.15, preset.flake * 0.15),
    envMapIntensity: 1.4,
    emissive: preset.glow ? new THREE.Color(preset.glow) : new THREE.Color(0),
    emissiveIntensity: preset.glow ? 0.6 : 0,
  });
  return m;
}

export function applyPaint(m, preset) {
  m.color.set(preset.color);
  m.metalness = preset.metalness;
  m.roughness = preset.roughness;
  m.clearcoat = preset.clearcoat;
  m.normalMap = preset.flake > 0 ? flakeNormal() : null;
  m.normalScale.set(preset.flake * 0.15, preset.flake * 0.15);
  m.emissive.set(preset.glow || 0);
  m.emissiveIntensity = preset.glow ? 0.6 : 0;
  m.needsUpdate = true;
}

const shared = {};
export function carMat(key) {
  if (shared[key]) return shared[key];
  let m;
  switch (key) {
    case 'glass': // dark bronze-tinted canopy
      m = new THREE.MeshPhysicalMaterial({ color: 0x1d130c, metalness: 0.4, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 });
      break;
    case 'glassDark':
      m = new THREE.MeshPhysicalMaterial({ color: 0x07090c, metalness: 0.5, roughness: 0.05, clearcoat: 1, envMapIntensity: 1.4 });
      break;
    case 'black':
      m = new THREE.MeshPhysicalMaterial({ color: 0x0b0c0e, metalness: 0.2, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 });
      break;
    case 'carbon':
      m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: carbonTexture(), metalness: 0.3, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 });
      break;
    case 'rubber':
      m = new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.88, metalness: 0 });
      break;
    case 'rimBlack':
      m = new THREE.MeshPhysicalMaterial({ color: 0x0a0a0b, metalness: 0.6, roughness: 0.22, clearcoat: 1 });
      break;
    case 'aeroDisc':
      m = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 0.55, roughness: 0.35 });
      break;
    case 'brakeDisc':
      m = new THREE.MeshStandardMaterial({ color: 0x55585c, metalness: 0.9, roughness: 0.45 });
      break;
    case 'caliper':
      m = new THREE.MeshStandardMaterial({ color: 0xc2410c, metalness: 0.3, roughness: 0.4 });
      break;
    case 'copper':
      m = new THREE.MeshStandardMaterial({ color: 0xc07a3a, metalness: 1, roughness: 0.25 });
      break;
    case 'chrome':
      m = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.08 });
      break;
    case 'nozzleIn':
      m = new THREE.MeshBasicMaterial({ color: 0x050505 });
      break;
    case 'ledWhite':
      m = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(6) });
      break;
    case 'underglow':
      m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2a6bff).multiplyScalar(5) });
      break;
    case 'plateWhite':
      m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
      break;
    default:
      m = new THREE.MeshStandardMaterial({ color: 0xff00ff });
  }
  shared[key] = m;
  return m;
}
