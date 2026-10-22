// Procedural geometry for street furniture. Each prop type is a list of parts
// (geometry + material key) that the Props system instances.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as Tex from './Textures.js';

const mats = {};
export function propMaterial(key) {
  if (mats[key]) return mats[key];
  let m;
  switch (key) {
    case 'metalDark': m = new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.45, metalness: 0.8 }); break;
    case 'metalLight': m = new THREE.MeshStandardMaterial({ color: 0x8a9198, roughness: 0.35, metalness: 0.85 }); break;
    case 'lampLight': m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc27a).multiplyScalar(5) }); break;
    case 'lampLightCool': m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xcfe4ff).multiplyScalar(4.5) }); break;
    case 'glass': m = new THREE.MeshStandardMaterial({ color: 0x9fc4d8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.25, depthWrite: false }); break;
    case 'plastic': m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.05 }); break;
    case 'paint': m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.5 }); break;
    case 'wood': m = new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.8 }); break;
    case 'concrete': m = new THREE.MeshStandardMaterial({ color: 0x9a9690, roughness: 0.85, map: Tex.groundTex('concrete') }); break;
    case 'trunk': m = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 }); break;
    case 'foliage': m = new THREE.MeshStandardMaterial({ color: 0x2f4a2a, roughness: 0.9, side: THREE.DoubleSide }); break;
    case 'pine': m = new THREE.MeshStandardMaterial({ color: 0x1f3324, roughness: 0.95 }); break;
    case 'darkGlass': m = new THREE.MeshStandardMaterial({ color: 0x080a0e, roughness: 0.08, metalness: 0.6 }); break;
    case 'tire': m = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.85 }); break;
    case 'airGlow': m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x40e8ff).multiplyScalar(2.2) }); break;
    case 'emissiveAd': m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbfe6ff).multiplyScalar(2.2) }); break;
    case 'lightBlue': m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2050ff).multiplyScalar(4) }); break;
    case 'emissiveRed': m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2020).multiplyScalar(4) }); break;
    case 'stripe': m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, map: stripeTex() }); break;
    default: m = new THREE.MeshStandardMaterial({ color: 0xff00ff });
  }
  mats[key] = m;
  return m;
}

let _stripe;
function stripeTex() {
  if (_stripe) return _stripe;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 ? '#f2f2f2' : '#e8521c';
    x.beginPath();
    x.moveTo(i * 16, 0);
    x.lineTo(i * 16 + 16, 0);
    x.lineTo(i * 16 + 8, 16);
    x.lineTo(i * 16 - 8, 16);
    x.fill();
  }
  _stripe = new THREE.CanvasTexture(c);
  _stripe.colorSpace = THREE.SRGBColorSpace;
  _stripe.wrapS = THREE.RepeatWrapping;
  return _stripe;
}

const box = (w, h, d, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
};
const cyl = (rt, rb, h, x = 0, y = 0, z = 0, seg = 10, rx = 0, rz = 0) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  if (rx || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz)));
  g.translate(x, y, z);
  return g;
};

function merge(list) {
  const clean = list.map((g) => (g.index ? g.toNonIndexed() : g));
  clean.forEach((g) => {
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  });
  return mergeGeometries(clean, false);
}

