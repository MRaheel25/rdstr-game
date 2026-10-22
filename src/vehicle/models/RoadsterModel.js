// 2nd-generation Tesla Roadster, modelled from the reference photos in /reference:
// low faceted wedge, long sloping nose with no grille, fender peaks with triangular LED
// headlights, a full-width LED strip on the nose, huge bronze-tinted canopy that wraps
// around, flat side panels with a sharp shoulder crease, black sill rising toward wide
// rear haunches, Kamm tail with a full-width red light bar, "RDSTR" plate hiding the
// SpaceX cold-gas rocket nozzle, four copper thruster outlets and a finned diffuser.
import * as THREE from 'three';
import { CarVisual } from '../CarVisual.js';
import { buildBody } from './BodyBuilder.js';
import { makeWheel } from './Wheels.js';
import { carMat, makePaint, applyPaint, PAINTS, crackTexture } from './CarMaterials.js';
import { textTexture } from '../../world/Textures.js';
import { clamp, damp } from '../../util/math.js';

const GROUND = -0.55; // body origin sits 0.55 m above the ground

// Stations along the car (front = -z) and crease lines: half-width w, height y (ground = 0).
const Z = [-2.16, -2.06, -1.9, -1.65, -1.38, -1.1, -0.92, -0.6, -0.2, 0.2, 0.6, 1.0, 1.32, 1.55, 1.8, 2.0, 2.12];
export const ROADSTER_DESIGN = {
  z: Z,
  zStep: 0.07,
  lines: {
    bottom: { w: [0.7, 0.8, 0.86, 0.88, 0.88, 0.88, 0.88, 0.87, 0.87, 0.87, 0.88, 0.9, 0.92, 0.92, 0.9, 0.86, 0.8], y: Z.map(() => 0.13) },
    sill: {
      w: [0.78, 0.88, 0.94, 0.96, 0.97, 0.96, 0.94, 0.93, 0.93, 0.93, 0.95, 0.99, 1.02, 1.02, 0.99, 0.95, 0.88],
      y: [0.16, 0.2, 0.25, 0.3, 0.32, 0.31, 0.3, 0.29, 0.29, 0.3, 0.32, 0.36, 0.42, 0.47, 0.5, 0.5, 0.48],
    },
    max: {
      w: [0.84, 0.94, 0.99, 1.0, 1.0, 0.99, 0.97, 0.95, 0.95, 0.96, 0.99, 1.03, 1.06, 1.06, 1.03, 0.98, 0.9],
      y: [0.36, 0.44, 0.5, 0.55, 0.58, 0.57, 0.55, 0.53, 0.52, 0.53, 0.55, 0.6, 0.64, 0.66, 0.66, 0.65, 0.62],
    },
    shoulder: {
      w: [0.8, 0.9, 0.95, 0.96, 0.95, 0.92, 0.89, 0.87, 0.87, 0.88, 0.92, 0.97, 1.01, 1.01, 0.99, 0.95, 0.87],
      y: [0.5, 0.56, 0.62, 0.7, 0.76, 0.74, 0.71, 0.69, 0.69, 0.71, 0.74, 0.79, 0.84, 0.87, 0.89, 0.9, 0.9],
    },
    belt: {
      w: [0.72, 0.82, 0.88, 0.9, 0.88, 0.84, 0.8, 0.78, 0.78, 0.8, 0.83, 0.87, 0.9, 0.9, 0.89, 0.86, 0.8],
      y: [0.55, 0.6, 0.67, 0.77, 0.83, 0.8, 0.77, 0.76, 0.77, 0.79, 0.82, 0.87, 0.92, 0.95, 0.97, 0.98, 0.98],
    },
    inner: {
      w: [0.48, 0.52, 0.55, 0.56, 0.58, 0.62, 0.66, 0.7, 0.72, 0.74, 0.76, 0.79, 0.82, 0.83, 0.82, 0.8, 0.75],
      y: [0.56, 0.6, 0.64, 0.67, 0.69, 0.71, 0.74, 0.79, 0.8, 0.82, 0.85, 0.89, 0.93, 0.96, 0.975, 0.985, 0.985],
    },
    roofSide: {
      w: [0.4, 0.42, 0.44, 0.45, 0.46, 0.5, 0.54, 0.6, 0.62, 0.62, 0.61, 0.6, 0.62, 0.66, 0.66, 0.65, 0.6],
      y: [0.57, 0.61, 0.65, 0.68, 0.7, 0.73, 0.765, 0.9, 1.02, 1.07, 1.06, 1.03, 0.99, 0.975, 0.98, 0.985, 0.985],
    },
    center: { y: [0.575, 0.615, 0.655, 0.685, 0.705, 0.735, 0.765, 0.93, 1.07, 1.12, 1.11, 1.07, 1.02, 0.985, 0.985, 0.99, 0.99] },
  },
  order: ['bottom', 'sill', 'max', 'shoulder', 'belt', 'inner', 'center'],
  bands: [
    { a: 'bottom', b: 'sill', mat: 'black', arches: true, steps: 1 },
    { a: 'sill', b: 'max', mat: 'paint', arches: true, steps: 2, bulge: 0.008 },
    { a: 'max', b: 'shoulder', mat: 'paint', arches: true, steps: 2, bulge: 0.006 },
    { a: 'shoulder', b: 'belt', mat: 'paint', arches: true, steps: 1 },
  ],
  top: [
    { a: 'belt', b: 'inner', mat: 'paint', steps: 2 },
    { a: 'inner', b: 'center', mat: 'paint', steps: 4, crown: 0.012, zRange: [-2.16, -0.92] },
    { a: 'inner', b: 'roofSide', mat: 'glass', steps: 3, crown: 0.025, zRange: [-0.92, 1.55] },
    { a: 'roofSide', b: 'center', mat: 'glass', steps: 3, crown: 0.01, zRange: [-0.92, 1.55] },
    { a: 'inner', b: 'center', mat: 'paint', steps: 3, crown: 0.008, zRange: [1.55, 2.12] },
  ],
  arches: [{ z: -1.38, y: 0.355, r: 0.45 }, { z: 1.32, y: 0.37, r: 0.47 }],
  door: { z0: -0.85, z1: 0.55, bands: [1, 2, 3] },
  frontCapMat: 'black',
  rearCapMat: 'black',
};

