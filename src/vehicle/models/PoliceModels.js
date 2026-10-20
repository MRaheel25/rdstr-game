// Halcyon Bay Police fleet: Patrol Cruiser, Interceptor, Armored SWAT truck, helicopter
// and pursuit drone. Cruisers and interceptors are lofted sedan/coupe bodies; every unit
// has a strobing red/blue light bar that the AI system can tie to real lights.
import * as THREE from 'three';
import { CarVisual } from '../CarVisual.js';
import { buildBody } from './BodyBuilder.js';
import { makeWheel } from './Wheels.js';
import { carMat } from './CarMaterials.js';
import { textTexture } from '../../world/Textures.js';
import { mergeByMaterial, bakeLOD } from './MergeUtils.js';

// Generic four-door sedan / coupe design (ground y = 0, front = -z).
export function sedanDesign(o = {}) {
  const L = o.length ?? 5.0;
  const hl = L / 2;
  const W = o.halfWidth ?? 0.95;
  const roof = o.roof ?? 1.47;
  const hood = o.hood ?? 0.93;
  const trunk = o.trunk ?? 1.0;
  const fa = o.frontAxle ?? -1.45;
  const ra = o.rearAxle ?? 1.4;
  const ws0 = o.windshieldBase ?? -0.85;
  const ws1 = o.windshieldTop ?? -0.25;
  const rw0 = o.rearWindowTop ?? 0.75;
  const rw1 = o.rearWindowBase ?? 1.35;
  const Z = [-hl, -hl + 0.08, -hl + 0.25, fa - 0.45, fa, ws0 - 0.2, ws0, ws1, 0.2, rw0, rw1, ra, ra + 0.45, hl - 0.2, hl]
    .filter((z) => z >= -hl && z <= hl)
    .sort((a, b) => a - b)
    .filter((z, i, arr) => i === 0 || z - arr[i - 1] > 0.03);
  const n = Z.length;
  const arr = (f) => Z.map((z, i) => f(z, i));
  const taper = (z) => {
    // 0 in the middle, 1 at the very ends.
    const t = Math.max(0, (Math.abs(z) - (hl - 0.5)) / 0.5);
    return t * t;
  };
  const sideY = (base, endDrop) => arr((z) => base - taper(z) * endDrop);
  const cabin = (z) => z >= ws0 && z <= rw1;
  const centerY = arr((z) => {
    if (z <= ws0) return hood + (1 - taper(z)) * 0.02 - taper(z) * 0.08;
    if (z <= ws1) return hood + ((z - ws0) / (ws1 - ws0)) * (roof - hood);
    if (z <= rw0) return roof + 0.01;
    if (z <= rw1) return roof - ((z - rw0) / (rw1 - rw0)) * (roof - trunk);
    return trunk - taper(z) * 0.08;
  });
  return {
    z: Z,
    zStep: 0.09,
    lines: {
      bottom: { w: arr((z) => W - 0.08 - taper(z) * 0.12), y: arr(() => o.clearance ?? 0.2) },
      sill: { w: arr((z) => W - 0.03 - taper(z) * 0.1), y: sideY(0.34, 0.04) },
      max: { w: arr((z) => W - taper(z) * 0.1), y: sideY(0.64, 0.06) },
      shoulder: { w: arr((z) => W - 0.02 - taper(z) * 0.12), y: sideY(hood - 0.06, 0.1) },
      belt: { w: arr((z) => W - 0.06 - taper(z) * 0.14), y: arr((z, i) => (cabin(z) ? hood + 0.02 : centerY[i] - 0.03)) },
      inner: { w: arr((z) => W - 0.1 - taper(z) * 0.14), y: arr((z, i) => (cabin(z) ? hood + 0.04 : centerY[i] - 0.01)) },
      roofSide: { w: arr((z) => (cabin(z) ? W - 0.24 : W - 0.3)), y: arr((z, i) => (cabin(z) ? Math.min(roof - 0.05, Math.max(hood + 0.05, centerY[i] - 0.05)) : centerY[i])) },
      center: { y: centerY },
    },
    order: ['bottom', 'sill', 'max', 'shoulder', 'belt', 'inner', 'center'],
    bands: [
      { a: 'bottom', b: 'sill', mat: 'trim', arches: true, steps: 1 },
      { a: 'sill', b: 'max', mat: 'body', arches: true, steps: 2, bulge: 0.01 },
      { a: 'max', b: 'shoulder', mat: 'body', arches: true, steps: 2, bulge: 0.01 },
      { a: 'shoulder', b: 'belt', mat: 'body', arches: true, steps: 1 },
    ],
    top: [
      { a: 'belt', b: 'inner', mat: 'body', steps: 1 },
      { a: 'inner', b: 'center', mat: 'hood', steps: 3, crown: 0.02, zRange: [Z[0], ws0] },
      { a: 'inner', b: 'roofSide', mat: 'glass', steps: 2, crown: 0.02, zRange: [ws0, rw1] },
      { a: 'roofSide', b: 'center', mat: 'glass', steps: 2, crown: 0.01, zRange: [ws0, ws1] },
      { a: 'roofSide', b: 'center', mat: 'roof', steps: 2, crown: 0.015, zRange: [ws1, rw0] },
      { a: 'roofSide', b: 'center', mat: 'glass', steps: 2, crown: 0.01, zRange: [rw0, rw1] },
      { a: 'inner', b: 'center', mat: 'hood', steps: 3, crown: 0.015, zRange: [rw1, Z[n - 1]] },
    ],
    arches: [{ z: fa, y: o.wheelR ?? 0.36, r: (o.wheelR ?? 0.36) + 0.08 }, { z: ra, y: o.wheelR ?? 0.36, r: (o.wheelR ?? 0.36) + 0.08 }],
    door: { z0: ws0 + 0.05, z1: rw0 + 0.2, bands: [1, 2, 3] },
    frontCapMat: 'trim',
    rearCapMat: 'trim',
  };
}

