// World-space activity markers: tall light columns for mission/race starts and objectives
// (with a floating name label and a pulsing ground ring) and glowing gates for checkpoints.
import * as THREE from 'three';
import { textTexture } from '../world/Textures.js';

const columnVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const columnFrag = /* glsl */ `
uniform vec3 color;
uniform float time;
uniform float opacity;
varying vec2 vUv;
void main() {
  float fade = pow(1.0 - vUv.y, 1.6);
  float bands = 0.65 + 0.35 * sin(vUv.y * 60.0 - time * 4.0);
  float edge = 0.55 + 0.45 * pow(abs(sin(vUv.x * 3.14159 * 6.0)), 6.0);
  gl_FragColor = vec4(color * bands * edge * fade * 1.6, fade * opacity);
}`;

function columnMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, time: { value: 0 }, opacity: { value: 0.85 } },
    vertexShader: columnVert,
    fragmentShader: columnFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
}

let ringTex = null;
function ringTexture() {
  if (ringTex) return ringTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 40, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.8, 'rgba(255,255,255,0)');
  g.addColorStop(0.9, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  ringTex = new THREE.CanvasTexture(c);
  return ringTex;
}

export class MarkerSystem {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'markers';
    scene.add(this.group);
    this.items = [];
    this.time = 0;
    this.colGeo = new THREE.CylinderGeometry(3.2, 3.2, 70, 24, 1, true);
    this.colGeo.translate(0, 35, 0);
    this.ringGeo = new THREE.PlaneGeometry(12, 12);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.gateGeo = new THREE.TorusGeometry(7.5, 0.28, 8, 48);
  }

  // kind: 'column' | 'gate'. Returns a handle with remove(), setVisible(), setColor(), move().
  add({ kind = 'column', pos, dir = null, color = 0xffd23f, label = null, scale = 1 }) {
    const root = new THREE.Group();
    root.position.copy(pos);
    const mat = columnMaterial(color);
    const parts = [];
    if (kind === 'column') {
      const col = new THREE.Mesh(this.colGeo, mat);
      col.scale.set(scale, 1, scale);
      col.renderOrder = 5;
      root.add(col);
      parts.push(col);
    } else {
      const gm = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const gate = new THREE.Mesh(this.gateGeo, gm);
      gate.position.y = 6.5;
      if (dir) gate.rotation.y = Math.atan2(dir.x, dir.z);
      gate.scale.setScalar(scale);
      root.add(gate);
      parts.push(gate);
      const beam = new THREE.Mesh(this.colGeo, mat);
      beam.scale.set(0.12, 0.5, 0.12);
      beam.position.y = 14;
      root.add(beam);
      parts.push(beam);
      root.userData.gateMat = gm;
    }
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.9), map: ringTexture(), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.position.y = 0.15;
    ring.scale.setScalar(scale);
    root.add(ring);
    let sprite = null;
    if (label) {
      const tex = textTexture(label, { w: 1024, h: 128, color: '#ffffff', font: 'bold 60px Arial', bg: null, stroke: 'rgba(0,0,0,0.85)' });
      sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
      sprite.scale.set(24, 3, 1);
      sprite.position.y = 12;
      sprite.renderOrder = 10;
      root.add(sprite);
    }
    this.group.add(root);
    const item = {
      root, mat, ring, ringMat, sprite, kind, color,
      remove: () => {
        this.group.remove(root);
        mat.dispose();
        ringMat.dispose();
        if (root.userData.gateMat) root.userData.gateMat.dispose();
        if (sprite) sprite.material.dispose(); // label textures are shared via the texture cache
        const i = this.items.indexOf(item);
        if (i >= 0) this.items.splice(i, 1);
      },
      setVisible: (v) => {
        root.visible = v;
      },
      setColor: (c) => {
        mat.uniforms.color.value.set(c);
        ringMat.color.set(c).multiplyScalar(0.9);
        if (root.userData.gateMat) root.userData.gateMat.color.set(c).multiplyScalar(2.2);
      },
      move: (p, d) => {
        root.position.copy(p);
        if (d && kind === 'gate') parts[0].rotation.y = Math.atan2(d.x, d.z);
      },
    };
    this.items.push(item);
    return item;
  }

  clear() {
    for (const it of [...this.items]) it.remove();
  }

  update(dt, camPos, columns = true) {
    this.time += dt;
    const t = this.time;
    for (const it of this.items) {
      if (!it.root.visible) continue;
      // Light columns belong to Missions / Career only; elsewhere the ring and label remain.
      if (it.kind === 'column') it.root.children[0].visible = columns;
      it.mat.uniforms.time.value = t;
      // Fade the column out when the camera is inside it (it would wash the whole screen).
      const p = it.root.position;
      const dc = Math.hypot(camPos.x - p.x, camPos.z - p.z);
      it.mat.uniforms.opacity.value = 0.85 * Math.min(1, Math.max(0, (dc - 5) / 12));
      const s = 1 + 0.12 * Math.sin(t * 3);
      it.ring.scale.set(s, 1, s);
      if (it.sprite) {
        // Keep labels readable at distance.
        const d = it.root.position.distanceTo(camPos);
        const k = Math.max(1, d / 60);
        it.sprite.scale.set(24 * k, 3 * k, 1);
        it.sprite.position.y = 12 + (k - 1) * 4;
      }
    }
  }
}
