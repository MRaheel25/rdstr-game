// Hand-picked camera shots for the mode / district / track cards. Each shot names a camera,
// a look-at point, the conditions to render under (bright daylight by default) and an
// optional stage: temporary props (cars, a start gantry, a passenger, a bank...) that sit in
// the scene only while the still is rendered (Game.renderPreview).
import * as THREE from 'three';
import { RoadsterModel } from '../vehicle/models/RoadsterModel.js';
import { RivalModel, RIVALS } from '../vehicle/models/RivalModels.js';
import { CruiserModel } from '../vehicle/models/PoliceModels.js';
import { CivilianModel } from '../vehicle/models/CivilianModels.js';
import { ROADSTER, RIVAL, POLICE_CRUISER } from '../vehicle/VehicleConfig.js';
import { textTexture } from '../world/Textures.js';
import { TAXI_STANDS } from '../game/Taxi.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DOWN = V(0, -1, 0);
const CAR_Y = 0.55; // lofted car visuals: root height above the road

export const MODE_ACCENTS = { free: '#1f7bff', race: '#ff3b4a', heist: '#ffb02e', career: '#a060ff', taxi: '#ffc21a', kids: '#2fd36a' };
export const DISTRICT_ACCENTS = { downtown: '#1f7bff', highway: '#ff7a1a', harbor: '#18b7c9', construction: '#ffb02e', canyon: '#d0763a', waterfront: '#3fa9ff' };

// Ground height under (x, z), ignoring nothing (decks count).
function groundAt(game, x, z) {
  const hit = game.physics.raycast(V(x, 400, z), DOWN, 600, game.activities.groundGroups, null);
  return hit ? 400 - hit.timeOfImpact : 0;
}

// Road frame: nearest road point, its direction and right vector; P(f, s, h) walks along it.
function roadFrame(game, x, z, filter) {
  const r = game.world.graph.nearest(V(x, 0, z), filter || ((e) => e.kind !== 'stunt' && e.kind !== 'highway' && e.kind !== 'ramp'));
  const p = r ? r.point.clone() : V(x, groundAt(game, x, z), z);
  const dir = r ? r.dir.clone().setY(0).normalize() : V(0, 0, -1);
  const right = V(-dir.z, 0, dir.x);
  const e = r && r.edge;
  const half = e ? ((e.lanes || 2) * (e.laneWidth || 4.7)) / 2 : 9;
  const P = (f, s = 0, h = 0) => p.clone().addScaledVector(dir, f).addScaledVector(right, s).add(V(0, h, 0));
  return { p, dir, right, half, P, yaw: Math.atan2(-dir.x, -dir.z) };
}

function place(group, obj, pos, yaw) {
  obj.position.copy(pos);
  obj.rotation.y = yaw;
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  group.add(obj);
  return obj;
}

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...o });
const glow = (color, k = 3) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) });
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

// Models are built once and re-used by every still.
const cache = {};
function roadster() {
  return (cache.roadster ||= new RoadsterModel(ROADSTER, 'pearlWhite')).root;
}
function rival(i) {
  return (cache['rival' + i] ||= new RivalModel(RIVAL, RIVALS[i])).root;
}
function cruiser(i) {
  if (!cache['cop' + i]) {
    const m = new CruiserModel(POLICE_CRUISER, 10 + i);
    m.lightBar.red.color.setRGB(1, 0.05, 0.03).multiplyScalar(i % 2 ? 1 : 6);
    m.lightBar.blue.color.setRGB(0.05, 0.25, 1).multiplyScalar(i % 2 ? 7 : 1);
    cache['cop' + i] = m;
  }
  return cache['cop' + i].root;
}
function civilian(key, type, color) {
  return (cache[key] ||= new CivilianModel(type, color)).root;
}

// A simple standing person; `wave` raises the right arm.
function person(shirt, wave = false) {
  const g = new THREE.Group();
  const skin = std(0xc89070);
  for (const s of [-1, 1]) {
    const leg = box(0.16, 0.85, 0.18, std(0x23262e));
    leg.position.set(s * 0.11, 0.43, 0);
    g.add(leg);
  }
  const torso = box(0.46, 0.66, 0.26, std(shirt));
  torso.position.y = 1.18;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), skin);
  head.position.y = 1.67;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0x2a1a10));
  hair.position.y = 1.69;
  g.add(hair);
  for (const s of [-1, 1]) {
    const up = wave && s > 0;
    const arm = box(0.12, 0.62, 0.14, std(shirt));
    arm.position.set(s * 0.31, up ? 1.72 : 1.17, 0);
    if (up) arm.rotation.z = -0.35;
    g.add(arm);
  }
  return g;
}

function sign(text, w, h, bg, color) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textTexture(text, { w: 512, h: Math.round((512 * h) / w), bg, color, font: `bold ${Math.round((512 * h) / w * 0.62)}px Arial` }), color: new THREE.Color(1.15, 1.15, 1.15) }));
}

