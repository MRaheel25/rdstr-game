// The showroom used by the title screen and the Garage: a dark studio with a polished,
// mirror-like floor (planar reflection under a glossy coat), a turntable with a glowing rim,
// a dramatic key light, coloured rim lights, light bars sweeping across the paint, soft haze
// in the light beams and a slow camera drift. The player's own car model is borrowed while
// the menu is open. Live car viewer: drag / touch to orbit, wheel / pinch to zoom.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { clamp, damp } from '../util/math.js';
import { makeSign } from '../world/Grafigator.js';

const MIN_DIST = 5.4; // never inside the car (half length ~2.3 m + margin)
const MAX_DIST = 12;

export class GarageScene {
  constructor(renderer) {
    this.renderer = renderer;
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x030407);
    s.fog = new THREE.FogExp2(0x05070c, 0.028);
    this.scene = s;
    this.time = 0;
    this.yaw = 0.6;
    this.userYaw = 0; // drag offset on the title screen
    this.camYaw = -0.75;
    this.camPitch = 0.16;
    this.camDist = 8.4;
    this.zoom = 0; // title-screen zoom offset
    this.dragging = false;
    this.pointers = new Map();
    this.mode = 'title';
    this.build();
    this.bindPointer();
  }

  build() {
    const s = this.scene;
    // Room: dark walls with vertical slat texture.
    const room = new THREE.Mesh(new THREE.BoxGeometry(40, 14, 40), new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.85, metalness: 0.2, side: THREE.BackSide }));
    room.position.y = 7;
    s.add(room);
    // Polished floor: planar reflection below a glossy, slightly transparent coat.
    const size = 40;
    this.mirror = new Reflector(new THREE.PlaneGeometry(size, size), { textureWidth: 1024, textureHeight: 1024, color: 0x8a8f99, multisample: 4 });
    this.mirror.rotation.x = -Math.PI / 2;
    this.mirror.position.y = -0.002;
    s.add(this.mirror);
    const coat = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color: 0x07080b, roughness: 0.28, metalness: 0.2, transparent: true, opacity: 0.72, map: floorTexture() }));
    coat.rotation.x = -Math.PI / 2;
    coat.receiveShadow = true;
    s.add(coat);
    // Turntable with a glowing rim.
    this.table = new THREE.Group();
    s.add(this.table);
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.7, 0.1, 96), new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.22, metalness: 0.8 }));
    disk.position.y = 0.05;
    disk.receiveShadow = true;
    this.table.add(disk);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.68, 0.03, 8, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3fe0ff).multiplyScalar(2.5) }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.1;
    s.add(rim);
    this.rim = rim;
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(4.6, 4.64, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3df0).multiplyScalar(0.8), side: THREE.DoubleSide }));
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.y = 0.004;
    s.add(ring2);
    // Overhead light panel (big soft box) + thin ceiling strips.
    const strip = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdfe8ff).multiplyScalar(2.4) });
    for (const x of [-3, 0, 3]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 9), strip);
      m.position.set(x, 9.2, 0);
      s.add(m);
    }
    // Vertical accent pillars of light in the back.
    const pillarMat = (c, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) });
    for (let i = 0; i < 9; i++) {
      const a = -0.2 + i * 0.32;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 6, 0.08), pillarMat(i % 2 ? 0x3fe0ff : 0xff3df0, 1.4));
      m.position.set(Math.cos(a) * 15, 3.2, -Math.sin(a) * 15);
      s.add(m);
    }
    // Lights.
    s.add(new THREE.HemisphereLight(0x8090b0, 0x050505, 0.35));
    this.key = new THREE.SpotLight(0xfff4e8, 850, 40, 0.42, 0.55, 1.6);
    this.key.position.set(4, 10, 5);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0003;
    s.add(this.key, this.key.target);
    this.sweeps = [0xbfe9ff, 0xff8ad8, 0xffffff].map((c, i) => {
      const l = new THREE.SpotLight(c, 800, 34, 0.1, 0.3, 1.4);
      l.position.set(Math.cos(i * 2.1) * 9, 9.5, Math.sin(i * 2.1) * 9);
      s.add(l, l.target);
      return l;
    });
    this.rimL = new THREE.PointLight(0x3fe0ff, 90, 16, 1.8);
    this.rimL.position.set(-5, 1.4, -4);
    this.rimR = new THREE.PointLight(0xff3df0, 35, 16, 1.8);
    this.rimR.position.set(5, 1.4, 4);
    this.back = new THREE.SpotLight(0xa8d8ff, 700, 30, 0.5, 0.7, 1.5);
    this.back.position.set(-6, 6, -9);
    s.add(this.rimL, this.rimR, this.back, this.back.target);
    // Haze: soft additive beams under the key and sweep lights.
    this.beams = [];
    const beamGeo = new THREE.ConeGeometry(2.6, 9.5, 32, 1, true);
    beamGeo.translate(0, -4.75, 0);
    for (const l of [this.key, ...this.sweeps]) {
      const m = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(l.color).multiplyScalar(l === this.key ? 0.022 : 0.014) } },
        vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = position.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
        fragmentShader: 'uniform vec3 color; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(vN,vV)), 1.5); float fade = smoothstep(-9.5,-1.0,vY) * (1.0 - smoothstep(-1.0, 0.0, vY) * 0.6); gl_FragColor = vec4(color * f * fade, 1.0); }',
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      m.userData.light = l;
      s.add(m);
      this.beams.push(m);
    }
    // GRAFIGATOR wall sign (subtle, behind the car on the title camera).
    const sign = makeSign({ height: 0.62, glow: 0.55 });
    sign.position.set(9.8, 3.6, -9.2);
    sign.lookAt(-6, 3.0, 6);
    s.add(sign);
    this.sign = sign;
    // Environment for reflections: the studio light boxes baked into a PMREM.
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x030407);
    const envStrip = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(7) });
    for (const x of [-3, 0, 3]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 12), envStrip);
      m.position.set(x, 10, 0);
      envScene.add(m);
    }
    const softbox = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2e0).multiplyScalar(2.5), side: THREE.DoubleSide }));
    softbox.position.set(8, 6, 8);
    softbox.lookAt(0, 0, 0);
    envScene.add(softbox);
    const envSide = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3fe0ff).multiplyScalar(1.6) });
    const sideA = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 20), envSide);
    sideA.position.set(-12, 3, 0);
    envScene.add(sideA);
    const sideB = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3df0).multiplyScalar(1.3) }));
    sideB.position.set(12, 3, 0);
    envScene.add(sideB);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.env = pm.fromScene(envScene, 0.02).texture;
    pm.dispose();
    s.environment = this.env;
    s.environmentIntensity = 1;
  }

  bindPointer() {
    const el = document.getElementById('game');
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      if (!this.active || !this.interactive) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.dragging = true;
      this.idle = 0;
    });
    const up = (e) => {
      this.pointers.delete(e.pointerId);
      this.pinch = null;
      if (!this.pointers.size) this.dragging = false;
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p || !this.active) return;
      if (this.pointers.size === 2) {
        // Pinch zoom.
        p.x = e.clientX;
        p.y = e.clientY;
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch) this.zoomBy((this.pinch - d) * 0.02);
        this.pinch = d;
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.mode === 'title') this.userYaw -= dx * 0.006;
      else this.camYaw -= dx * 0.006;
      this.camPitch = clamp(this.camPitch + dy * 0.003, 0.02, 0.6);
      this.idle = 0;
    });
    el.addEventListener('wheel', (e) => {
      if (!this.active || !this.interactive) return;
      this.zoomBy(e.deltaY * 0.004);
    }, { passive: true });
  }

  zoomBy(d) {
    if (this.mode === 'title') this.zoom = clamp(this.zoom + d, MIN_DIST - 9.6, MAX_DIST - 9.6);
    else this.camDist = clamp(this.camDist + d, MIN_DIST, MAX_DIST);
    this.idle = 0;
  }

  get interactive() {
    return this.mode === 'title' || this.mode === 'garage';
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
  }

  setMode(mode) {
    this.mode = mode;
  }

  // Hotspot actions (title screen car viewer).
  toggle(what) {
    const h = this.hot;
    if (!this.model) return;
    if (what === 'doors') this.model.toggleDoors();
    else h[what] = !h[what];
    this.idle = 0;
  }

  update(dt, camera) {
    this.time += dt;
    const t = this.time;
    this.idle = (this.idle || 0) + dt;
    // Turntable: slow constant spin when idle.
    const spin = this.mode === 'title' ? (this.idle > 3 ? 0.16 : 0) : this.idle > 4 ? 0.12 : 0;
    this.yaw += spin * dt;
    this.table.rotation.y = this.yaw;
    // Sweeping light bars across the paint.
    this.sweeps.forEach((l, i) => {
      const a = t * (0.3 + i * 0.1) + i * 2.1;
      l.position.set(Math.cos(a) * 8, 9.5, Math.sin(a) * 8);
      l.target.position.set(Math.sin(t * 0.5 + i) * 2.2, 0.4, Math.cos(t * 0.4 + i * 1.7) * 3.2);
      l.target.updateMatrixWorld();
    });
    for (const b of this.beams) {
      const l = b.userData.light;
      b.position.copy(l.position);
      b.lookAt(l.target.position);
      b.rotateX(-Math.PI / 2);
    }
    this.rim.material.color.setHSL(0.52 + Math.sin(t * 0.3) * 0.05, 1, 0.5).multiplyScalar(2.5);
    // Camera: title = low cinematic three-quarter view with slow drift (car right of the
    // menu); garage = orbit. Both can be dragged / zoomed.
    const title = this.mode === 'title';
    const yaw = title ? -0.95 + Math.sin(t * 0.07) * 0.1 + this.userYaw : this.camYaw;
    const pitch = title ? 0.13 + Math.sin(t * 0.05) * 0.03 + (this.camPitch - 0.16) : this.camPitch;
    const dist = title ? 9.6 + this.zoom + Math.sin(t * 0.09) * 0.25 : this.camDist;
    this.cy = damp(this.cy ?? yaw, yaw, 4, dt);
    this.cp = damp(this.cp ?? pitch, pitch, 4, dt);
    this.cd = damp(this.cd ?? dist, dist, 4, dt);
    camera.position.set(Math.sin(this.cy) * Math.cos(this.cp) * this.cd, 0.9 + Math.sin(this.cp) * this.cd, Math.cos(this.cy) * Math.cos(this.cp) * this.cd);
    // Aim beside the car so it sits right of the title menu / left of the garage panel.
    const side = title ? -2.5 * (this.cd / 9.6) : 2.3;
    const look = new THREE.Vector3(Math.cos(this.cy) * side, title ? 0.75 : 0.8, -Math.sin(this.cy) * side);
    camera.lookAt(look);
    camera.fov = title ? 40 : 45;
    camera.updateProjectionMatrix();
  }
}

function floorTexture() {
  // Subtle large tiles so the reflection reads as a polished floor rather than a mirror.
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 512, 512);
  x.strokeStyle = 'rgba(0,0,0,0.5)';
  x.lineWidth = 2;
  for (let i = 0; i <= 512; i += 128) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i, 512);
    x.moveTo(0, i);
    x.lineTo(512, i);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