// Red/blue strobe pattern shared by all units.
export class LightBar {
  constructor(width = 1.2, height = 0.11) {
    this.group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(width + 0.06, height * 0.6, 0.32), carMat('black'));
    this.group.add(base);
    this.red = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    this.blue = new THREE.MeshBasicMaterial({ color: 0x0030ff });
    this.white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const seg = width / 4;
    for (let k = 0; k < 4; k++) {
      const mat = k < 2 ? this.red : this.blue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(seg - 0.03, height, 0.28), mat);
      m.position.set(-width / 2 + seg * (k + 0.5), height * 0.45, 0);
      this.group.add(m);
    }
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.12, height * 0.7, 0.29), this.white);
    w.position.y = height * 0.4;
    this.group.add(w);
    this.phase = Math.random() * 10;
    this.on = true;
    this.redLevel = 0;
    this.blueLevel = 0;
  }

  update(dt, on = true) {
    this.phase += dt;
    this.on = on;
    // Alternating double flashes.
    const t = (this.phase * 2.2) % 1;
    const flash = (a, b) => (t > a && t < b ? 1 : 0);
    const r = on ? Math.max(flash(0.0, 0.1), flash(0.16, 0.26)) : 0;
    const b = on ? Math.max(flash(0.5, 0.6), flash(0.66, 0.76)) : 0;
    this.redLevel = r;
    this.blueLevel = b;
    this.red.color.setRGB(1, 0.05, 0.03).multiplyScalar(0.35 + r * 9);
    this.blue.color.setRGB(0.05, 0.25, 1).multiplyScalar(0.35 + b * 10);
    this.white.color.setRGB(1, 1, 1).multiplyScalar(on ? 0.4 + flash(0.33, 0.38) * 6 : 0.3);
  }
}

function decal(text, w, h, opts) {
  const tex = textTexture(text, { w: 1024, h: Math.round((1024 * h) / w), color: opts.color || '#0a0a0a', font: opts.font || 'bold 110px Arial', bg: null });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  return m;
}

