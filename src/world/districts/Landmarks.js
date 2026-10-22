// V2 key locations, marked on the minimap: Police Station (cruisers parked out front; units
// at higher heat drive out from here), Charging Stations, Repair Shops, the Garage / Tuning
// Shop and the GRAFIGATOR Design Studio landmark. Each registers service points in
// gen.services (used by game/Services.js) and icons in gen.pois.
import * as THREE from 'three';
import { CURB_H, SIDEWALK_W } from '../CityGenerator.js';
import { textTexture } from '../Textures.js';
import { makeSign, drawLogo2D, BRAND } from '../Grafigator.js';

const Y0 = CURB_H;

// Local frame on a street-facing front: u along the facade, v inward (depth), y up.
function frame(fx, fz, nx, nz) {
  const rx = nz;
  const rz = -nx;
  const horiz = nz !== 0;
  return {
    horiz, nx, nz,
    p: (u, v) => ({ x: fx + rx * u - nx * v, z: fz + rz * u - nz * v }),
    size: (su, sv) => (horiz ? [su, sv] : [sv, su]),
    yaw: Math.atan2(nx, nz), // facing the street
  };
}

function solid(gen, F, batch, u, y, v, su, sy, sv, color) {
  const c = F.p(u, v);
  const [sx, sz] = F.size(su, sv);
  gen.solidBox(batch, c.x, y, c.z, sx, sy, sz, 0, { color, batchOpts: color ? { color: true } : {} });
}

function deco(gen, F, batch, u, y, v, su, sy, sv) {
  const c = F.p(u, v);
  const [sx, sz] = F.size(su, sv);
  gen.batch(c.x, c.z, batch).box(c.x, y, c.z, sx, sy, sz, 0);
}

// Flat sign quad facing the street.
function signQuad(gen, F, u, y, v, w, h, material) {
  const c = F.p(u, v);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.position.set(c.x, y, c.z);
  m.rotation.y = F.yaw;
  gen.addStatic(m, false, { shadows: false });
  m.userData.decal = true;
  return m;
}

const signMat = (text, color, bg, font = 'bold 74px "Arial Black", Impact, sans-serif', w = 512) =>
  new THREE.MeshBasicMaterial({ map: textTexture(text, { w, h: 128, bg, color, font }), color: new THREE.Color(1.6, 1.6, 1.6) });

function poi(gen, kind, x, z, label) {
  gen.pois = gen.pois || [];
  gen.pois.push({ kind, x, z, label });
}

function service(gen, type, x, z, yaw, extra = {}) {
  gen.services = gen.services || [];
  const s = { type, x, y: Y0, z, yaw, r: 3.2, ...extra };
  gen.services.push(s);
  return s;
}

