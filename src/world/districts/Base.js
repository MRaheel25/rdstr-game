// Land masses, canal, bay water, sea bed, world boundary and the waterfront promenade.
import * as THREE from 'three';
import { LAND, WATER_Y, PROMENADE_X, HARBOR_BLVD_Z, RING } from '../Layout.js';
import { CURB_H } from '../CityGenerator.js';
import * as M from '../Materials.js';
import { waterMaterial } from '../Atmosphere.js';
import { GeometryBatch } from '../GeometryBatch.js';

export function buildBase(gen) {
  const slabs = [
    [LAND.west, LAND.north, LAND.canalX0, LAND.south],
    [LAND.canalX1, LAND.north, LAND.east, LAND.south],
  ];
  const b = new GeometryBatch();
  for (const [x0, z0, x1, z1] of slabs) {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    b.box(cx, -5, cz, x1 - x0, 10, z1 - z0, 0, { uvScale: 1 / 12 });
    gen.physics.fixedBox(cx, -5, cz, (x1 - x0) / 2, 5, (z1 - z0) / 2, { kind: 'ground', friction: 0.9 });
  }
  const land = new THREE.Mesh(b.toGeometry(), M.groundMaterial('concrete'));
  land.name = 'land';
  gen.addStatic(land, true, { shadows: false });
  land.receiveShadow = true;
  // Canal bed.
  const cb = new GeometryBatch();
  const ccx = (LAND.canalX0 + LAND.canalX1) / 2;
  const ccz = (LAND.north + LAND.south) / 2;
  cb.box(ccx, -9, ccz, LAND.canalX1 - LAND.canalX0, 2, LAND.south - LAND.north, 0, { uvScale: 1 / 8 });
  gen.physics.fixedBox(ccx, -9, ccz, (LAND.canalX1 - LAND.canalX0) / 2, 1, (LAND.south - LAND.north) / 2, { kind: 'ground' });
  gen.addStatic(new THREE.Mesh(cb.toGeometry(), M.groundMaterial('dirt')), true, { shadows: false });
  // Sea bed far below the bay.
  gen.physics.fixedBox(0, -16, 0, 4000, 1, 4000, { kind: 'seabed' });
  // Water.
  const wm = waterMaterial();
  const water = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), wm);
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  water.name = 'water';
  water.receiveShadow = true;
  water.userData.noCollider = true; // water is handled by the splash/reset logic
  gen.root.add(water);
  gen.water = water;
  // Invisible world boundary (keeps flights inside the map).
  const B = { x0: -1050, x1: 1380, z0: -1760, z1: 1320 };
  const H = 400;
  gen.physics.fixedBox(B.x0, H / 2, (B.z0 + B.z1) / 2, 2, H / 2, (B.z1 - B.z0) / 2, { kind: 'boundary' });
  gen.physics.fixedBox(B.x1, H / 2, (B.z0 + B.z1) / 2, 2, H / 2, (B.z1 - B.z0) / 2, { kind: 'boundary' });
  gen.physics.fixedBox((B.x0 + B.x1) / 2, H / 2, B.z0, (B.x1 - B.x0) / 2, H / 2, 2, { kind: 'boundary' });
  gen.physics.fixedBox((B.x0 + B.x1) / 2, H / 2, B.z1, (B.x1 - B.x0) / 2, H / 2, 2, { kind: 'boundary' });
  gen.physics.fixedBox((B.x0 + B.x1) / 2, H, (B.z0 + B.z1) / 2, (B.x1 - B.x0) / 2, 2, (B.z1 - B.z0) / 2, { kind: 'boundary' });
  gen.bounds = B;
}

export function buildWaterfront(gen) {
  const rng = gen.rng;
  const x0 = LAND.west;
  const x1 = PROMENADE_X - 8;
  const z0 = -690;
  const z1 = HARBOR_BLVD_Z - 8;
  const cx = (x0 + x1) / 2;
  // Promenade slab in sections (one per chunk).
  for (let z = z0; z < z1; z += 120) {
    const zz = Math.min(z + 120, z1);
    gen.batch(cx, (z + zz) / 2, 'sidewalk').box(cx, CURB_H / 2, (z + zz) / 2, x1 - x0, CURB_H, zz - z, 0, { uvScale: 1 / 5 });
    gen.physics.fixedBox(cx, CURB_H / 2, (z + zz) / 2, (x1 - x0) / 2, CURB_H / 2, (zz - z) / 2, { kind: 'sidewalk', round: 0.06 });
  }
  for (let z = z0 + 10; z < z1 - 5; z += 18) {
    gen.props.add('palm', x0 + 6, CURB_H, z, rng.float(0, 6.3));
    if (Math.round(z / 18) % 2 === 0) gen.props.add('lamp', x1 - 0.8, CURB_H, z + 9, Math.PI / 2, { groundY: 0.02 });
    if (rng.chance(0.3)) gen.props.add('bench', x0 + 11, CURB_H, z + 4, Math.PI / 2);
    if (rng.chance(0.15)) gen.props.add('stall', x0 + 13, CURB_H, z + 9, -Math.PI / 2);
  }
  // Railing along the quay edge.
  for (let z = z0 + 2; z < z1 - 2; z += 3) gen.props.add('fence', x0 + 0.6, CURB_H, z, Math.PI / 2);
  // Grass strip between Waterfront Dr and the ring.
  const gx0 = PROMENADE_X + 8;
  const gx1 = -RING.hx - RING.width / 2;
  for (let z = -600; z < 600; z += 120) gen.batch((gx0 + gx1) / 2, z + 60, 'grass').flatRect((gx0 + gx1) / 2, 0.015, z + 60, gx1 - gx0, 120, 0, 6);
  for (let z = -580; z < 580; z += 26) {
    if ([-240, 120, 360].some((r) => Math.abs(r - z) < 14)) continue;
    gen.props.add('palm', (gx0 + gx1) / 2, 0, z, rng.float(0, 6.3));
  }
  gen.airStations.push(new THREE.Vector3(x0 + 10, CURB_H, -420));
  gen.hideSpots.push({ x: -600, z: 0, r: 20, kind: 'underpass' });
}
