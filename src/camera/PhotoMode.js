// Photo Mode [P]: pauses the game, frees the camera (WASD / arrows to fly, mouse drag or
// right stick to look, Q/E down/up), depth of field focused on the car, filters, HUD hidden.
import * as THREE from 'three';
import { clamp } from '../util/math.js';

const FILTERS = [
  { name: 'Neutral', sat: 1.18, warmth: 1, mono: 0 },
  { name: 'Noir', sat: 0.0, warmth: 0, mono: 1 },
  { name: 'Neon', sat: 1.6, warmth: 0.6, mono: 0 },
  { name: 'Warm Film', sat: 1.0, warmth: 2.2, mono: 0 },
  { name: 'Cold Steel', sat: 0.7, warmth: -1, mono: 0 },
];

export class PhotoMode {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.yaw = 0;
    this.pitch = 0;
    this.pos = new THREE.Vector3();
    this.filter = 0;
    this.dragging = false;
    this.el = document.createElement('div');
    this.el.className = 'photo-ui hidden';
    this.el.innerHTML = '<div class="photo-title">PHOTO MODE</div><div class="photo-help">WASD / Arrows move &nbsp; Q/E down/up &nbsp; Drag to look &nbsp; Wheel: focus &nbsp; F: filter &nbsp; H: hide UI &nbsp; P / Esc: exit</div><div class="photo-filter"></div>';
    document.body.appendChild(this.el);
    const canvas = game.gfx.renderer.domElement;
    canvas.addEventListener('mousedown', () => {
      if (this.active) this.dragging = true;
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.active || !this.dragging) return;
      this.yaw -= e.movementX * 0.004;
      this.pitch = clamp(this.pitch - e.movementY * 0.004, -1.4, 1.4);
    });
    window.addEventListener('wheel', (e) => {
      if (!this.active) return;
      this.focusOffset = clamp((this.focusOffset || 0) + e.deltaY * 0.01, -20, 60);
    });
  }

  toggle() {
    if (this.active) this.exit();
    else this.enter();
  }

  enter() {
    const g = this.game;
    this.active = true;
    this.prevState = g.state;
    g.state = 'photo';
    const cam = g.camera;
    this.pos.copy(cam.position);
    const e = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;
    this.focusOffset = 0;
    g.hud.show(false);
    this.el.classList.remove('hidden');
    g.gfx.setDof(true);
    this.applyFilter();
    g.cameraCtl.playShot({ type: 'free', duration: 0 });
  }

  exit() {
    const g = this.game;
    this.active = false;
    g.state = this.prevState || 'playing';
    g.hud.show(true);
    this.el.classList.add('hidden');
    g.gfx.setDof(false);
    this.filter = 0;
    this.applyFilter();
    g.cameraCtl.clearShot();
    g.cameraCtl.initialized = false;
  }

  applyFilter() {
    const f = FILTERS[this.filter];
    const u = this.game.gfx.grade.uniforms;
    u.get('saturation').value = f.sat;
    u.get('warmth').value = f.warmth;
    this.el.querySelector('.photo-filter').textContent = `Filter: ${f.name}`;
  }

  update(realDt) {
    if (!this.active) return;
    const g = this.game;
    const i = g.input;
    if (i.pressed('pause') || i.pressed('photo')) {
      this.exit();
      return;
    }
    if (i.pressed('ghost')) {
      this.filter = (this.filter + 1) % FILTERS.length;
      this.applyFilter();
    }
    if (i.pressed('help')) this.el.classList.toggle('hidden');
    const sp = (i.keyDown('rocket') ? 30 : 8) * realDt;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    if (i.keyDown('throttle')) this.pos.addScaledVector(fwd, sp);
    if (i.keyDown('brake')) this.pos.addScaledVector(fwd, -sp);
    if (i.keyDown('left')) this.pos.addScaledVector(right, -sp);
    if (i.keyDown('right')) this.pos.addScaledVector(right, sp);
    if (i.keyDown('rollRight')) this.pos.y += sp;
    if (i.keyDown('rollLeft')) this.pos.y -= sp;
    if (i.pad) {
      this.yaw -= (i.pad.axes[2] || 0) * realDt * 2;
      this.pitch = clamp(this.pitch - (i.pad.axes[3] || 0) * realDt * 2, -1.4, 1.4);
      this.pos.addScaledVector(fwd, -(i.pad.axes[1] || 0) * sp * 2);
      this.pos.addScaledVector(right, (i.pad.axes[0] || 0) * sp * 2);
    }
    // Keep the camera within 60 m of the car.
    const car = g.playerVisual.root.position;
    const d = this.pos.distanceTo(car);
    if (d > 60) this.pos.sub(car).multiplyScalar(60 / d).add(car);
    const cam = g.camera;
    cam.position.copy(this.pos);
    cam.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    cam.fov = 50;
    cam.updateProjectionMatrix();
    g.gfx.setDofFocus(Math.max(0.5, cam.position.distanceTo(car) + (this.focusOffset || 0)));
  }
}