class LoftedCar extends CarVisual {
  constructor(cfg, design, mats, groundY) {
    super(cfg);
    this.design = design;
    const shell = new THREE.Group();
    shell.position.y = groundY;
    this.body.add(shell);
    this.shell = shell;
    const built = buildBody(design);
    this.sampler = built.sample;
    for (const [mat, geo] of Object.entries(built.geometries)) {
      const m = new THREE.Mesh(geo, mats[mat] || carMat('black'));
      m.castShadow = true;
      shell.add(m);
    }
    // Doors (static on police units, mirrored to both sides).
    for (const [mat, geo] of Object.entries(built.doors)) {
      const g = geo.clone();
      for (const side of [1, -1]) {
        const m = new THREE.Mesh(g, mats.door || mats[mat] || carMat('black'));
        if (side < 0) m.scale.x = -1;
        m.castShadow = true;
        shell.add(m);
      }
    }
    // Arch liners.
    for (const a of design.arches) {
      const g = new THREE.CylinderGeometry(a.r - 0.01, a.r - 0.01, 1.3, 20, 1, true, -Math.PI / 2 - 1.3, 2.6);
      g.rotateZ(Math.PI / 2);
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x050505, side: THREE.BackSide }));
      m.position.set(0, a.y, a.z);
      shell.add(m);
    }
  }

  // Bake a single-mesh stand-in for distant rendering (light bars stay live).
  makeLOD() {
    if (this.lightBar) this.lightBar.group.userData.noBake = true;
    this.lod = bakeLOD(this.root);
    this.lod.visible = false;
    this.root.add(this.lod);
    this.detailed = true;
  }

  setDetail(near) {
    if (!this.lod || near === this.detailed) return;
    this.detailed = near;
    this.lod.visible = !near;
    this.body.traverse((o) => {
      if (o.isMesh && !o.parent.userData.noBake && !o.userData.noBake) {
        let inBar = false;
        o.traverseAncestors((a) => {
          if (a.userData.noBake) inBar = true;
        });
        if (!inBar) o.visible = near;
      }
    });
    for (const p of this.wheelPivots) p.visible = near;
  }
}

export class CruiserModel extends LoftedCar {
  constructor(cfg, unit = 7) {
    const black = new THREE.MeshPhysicalMaterial({ color: 0x0c0d10, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 });
    const white = new THREE.MeshPhysicalMaterial({ color: 0xf0f0ec, metalness: 0.2, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.05 });
    const design = sedanDesign({});
    const G = -0.52;
    super(cfg, design, { body: black, hood: black, roof: white, door: white, trim: carMat('black'), glass: carMat('glassDark') }, G);
    const S = this.sampler;
    const shell = this.shell;
    // Livery text on both doors.
    const zMid = (design.door.z0 + design.door.z1) / 2;
    for (const side of [1, -1]) {
      const d = decal('HALCYON BAY POLICE', 1.6, 0.2, { font: 'bold 92px Arial' });
      d.position.set(side * (S.max.w(zMid) + 0.015), 0.68, zMid);
      d.rotation.y = side * Math.PI / 2;
      shell.add(d);
      const num = decal(String(unit).padStart(2, '0'), 0.32, 0.22, { font: 'bold 150px Arial' });
      num.position.set(side * (S.max.w(1.9) + 0.012), 0.72, 1.9);
      num.rotation.y = side * Math.PI / 2;
      shell.add(num);
    }
    const roofNum = decal(String(unit).padStart(2, '0'), 0.7, 0.5, { font: 'bold 300px Arial' });
    roofNum.rotation.x = -Math.PI / 2;
    roofNum.position.set(0, 1.49, 0.45);
    shell.add(roofNum);
    // Light bar on the roof.
    this.lightBar = new LightBar(1.25, 0.11);
    this.lightBar.group.position.set(0, 1.5, -0.05);
    shell.add(this.lightBar.group);
    // Push bar.
    const pb = new THREE.Group();
    for (const x of [-0.42, 0.42]) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.07), carMat('black'));
      v.position.set(x, 0.55, -2.58);
      pb.add(v);
    }
    for (const y of [0.4, 0.78]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.07, 0.07), carMat('black'));
      h.position.set(0, y, -2.6);
      pb.add(h);
    }
    shell.add(mergeByMaterial(pb));
    this.addLamps(shell, -2.5, 2.5, 0.78);
    this.setupWheels((i, w) => makeWheel(w.radius, 0.26, 'police'));
    this.makeLOD();
  }

  addLamps(shell, zF, zR, y) {
    this.head = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.95, 0.85).multiplyScalar(4) });
    this.tail = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.05, 0.05).multiplyScalar(2.5) });
    for (const side of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.03), this.head);
      h.position.set(side * 0.62, y, zF - 0.005);
      shell.add(h);
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.03), this.tail);
      t.position.set(side * 0.62, y + 0.06, zR + 0.005);
      shell.add(t);
    }
  }

  update(dt, v, ctx = {}) {
    super.update(dt, v);
    this.lightBar.update(dt, ctx.sirens !== false && !v.wrecked);
    if (this.tail) this.tail.color.setRGB(1, 0.05, 0.05).multiplyScalar(v.braking ? 7 : 2.5);
  }
}