// Prop definitions: parts, collider, physical response.
// collider: { type: 'cyl', r, h } | { type: 'box', hx, hy, hz } (local, origin at ground)
// breakSpeed: m/s needed to snap it off; solid: static collider until broken.
export function buildPropTypes() {
  const T = {};
  // Street lamp: pole, curved arm toward road (+z local), lamp head.
  T.lamp = {
    parts: [
      { mat: 'metalDark', geo: merge([cyl(0.09, 0.14, 8.2, 0, 4.1, 0), cyl(0.18, 0.2, 0.5, 0, 0.25, 0), box(0.12, 0.12, 2.3, 0, 8.1, 1.1), box(0.55, 0.16, 0.95, 0, 8.05, 2.25)]) },
      { mat: 'lampLight', geo: box(0.42, 0.04, 0.8, 0, 7.96, 2.25) },
    ],
    collider: { type: 'cyl', r: 0.16, h: 8.2 }, breakSpeed: 8, solid: true, mass: 180, radius: 0.3, light: { x: 0, y: 7.9, z: 2.25 },
  };
  T.highwayLamp = {
    parts: [
      { mat: 'metalLight', geo: merge([cyl(0.1, 0.15, 9, 0, 4.5, 0), box(0.14, 0.14, 3.2, 0, 8.9, 1.5), box(0.5, 0.16, 1.0, 0, 8.85, 3.0)]) },
      { mat: 'lampLightCool', geo: box(0.4, 0.04, 0.85, 0, 8.76, 3.0) },
    ],
    collider: { type: 'cyl', r: 0.16, h: 9 }, breakSpeed: 9, solid: true, mass: 200, radius: 0.3, light: { x: 0, y: 8.7, z: 3.0 }, cool: true,
  };
  // Traffic signal: pole + mast arm over the road (+z) with a signal head.
  T.signal = {
    parts: [
      { mat: 'metalDark', geo: merge([cyl(0.12, 0.16, 6.4, 0, 3.2, 0), box(0.14, 0.14, 5.4, 0, 6.2, 2.7), box(0.45, 1.3, 0.4, 0, 5.4, 4.6), box(0.35, 0.9, 0.3, 0.3, 2.6, 0)]) },
    ],
    collider: { type: 'cyl', r: 0.18, h: 6.4 }, breakSpeed: 10, solid: true, mass: 220, radius: 0.3,
    bulbs: { x: 0, z: 4.6 - 0.21, ys: [5.82, 5.4, 4.98] },
  };
  T.bench = {
    parts: [
      { mat: 'wood', geo: merge([box(1.9, 0.08, 0.5, 0, 0.48, 0), box(1.9, 0.5, 0.06, 0, 0.78, -0.24, 0, -0.15)]) },
      { mat: 'metalDark', geo: merge([box(0.08, 0.48, 0.5, -0.8, 0.24, 0), box(0.08, 0.48, 0.5, 0.8, 0.24, 0)]) },
    ],
    collider: { type: 'box', hx: 0.95, hy: 0.45, hz: 0.3 }, breakSpeed: 3, solid: true, mass: 60, radius: 1.0,
  };
  T.bin = {
    parts: [{ mat: 'plastic', geo: merge([cyl(0.32, 0.28, 0.95, 0, 0.475, 0, 12), cyl(0.35, 0.35, 0.08, 0, 0.98, 0, 12)]), color: 0x2f5a3a }],
    collider: { type: 'cyl', r: 0.34, h: 1.0 }, breakSpeed: 1.5, solid: false, mass: 25, radius: 0.35,
  };
  T.hydrant = {
    parts: [{ mat: 'plastic', geo: merge([cyl(0.15, 0.17, 0.7, 0, 0.35, 0, 10), cyl(0.12, 0.15, 0.18, 0, 0.78, 0, 10), cyl(0.06, 0.06, 0.45, 0, 0.5, 0, 6, 0, Math.PI / 2)]), color: 0xc8261e }],
    collider: { type: 'cyl', r: 0.2, h: 0.85 }, breakSpeed: 2.5, solid: true, mass: 90, radius: 0.25, spray: true,
  };
  T.newsBox = {
    parts: [{ mat: 'plastic', geo: merge([box(0.5, 1.0, 0.45, 0, 0.6, 0), box(0.06, 0.1, 0.06, -0.2, 0.05, 0), box(0.06, 0.1, 0.06, 0.2, 0.05, 0)]), color: 0x2050a8 }],
    collider: { type: 'box', hx: 0.26, hy: 0.55, hz: 0.24 }, breakSpeed: 1.5, solid: false, mass: 30, radius: 0.35,
  };
  T.cone = {
    parts: [
      { mat: 'plastic', geo: merge([cyl(0.03, 0.2, 0.7, 0, 0.38, 0, 10), box(0.45, 0.04, 0.45, 0, 0.02, 0)]), color: 0xff5a10 },
    ],
    collider: { type: 'cyl', r: 0.22, h: 0.72 }, breakSpeed: 0.4, solid: false, mass: 4, radius: 0.25,
  };
  T.barrier = {
    parts: [
      { mat: 'stripe', geo: merge([box(2.0, 0.28, 0.06, 0, 0.9, 0), box(2.0, 0.28, 0.06, 0, 0.45, 0)]) },
      { mat: 'metalLight', geo: merge([box(0.06, 1.1, 0.5, -0.9, 0.55, 0), box(0.06, 1.1, 0.5, 0.9, 0.55, 0)]) },
    ],
    collider: { type: 'box', hx: 1.0, hy: 0.55, hz: 0.25 }, breakSpeed: 1.0, solid: false, mass: 20, radius: 1.0,
  };
  T.jersey = {
    parts: [{ mat: 'concrete', geo: merge([box(3.9, 0.35, 0.6, 0, 0.175, 0), box(3.9, 0.7, 0.24, 0, 0.7, 0)]) }],
    collider: { type: 'box', hx: 1.95, hy: 0.53, hz: 0.3 }, breakSpeed: 999, solid: true, mass: 1000, radius: 2.0,
  };
  T.busStop = {
    parts: [
      { mat: 'metalDark', geo: merge([box(0.08, 2.6, 0.08, -1.9, 1.3, -0.6), box(0.08, 2.6, 0.08, 1.9, 1.3, -0.6), box(0.08, 2.6, 0.08, -1.9, 1.3, 0.6), box(0.08, 2.6, 0.08, 1.9, 1.3, 0.6), box(4.1, 0.1, 1.5, 0, 2.62, 0), box(3.0, 0.08, 0.4, 0, 0.5, -0.4)]) },
      { mat: 'glass', geo: merge([box(3.8, 2.2, 0.03, 0, 1.3, -0.62), box(0.03, 2.2, 1.1, -1.9, 1.3, 0)]) },
      { mat: 'emissiveAd', geo: box(1.2, 1.7, 0.08, 1.85, 1.3, 0) },
    ],
    collider: { type: 'box', hx: 2.05, hy: 1.35, hz: 0.75 }, breakSpeed: 12, solid: true, mass: 300, radius: 2.1, glass: true,
  };
  T.palm = {
    parts: [
      { mat: 'trunk', geo: merge([cyl(0.16, 0.24, 4, 0, 2, 0, 8), cyl(0.13, 0.16, 4, 0.25, 5.9, 0, 8, 0, -0.12), cyl(0.11, 0.13, 2.5, 0.55, 8.9, 0, 8, 0, -0.2)]) },
      { mat: 'foliage', geo: palmFronds() },
    ],
    collider: { type: 'cyl', r: 0.25, h: 10 }, breakSpeed: 22, solid: true, mass: 400, radius: 0.35,
  };
  T.tree = {
    parts: [
      { mat: 'trunk', geo: cyl(0.14, 0.22, 3.2, 0, 1.6, 0, 8) },
      { mat: 'foliage', geo: merge([new THREE.IcosahedronGeometry(2.0, 1).translate(0, 4.2, 0), new THREE.IcosahedronGeometry(1.5, 1).translate(0.8, 5.0, 0.4)]) },
    ],
    collider: { type: 'cyl', r: 0.25, h: 3.5 }, breakSpeed: 18, solid: true, mass: 300, radius: 0.3,
  };
  T.pine = {
    parts: [
      { mat: 'trunk', geo: cyl(0.18, 0.3, 4, 0, 2, 0, 7) },
      { mat: 'pine', geo: merge([cyl(0.0, 2.6, 4.5, 0, 4.8, 0, 8), cyl(0.0, 2.0, 3.8, 0, 7.0, 0, 8), cyl(0.0, 1.3, 3.0, 0, 9.0, 0, 8)]) },
    ],
    collider: { type: 'cyl', r: 0.32, h: 4 }, breakSpeed: 30, solid: true, mass: 600, radius: 0.4,
  };
  T.fence = {
    parts: [{ mat: 'metalLight', geo: merge([box(3.0, 0.06, 0.06, 0, 1.6, 0), box(3.0, 0.06, 0.06, 0, 0.3, 0), box(0.06, 1.7, 0.06, -1.45, 0.85, 0), box(0.06, 1.7, 0.06, 1.45, 0.85, 0), ...[...Array(9)].map((_, i) => box(0.02, 1.3, 0.02, -1.2 + i * 0.3, 0.95, 0))]) }],
    collider: { type: 'box', hx: 1.5, hy: 0.85, hz: 0.1 }, breakSpeed: 2, solid: false, mass: 30, radius: 1.5,
  };
  T.stall = {
    parts: [
      { mat: 'wood', geo: merge([box(2.6, 1.0, 1.4, 0, 0.5, 0), box(0.08, 2.3, 0.08, -1.25, 1.65, 0.65), box(0.08, 2.3, 0.08, 1.25, 1.65, 0.65)]) },
      { mat: 'plastic', geo: box(3.0, 0.1, 1.9, 0, 2.6, 0.2, 0, 0.18), color: 0xd23a3a },
      { mat: 'emissiveAd', geo: box(2.2, 0.4, 0.06, 0, 2.35, 0.75) },
    ],
    collider: { type: 'box', hx: 1.4, hy: 1.2, hz: 0.8 }, breakSpeed: 6, solid: true, mass: 200, radius: 1.5,
  };
  T.parkedCar = {
    parts: [
      { mat: 'paint', geo: sedanBody() },
      { mat: 'darkGlass', geo: sedanGlass() },
      { mat: 'tire', geo: sedanWheels() },
      { mat: 'emissiveRed', geo: merge([box(0.35, 0.08, 0.04, -0.62, 0.78, 2.26), box(0.35, 0.08, 0.04, 0.62, 0.78, 2.26)]) },
    ],
    collider: { type: 'box', hx: 0.92, hy: 0.7, hz: 2.3, y: 0.75 }, breakSpeed: 999, solid: true, mass: 1400, radius: 2.4, car: true,
  };
  T.vent = {
    parts: [{ mat: 'metalDark', geo: merge([cyl(0.45, 0.45, 0.05, 0, 0.13, 0, 14)]) }],
    collider: null, breakSpeed: 999, solid: false, mass: 0, radius: 0.5, decor: true,
  };
  T.airStation = {
    parts: [
      { mat: 'metalLight', geo: merge([cyl(1.6, 1.8, 0.2, 0, 0.1, 0, 20), box(0.3, 2.4, 0.3, 1.7, 1.2, 0), box(0.6, 0.5, 0.4, 1.7, 2.3, 0)]) },
      { mat: 'airGlow', geo: merge([new THREE.TorusGeometry(1.45, 0.07, 6, 32).rotateX(Math.PI / 2).translate(0, 0.24, 0), new THREE.TorusGeometry(0.9, 0.05, 6, 24).rotateX(Math.PI / 2).translate(0, 0.24, 0), box(0.5, 0.3, 0.42, 1.7, 2.3, 0)]) },
    ],
    collider: null, breakSpeed: 999, solid: false, mass: 0, radius: 1.8, decor: true,
  };
  // V2 street detail.
  T.planter = {
    parts: [
      { mat: 'concrete', geo: box(2.4, 0.6, 1.0, 0, 0.3, 0) },
      { mat: 'foliage', geo: merge([new THREE.IcosahedronGeometry(0.55, 0).translate(-0.6, 0.85, 0), new THREE.IcosahedronGeometry(0.6, 0).translate(0.2, 0.9, 0.05), new THREE.IcosahedronGeometry(0.5, 0).translate(0.85, 0.8, -0.05)]) },
    ],
    // Heavy: lines the curb in dense areas so the car stays on the road.
    collider: { type: 'box', hx: 1.2, hy: 0.45, hz: 0.5 }, breakSpeed: 999, solid: true, mass: 900, radius: 1.2,
  };
  T.bollard = {
    parts: [{ mat: 'metalDark', geo: merge([cyl(0.12, 0.14, 0.95, 0, 0.475, 0, 10), cyl(0.15, 0.15, 0.08, 0, 0.7, 0, 10)]) }],
    collider: { type: 'cyl', r: 0.14, h: 0.95 }, breakSpeed: 999, solid: true, mass: 400, radius: 0.2,
  };
  T.bike = {
    parts: [
      { mat: 'tire', geo: merge([new THREE.TorusGeometry(0.33, 0.035, 6, 16).translate(-0.52, 0.36, 0), new THREE.TorusGeometry(0.33, 0.035, 6, 16).translate(0.52, 0.36, 0)]).rotateY(Math.PI / 2) },
      { mat: 'paint', geo: merge([box(0.04, 0.04, 1.0, 0, 0.62, 0, 0, 0.5), box(0.04, 0.5, 0.04, 0, 0.6, -0.25), box(0.04, 0.04, 0.5, 0, 0.82, 0.25), box(0.4, 0.04, 0.04, 0, 0.95, 0.5), box(0.12, 0.05, 0.22, 0, 0.86, -0.28)]), color: 0x2a8ae0 },
    ],
    collider: { type: 'box', hx: 0.15, hy: 0.5, hz: 0.85 }, breakSpeed: 0.8, solid: false, mass: 14, radius: 0.85,
  };
  T.bikeRack = {
    parts: [{ mat: 'metalLight', geo: merge([...[0, 1, 2, 3].map((i) => new THREE.TorusGeometry(0.4, 0.03, 5, 12, Math.PI).translate(-1.2 + i * 0.8, 0.02, 0))]) }],
    collider: { type: 'box', hx: 1.5, hy: 0.4, hz: 0.1 }, breakSpeed: 3, solid: true, mass: 80, radius: 1.5,
  };
  T.kiosk = {
    parts: [
      { mat: 'metalDark', geo: merge([box(1.6, 2.2, 1.4, 0, 1.1, 0), box(2.0, 0.12, 1.8, 0, 2.6, 0)]) },
      { mat: 'emissiveAd', geo: merge([box(1.3, 0.8, 0.05, 0, 1.5, 0.72), box(1.3, 0.35, 0.05, 0, 2.38, 0.72)]) },
    ],
    collider: { type: 'box', hx: 0.85, hy: 1.3, hz: 0.75 }, breakSpeed: 10, solid: true, mass: 350, radius: 1.1,
  };
  T.acUnit = {
    parts: [{ mat: 'metalLight', geo: merge([box(1.0, 0.7, 0.6, 0, 0.35, 0), cyl(0.25, 0.25, 0.05, 0, 0.4, 0.31, 12, Math.PI / 2)]) }],
    collider: null, breakSpeed: 999, solid: false, mass: 0, radius: 0.6, decor: true,
  };
  T.mailbox = {
    parts: [{ mat: 'plastic', geo: merge([box(0.5, 0.9, 0.45, 0, 0.75, 0), box(0.1, 0.35, 0.1, 0, 0.17, 0)]), color: 0xc8a020 }],
    collider: { type: 'box', hx: 0.26, hy: 0.6, hz: 0.24 }, breakSpeed: 1.5, solid: false, mass: 30, radius: 0.35,
  };
  T.charger = {
    parts: [
      { mat: 'metalLight', geo: merge([box(0.6, 1.8, 0.45, 0, 0.9, 0), box(0.8, 0.12, 0.6, 0, 1.86, 0)]) },
      { mat: 'airGlow', geo: merge([box(0.42, 0.5, 0.05, 0, 1.3, 0.24), box(0.08, 1.4, 0.05, -0.26, 0.8, 0.24), box(0.08, 1.4, 0.05, 0.26, 0.8, 0.24)]) },
    ],
    collider: { type: 'box', hx: 0.32, hy: 0.95, hz: 0.25 }, breakSpeed: 999, solid: true, mass: 500, radius: 0.5,
  };
  T.policeCar = {
    parts: [
      { mat: 'paint', geo: sedanBody(), color: 0xf2f2f2 },
      { mat: 'darkGlass', geo: sedanGlass() },
      { mat: 'tire', geo: sedanWheels() },
      { mat: 'metalDark', geo: merge([box(1.84, 0.06, 1.9, 0, 0.9, -1.4), box(1.84, 0.06, 1.0, 0, 0.9, 1.95)]) },
      { mat: 'emissiveRed', geo: box(0.55, 0.14, 0.3, -0.32, 1.52, 0.05) },
      { mat: 'lightBlue', geo: box(0.55, 0.14, 0.3, 0.32, 1.52, 0.05) },
    ],
    collider: { type: 'box', hx: 0.92, hy: 0.7, hz: 2.3, y: 0.75 }, breakSpeed: 999, solid: true, mass: 1400, radius: 2.4, car: true,
  };
  for (const k in T) T[k].name = k;
  return T;
}