// Start / finish gantry across the road at frame point f, green lights, banners both ways.
function gantry(group, F, f) {
  const W = F.half * 2 + 4;
  const steel = std(0x2a2d33, { metalness: 0.8, roughness: 0.4 });
  for (const s of [-1, 1]) place(group, box(0.8, 7.5, 0.8, steel), F.P(f, s * W / 2, 3.75), F.yaw);
  place(group, box(W + 1, 1.4, 0.7, steel), F.P(f, 0, 7.6), F.yaw);
  for (const back of [0, Math.PI]) {
    const b = sign('START  ·  FINISH', W - 4, 1.2, '#0b0e14', '#ffffff');
    place(group, b, F.P(f + (back ? -0.38 : 0.38), 0, 7.6), F.yaw + back + Math.PI);
    b.castShadow = false;
  }
  for (let k = 0; k < 5; k++) place(group, new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), glow(0x20ff60, 4)), F.P(f + 0.5, (k - 2) * 1.3, 6.3), F.yaw);
  // Chequered strip on the road.
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 16;
  const x = c.getContext('2d');
  for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) {
    x.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4';
    x.fillRect(i * 8, j * 8, 8, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(W - 2, 1.2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4 }));
  strip.rotation.x = -Math.PI / 2;
  const s0 = new THREE.Group();
  s0.add(strip);
  place(group, s0, F.P(f, 0, 0.03), F.yaw);
}

// Grid of rivals behind the gantry.
function grid(group, F, f0, n = 4) {
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 2);
    const side = i % 2 ? 1 : -1;
    place(group, rival([0, 5, 7, 2, 4, 1][i]), F.P(f0 - row * 8 - (side > 0 ? 3 : 0), side * Math.min(3, F.half * 0.35), CAR_Y), F.yaw);
  }
}

function bank(group, F, f, s) {
  const stone = std(0xe8e0cc, { roughness: 0.75 });
  const g = new THREE.Group();
  const W = 26;
  const D = 10;
  const body = box(W, 13, D, stone);
  body.position.set(0, 6.5, D / 2 + 3);
  g.add(body);
  const steps = box(W + 2, 0.9, 3, std(0xd8d0bc));
  steps.position.set(0, 0.45, 1.5);
  g.add(steps);
  for (let k = 0; k < 6; k++) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 10.5, 16), stone);
    col.position.set(-W / 2 + 2.2 + k * ((W - 4.4) / 5), 6.15, 1.6);
    g.add(col);
  }
  const entab = box(W + 1, 1.4, 3.6, stone);
  entab.position.set(0, 12, 2.6);
  g.add(entab);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(W / 2 + 1, W / 2 + 1, 3.6, 3, 1), stone);
  ped.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  ped.scale.set(0.24, 1, 1);
  ped.position.set(0, 13.2, 2.6);
  g.add(ped);
  const name = sign('MERIDIAN BANK', 14, 1.3, '#1a2230', '#f0c860');
  name.position.set(0, 12, 0.78);
  name.rotation.y = Math.PI;
  g.add(name);
  const door = box(3.4, 5.4, 0.3, std(0x3a2a18, { metalness: 0.5 }));
  door.position.set(0, 3.6, 3.05);
  g.add(door);
  // Front faces the road: local +z points away from it.
  place(group, g, F.P(f, s, 0), Math.atan2(F.right.x * Math.sign(s), F.right.z * Math.sign(s)));
}

function balloons(group, at) {
  const cols = [0xff3b6b, 0xffd23f, 0x3ad1ff, 0x7cff5a, 0xff8a1a, 0xb46bff, 0xff5ad8];
  for (let i = 0; i < 22; i++) {
    const a = i * 2.4;
    const r = 0.6 + (i % 5) * 0.35;
    const y = 4.2 + ((i * 7) % 5) * 0.45;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), std(cols[i % cols.length], { roughness: 0.25, emissive: cols[i % cols.length], emissiveIntensity: 0.15 }));
    b.scale.y = 1.18;
    place(group, b, V(at.x + Math.cos(a) * r, at.y + y, at.z + Math.sin(a) * r), 0);
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, y - 1, 4), std(0xffffff));
    place(group, str, V(at.x + Math.cos(a) * r * 0.5, at.y + 1 + (y - 1) / 2, at.z + Math.sin(a) * r * 0.5), 0);
  }
}

// Keeps a camera at least `clear` m above the ground.
function lift(game, cam, clear = 3) {
  cam.y = Math.max(cam.y, groundAt(game, cam.x, cam.z) + clear);
  return cam;
}

function shot(game, cam, look, stage, opts = {}) {
  return { cam: lift(game, cam), look, stage, fov: opts.fov || 52, tod: opts.tod || 'noon', weather: opts.weather || 'clear' };
}