export class RoadsterModel extends CarVisual {
  constructor(cfg, paintKey = 'pearlWhite') {
    super(cfg);
    this.paint = makePaint(PAINTS[paintKey] || PAINTS.pearlWhite);
    this.paintKey = paintKey;
    this.mats = {
      paint: this.paint,
      glass: carMat('glass').clone(),
      black: carMat('black'),
      tail: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff1020).multiplyScalar(2.6) }),
      head: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.97, 0.92).multiplyScalar(6) }),
      reverse: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.2, 0.2) }),
      vent: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x40c8ff).multiplyScalar(0.2) }),
    };
    const shell = new THREE.Group();
    shell.position.y = GROUND;
    this.body.add(shell);
    this.shell = shell;
    const built = buildBody(ROADSTER_DESIGN);
    this.sampler = built.sample;
    this.meshes = [];
    for (const [mat, geo] of Object.entries(built.geometries)) {
      const m = new THREE.Mesh(geo, this.mats[mat] || carMat(mat));
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = `rdstr_${mat}`;
      shell.add(m);
      this.meshes.push(m);
      if (mat === 'paint') this.paintMesh = m;
      if (mat === 'glass') this.glassMesh = m;
    }
    this.buildDoors(built.doors);
    this.buildArchLiners(shell);
    this.buildNose(shell);
    this.buildTail(shell);
    this.buildWing(shell);
    this.buildVents(shell);
    this.buildDamageParts(shell);
    this.setupWheels((i, w) => makeWheel(w.radius, w.front ? 0.29 : 0.33, 'aero'));
    this.headlights = [];
    for (const side of [-1, 1]) {
      const l = new THREE.SpotLight(0xfff3e6, 0, 90, 0.42, 0.45, 1.5);
      l.position.set(side * 0.62, 0.68 + GROUND, -1.95);
      l.target.position.set(side * 1.2, -0.4, -20);
      this.body.add(l, l.target);
      this.headlights.push(l);
    }
    this.state = { doors: 0, doorTarget: 0, wing: 0, plate: 0, vents: 0, brake: 0, lights: 1, damage: 0 };
    this.dentQueue = [];
  }

  // smooth: blend the colour over ~0.6 s (showroom / garage live preview).
  setPaint(key, smooth = false) {
    const from = this.paint.color.clone();
    const fromE = this.paint.emissive.clone();
    applyPaint(this.paint, PAINTS[key] || PAINTS.pearlWhite);
    this.paintKey = key;
    if (smooth) {
      this.paintTween = { t: 0, from, to: this.paint.color.clone(), fromE, toE: this.paint.emissive.clone() };
      this.paint.color.copy(from);
      this.paint.emissive.copy(fromE);
    } else this.paintTween = null;
  }

  // Showroom overrides (hotspots): { lights, roof, thrusters } or null in game.
  setShowroom(state) {
    this.showroom = state;
    if (state && !this.canopyPivot && this.glassMesh) {
      // Canopy lifts around a hinge at its rear edge.
      this.glassMesh.geometry.computeBoundingBox();
      const b = this.glassMesh.geometry.boundingBox;
      const pivot = new THREE.Group();
      pivot.position.set(0, b.max.y - 0.08, b.max.z - 0.05);
      this.shell.add(pivot);
      for (const m of [this.glassMesh, this.crack]) {
        if (!m) continue;
        pivot.add(m);
        m.position.sub(pivot.position);
      }
      this.canopyPivot = pivot;
    }
  }

  buildDoors(doors) {
    this.doors = [];
    const d = ROADSTER_DESIGN.door;
    const S = this.sampler;
    for (const side of [1, -1]) {
      const hinge = new THREE.Vector3(side * S.max.w(d.z0) * 0.98, S.shoulder.y(d.z0) + GROUND, d.z0);
      const pivot = new THREE.Group();
      pivot.position.copy(hinge);
      const inner = new THREE.Group();
      inner.position.set(-hinge.x, -hinge.y, -hinge.z);
      if (side < 0) inner.scale.x = -1;
      const trim = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.7, side: THREE.BackSide });
      for (const [mat, geo] of Object.entries(doors)) {
        const g = geo.clone();
        g.translate(0, GROUND, 0);
        const m = new THREE.Mesh(g, this.mats[mat] || carMat(mat));
        m.castShadow = true;
        inner.add(m);
        inner.add(new THREE.Mesh(g, trim));
      }
      // Door inner skin (seen when open) and a door seam line.
      pivot.add(inner);
      this.body.add(pivot);
      this.doors.push({ pivot, side });
    }
    // Interior silhouette visible when doors open: seats and dash.
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.7 });
    for (const sx of [-0.38, 0.38]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.55), seatMat);
      seat.position.set(sx, 0.3 + GROUND, 0.15);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.12), seatMat);
      back.position.set(sx, 0.6 + GROUND, 0.48);
      back.rotation.x = -0.35;
      this.body.add(seat, back);
    }
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.5), carMat('carbon'));
    dash.position.set(0, 0.62 + GROUND, -0.62);
    this.body.add(dash);
  }

  buildArchLiners(shell) {
    for (const a of ROADSTER_DESIGN.arches) {
      const g = new THREE.CylinderGeometry(a.r - 0.01, a.r - 0.01, 0.62, 24, 1, true, -Math.PI / 2 - 1.3, 2.6);
      g.rotateZ(Math.PI / 2);
      for (const side of [-1, 1]) {
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9, side: THREE.BackSide }));
        m.position.set(side * 0.68, a.y, a.z);
        shell.add(m);
      }
    }
  }

  buildNose(shell) {
    const S = this.sampler;
    const zF = Z[0];
    // Full-width LED strip along the nose, just under the hood edge.
    const w = S.belt.w(zF + 0.02) * 2 + 0.02;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.014, 0.03), this.mats.head);
    strip.position.set(0, S.inner.y(zF) - 0.025, zF - 0.004);
    shell.add(strip);
    this.frontStrip = strip;
    // Triangular headlights where the fender peaks meet the hood.
    for (const side of [-1, 1]) {
      const z = -1.96;
      const xo = S.belt.w(z);
      const xi = S.inner.w(z) + 0.04;
      const yb = S.inner.y(z) + 0.01;
      const yt = S.belt.y(z) + 0.005;
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(side * xi, yb, z - 0.03), new THREE.Vector3(side * xo, yb + 0.005, z - 0.09), new THREE.Vector3(side * (xo - 0.04), yt, z + 0.06),
      ]);
      g.computeVertexNormals();
      const tri = new THREE.Mesh(g, this.mats.head);
      tri.material.side = THREE.DoubleSide;
      shell.add(tri);
    }
    // Lower fascia: carbon splitter is a detachable damage part (see buildDamageParts).
    const intake = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.05), carMat('carbon'));
    intake.position.set(0, 0.3, zF + 0.02);
    shell.add(intake);
  }

  buildTail(shell) {
    const S = this.sampler;
    const zR = Z[Z.length - 1];
    const w = S.max.w(zR) * 2;
    // Full-width red light bar with a body-coloured cap above it.
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.035, 0.03), this.mats.tail);
    bar.position.set(0, 0.905, zR + 0.012);
    shell.add(bar);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, 0.06, 0.04), this.paint);
    cap.position.set(0, 0.955, zR + 0.005);
    shell.add(cap);
    for (const side of [-1, 1]) {
      const rev = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.02), this.mats.reverse);
      rev.position.set(side * (w / 2 - 0.12), 0.86, zR + 0.012);
      shell.add(rev);
    }
    // Plate: pivots at its bottom edge and flips down to reveal the rocket nozzle.
    const plateTex = textTexture('RDSTR', { w: 256, h: 64, bg: '#e8e8e4', color: '#202024', font: 'bold 44px "Arial Narrow", Arial, sans-serif' });
    const platePivot = new THREE.Group();
    platePivot.position.set(0, 0.5, zR + 0.03);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 0.012), [
      carMat('chrome'), carMat('chrome'), carMat('chrome'), carMat('chrome'),
      new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.4 }), carMat('black'),
    ]);
    plate.position.set(0, 0.075, 0);
    platePivot.add(plate);
    shell.add(platePivot);
    this.platePivot = platePivot;
    // Rocket nozzle recess behind the plate.
    const recess = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.15, 0.04), carMat('nozzleIn'));
    recess.position.set(0, 0.575, zR + 0.0);
    shell.add(recess);
    this.rocketNozzles = [];
    for (const nx of [-0.12, 0.12]) {
      const n = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.06, 16, 1, true), carMat('copper'));
      n.rotation.x = Math.PI / 2;
      n.position.set(nx, 0.575, zR + 0.02);
      n.material.side = THREE.DoubleSide;
      shell.add(n);
      this.rocketNozzles.push(new THREE.Vector3(nx, 0.575 + GROUND, zR + 0.05));
    }
    // Four copper cold-gas outlets below the plate.
    this.coldGasNozzles = [];
    for (const nx of [-0.42, -0.14, 0.14, 0.42]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 20), carMat('copper'));
      ring.position.set(nx, 0.39, zR + 0.01);
      shell.add(ring);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.044, 16), carMat('nozzleIn'));
      hole.position.set(nx, 0.39, zR + 0.005);
      shell.add(hole);
      this.coldGasNozzles.push(new THREE.Vector3(nx, 0.39 + GROUND, zR + 0.03));
    }
    // Diffuser fins.
    for (let k = -3; k <= 3; k++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.42), carMat('carbon'));
      fin.position.set(k * 0.22, 0.23, zR - 0.18);
      shell.add(fin);
    }
    const diff = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.02, 0.5), carMat('carbon'));
    diff.position.set(0, 0.14, zR - 0.2);
    diff.rotation.x = -0.18;
    shell.add(diff);
  }

  buildWing(shell) {
    const zR = Z[Z.length - 1];
    this.wing = new THREE.Group();
    this.wing.position.set(0, 0.99, zR - 0.22);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.035, 0.34), this.paint);
    blade.castShadow = true;
    this.wing.add(blade);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.04, 0.03), carMat('carbon'));
    lip.position.set(0, 0.02, 0.17);
    this.wing.add(lip);
    this.wingStruts = [];
    for (const x of [-0.45, 0.45]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1, 0.12), carMat('black'));
      s.position.set(x, -0.5, 0);
      s.scale.y = 0.01;
      this.wing.add(s);
      this.wingStruts.push(s);
    }
    shell.add(this.wing);
  }

  // Flight-mode side vents on the rear haunches.
  buildVents(shell) {
    this.vents = [];
    const S = this.sampler;
    const z0 = 0.62;
    const z1 = 0.88;
    for (const side of [-1, 1]) {
      const y = (S.max.y(0.75) + S.shoulder.y(0.75)) / 2;
      const x = side * (S.max.w(0.75) + 0.005);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, 0.1), this.mats.vent);
      glow.rotation.y = side * Math.PI / 2;
      glow.position.set(x - side * 0.004, y, (z0 + z1) / 2);
      shell.add(glow);
      const pivot = new THREE.Group();
      pivot.position.set(x, y + 0.05, (z0 + z1) / 2);
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.11, z1 - z0), this.paint);
      flap.position.set(0, -0.055, 0);
      pivot.add(flap);
      shell.add(pivot);
      this.vents.push({ pivot, side });
    }
    // Hover jet outlets under the car (used by VFX).
    this.hoverNozzles = [
      new THREE.Vector3(-0.6, 0.15 + GROUND, -1.0), new THREE.Vector3(0.6, 0.15 + GROUND, -1.0),
      new THREE.Vector3(-0.6, 0.15 + GROUND, 0.95), new THREE.Vector3(0.6, 0.15 + GROUND, 0.95),
    ];
    // Attitude-control thruster ports (nose and tail corners).
    this.rcsNozzles = [
      new THREE.Vector3(-0.8, 0.5 + GROUND, -1.9), new THREE.Vector3(0.8, 0.5 + GROUND, -1.9),
      new THREE.Vector3(-0.85, 0.75 + GROUND, 1.9), new THREE.Vector3(0.85, 0.75 + GROUND, 1.9),
    ];
  }

  buildDamageParts(shell) {
    // Front carbon splitter: falls off at heavy damage.
    const zF = Z[0];
    this.splitter = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.03, 0.32), carMat('carbon'));
    this.splitter.position.set(0, 0.15, zF + 0.12);
    shell.add(this.splitter);
    // Cracked glass overlay on the canopy.
    const crackMat = new THREE.MeshBasicMaterial({ map: crackTexture(), transparent: true, opacity: 0, depthWrite: false, color: 0xbfd0dc });
    if (this.glassMesh) {
      this.crack = new THREE.Mesh(this.glassMesh.geometry, crackMat);
      this.crack.scale.setScalar(1.002);
      this.crack.renderOrder = 2;
      shell.add(this.crack);
      // Planar UVs for the crack texture.
      const pos = this.glassMesh.geometry.attributes.position;
      const uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        uv[i * 2] = pos.getX(i) * 0.6 + 0.5;
        uv[i * 2 + 1] = pos.getZ(i) * 0.3 + 0.5;
      }
      this.crack.geometry = this.glassMesh.geometry.clone();
      this.crack.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
  }

  toggleDoors() {
    this.state.doorTarget = this.state.doorTarget > 0.5 ? 0 : 1;
  }

  // Impact dent on the paint shell at a body-local point.
  dent(localPoint, strength) {
    if (!this.paintMesh) return;
    const p = localPoint.clone();
    p.y -= GROUND;
    const geo = this.paintMesh.geometry;
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const r = 0.35 + strength * 0.25;
    const depth = Math.min(0.06, strength * 0.02);
    let moved = false;
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i) - p.x;
      const dy = pos.getY(i) - p.y;
      const dz = pos.getZ(i) - p.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r * r) continue;
      const f = 1 - Math.sqrt(d2) / r;
      const k = depth * f * f;
      pos.setXYZ(i, pos.getX(i) - nrm.getX(i) * k, pos.getY(i) - nrm.getY(i) * k, pos.getZ(i) - nrm.getZ(i) * k);
      moved = true;
    }
    if (moved) {
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    }
  }

  // Visual state driven by the vehicle each frame.
  update(dt, v, ctx = {}) {
    super.update(dt, v);
    const st = this.state;
    const sr = this.showroom;
    if (this.paintTween) {
      const tw = this.paintTween;
      tw.t = Math.min(1, tw.t + dt / 0.6);
      const k = tw.t * tw.t * (3 - 2 * tw.t);
      this.paint.color.copy(tw.from).lerp(tw.to, k);
      this.paint.emissive.copy(tw.fromE).lerp(tw.toE, k);
      if (tw.t >= 1) this.paintTween = null;
    }
    if (this.canopyPivot) {
      st.roof = damp(st.roof || 0, sr && sr.roof ? 1 : 0, 3, dt);
      this.canopyPivot.rotation.x = st.roof * 0.42;
    }
    st.doors = damp(st.doors, st.doorTarget, 4, dt);
    for (const d of this.doors) {
      // Butterfly: swing out and up around the front hinge.
      d.pivot.rotation.set(0, 0, 0);
      d.pivot.rotateY(d.side * st.doors * 0.55);
      d.pivot.rotateX(-st.doors * 0.95);
    }
    // Wing rises at speed, under braking (air brake) and in Flight mode.
    const mph = v.speed * 2.237;
    const wingT = v.mode.id === 'flight' ? 1 : Math.max(clamp((mph - 90) / 60, 0, 1), v.braking && mph > 60 ? 1 : 0);
    st.wing = damp(st.wing, wingT, 3, dt);
    this.wing.position.y = 0.99 + st.wing * 0.34;
    this.wing.rotation.x = -st.wing * (v.braking ? 0.5 : 0.18);
    for (const s of this.wingStruts) {
      s.scale.y = Math.max(0.01, st.wing * 0.36);
      s.position.y = -st.wing * 0.18;
    }
    // Plate flips down while Rear Rockets fire.
    st.plate = damp(st.plate, v.thrust.rocket || (sr && sr.thrusters) ? 1 : 0, sr ? 4 : 12, dt);
    this.platePivot.rotation.x = st.plate * 1.6;
    // Flight mode side vents.
    st.vents = damp(st.vents, v.mode.id === 'flight' || (sr && sr.thrusters) ? 1 : 0, 4, dt);
    for (const vt of this.vents) vt.pivot.rotation.z = -vt.side * st.vents * 0.9;
    this.mats.vent.color.setRGB(0.25, 0.78, 1).multiplyScalar(0.2 + st.vents * 3 * (v.thrust.air || v.thrust.hover || (sr && sr.thrusters) ? 1.5 : 1));
    // Lights: ghost mode kills everything, brake lights brighten, reverse lights.
    const ghost = v.energy && v.energy.ghost;
    st.lights = damp(st.lights, ghost || (sr && !sr.lights) ? 0 : 1, 8, dt);
    st.brake = damp(st.brake, v.braking ? 1 : 0, 14, dt);
    this.mats.tail.color.setRGB(1, 0.06, 0.12).multiplyScalar((2.4 + st.brake * 6) * st.lights);
    this.mats.head.color.setRGB(1, 0.97, 0.92).multiplyScalar(6 * st.lights);
    this.mats.reverse.color.setRGB(1, 1, 1).multiplyScalar(v.reversing ? 4 * st.lights : 0.15);
    for (const h of this.headlights) h.intensity = 380 * st.lights * (ctx.headlights === false ? 0 : 1);
    // V2 body motion: the shell pitches under braking / acceleration and rolls in corners on
    // a spring-damper (wheels stay planted), so weight transfer is visible.
    if (!sr) {
      const fwd = v.fwdSpeed || 0;
      const accel = dt > 0 ? (fwd - (st.lastFwd ?? fwd)) / dt : 0;
      st.lastFwd = fwd;
      st.accelF = damp(st.accelF || 0, clamp(accel, -25, 25), 8, dt);
      const lat = (v.yawRate ?? (v.body ? v.body.angvel().y : 0)) * fwd;
      st.accelL = damp(st.accelL || 0, clamp(-lat, -25, 25), 8, dt);
      const onGround = v.groundedCount >= 3;
      const tp = onGround ? clamp(st.accelF * 0.0028, -0.045, 0.035) : 0;
      const tr = onGround ? clamp(st.accelL * 0.0024, -0.05, 0.05) : 0;
      for (const [k, target] of [['p', tp], ['r', tr]]) {
        const vk = `${k}v`;
        st[vk] = (st[vk] || 0) + ((target - (st[k] || 0)) * 140 - (st[vk] || 0) * 14) * dt;
        st[k] = (st[k] || 0) + st[vk] * dt;
      }
      this.shell.rotation.x = st.p;
      this.shell.rotation.z = st.r;
      this.shell.position.y = GROUND - Math.abs(st.r) * 0.3 - Math.max(0, -st.p) * 0.4;
    }
    // Damage visuals.
    const dmg = 1 - v.hp / v.maxHp;
    st.damage = dmg;
    // Scratches: the clearcoat dulls and the paint gets rougher as damage builds up.
    if (!this.paintTween && Math.abs((st.paintDmg ?? -1) - dmg) > 0.02) {
      st.paintDmg = dmg;
      const pr = PAINTS[this.paintKey] || PAINTS.pearlWhite;
      this.paint.roughness = Math.min(0.9, pr.roughness + dmg * 0.4);
      this.paint.clearcoat = pr.clearcoat * (1 - dmg * 0.75);
    }
    // Broken headlight (left) at heavy damage, the right one flickers.
    if (dmg > 0.6) {
      this.headlights[0].intensity = 0;
      if (Math.random() < 0.08) this.headlights[1].intensity *= 0.2;
    }
    if (this.crack) this.crack.material.opacity = clamp((dmg - 0.3) * 1.6, 0, 0.85);
    if (this.splitter.visible && dmg > 0.55) {
      this.splitter.visible = false;
      if (this.onPartLost) this.onPartLost('splitter', this.splitter);
    }
    if (dmg < 0.05 && !this.splitter.visible) this.splitter.visible = true;
  }

  // Restore after repair / reset to garage.
  repair() {
    this.splitter.visible = true;
    const built = buildBody(ROADSTER_DESIGN);
    if (this.paintMesh) this.paintMesh.geometry = built.geometries.paint;
  }

  // World-space helpers for VFX.
  worldPoint(local, out) {
    return out.copy(local).applyMatrix4(this.root.matrixWorld);
  }
}
