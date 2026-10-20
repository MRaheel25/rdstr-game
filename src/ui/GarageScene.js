// The showroom used by the title screen and the Garage: a dark garage with a glossy floor,
// ceiling light strips, a turntable with a glowing rim, and spot lights that sweep across the
// Roadster's paint. The player's own car model is borrowed while the menu is open.
import * as THREE from 'three';
import { clamp, damp } from '../util/math.js';

export class GarageScene {
  constructor(renderer) {
    this.renderer = renderer;
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x020306);
    this.scene = s;
    this.time = 0;
    this.yaw = 0.6;
    this.camYaw = -0.75;
    this.camPitch = 0.18;
    this.camDist = 7.6;
    this.dragging = false;
    this.mode = 'title';
    this.build();
    this.bindPointer();
  }

  build() {
    const s = this.scene;
    // Room.
    const room = new THREE.Mesh(new THREE.BoxGeometry(34, 12, 34), new THREE.MeshStandardMaterial({ color: 0x07080b, roughness: 0.9, side: THREE.BackSide }));
    room.position.y = 6;
    room.receiveShadow = true;
    s.add(room);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), new THREE.MeshStandardMaterial({ color: 0x0a0b0e, roughness: 0.16, metalness: 0.55 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    // Turntable with a glowing rim.
    this.table = new THREE.Group();
    s.add(this.table);
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.7, 0.1, 64), new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.3, metalness: 0.7 }));
    disk.position.y = 0.05;
    disk.receiveShadow = true;
    this.table.add(disk);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.68, 0.035, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3fe0ff).multiplyScalar(2.5) }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.1;
    s.add(rim);
    this.rim = rim;
    // Ceiling light strips and wall accent strips.
    const strip = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdfe8ff).multiplyScalar(2.2) });
    for (const x of [-4.5, 0, 4.5]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 12), strip);
      m.position.set(x, 11.9, 0);
      s.add(m);
    }
    const accent = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3df0).multiplyScalar(1.6) });
    for (const z of [-16.9, 16.9]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(30, 0.06, 0.06), accent);
      m.position.set(0, 0.5, z);
      s.add(m);
    }
    const cyan = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3fe0ff).multiplyScalar(1.6) });
    for (const x of [-16.9, 16.9]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 30), cyan);
      m.position.set(x, 0.5, 0);
      s.add(m);
    }
    // Lights.
    s.add(new THREE.HemisphereLight(0x8090b0, 0x050505, 0.25));
    this.key = new THREE.SpotLight(0xffffff, 900, 40, 0.38, 0.6, 1.6);
    this.key.position.set(5, 10, 6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.bias = -0.0004;
    s.add(this.key, this.key.target);
    this.sweeps = [0xbfe9ff, 0xff8ad8, 0xffffff].map((c, i) => {
      const l = new THREE.SpotLight(c, 1100, 34, 0.12, 0.35, 1.4);
      l.position.set(Math.cos(i * 2.1) * 9, 9.5, Math.sin(i * 2.1) * 9);
      s.add(l, l.target);
      return l;
    });
    this.rimL = new THREE.PointLight(0x3fe0ff, 60, 14, 1.8);
    this.rimL.position.set(-5, 1.2, -4);
    this.rimR = new THREE.PointLight(0xff3df0, 50, 14, 1.8);
    this.rimR.position.set(5, 1.2, 4);
    s.add(this.rimL, this.rimR);
    // Environment for reflections: the garage itself (light strips) baked into a PMREM.
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x020306);
    const envStrip = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(6) });
    for (const x of [-4.5, 0, 4.5]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 14), envStrip);
      m.position.set(x, 10, 0);
      envScene.add(m);
    }
    const envSide = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3fe0ff).multiplyScalar(1.5) });
    const sideA = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 20), envSide);
    sideA.position.set(-12, 3, 0);
    envScene.add(sideA);
    const sideB = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3df0).multiplyScalar(1.2) }));
    sideB.position.set(12, 3, 0);
    envScene.add(sideB);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.env = pm.fromScene(envScene, 0.02).texture;
    pm.dispose();
    s.environment = this.env;
    s.environmentIntensity = 0.9;
  }

  bindPointer() {
    const el = document.getElementById('game');
    el.addEventListener('pointerdown', (e) => {
      if (!this.active || this.mode !== 'garage') return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    window.addEventListener('pointerup', () => {
      this.dragging = false;
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.camYaw -= (e.clientX - this.lastX) * 0.006;
      this.camPitch = clamp(this.camPitch + (e.clientY - this.lastY) * 0.003, 0.02, 0.6);
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.idle = 0;
    });
    el.addEventListener('wheel', (e) => {
      if (!this.active || this.mode !== 'garage') return;
      this.camDist = clamp(this.camDist + e.deltaY * 0.004, 5, 11);
    }, { passive: true });
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
    this.model = null;
  }

  setMode(mode) {
    this.mode = mode;
  }

  update(dt, camera) {
    this.time += dt;
    const t = this.time;
    this.idle = (this.idle || 0) + dt;
    // Turntable: slow constant spin on the title screen; in the garage it spins when idle.
    const spin = this.mode === 'title' ? 0.18 : this.idle > 4 ? 0.12 : 0;
    this.yaw += spin * dt;
    this.table.rotation.y = this.yaw;
    // Sweeping spot lights across the paint.
    this.sweeps.forEach((l, i) => {
      const a = t * (0.35 + i * 0.12) + i * 2.1;
      l.position.set(Math.cos(a) * 9, 9.5, Math.sin(a) * 9);
      l.target.position.set(Math.sin(t * 0.6 + i) * 2.2, 0.4, Math.cos(t * 0.45 + i * 1.7) * 3.4);
      l.target.updateMatrixWorld();
    });
    this.rim.material.color.setHSL(0.52 + Math.sin(t * 0.3) * 0.05, 1, 0.5).multiplyScalar(2.5);
    // Camera: title = low cinematic side view (car offset to the right of the menu);
    // garage = orbit (drag to rotate).
    const title = this.mode === 'title';
    const yaw = title ? -0.95 + Math.sin(t * 0.08) * 0.08 : this.camYaw;
    const pitch = title ? 0.12 : this.camPitch;
    const dist = title ? 8.4 : this.camDist;
    this.cy = damp(this.cy ?? yaw, yaw, 4, dt);
    this.cp = damp(this.cp ?? pitch, pitch, 4, dt);
    this.cd = damp(this.cd ?? dist, dist, 4, dt);
    camera.position.set(Math.sin(this.cy) * Math.cos(this.cp) * this.cd, 0.9 + Math.sin(this.cp) * this.cd, Math.cos(this.cy) * Math.cos(this.cp) * this.cd);
    // Aim beside the car so it sits right of the title menu / left of the garage panel.
    const side = title ? -2.1 : 2.3;
    const look = new THREE.Vector3(Math.cos(this.cy) * side, title ? 0.75 : 0.8, -Math.sin(this.cy) * side);
    camera.lookAt(look);
    camera.fov = title ? 42 : 45;
    camera.updateProjectionMatrix();
  }
}