export function modeShot(game, id) {
  const S = {
    free: () => {
      const F = roadFrame(game, game.world.spawn.position.x, game.world.spawn.position.z);
      return shot(game, F.P(10, -4.5, 1.6), F.P(-8, 1.5, 5.5), (g) => place(g, roadster(), F.P(0, 1.5, CAR_Y), F.yaw));
    },
    race: () => {
      const def = game.activities.defs.find((d) => d.id === 'downtown-circuit') || game.activities.defs.find((d) => d.kind === 'race');
      const F = roadFrame(game, def.start.x, def.start.z);
      return shot(game, F.P(24, 2, 3.2), F.P(0, 0, 2.6), (g) => {
        gantry(g, F, 6);
        grid(g, F, 2, 4);
      });
    },
    taxi: () => {
      const [x, z] = TAXI_STANDS[0];
      const F = roadFrame(game, x, z);
      const kerb = F.half - 1.3;
      return shot(game, F.P(-11, kerb - 6, 2.2), F.P(1.5, kerb + 1.2, 1.3), (g) => {
        const taxi = civilian('taxi', 'sedan', 0xf2c200);
        const roof = sign('TAXI', 0.7, 0.24, '#ffc21a', '#111111');
        roof.position.set(0, 1.62, 0.1);
        if (!taxi.userData.roof) {
          taxi.add(roof);
          const back = roof.clone();
          back.rotation.y = Math.PI;
          taxi.add(back);
          taxi.userData.roof = true;
        }
        place(g, taxi, F.P(0, kerb, 0), F.yaw);
        place(g, person(0x2a7ad8, true), F.P(1.8, kerb + 3.2, 0.15), F.yaw - Math.PI / 2);
        const post = box(0.12, 3, 0.12, std(0x30343a, { metalness: 0.7 }));
        place(g, post, F.P(5, kerb + 3.6, 1.5), F.yaw);
        const sg = sign('TAXI', 1.4, 0.55, '#ffc21a', '#111111');
        place(g, sg, F.P(5, kerb + 3.6, 3.1), F.yaw - Math.PI / 2);
      });
    },
    kids: () => {
      const at = V(-372, 0, -232);
      at.y = groundAt(game, at.x, at.z);
      return shot(game, V(-336, at.y + 9, -196), V(-375, at.y + 3, -240), (g) => {
        balloons(g, at);
        const cols = [0xff4fa0, 0x3ad1ff, 0x8aff3a];
        cols.forEach((c, i) => place(g, civilian('kid' + i, 'hatch', c), V(at.x + 6 + i * 3.4, at.y + 0.02, at.z + 9 - i * 2.2), 0.5 + i * 0.4));
      });
    },
    heist: () => {
      const F = roadFrame(game, 244, -300);
      return shot(game, F.P(-24, -F.half + 2, 4.5), F.P(2, F.half + 4, 5), (g) => {
        bank(g, F, 4, F.half + 3.5);
        place(g, roadster(), F.P(2, F.half - 3, CAR_Y), F.yaw);
        place(g, cruiser(0), F.P(-7, 0, CAR_Y), F.yaw + 0.7);
        place(g, cruiser(1), F.P(12, 1, CAR_Y), F.yaw + 2.6);
      });
    },
    career: () => shot(game, V(-860, 38, 420), V(-40, 70, -60), null, { fov: 48 }),
  };
  return (S[id] || S.free)();
}

export function districtShot(game, id) {
  const S = {
    downtown: () => shot(game, V(9, 8, 300), V(-6, 55, -200), null, { fov: 56 }),
    highway: () => {
      const F = roadFrame(game, 120, 600, (e) => e.kind === 'highway');
      return shot(game, F.P(-30, 34, 2), F.P(10, 0, 4), (g) => {
        place(g, rival(3), F.P(4, -4, CAR_Y), F.yaw);
        place(g, civilian('hw1', 'suv', 0x16305a), F.P(-12, 3, 0), F.yaw);
      }, { fov: 58 });
    },
    harbor: () => shot(game, V(40, 16, 880), V(180, 24, 985), null),
    construction: () => shot(game, V(560, 10, 80), V(650, 32, -40), null, { fov: 58 }),
    canyon: () => shot(game, V(-250, 0, -1080), V(-418, 104, -1279), null, { fov: 55 }),
    waterfront: () => shot(game, V(-780, 10, -90), V(-620, 18, 80), null, { fov: 56 }),
  };
  const s = (S[id] || S.downtown)();
  if (id === 'canyon') s.cam.y = Math.max(s.cam.y, groundAt(game, s.cam.x, s.cam.z) + 40);
  return s;
}

// Race track card: the start gantry with the grid, in the track's own conditions.
export function trackShot(game, def) {
  const F = roadFrame(game, def.start.x, def.start.z, (e) => e.kind !== 'stunt');
  // Face the frame along the race direction.
  const fwd = V(-Math.sin(def.yaw || 0), 0, -Math.cos(def.yaw || 0));
  if (fwd.dot(F.dir) < 0) {
    F.dir.negate();
    F.right.negate();
    F.yaw = Math.atan2(-F.dir.x, -F.dir.z);
  }
  return shot(game, F.P(26, 3, 3.6), F.P(0, 0, 2.4), (g) => {
    gantry(g, F, 6);
    grid(g, F, 2, 4);
  }, { tod: def.tod === 'night' ? 'night' : def.tod, weather: def.weather });
}
