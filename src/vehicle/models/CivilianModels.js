// Civilian traffic cars: sedan, hatchback, SUV and van built with the loft body builder,
// merged into one vertex-coloured mesh per type (paint tinted per car), plus a shared
// lights mesh and four wheels. Cheap enough for dozens of cars.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildBody } from './BodyBuilder.js';
import { sedanDesign } from './PoliceModels.js';

export const CIVILIAN_TYPES = {
  sedan: { design: { length: 4.7, roof: 1.45, hood: 0.9, trunk: 0.98, halfWidth: 0.9, frontAxle: -1.4, rearAxle: 1.35 }, wheelR: 0.33 },
  hatch: { design: { length: 4.1, roof: 1.5, hood: 0.88, trunk: 1.15, halfWidth: 0.87, frontAxle: -1.25, rearAxle: 1.25, windshieldBase: -0.75, windshieldTop: -0.2, rearWindowTop: 0.95, rearWindowBase: 1.75 }, wheelR: 0.31 },
  suv: { design: { length: 4.8, roof: 1.78, hood: 1.08, trunk: 1.22, halfWidth: 0.95, frontAxle: -1.45, rearAxle: 1.4, clearance: 0.28, windshieldBase: -0.85, windshieldTop: -0.3, rearWindowTop: 1.4, rearWindowBase: 2.1, wheelR: 0.38 }, wheelR: 0.38 },
  van: { design: { length: 5.1, roof: 2.05, hood: 1.0, trunk: 1.9, halfWidth: 0.98, frontAxle: -1.75, rearAxle: 1.6, clearance: 0.24, windshieldBase: -1.6, windshieldTop: -1.05, rearWindowTop: 2.2, rearWindowBase: 2.4, wheelR: 0.36 }, wheelR: 0.36 },
};

export const CAR_COLORS = [0xb8bcc2, 0x1d1f24, 0xe8e8e4, 0x6a1010, 0x16305a, 0x4a4e56, 0x7a6a50, 0x2e4a32, 0xc0a020, 0x8a2a5a, 0x2a6a8a, 0xd06020];

const built = new Map();
const PART_COLORS = {
  body: [1, 1, 1], hood: [1, 1, 1], roof: [1, 1, 1], trim: [0.04, 0.04, 0.045], glass: [0.06, 0.07, 0.08],
};

function colorize(geo, rgb) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set(rgb, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

// Shared per-type geometry (body + lights + wheel), ground at y = 0.
function typeGeometry(type) {
  if (built.has(type)) return built.get(type);
  const t = CIVILIAN_TYPES[type];
  const d = sedanDesign({ ...t.design, wheelR: t.wheelR });
  const b = buildBody(d);
  const parts = [];
  for (const [mat, g] of Object.entries(b.geometries)) parts.push(colorize(g, PART_COLORS[mat] || [1, 1, 1]));
  for (const g of Object.values(b.doors)) {
    const right = colorize(g, [1, 1, 1]);
    const left = right.clone();
    left.scale(-1, 1, 1);
    // Flip winding for the mirrored copy.
    const p = left.attributes.position.array;
    for (let i = 0; i < p.length; i += 9) {
      for (let k = 0; k < 3; k++) {
        const tmp = p[i + 3 + k];
        p[i + 3 + k] = p[i + 6 + k];
        p[i + 6 + k] = tmp;
      }
    }
    left.computeVertexNormals();
    parts.push(right, left);
  }
  // Arch liners (dark).
  for (const a of d.arches) {
    const g = new THREE.CylinderGeometry(a.r - 0.01, a.r - 0.01, d.lines.max.w[5] * 2 + 0.02, 14, 1, true, -Math.PI / 2 - 1.3, 2.6);
    g.rotateZ(Math.PI / 2);
    g.translate(0, a.y, a.z);
    const inv = g.index ? g.toNonIndexed() : g;
    // Render the inside faces: reverse winding.
    const p = inv.attributes.position.array;
    for (let i = 0; i < p.length; i += 9) {
      for (let k = 0; k < 3; k++) {
        const tmp = p[i + 3 + k];
        p[i + 3 + k] = p[i + 6 + k];
        p[i + 6 + k] = tmp;
      }
    }
    inv.computeVertexNormals();
    parts.push(colorize(inv, [0.02, 0.02, 0.02]));
  }
  const body = mergeGeometries(parts.map((g) => {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    return g;
  }), false);
  body.computeBoundingSphere();
  // Lights.
  const L = t.design.length / 2;
  const lights = [];
  const hy = t.design.hood - 0.15;
  for (const s of [-1, 1]) {
    const h = new THREE.BoxGeometry(0.3, 0.08, 0.04);
    h.translate(s * (t.design.halfWidth - 0.25), hy, -L - 0.01);
    lights.push(colorize(h, [1, 0.95, 0.85]));
    const r = new THREE.BoxGeometry(0.32, 0.09, 0.04);
    r.translate(s * (t.design.halfWidth - 0.24), Math.min(t.design.trunk, 1.1) - 0.12, L + 0.01);
    lights.push(colorize(r, [1, 0.05, 0.04]));
  }
  const lightsGeo = mergeGeometries(lights, false);
  // Wheel: tyre + hubcap.
  const tire = new THREE.CylinderGeometry(t.wheelR, t.wheelR, 0.22, 16);
  tire.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(t.wheelR * 0.62, t.wheelR * 0.62, 0.23, 10);
  hub.rotateZ(Math.PI / 2);
  const wheelGeo = mergeGeometries([colorize(tire, [0.05, 0.05, 0.055]), colorize(hub, [0.55, 0.57, 0.6])], false);
  const res = { body, lights: lightsGeo, wheel: wheelGeo, design: d, wheelR: t.wheelR };
  built.set(type, res);
  return res;
}

const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.5, 2.5, 2.5) });
const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.3 });
const paintMats = new Map();
function paintMat(color) {
  if (!paintMats.has(color)) {
    paintMats.set(color, new THREE.MeshPhysicalMaterial({ vertexColors: true, color, metalness: 0.55, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.1 }));
  }
  return paintMats.get(color);
}

export class CivilianModel {
  constructor(type = 'sedan', color = CAR_COLORS[0]) {
    const g = typeGeometry(type);
    this.type = type;
    this.root = new THREE.Group();
    this.body = new THREE.Mesh(g.body, paintMat(color));
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.root.add(this.body);
    this.lights = new THREE.Mesh(g.lights, lightMat);
    this.root.add(this.lights);
    this.wheels = [];
    const d = g.design;
    for (const a of d.arches) {
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(g.wheel, wheelMat);
        w.position.set(s * (d.lines.max.w[5] - 0.14), g.wheelR, a.z);
        w.castShadow = true;
        this.root.add(w);
        this.wheels.push(w);
      }
    }
    this.halfLength = CIVILIAN_TYPES[type].design.length / 2;
    this.halfWidth = CIVILIAN_TYPES[type].design.halfWidth;
    this.height = CIVILIAN_TYPES[type].design.roof;
    this.wheelR = g.wheelR;
    this.spin = 0;
  }

  update(dt, speed, near) {
    this.spin += (speed / this.wheelR) * dt;
    for (const w of this.wheels) {
      w.visible = near;
      w.rotation.x = -this.spin;
    }
  }
}