export class InterceptorModel extends LoftedCar {
  constructor(cfg, unit = 21) {
    const matte = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, metalness: 0.45, roughness: 0.62 });
    const design = sedanDesign({ length: 4.8, roof: 1.27, hood: 0.84, trunk: 0.95, halfWidth: 0.97, windshieldBase: -0.7, windshieldTop: -0.05, rearWindowTop: 0.55, rearWindowBase: 1.3, clearance: 0.16 });
    const G = -0.5;
    super(cfg, design, { body: matte, hood: matte, roof: matte, door: matte, trim: carMat('black'), glass: carMat('glassDark') }, G);
    const S = this.sampler;
    const shell = this.shell;
    const zMid = (design.door.z0 + design.door.z1) / 2;
    for (const side of [1, -1]) {
      const d = decal('POLICE', 0.9, 0.16, { color: '#3a3d44', font: 'bold 150px Arial' });
      d.position.set(side * (S.max.w(zMid) + 0.015), 0.55, zMid);
      d.rotation.y = side * Math.PI / 2;
      shell.add(d);
      // Blue under-glow strip.
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 3.4), carMat('underglow'));
      g.position.set(side * (S.sill.w(0) - 0.05), 0.2, 0);
      shell.add(g);
    }
    // Under-glow pool on the ground.
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.4), new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x2050ff).multiplyScalar(0.6), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false,
      map: radialTex(),
    }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.03;
    shell.add(pool);
    // Hidden strobes in the grille and rear window instead of a roof bar.
    this.lightBar = new LightBar(0.9, 0.05);
    this.lightBar.group.position.set(0, 0.6, -2.42);
    this.lightBar.group.scale.set(1, 1, 0.2);
    shell.add(this.lightBar.group);
    this.rearBar = new LightBar(0.8, 0.04);
    this.rearBar.group.position.set(0, 1.18, 0.95);
    this.rearBar.group.scale.set(1, 1, 0.2);
    shell.add(this.rearBar.group);
    CruiserModel.prototype.addLamps.call(this, shell, -2.4, 2.4, 0.66);
    this.setupWheels((i, w) => makeWheel(w.radius, 0.3, 'aero'));
    this.rearBar.group.userData.noBake = true;
    this.makeLOD();
  }

  update(dt, v, ctx = {}) {
    super.update(dt, v);
    const on = ctx.sirens !== false && !v.wrecked;
    this.lightBar.update(dt, on);
    this.rearBar.update(dt, on);
    if (this.tail) this.tail.color.setRGB(1, 0.05, 0.05).multiplyScalar(v.braking ? 7 : 2.5);
  }
}

let _radial = null;
function radialTex() {
  if (_radial) return _radial;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 64, 0, 32, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 128);
  _radial = new THREE.CanvasTexture(c);
  return _radial;
}

// Armored SWAT truck: heavy chamfered boxes, battering ram, roof bar.
export class SwatModel extends CarVisual {
  constructor(cfg, unit = 4) {
    super(cfg);
    const G = -0.72;
    const shell = new THREE.Group();
    shell.position.y = G;
    this.body.add(shell);
    const navy = new THREE.MeshPhysicalMaterial({ color: 0x141a26, metalness: 0.5, roughness: 0.45, clearcoat: 0.5 });
    const chamferBox = (w, h, d, bevel = 0.12) => {
      const s = new THREE.Shape();
      const hw = w / 2;
      const hh = h / 2;
      s.moveTo(-hw + bevel, -hh);
      s.lineTo(hw - bevel, -hh);
      s.lineTo(hw, -hh + bevel);
      s.lineTo(hw, hh - bevel);
      s.lineTo(hw - bevel, hh);
      s.lineTo(-hw + bevel, hh);
      s.lineTo(-hw, hh - bevel);
      s.lineTo(-hw, -hh + bevel);
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 });
      g.translate(0, 0, -d / 2);
      return g;
    };
    // Lower chassis / cab / armored box.
    const lower = new THREE.Mesh(chamferBox(2.4, 1.0, 6.2, 0.1), navy);
    lower.position.set(0, 0.95, 0);
    const cab = new THREE.Mesh(chamferBox(2.3, 1.1, 2.0, 0.25), navy);
    cab.position.set(0, 1.95, -1.9);
    const boxBody = new THREE.Mesh(chamferBox(2.36, 1.5, 3.9, 0.12), navy);
    boxBody.position.set(0, 2.15, 1.0);
    for (const m of [lower, cab, boxBody]) {
      m.castShadow = true;
      shell.add(m);
    }
    // Windows (small armored slits).
    const glass = carMat('glassDark');
    const ws = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 0.05), glass);
    ws.position.set(0, 2.15, -2.95);
    ws.rotation.x = -0.25;
    shell.add(ws);
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 1.0), glass);
      w.position.set(side * 1.2, 2.15, -1.9);
      shell.add(w);
      const t = decal('SWAT', 1.6, 0.6, { color: '#e8e8e8', font: 'bold 400px Arial' });
      t.position.set(side * 1.25, 2.2, 1.0);
      t.rotation.y = side * Math.PI / 2;
      shell.add(t);
      const t2 = decal('HALCYON BAY POLICE', 2.6, 0.2, { color: '#cfd3da', font: 'bold 92px Arial' });
      t2.position.set(side * 1.25, 1.55, 1.0);
      t2.rotation.y = side * Math.PI / 2;
      shell.add(t2);
    }
    // Battering ram / push bar.
    const ram = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.6, 0.25), carMat('black'));
    ram.position.set(0, 0.85, -3.4);
    shell.add(ram);
    for (const x of [-0.8, 0, 0.8]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.3), carMat('black'));
      r.position.set(x, 1.0, -3.3);
      shell.add(r);
    }
    this.lightBar = new LightBar(1.8, 0.14);
    this.lightBar.group.position.set(0, 2.58, -1.9);
    shell.add(this.lightBar.group);
    this.head = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.95, 0.85).multiplyScalar(4) });
    for (const side of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.04), this.head);
      h.position.set(side * 0.8, 1.25, -3.12);
      shell.add(h);
    }
    this.setupWheels((i, w) => makeWheel(w.radius, 0.42, 'truck'));
    LoftedCar.prototype.makeLOD.call(this);
  }

  update(dt, v, ctx = {}) {
    super.update(dt, v);
    this.lightBar.update(dt, ctx.sirens !== false && !v.wrecked);
  }

  setDetail(near) {
    LoftedCar.prototype.setDetail.call(this, near);
  }
}