// ---- Police station ----------------------------------------------------------------------
// Station block at the back of the lot, a parking lot full of cruisers in front, exits onto
// the street (front = the lot's south edge).
export function policeStation(gen, lot) {
  const { x0, z0, x1, z1 } = lot;
  const F = frame((x0 + x1) / 2, z1, 0, 1);
  const W = x1 - x0 - SIDEWALK_W * 2;
  const D = z1 - z0;
  const bDepth = 26;
  const bV = D - SIDEWALK_W - bDepth / 2; // building centre depth
  // Main building (3 floors, blue-grey office facade) + entrance block.
  const b = gen.chunk(lot.x0 + 40, lot.z0 + 20).buildings;
  b.setColor(0.32, 0.38, 0.46);
  b.setFacade(12.3, 1, 3.6, 0.7);
  const c = F.p(0, bV);
  b.box(c.x, Y0 + 6.5, c.z, W - 10, 13, bDepth, 0, { baseY: Y0 });
  gen.physics.fixedBox(c.x, Y0 + 6.5, c.z, (W - 10) / 2, 6.5, bDepth / 2, { kind: 'building' });
  gen.buildings.push({ x: c.x, z: c.z, hx: (W - 10) / 2, hz: bDepth / 2, y0: Y0, h: 13 });
  b.setFacade(0, 0, 3.4, 0);
  b.setColor(0.18, 0.2, 0.26);
  b.box(c.x, Y0 + 13.6, c.z, W - 9, 1.2, bDepth + 1, 0);
  solid(gen, F, 'darkMetal', 0, Y0 + 2.6, bV - bDepth / 2 - 3, 16, 0.4, 6);
  for (const u of [-7.5, 7.5]) deco(gen, F, 'darkMetal', u, Y0 + 1.2, bV - bDepth / 2 - 5.6, 0.4, 2.4, 0.4);
  // Blue light band and signage.
  deco(gen, F, 'policeBlue', 0, Y0 + 12.2, bV - bDepth / 2 - 0.12, W - 10.4, 0.3, 0.1);
  signQuad(gen, F, 0, Y0 + 9.6, bV - bDepth / 2 - 0.2, 18, 4.5, signMat('POLICE', '#ffffff', '#10306a'));
  signQuad(gen, F, 0, Y0 + 3.4, bV - bDepth / 2 - 6.25, 14, 1.6, signMat('HALCYON BAY POLICE DEPT.', '#dfe8ff', '#0a0e18', 'bold 40px Arial', 1024));
  // Flag pole.
  const fp = F.p(W / 2 - 12, bV - bDepth / 2 - 8);
  gen.solidBox('metalPole', fp.x, Y0 + 6, fp.z, 0.2, 12, 0.2, 0);
  // Parking lot: asphalt, bay lines, cruisers.
  const lotV0 = SIDEWALK_W + 2;
  const lotV1 = bV - bDepth / 2 - 7;
  const pc = F.p(0, (lotV0 + lotV1) / 2);
  gen.batch(pc.x, pc.z, 'road').flatRect(pc.x, Y0 + 0.01, pc.z, W - 6, lotV1 - lotV0, 0, 8);
  const mk = gen.markings;
  mk.setColor(0.85, 0.85, 0.82);
  const rows = [lotV0 + 9, lotV1 - 6];
  const exits = [];
  rows.forEach((v, ri) => {
    for (let u = -W / 2 + 8; u < W / 2 - 8; u += 3.4) {
      const a = F.p(u - 1.7, v - 2.6);
      const bb = F.p(u - 1.7, v + 2.6);
      mk.quad(new THREE.Vector3(a.x - 0.06, Y0 + 0.03, a.z), new THREE.Vector3(a.x + 0.06, Y0 + 0.03, a.z), new THREE.Vector3(bb.x + 0.06, Y0 + 0.03, bb.z), new THREE.Vector3(bb.x - 0.06, Y0 + 0.03, bb.z), [[0, 0], [1, 0], [1, 1], [0, 1]], new THREE.Vector3(0, 1, 0));
      if ((Math.round(u * 7) + ri) % 3 !== 0) {
        const cp = F.p(u, v);
        gen.props.add('policeCar', cp.x, Y0, cp.z, ri ? 0 : Math.PI, {});
      }
    }
  });
  // Exits: drive lanes out to the street.
  for (const u of [-W / 4, W / 4]) {
    const e = F.p(u, lotV0 - 1);
    exits.push({ x: e.x, z: e.z, yaw: Math.PI }); // heading +z (out of the lot)
    const g = F.p(u, (lotV0 + lotV1) / 2);
    exits.push({ x: g.x, z: g.z, yaw: Math.PI });
  }
  for (const u of [-W / 2 + 4, W / 2 - 4]) {
    for (let v = lotV0; v < lotV1; v += 14) {
      const lp = F.p(u, v);
      gen.props.add('lamp', lp.x, Y0, lp.z, u < 0 ? Math.PI / 2 : -Math.PI / 2, { groundY: Y0 });
    }
  }
  gen.policeStation = { x: c.x, z: c.z, exits };
  poi(gen, 'police', c.x, c.z, 'Police Station');
}

