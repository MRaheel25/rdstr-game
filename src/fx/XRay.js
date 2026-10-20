// X-Ray view (X): police, rivals, traffic and the player's own car glow through buildings as
// fresnel-edged silhouettes (police red/blue, rivals magenta, traffic dim white), the
// helicopter and drones as rings. A cool tint marks the mode.
import * as THREE from 'three';

const vert = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const frag = /* glsl */ `
uniform vec3 color;
uniform float strength;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float a = (0.12 + pow(f, 2.2) * 0.9) * strength;
  gl_FragColor = vec4(color * a, a);
}`;

function ghostMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, strength: { value: 1 } },
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
}

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

export class XRay {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.group = new THREE.Group();
    this.group.renderOrder = 50;
    this.group.visible = false;
    game.scene.add(this.group);
    this.ghosts = new Map(); // model root -> mesh
    this.geoCache = new WeakMap();
    this.mats = {
      police: ghostMaterial(0xff3048),
      policeB: ghostMaterial(0x3070ff),
      rival: ghostMaterial(0xff3df0),
      traffic: ghostMaterial(0x9fb2c8),
      player: ghostMaterial(0x3fe0ff),
      air: ghostMaterial(0xffffff),
    };
    this.mats.traffic.uniforms.strength.value = 0.55;
    this.mats.player.uniforms.strength.value = 0.35;
    this.ringGeo = new THREE.TorusGeometry(3, 0.25, 6, 32);
    this.ringGeo.rotateX(Math.PI / 2);
  }

  toggle() {
    this.on = !this.on;
    this.group.visible = this.on;
    if (!this.on) this.clear();
    if (this.game.audio && this.game.audio.ok) this.game.audio.ui(this.on ? 'click' : 'back');
  }

  clear() {
    for (const m of this.ghosts.values()) this.group.remove(m);
    this.ghosts.clear();
  }

  // Local-space bounds as a box geometry (cached per model): the physics chassis for vehicles,
  // otherwise the model's own bounds.
  geometryFor(root, cfg = null) {
    let g = this.geoCache.get(root);
    if (g) return g;
    if (cfg && cfg.chassis) {
      _box.makeEmpty();
      for (const c of cfg.chassis) {
        _box.expandByPoint(_center.set(c.offset[0] - c.half[0], c.offset[1] - c.half[1], c.offset[2] - c.half[2]));
        _box.expandByPoint(_center.set(c.offset[0] + c.half[0], c.offset[1] + c.half[1], c.offset[2] + c.half[2]));
      }
      _box.expandByScalar(0.08);
      _box.getSize(_size);
      _box.getCenter(_center);
      g = new THREE.BoxGeometry(_size.x, _size.y, _size.z);
      g.translate(_center.x, _center.y, _center.z);
      this.geoCache.set(root, g);
      return g;
    }
    const pos = root.position.clone();
    const quat = root.quaternion.clone();
    root.position.set(0, 0, 0);
    root.quaternion.identity();
    root.updateMatrixWorld(true);
    _box.setFromObject(root);
    root.position.copy(pos);
    root.quaternion.copy(quat);
    root.updateMatrixWorld(true);
    _box.getSize(_size);
    _box.getCenter(_center);
    g = new THREE.BoxGeometry(Math.min(_size.x, 3.4) * 0.98, Math.min(_size.y, 3.6) * 0.9, Math.min(_size.z, 7.5) * 0.98, 1, 1, 1);
    g.translate(_center.x, _center.y, _center.z);
    this.geoCache.set(root, g);
    return g;
  }

  ghost(root, mat, cfg = null) {
    let m = this.ghosts.get(root);
    if (!m) {
      m = new THREE.Mesh(this.geometryFor(root, cfg), mat);
      m.matrixAutoUpdate = false;
      m.renderOrder = 50;
      m.frustumCulled = false;
      this.group.add(m);
      this.ghosts.set(root, m);
    }
    m.material = mat;
    m.matrix.copy(root.matrixWorld);
    m.matrixWorldNeedsUpdate = true;
    m.userData.seen = this.frame;
    return m;
  }

  update(realDt) {
    if (!this.on) return;
    const g = this.game;
    this.frame = (this.frame || 0) + 1;
    const cam = g.camera.position;
    const t = performance.now() * 0.006;
    for (const n of g.npcs) {
      if (!n.model.root.visible || n.vehicle.wrecked) continue;
      if (n.model.root.position.distanceToSquared(cam) > 420 * 420) continue;
      const mat = n.kind === 'police' ? (Math.sin(t + n.vehicle.position.x) > 0 ? this.mats.police : this.mats.policeB) : n.kind === 'rival' ? this.mats.rival : this.mats.traffic;
      this.ghost(n.model.root, mat, n.vehicle.cfg);
    }
    for (const car of g.traffic.cars) {
      if (!car.model.root.visible || car.pos.distanceToSquared(cam) > 260 * 260) continue;
      this.ghost(car.model.root, this.mats.traffic);
    }
    this.ghost(g.playerVisual.root, this.mats.player, g.player.cfg);
    // Air units.
    const P = g.police;
    const air = [];
    if (P.heli) air.push(P.heli.model.root || P.heli.model.group);
    for (const d of P.drones) if (!d.dead && d.model) air.push(d.model.root);
    for (const r of air) {
      if (!r) continue;
      let m = this.ghosts.get(r);
      if (!m) {
        m = new THREE.Mesh(this.ringGeo, this.mats.air);
        m.matrixAutoUpdate = false;
        m.frustumCulled = false;
        this.group.add(m);
        this.ghosts.set(r, m);
      }
      m.matrix.copy(r.matrixWorld);
      m.matrixWorldNeedsUpdate = true;
      m.userData.seen = this.frame;
    }
    // Drop ghosts whose vehicles are gone.
    for (const [root, m] of this.ghosts) {
      if (m.userData.seen !== this.frame) {
        this.group.remove(m);
        this.ghosts.delete(root);
      }
    }
  }
}
