// The showroom used by the title screen and the Garage (V3): a bright, clean photo studio.
// Soft light-grey infinity cove (floor curving up into the wall), large soft area lights
// overhead, a glossy light floor with a soft real reflection of the car, a contact shadow
// under the car, a slow light sweep across the paint and a slow camera drift. No flicker,
// no glitch effects. Settings > Graphics "Night Studio" switches to a darker version.
// Car viewer: drag to rotate (with inertia), wheel / pinch to zoom, right-drag / two-finger
// drag to pan; click a door, the roof, the rear (thrusters) or the headlights to toggle them.
// Hovered parts get a soft outline.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { clamp, damp } from '../util/math.js';

const MIN_DIST = 5.4; // never inside the car (half length ~2.3 m + margin)
const MAX_DIST = 12;

const LOOKS = {
  light: {
    bg: 0xd9dce1, fog: 0.008, cove: 0xb9bdc4, floor: 0xa9aeb6, coat: 0xc6cad1, coatOpacity: 0.84, disk: 0xc0c4ca,
    hemi: [0xffffff, 0xb8bcc4, 0.55], area: 2.6, sweep: 3.5, key: 1.3, env: 0.85, exposure: 1.0, shadow: 0.45,
  },
  night: {
    bg: 0x0a0c11, fog: 0.03, cove: 0x15171c, floor: 0x3a3e46, coat: 0x0c0e12, coatOpacity: 0.74, disk: 0x1a1d22,
    hemi: [0x8090b0, 0x050505, 0.35], area: 5, sweep: 10, key: 2.2, env: 0.9, exposure: 1.0, shadow: 0.7,
  },
};

export class GarageScene {
  constructor(renderer) {
    this.renderer = renderer;
    RectAreaLightUniformsLib.init();
    const s = new THREE.Scene();
    this.scene = s;
    this.time = 0;
    this.yaw = 0.6;
    this.userYaw = 0; // drag offset on the title screen
    this.yawVel = 0; // inertia
    this.camYaw = -0.75;
    this.camPitch = 0.16;
    this.camDist = 8.4;
    this.zoom = 0; // title-screen zoom offset
    this.zoomTarget = 0;
    this.pan = new THREE.Vector2();
    this.dragging = false;
    this.pointers = new Map();
    this.mode = 'title';
    this.raycaster = new THREE.Raycaster();
    this.hoverPart = null;
    this.build();
    this.bindPointer();
  }