// ---- Workshops: repair shop / tuning garage ----------------------------------------------
// Open service bays facing the street with a roller door over each; walls, roof and the bay
// dividers are solid, the bays are drive-in.
function workshop(gen, F, { bays = 2, label, accent, type, color }) {
  const bayW = 6;
  const W = bays * bayW + (bays + 1) * 0.6;
  const D = 14;
  const H = 6;
  const v0 = SIDEWALK_W + 1;
  const vc = v0 + D / 2;
  // Back wall, side walls, dividers, roof.
  solid(gen, F, 'paint', 0, Y0 + H / 2, v0 + D - 0.3, W, H, 0.6, color);
  for (let k = 0; k <= bays; k++) {
    const u = -W / 2 + 0.3 + k * (bayW + 0.6);
    solid(gen, F, 'paint', u, Y0 + H / 2, vc, 0.6, H, D, color);
  }
  solid(gen, F, 'paint', 0, Y0 + H + 0.3, vc, W + 0.4, 0.6, D + 0.4, color.map((c) => c * 0.7));
  // Header over the doors with the sign.
  solid(gen, F, 'darkMetal', 0, Y0 + H - 0.6, v0 + 0.2, W, 1.2, 0.4);
  signQuad(gen, F, 0, Y0 + H + 1.6, v0 - 0.05, Math.min(W + 2, 18), 2.2, signMat(label, '#ffffff', accent));
  deco(gen, F, 'lights', 0, Y0 + H - 1.25, v0 + 0.5, W - 1, 0.08, 0.3);
  const out = [];
  for (let k = 0; k < bays; k++) {
    const u = -W / 2 + 0.6 + bayW / 2 + k * (bayW + 0.6);
    const p = F.p(u, vc + 1);
    const door = F.p(u, v0 + 0.3);
    out.push(service(gen, type, p.x, p.z, F.yaw + Math.PI, { door: { x: door.x, z: door.z, w: bayW, h: H - 1.2, yaw: F.yaw }, r: 3.0 }));
    // Floor marking and a tool bench.
    const fl = F.p(u, vc);
    const [sx, sz] = F.size(bayW - 1, D - 2);
    gen.batch(fl.x, fl.z, 'concrete').flatRect(fl.x, Y0 + 0.02, fl.z, sx, sz, 0, 0.25);
  }
  return { W, D: D + v0 };
}

export function repairShop(gen, lot, side = 's') {
  const F = lotFront(lot, side);
  const w = workshop(gen, F, { bays: 2, label: 'REPAIR · COPV', accent: '#a8401a', type: 'repair', color: [0.55, 0.52, 0.48] });
  const c = F.p(0, w.D / 2);
  poi(gen, 'repair', c.x, c.z, 'Repair Shop');
  backBuilding(gen, lot, F, w.D + 6);
}

export function tuningShop(gen, lot, side = 's') {
  const F = lotFront(lot, side);
  const w = workshop(gen, F, { bays: 3, label: 'GARAGE · TUNING', accent: '#5a1aa8', type: 'tuning', color: [0.2, 0.2, 0.24] });
  const c = F.p(0, w.D / 2);
  poi(gen, 'tuning', c.x, c.z, 'Garage / Tuning');
  backBuilding(gen, lot, F, w.D + 6);
}