function palmFronds() {
  const list = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const g = new THREE.PlaneGeometry(0.7, 3.4, 1, 3);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const y = pos.getY(k);
      pos.setZ(k, -((y + 1.7) ** 2) * 0.12);
    }
    g.rotateX(-Math.PI / 2 + 0.35);
    g.translate(0, 0, 1.6);
    g.rotateY(a);
    g.translate(0.7, 10.1, 0);
    list.push(g);
  }
  return merge(list);
}

function sedanBody() {
  // Generic sedan, length 4.6, width 1.84, origin at ground.
  const shape = new THREE.Shape();
  const pts = [[-2.3, 0.3], [-2.3, 0.85], [-1.6, 0.98], [-0.9, 1.0], [-0.5, 1.42], [0.85, 1.44], [1.5, 1.05], [2.3, 0.95], [2.3, 0.3]];
  shape.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) shape.lineTo(p[0], p[1]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1.84, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 });
  g.translate(0, 0, -0.92);
  g.rotateY(-Math.PI / 2);
  return g;
}
function sedanGlass() {
  const shape = new THREE.Shape();
  const pts = [[-0.88, 1.03], [-0.48, 1.4], [0.82, 1.42], [1.45, 1.07]];
  shape.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) shape.lineTo(p[0], p[1]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1.9, bevelEnabled: false });
  g.translate(0, 0, -0.95);
  g.rotateY(-Math.PI / 2);
  return g;
}
function sedanWheels() {
  const list = [];
  for (const [x, z] of [[-0.82, -1.45], [0.82, -1.45], [-0.82, 1.4], [0.82, 1.4]]) list.push(cyl(0.34, 0.34, 0.24, x, 0.34, z, 14, 0, Math.PI / 2));
  return merge(list);
}

// Light pool decal (additive) placed under lamps on the road / sidewalk.
export function lightPoolMaterial(color = 0xffb066, strength = 0.55) {
  return new THREE.MeshBasicMaterial({
    map: Tex.radial('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 128),
    color: new THREE.Color(color).multiplyScalar(strength),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    fog: true,
  });
}

// Soft volumetric light cone under lamps.
export function lightConeMaterial(color = 0xffb066) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, strength: { value: 0.12 } },
    vertexShader: /* glsl */ `
      varying float vH;
      varying vec3 vN;
      varying vec3 vV;
      varying float vDist;
      void main() {
        vH = uv.y;
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        vDist = distance(cameraPosition, wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float strength;
      varying float vH;
      varying vec3 vN;
      varying vec3 vV;
      varying float vDist;
      void main() {
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
        float a = strength * edge * pow(vH, 1.6) * smoothstep(240.0, 70.0, vDist);
        gl_FragColor = vec4(color * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}