  build() {
    const s = this.scene;
    // Infinity cove all around the car: flat floor out to 14 m, then a quarter-circle curve
    // up into a vertical wall (a lathe), so every orbit angle sees a seamless backdrop.
    const prof = [new THREE.Vector2(0.01, 0)];
    for (let r = 2; r <= 14; r += 2) prof.push(new THREE.Vector2(r, 0));
    const R = 7;
    for (let i = 1; i <= 16; i++) {
      const a = (i / 16) * (Math.PI / 2);
      prof.push(new THREE.Vector2(14 + Math.sin(a) * R, R - Math.cos(a) * R));
    }
    prof.push(new THREE.Vector2(21, 30));
    const cg = new THREE.LatheGeometry(prof, 96);
    this.coveMat = new THREE.MeshStandardMaterial({ color: 0xf1f2f4, roughness: 0.95, metalness: 0, side: THREE.BackSide });
    this.cove = new THREE.Mesh(cg, this.coveMat);
    this.cove.position.y = -0.01;
    this.cove.receiveShadow = true;
    s.add(this.cove);
    // Glossy floor: a planar reflection under a light, mostly opaque coat (soft reflection).
    this.mirror = new Reflector(new THREE.CircleGeometry(16, 64), { textureWidth: 1024, textureHeight: 1024, color: 0xc9cdd3, multisample: 4 });
    this.mirror.rotation.x = -Math.PI / 2;
    this.mirror.position.y = 0.004;
    s.add(this.mirror);
    this.coat = new THREE.Mesh(new THREE.CircleGeometry(16.02, 64), new THREE.MeshStandardMaterial({
      color: 0xf4f5f7, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.86, alphaMap: fadeTexture(),
    }));
    this.coat.rotation.x = -Math.PI / 2;
    this.coat.position.y = 0.008;
    this.coat.receiveShadow = true;
    s.add(this.coat);
    // Turntable: a flush disk with a thin seam, and a soft contact shadow under the car.
    this.table = new THREE.Group();
    s.add(this.table);
    this.diskMat = new THREE.MeshStandardMaterial({ color: 0xdfe2e6, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.55 });
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.02, 96), this.diskMat);
    disk.position.y = 0.012;
    disk.receiveShadow = true;
    this.table.add(disk);
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 6.2), new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, depthWrite: false, opacity: 0.42, color: 0x000000 }));
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.026;
    contact.renderOrder = 1;
    this.contact = contact;
    this.table.add(contact);
    // Lights: big soft area lights overhead, a slow sweep bar, a soft shadow key.
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xcfd3da, 1.25);
    s.add(this.hemi);
    this.areas = [];
    for (const [x, z, w, h] of [[0, 0, 10, 3.2], [-6, -3, 3, 8], [6, 3, 3, 8]]) {
      const l = new THREE.RectAreaLight(0xffffff, 7, w, h);
      l.position.set(x, 7.5, z);
      l.lookAt(x * 0.3, 0, z * 0.3);
      s.add(l);
      this.areas.push(l);
    }
    this.sweep = new THREE.RectAreaLight(0xffffff, 9, 0.6, 9);
    this.sweep.position.set(0, 4.5, 0);
    s.add(this.sweep);
    this.key = new THREE.DirectionalLight(0xffffff, 2.6);
    this.key.position.set(2.5, 12, 3);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.radius = 7;
    this.key.shadow.blurSamples = 16;
    this.key.shadow.bias = -0.0004;
    const sc = this.key.shadow.camera;
    sc.left = sc.bottom = -6;
    sc.right = sc.top = 6;
    sc.near = 2;
    sc.far = 30;
    s.add(this.key, this.key.target);
    // Night look: two cool / warm rim lights (no neon poles, no strobing).
    this.rimL = new THREE.PointLight(0x7fb8ff, 0, 16, 1.8);
    this.rimL.position.set(-5, 1.6, -4);
    this.rimR = new THREE.PointLight(0xffc8a0, 0, 16, 1.8);
    this.rimR.position.set(5, 1.6, 4);
    s.add(this.rimL, this.rimR);
    // Visible soft boxes on the ceiling (seen in the reflections of the paint).
    this.boxMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(1.6), side: THREE.DoubleSide });
    for (const l of this.areas) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(l.width, l.height), this.boxMat);
      m.position.copy(l.position).add(new THREE.Vector3(0, 0.05, 0));
      m.quaternion.copy(l.quaternion);
      s.add(m);
    }
    this.setLook('light');
  }

  // Light (default) or Night Studio.
  setLook(name) {
    const L = LOOKS[name] || LOOKS.light;
    if (this.look === name && this.envTex) return;
    this.look = name;
    const s = this.scene;
    s.background = new THREE.Color(L.bg);
    s.fog = new THREE.FogExp2(L.bg, L.fog);
    this.coveMat.color.set(L.cove);
    this.mirror.material.uniforms && this.mirror.material.uniforms.color.value.set(L.floor);
    this.coat.material.color.set(L.coat);
    this.coat.material.opacity = L.coatOpacity;
    this.diskMat.color.set(L.disk);
    this.hemi.color.set(L.hemi[0]);
    this.hemi.groundColor.set(L.hemi[1]);
    this.hemi.intensity = L.hemi[2];
    for (const a of this.areas) a.intensity = L.area;
    this.sweep.intensity = L.sweep;
    this.key.intensity = L.key;
    this.contact.material.opacity = L.shadow;
    this.rimL.intensity = name === 'night' ? 40 : 0;
    this.rimR.intensity = name === 'night' ? 22 : 0;
    this.boxMat.color.setScalar(name === 'night' ? 1.2 : 1.6);
    this.buildEnv(name);
  }

  // Reflections: white soft boxes in a light (or dark) studio, baked into a PMREM.
  buildEnv(name) {
    const env = new THREE.Scene();
    env.background = new THREE.Color(name === 'night' ? 0x07080b : 0xd8dbe0);
    const white = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(name === 'night' ? 4 : 3), side: THREE.DoubleSide });
    const add = (w, h, x, y, z, look = [0, 0, 0]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), white);
      m.position.set(x, y, z);
      m.lookAt(...look);
      env.add(m);
    };
    add(10, 3.2, 0, 9, 0);
    add(3, 8, -7, 8, -3);
    add(3, 8, 7, 8, 3);
    add(14, 3, 0, 3, -14);
    add(3, 6, 14, 3, 2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshBasicMaterial({ color: name === 'night' ? 0x101216 : 0xbfc3c9 }));
    floor.rotation.x = -Math.PI / 2;
    env.add(floor);
    const pm = new THREE.PMREMGenerator(this.renderer);
    if (this.envTex) this.envTex.dispose();
    this.envTex = pm.fromScene(env, 0.03).texture;
    pm.dispose();
    env.traverse((o) => o.geometry && o.geometry.dispose());
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = LOOKS[name].env;
  }

  bindPointer() {
    const el = document.getElementById('game');
    el.style.touchAction = 'none';
    el.addEventListener('contextmenu', (e) => this.active && e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      if (!this.active || !this.interactive) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, button: e.button, t: performance.now() });
      this.dragging = true;
      this.idle = 0;
    });
    const up = (e) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      this.pinch = null;
      if (!this.pointers.size) this.dragging = false;
      // A short click without movement toggles the part under the cursor.
      if (p && this.active && this.interactive && p.button === 0 && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 6 && performance.now() - p.t < 400) {
        const part = this.pick(e.clientX, e.clientY);
        if (part) {
          this.toggle(part);
          if (this.onPart) this.onPart(part);
        }
      }
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      const p = this.pointers.get(e.pointerId);
      if (!p) {
        if (this.interactive && e.target === el) this.hover(e.clientX, e.clientY);
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 2) {
        // Pinch zoom + two-finger pan.
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch) this.zoomBy((this.pinch - d) * 0.02);
        this.pinch = d;
        this.panBy(dx * 0.5, dy * 0.5);
        return;
      }
      if (p.button === 2 || e.shiftKey) {
        this.panBy(dx, dy);
        return;
      }
      const k = dx * 0.006;
      if (this.mode === 'title') this.userYaw -= k;
      else this.camYaw -= k;
      this.yawVel = -k / Math.max(1 / 120, 1 / 60);
      this.camPitch = clamp(this.camPitch + dy * 0.003, 0.02, 0.6);
      this.idle = 0;
    });
    el.addEventListener('wheel', (e) => {
      if (!this.active || !this.interactive) return;
      this.zoomBy(e.deltaY * 0.004);
    }, { passive: true });
  }

  panBy(dx, dy) {
    this.pan.x = clamp(this.pan.x - dx * 0.004, -1.2, 1.2);
    this.pan.y = clamp(this.pan.y + dy * 0.004, -0.5, 0.8);
    this.idle = 0;
  }

  zoomBy(d) {
    if (this.mode === 'title') this.zoomTarget = clamp(this.zoomTarget + d, MIN_DIST - 9.6, MAX_DIST - 9.6);
    else this.camDist = clamp(this.camDist + d, MIN_DIST, MAX_DIST);
    this.idle = 0;
  }

  get interactive() {
    return this.mode === 'title' || this.mode === 'garage';
  }

  // Which car part is under the cursor: 'doors' | 'roof' | 'thrusters' | 'lights' | null.
  pick(cx, cy) {
    if (!this.model || !this.camera) return null;
    const ndc = new THREE.Vector2((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.model.root, true);
    for (const h of hits) {
      if (!h.object.visible || h.object.isLight) continue;
      const part = this.partOf(h.object, h.point);
      if (part) return part;
      return null;
    }
    return null;
  }

  partOf(obj, point) {
    const m = this.model;
    for (let o = obj; o && o !== m.root; o = o.parent) {
      if (m.doors && m.doors.some((d) => d.pivot === o)) return 'doors';
      if (o === m.canopyPivot) return 'roof';
      if (o === m.platePivot) return 'thrusters';
    }
    if (obj.material === m.mats.head) return 'lights';
    const local = m.root.worldToLocal(point.clone());
    if (local.z < -1.55 && local.y > -0.4) return 'lights';
    if (local.z > 1.85) return 'thrusters';
    if (local.y > 1.0 + 0.05 && Math.abs(local.z) < 1.2) return 'roof';
    return null;
  }

  // Meshes per part for the hover outline.
  partMeshes(part) {
    const m = this.model;
    const out = [];
    m.root.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const c = new THREE.Vector3();
      o.geometry.computeBoundingBox();
      o.geometry.boundingBox.getCenter(c);
      o.localToWorld(c);
      if (this.partOf(o, c) === part) out.push(o);
    });
    return out;
  }

  hover(cx, cy) {
    const part = this.pick(cx, cy);
    if (part === this.hoverPart) return;
    this.hoverPart = part;
    document.getElementById('game').style.cursor = part ? 'pointer' : '';
    if (this.onHover) this.onHover(part, part ? this.partMeshes(part) : []);
  }

  // Borrow the player's car model.
  enter(model) {
    if (this.active) return;
    this.active = true;
    this.model = model;
    this.prevParent = model.root.parent;
    this.prevPos = model.root.position.clone();
    this.prevQuat = model.root.quaternion.clone();
    this.table.add(model.root);
    model.root.position.set(0, 0.62, 0);
    model.root.quaternion.identity();
    model.root.updateMatrixWorld(true);
    model.setShowroom(this.hot || (this.hot = { lights: true, roof: false, thrusters: false }));
    this.idle = 10;
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    const r = this.model.root;
    this.table.remove(r);
    if (this.prevParent) this.prevParent.add(r);
    r.position.copy(this.prevPos);
    r.quaternion.copy(this.prevQuat);
    this.model.setShowroom(null);
    if (this.model.state.doorTarget > 0.5) this.model.toggleDoors();
    this.model = null;
    this.hoverPart = null;
    if (this.onHover) this.onHover(null, []);
    document.getElementById('game').style.cursor = '';
  }

  setMode(mode) {
    this.mode = mode;
  }

  toggle(what) {
    const h = this.hot;
    if (!this.model) return;
    if (what === 'doors') this.model.toggleDoors();
    else h[what] = !h[what];
    this.idle = 0;
  }

  update(dt, camera) {
    this.camera = camera;
    this.time += dt;
    const t = this.time;
    this.idle = (this.idle || 0) + dt;
    // Inertia after a drag, then a slow turntable spin when idle.
    if (!this.dragging && Math.abs(this.yawVel) > 0.001) {
      if (this.mode === 'title') this.userYaw += this.yawVel * dt;
      else this.camYaw += this.yawVel * dt;
      this.yawVel *= Math.exp(-dt * 3);
    }
    const spin = this.mode === 'title' ? (this.idle > 4 ? 0.12 : 0) : this.idle > 5 ? 0.1 : 0;
    this.yaw += spin * dt;
    this.table.rotation.y = this.yaw;
    // Slow light sweep across the paint (a narrow soft bar gliding front to back).
    const sw = Math.sin(t * 0.22);
    this.sweep.position.set(sw * 5, 4.2, -1 + Math.cos(t * 0.22) * 1.5);
    this.sweep.lookAt(0, 0.6, 0);
    this.zoom = damp(this.zoom, this.zoomTarget, 5, dt);
    // Camera: title = low three-quarter view with slow drift (car right of the menu);
    // garage = orbit. Both can be dragged / zoomed / panned.
    const title = this.mode === 'title';
    const yaw = title ? -0.95 + Math.sin(t * 0.07) * 0.08 + this.userYaw : this.camYaw;
    const pitch = title ? 0.13 + Math.sin(t * 0.05) * 0.025 + (this.camPitch - 0.16) : this.camPitch;
    const dist = title ? 9.6 + this.zoom + Math.sin(t * 0.09) * 0.2 : this.camDist;
    this.cy = damp(this.cy ?? yaw, yaw, 5, dt);
    this.cp = damp(this.cp ?? pitch, pitch, 5, dt);
    this.cd = damp(this.cd ?? dist, dist, 5, dt);
    camera.position.set(Math.sin(this.cy) * Math.cos(this.cp) * this.cd, 0.9 + Math.sin(this.cp) * this.cd, Math.cos(this.cy) * Math.cos(this.cp) * this.cd);
    // Aim beside the car so it sits right of the title menu / left of the garage panel.
    const narrow = window.innerWidth / window.innerHeight < 1.1;
    const side = (narrow ? 0 : title ? -2.5 * (this.cd / 9.6) : 2.3) + this.pan.x;
    const look = new THREE.Vector3(Math.cos(this.cy) * side, (title ? 0.75 : 0.8) + this.pan.y, -Math.sin(this.cy) * side);
    camera.position.add(new THREE.Vector3(0, this.pan.y, 0));
    camera.lookAt(look);
    camera.fov = title ? (narrow ? 52 : 40) : 45;
    camera.updateProjectionMatrix();
  }
}

// Radial fade so the glossy floor melts into the cove.
function fadeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 30, 128, 128, 128);
  g.addColorStop(0, '#fff');
  g.addColorStop(0.7, '#ddd');
  g.addColorStop(1, '#000');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

// Soft elliptical contact shadow.
function contactTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const x = c.getContext('2d');
  x.translate(64, 128);
  x.scale(1, 2);
  const g = x.createRadialGradient(0, 0, 4, 0, 0, 62);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.6)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(-64, -64, 128, 128);
  return new THREE.CanvasTexture(c);
}