// ---- Charging station --------------------------------------------------------------------
export function chargingStation(gen, lot, side = 's') {
  const F = lotFront(lot, side);
  const bays = 4;
  const v0 = SIDEWALK_W + 2;
  const D = 14;
  const W = bays * 5;
  // Pad + canopy on posts.
  const pc = F.p(0, v0 + D / 2);
  const [sx, sz] = F.size(W + 4, D + 2);
  gen.batch(pc.x, pc.z, 'concrete').flatRect(pc.x, Y0 + 0.02, pc.z, sx, sz, 0, 0.25);
  solid(gen, F, 'paint', 0, Y0 + 5.4, v0 + D / 2, W + 4, 0.5, D + 2, [0.9, 0.92, 0.94]);
  deco(gen, F, 'chargeGlow', 0, Y0 + 5.1, v0 + D / 2, W + 3.6, 0.06, D + 1.6);
  for (const u of [-W / 2 - 1.5, W / 2 + 1.5]) for (const v of [v0, v0 + D]) solid(gen, F, 'darkMetal', u, Y0 + 2.6, v, 0.4, 5.2, 0.4);
  signQuad(gen, F, 0, Y0 + 6.3, v0 - 1.02, 14, 1.4, signMat('⚡ VOLT CHARGE', '#21e8ff', '#05121a', 'bold 64px Arial'));
  const mk = gen.markings;
  mk.setColor(0.2, 0.85, 1.0);
  for (let k = 0; k < bays; k++) {
    const u = -W / 2 + 2.5 + k * 5;
    const ch = F.p(u - 2.1, v0 + D - 1.2);
    gen.props.add('charger', ch.x, Y0, ch.z, F.yaw);
    const p = F.p(u, v0 + D / 2);
    service(gen, 'charge', p.x, p.z, F.yaw + Math.PI, { cable: { x: ch.x, y: Y0 + 1.3, z: ch.z } });
    for (const du of [-2.4, 2.4]) {
      const a = F.p(u + du, v0 + 2);
      const b = F.p(u + du, v0 + D - 0.5);
      mk.quad(new THREE.Vector3(a.x - 0.07, Y0 + 0.04, a.z - 0.07), new THREE.Vector3(a.x + 0.07, Y0 + 0.04, a.z + 0.07), new THREE.Vector3(b.x + 0.07, Y0 + 0.04, b.z + 0.07), new THREE.Vector3(b.x - 0.07, Y0 + 0.04, b.z - 0.07), [[0, 0], [1, 0], [1, 1], [0, 1]], new THREE.Vector3(0, 1, 0));
    }
  }
  poi(gen, 'charge', pc.x, pc.z, 'Charging Station');
  backBuilding(gen, lot, F, v0 + D + 6);
}

// Charging bays at an existing open area (parking lots), no canopy.
export function chargingBays(gen, x, z, yaw, count = 3) {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  for (let k = 0; k < count; k++) {
    const ox = -fz * (k - (count - 1) / 2) * 5;
    const oz = fx * (k - (count - 1) / 2) * 5;
    gen.props.add('charger', x + ox - fx * 3.2, Y0, z + oz - fz * 3.2, yaw);
    service(gen, 'charge', x + ox, z + oz, yaw, { cable: { x: x + ox - fx * 3.2, y: Y0 + 1.3, z: z + oz - fz * 3.2 } });
  }
  poi(gen, 'charge', x, z, 'Charging');
}

// A lot's street front by side: 's' (south edge, facing +z), 'n', 'e', 'w'.
function lotFront(lot, side) {
  const { x0, z0, x1, z1 } = lot;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  if (side === 'n') return frame(cx, z0, 0, -1);
  if (side === 'e') return frame(x1, cz, 1, 0);
  if (side === 'w') return frame(x0, cz, -1, 0);
  return frame(cx, z1, 0, 1);
}

// Fill the rest of a lot behind a landmark with an ordinary building.
function backBuilding(gen, lot, F, depth) {
  const { x0, z0, x1, z1 } = lot;
  const r = { x0: x0 + SIDEWALK_W, z0: z0 + SIDEWALK_W, x1: x1 - SIDEWALK_W, z1: z1 - SIDEWALK_W };
  if (F.nz > 0) r.z1 = z1 - depth;
  else if (F.nz < 0) r.z0 = z0 + depth;
  else if (F.nx > 0) r.x1 = x1 - depth;
  else r.x0 = x0 + depth;
  if (r.x1 - r.x0 > 12 && r.z1 - r.z0 > 12) gen.building(r.x0, r.z0, r.x1, r.z1, { kind: 'downtown', height: [16, 44], neon: 0.6 });
}