// Police helicopter with spinning rotors and a steerable searchlight.
export class HelicopterModel {
  constructor() {
    this.root = new THREE.Group();
    const black = new THREE.MeshPhysicalMaterial({ color: 0x0d0e11, metalness: 0.5, roughness: 0.35, clearcoat: 1 });
    const white = new THREE.MeshPhysicalMaterial({ color: 0xeeeeea, metalness: 0.2, roughness: 0.35, clearcoat: 1 });
    // Fuselage: lathe teardrop along z.
    const prof = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const r = Math.sin(Math.PI * Math.pow(t, 0.8)) * 1.15 * (1 - t * 0.25);
      prof.push(new THREE.Vector2(Math.max(0.02, r), -2.3 + t * 4.6));
    }
    const fg = new THREE.LatheGeometry(prof, 20);
    fg.rotateX(Math.PI / 2);
    const fus = new THREE.Mesh(fg, black);
    fus.scale.set(1, 0.95, 1);
    this.root.add(fus);
    const belly = new THREE.Mesh(fg, white);
    belly.scale.set(1.01, 0.5, 1.01);
    belly.position.y = -0.35;
    this.root.add(belly);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), carMat('glassDark'));
    canopy.rotation.x = -Math.PI / 2 + 0.35;
    canopy.position.set(0, 0.1, -1.6);
    this.root.add(canopy);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 5.2, 10), black);
    boom.rotation.x = Math.PI / 2;
    boom.position.set(0, 0.35, 4.3);
    this.root.add(boom);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 0.8), black);
    fin.position.set(0, 0.95, 6.7);
    this.root.add(fin);
    this.tailRotor = new THREE.Group();
    this.tailRotor.position.set(0.18, 1.0, 6.75);
    for (let k = 0; k < 2; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.4, 0.12), carMat('black'));
      b.rotation.x = k * Math.PI / 2;
      this.tailRotor.add(b);
    }
    this.root.add(this.tailRotor);
    this.rotor = new THREE.Group();
    this.rotor.position.set(0, 1.35, 0);
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 5.2), carMat('black'));
      b.position.z = 2.6;
      const h = new THREE.Group();
      h.rotation.y = (k / 4) * Math.PI * 2;
      h.add(b);
      this.rotor.add(h);
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(5.3, 32), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2;
    this.rotor.add(disc);
    this.root.add(this.rotor);
    for (const side of [-1, 1]) {
      const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 8), carMat('chrome'));
      skid.rotation.x = Math.PI / 2;
      skid.position.set(side * 0.9, -1.25, -0.1);
      this.root.add(skid);
      for (const z of [-0.9, 0.8]) {
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), carMat('chrome'));
        strut.position.set(side * 0.8, -0.95, z);
        strut.rotation.z = side * 0.3;
        this.root.add(strut);
      }
      const t = decal('POLICE', 1.6, 0.36, { color: '#0a0a0a', font: 'bold 230px Arial' });
      t.position.set(side * 1.1, -0.3, 0.2);
      t.rotation.y = side * Math.PI / 2;
      this.root.add(t);
    }
    this.lightBar = new LightBar(0.6, 0.08);
    this.lightBar.group.position.set(0, -0.9, -0.5);
    this.root.add(this.lightBar.group);
    // Searchlight: a real spot light plus a visible additive beam cone.
    this.searchPivot = new THREE.Group();
    this.searchPivot.position.set(0, -1.0, -1.6);
    this.root.add(this.searchPivot);
    this.spot = new THREE.SpotLight(0xe6f0ff, 0, 160, 0.16, 0.5, 1.2);
    this.root.add(this.spot);
    this.root.add(this.spot.target);
    const beamGeo = new THREE.CylinderGeometry(0.25, 6, 1, 20, 1, true);
    beamGeo.translate(0, -0.5, 0);
    this.beam = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(0.7, 0.8, 1.0) } },
      vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
        void main(){ vY = -position.y; vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `uniform vec3 color; varying float vY; varying vec3 vN; varying vec3 vV;
        void main(){ float e = pow(abs(dot(normalize(vN), normalize(vV))), 2.0); float a = 0.09 * e * (1.0 - vY * 0.85); gl_FragColor = vec4(color * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.beam.frustumCulled = false;
    this.searchPivot.add(this.beam);
    this.root.traverse((o) => {
      if (o.isMesh && o !== this.beam) o.castShadow = true;
    });
    this.beamTarget = new THREE.Vector3();
  }

  // Aim the searchlight at a world point.
  aim(target, intensity = 1) {
    this.beamTarget.copy(target);
    const wp = new THREE.Vector3();
    this.searchPivot.getWorldPosition(wp);
    const len = wp.distanceTo(target);
    this.beam.scale.set(1 + len * 0.012, len, 1 + len * 0.012);
    // Orient the pivot so local -y points at the target.
    const dir = new THREE.Vector3().subVectors(target, wp).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    const parentQ = new THREE.Quaternion();
    this.root.getWorldQuaternion(parentQ);
    this.searchPivot.quaternion.copy(parentQ.invert().multiply(q));
    this.spot.position.copy(this.searchPivot.position);
    this.spot.target.position.copy(this.root.worldToLocal(target.clone()));
    this.spot.intensity = 2200 * intensity;
    this.beam.visible = intensity > 0.01;
  }

  update(dt, ctx = {}) {
    this.rotor.rotation.y += dt * 28;
    this.tailRotor.rotation.x += dt * 50;
    this.lightBar.update(dt, true);
  }
}

// Pursuit drone: quadcopter with strobes and an EMP emitter ring.
export class DroneModel {
  constructor() {
    this.root = new THREE.Group();
    const shell = new THREE.MeshPhysicalMaterial({ color: 0x1a1d22, metalness: 0.6, roughness: 0.3, clearcoat: 1 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 10), shell);
    body.scale.set(1.3, 0.55, 1.5);
    this.root.add(body);
    this.rotors = [];
    for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 1.25), shell);
      arm.position.set(x / 2, 0, z / 2);
      arm.rotation.y = Math.atan2(x, z);
      this.root.add(arm);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 6, 20), shell);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 0.04, z);
      this.root.add(ring);
      const r = new THREE.Mesh(new THREE.CircleGeometry(0.38, 16), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
      r.rotation.x = -Math.PI / 2;
      r.position.set(x, 0.06, z);
      this.root.add(r);
      this.rotors.push(r);
    }
    this.emp = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 8, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x40d0ff).multiplyScalar(3) }));
    this.emp.rotation.x = Math.PI / 2;
    this.emp.position.y = -0.22;
    this.root.add(this.emp);
    this.lightBar = new LightBar(0.5, 0.06);
    this.lightBar.group.position.set(0, 0.2, 0);
    this.root.add(this.lightBar.group);
    this.charge = 0;
  }

  update(dt) {
    for (const r of this.rotors) r.rotation.z += dt * 40;
    this.lightBar.update(dt, true);
    this.emp.material.color.setRGB(0.25, 0.8, 1).multiplyScalar(1 + this.charge * 10 * (0.5 + 0.5 * Math.sin(performance.now() * 0.03)));
  }
}