// ---- GRAFIGATOR Design Studio ------------------------------------------------------------
// Modern 4-storey block facing the west boulevard near the default spawn: glass storefront
// with a studio interior, a cantilevered top floor, lime / teal trim lighting, the extruded
// logo sign on the fascia, a rooftop sign and a small logo on the glass door.
export function grafigatorStudio(gen, lot) {
  const F = frame(lot.x0, (lot.z0 + lot.z1) / 2 + 6, -1, 0); // faces the boulevard (west)
  const W = 44; // along the facade
  const D = 26;
  const v0 = SIDEWALK_W + 1.5;
  const vc = v0 + D / 2;
  const GF = 5.2; // ground floor height
  const H = 18;
  const root = new THREE.Group();
  root.name = 'grafigator_studio';
  gen.root.add(root);
  // Upper floors: dark glass curtain wall.
  const b = gen.chunk(F.p(0, vc).x, F.p(0, vc).z).buildings;
  const c = F.p(0, vc);
  const [sx, sz] = F.size(W, D);
  b.setColor(0.08, 0.09, 0.1);
  b.setFacade(42.7, 2, 3.6, 0.55);
  b.box(c.x, Y0 + GF + (H - GF) / 2, c.z, sx, H - GF, sz, 0, { baseY: Y0 + GF });
  // Cantilevered top floor sliding out towards the street.
  const ct = F.p(-3, vc - 2.5);
  const [tsx, tsz] = F.size(W - 6, D + 5);
  b.setFacade(42.7, 2, 3.6, 0.7);
  b.setColor(0.86, 0.88, 0.86);
  b.box(ct.x, Y0 + H + 2, ct.z, tsx, 4, tsz, 0);
  gen.physics.fixedBox(c.x, Y0 + H / 2, c.z, sx / 2, H / 2, sz / 2, { kind: 'building' });
  gen.physics.fixedBox(ct.x, Y0 + H + 2, ct.z, tsx / 2, 2, tsz / 2, { kind: 'building' });
  gen.buildings.push({ x: c.x, z: c.z, hx: sx / 2, hz: sz / 2, y0: Y0, h: H + 4 });
  // Ground floor shell: back + side walls (plain), slab above, glass front.
  b.setFacade(0, 0, 3.4, 0);
  b.setColor(0.9, 0.9, 0.88);
  const wall = (u, v, su, sv) => {
    const p = F.p(u, v);
    const [wx, wz] = F.size(su, sv);
    b.box(p.x, Y0 + GF / 2, p.z, wx, GF, wz, 0, { baseY: Y0 });
  };
  wall(0, v0 + D - 0.2, W, 0.4);
  wall(-W / 2 + 0.2, vc, 0.4, D);
  wall(W / 2 - 0.2, vc, 0.4, D);
  const mats = {
    floor: new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.35, metalness: 0.1 }),
    desk: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.4 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5, metalness: 0.4 }),
    screen: new THREE.MeshBasicMaterial({ map: screenTexture(), color: new THREE.Color(1.4, 1.4, 1.4) }),
    poster: new THREE.MeshBasicMaterial({ map: posterTexture(), color: new THREE.Color(1.1, 1.1, 1.1) }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xbfe0e8, roughness: 0.04, metalness: 0, transmission: 0, transparent: true, opacity: 0.22, depthWrite: false }),
    lime: new THREE.MeshBasicMaterial({ color: new THREE.Color(BRAND.lime).multiplyScalar(2.2) }),
    teal: new THREE.MeshBasicMaterial({ color: new THREE.Color(BRAND.teal).multiplyScalar(2.2) }),
    ceiling: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6e8).multiplyScalar(1.6) }),
  };
  const put = (geo, mat, u, y, v, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    const p = F.p(u, v);
    m.position.set(p.x, y, p.z);
    m.rotation.y = F.yaw;
    m.castShadow = shadow;
    m.receiveShadow = true;
    root.add(m);
    return m;
  };
  // Floor, ceiling light panels.
  put(new THREE.BoxGeometry(W - 0.8, 0.1, D - 0.6), mats.floor, 0, Y0 + 0.05, vc, false);
  for (let u = -W / 2 + 5; u < W / 2 - 3; u += 8) put(new THREE.BoxGeometry(5, 0.05, 1.0), mats.ceiling, u, Y0 + GF - 0.1, vc - 2, false);
  // Desks with monitors, a big wall screen and design posters on the back wall.
  for (let k = 0; k < 6; k++) {
    const u = -W / 2 + 5 + k * 6.6;
    for (const v of [v0 + 6, v0 + 11]) {
      put(new THREE.BoxGeometry(3.2, 0.08, 1.4), mats.desk, u, Y0 + 0.78, v);
      put(new THREE.BoxGeometry(0.08, 0.74, 1.2), mats.dark, u - 1.5, Y0 + 0.39, v, false);
      put(new THREE.BoxGeometry(0.08, 0.74, 1.2), mats.dark, u + 1.5, Y0 + 0.39, v, false);
      const scr = put(new THREE.PlaneGeometry(1.1, 0.66), mats.screen, u - 0.7, Y0 + 1.25, v + 0.3, false);
      scr.rotation.y = F.yaw + Math.PI;
      const scr2 = put(new THREE.PlaneGeometry(1.1, 0.66), mats.screen, u + 0.7, Y0 + 1.25, v + 0.3, false);
      scr2.rotation.y = F.yaw + Math.PI;
    }
  }
  for (let k = 0; k < 5; k++) {
    const pst = put(new THREE.PlaneGeometry(3.2, 4.2), mats.poster, -W / 2 + 6 + k * 8, Y0 + 2.6, v0 + D - 0.45, false);
    pst.rotation.y = F.yaw + Math.PI;
    pst.material = mats.poster.clone();
    pst.material.map = posterTexture(k);
  }
  // Glass front with mullions, a door with the small logo.
  put(new THREE.PlaneGeometry(W - 0.6, GF - 0.3), mats.glass, 0, Y0 + GF / 2, v0 + 0.05, false).rotation.y = F.yaw;
  for (let u = -W / 2 + 0.4; u <= W / 2; u += 4.4) put(new THREE.BoxGeometry(0.12, GF, 0.15), mats.dark, u, Y0 + GF / 2, v0, false);
  const doorTex = doorTexture();
  const door = put(new THREE.PlaneGeometry(2.2, 3.0), new THREE.MeshBasicMaterial({ map: doorTex, transparent: true }), -4, Y0 + 1.5, v0 - 0.03, false);
  door.rotation.y = F.yaw;
  // Fascia band with the illuminated 3D sign; lime / teal trim lines.
  const fas = F.p(0, v0 - 0.35);
  const [fx, fz] = F.size(W + 0.6, 0.7);
  gen.solidBox('darkMetal', fas.x, Y0 + GF + 0.8, fas.z, fx, 1.6, fz, 0);
  put(new THREE.BoxGeometry(W + 0.6, 0.12, 0.2), mats.teal, 0, Y0 + GF, v0 - 0.75, false);
  put(new THREE.BoxGeometry(W - 5.4, 0.14, 0.2), mats.lime, -3, Y0 + H + 4.05, v0 - 2.5 - 0.1, false);
  put(new THREE.BoxGeometry(W - 5.4, 0.14, 0.2), mats.teal, -3, Y0 + H - 0.05, v0 - 2.5 - 0.1, false);
  for (const u of [-W / 2, W / 2]) put(new THREE.BoxGeometry(0.16, H - GF, 0.16), mats.lime, u, Y0 + GF + (H - GF) / 2, v0 - 0.1, false);
  const sign = makeSign({ height: 1.25, sub: 'DESIGN STUDIO', backing: false, glow: 1 });
  const sp = F.p(4, v0 - 0.75);
  sign.position.set(sp.x, Y0 + GF + 0.85, sp.z);
  sign.rotation.y = F.yaw;
  root.add(sign);
  // Rooftop sign (large, faces the boulevard) on a steel frame.
  const roof = makeSign({ height: 3.4, sub: 'DESIGN STUDIO', backing: true, glow: 1 });
  const rp = F.p(-3, v0 + 2);
  roof.position.set(rp.x, Y0 + H + 4 + 3.6, rp.z);
  roof.rotation.y = F.yaw;
  root.add(roof);
  const rw = roof.userData.width + 3;
  for (const u of [-rw / 3, rw / 3]) put(new THREE.BoxGeometry(0.3, 2.2, 0.3), mats.dark, -3 + u, Y0 + H + 4 + 1.1, v0 + 2.2, true);
  root.traverse((o) => {
    o.userData.noCollider = true;
    if (o.isMesh) o.matrixAutoUpdate = true;
  });
  gen.landmarkLights = gen.landmarkLights || [];
  gen.landmarkLights.push({ x: sp.x, y: Y0 + GF + 1, z: sp.z, color: BRAND.teal });
  gen.neonLights && gen.neonLights.push({ x: sp.x, y: Y0 + GF + 1, z: sp.z, color: new THREE.Color(BRAND.teal), w: 12 });
  gen.grafigator = { x: c.x, z: c.z, front: F.p(0, -2) };
  poi(gen, 'grafigator', c.x, c.z, 'GRAFIGATOR Design Studio');
  // The rest of the lot behind it.
  gen.building(lot.x0 + SIDEWALK_W + D + 10, lot.z0 + SIDEWALK_W, lot.x1 - SIDEWALK_W, lot.z1 - SIDEWALK_W, { kind: 'downtown', height: [40, 90], tallChance: 0.3, neon: 0.8 });
}

// ---- canvas textures for the studio ------------------------------------------------------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let _screen;
function screenTexture() {
  if (_screen) return _screen;
  _screen = canvasTex(128, 80, (x, w, h) => {
    x.fillStyle = '#1b1e24';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#e7f75b';
    x.fillRect(6, 6, 40, 30);
    x.fillStyle = '#54dc9d';
    x.fillRect(52, 6, 70, 12);
    x.fillStyle = '#8a92a0';
    for (let i = 0; i < 6; i++) x.fillRect(52, 24 + i * 8, 40 + ((i * 17) % 30), 3);
    x.fillStyle = '#3a6aff';
    x.fillRect(6, 42, 40, 32);
  });
  return _screen;
}

function posterTexture(k = 0) {
  return canvasTex(192, 256, (x, w, h) => {
    const bgs = ['#e7f75b', '#54dc9d', '#15171a', '#f2f2ee', '#2a3a8a'];
    x.fillStyle = bgs[k % bgs.length];
    x.fillRect(0, 0, w, h);
    const ink = k % bgs.length === 2 || k % bgs.length === 4 ? '#e7f75b' : '#15171a';
    if (k % 2 === 0) drawLogo2D(x, 40, 170, 1.1, ink);
    else {
      x.fillStyle = ink;
      for (let i = 0; i < 5; i++) {
        x.beginPath();
        x.arc(96, 110, 80 - i * 15, 0, Math.PI * 2);
        x.lineWidth = 6;
        x.strokeStyle = ink;
        x.stroke();
      }
    }
    x.fillStyle = ink;
    x.font = 'bold 22px Arial';
    x.fillText(['BRAND', 'MOTION', 'IDENTITY', 'TYPE', 'DIGITAL'][k % 5], 14, 236);
  });
}

function doorTexture() {
  return canvasTex(128, 176, (x, w, h) => {
    x.fillStyle = 'rgba(180,220,230,0.25)';
    x.fillRect(0, 0, w, h);
    x.strokeStyle = '#15171a';
    x.lineWidth = 8;
    x.strokeRect(4, 4, w - 8, h - 8);
    drawLogo2D(x, 30, 100, 0.55, '#ffffff');
    x.fillStyle = '#e7f75b';
    x.fillRect(50, 120, 28, 4);
  });
}
