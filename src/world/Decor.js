// Neon signs and rooftop billboards with fictional brands, aviation beacons and the
// glowing Air Station pads. Signs also register as light sources for wet-road streaks.
import * as THREE from 'three';
import { neonSign, BRANDS, RANDOM_BRANDS, GRAFIGATOR_BRAND } from './Textures.js';
import { GeometryBatch } from './GeometryBatch.js';

export function buildDecor(gen) {
  const brandBatches = new Map();
  const getBatch = (i) => {
    if (!brandBatches.has(i)) brandBatches.set(i, new GeometryBatch());
    return brandBatches.get(i);
  };
  gen.neonLights = [];
  const box = gen.batch(0, 0, 'darkMetal');
  for (const s of gen.signSpots) {
    const brand = s.brand % RANDOM_BRANDS;
    const w = s.vertical ? Math.min(3.2, s.width * 0.3) : s.width;
    const h = s.vertical ? w * 4 : s.width * 0.25;
    const b = getBatch(brand);
    // Plane facing the normal (nx, nz), slightly off the wall.
    const rx = s.nz;
    const rz = -s.nx;
    const P = (u, v) => new THREE.Vector3(s.x + rx * u + s.nx * 0.12, s.y + v, s.z + rz * u + s.nz * 0.12);
    if (s.vertical) {
      // Rotated texture: map u along height.
      b.quad(P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, h / 2), P(-w / 2, h / 2), [[0, 0], [0, 1], [1, 1], [1, 0]].map(([a, c]) => [c, 1 - a]));
    } else {
      b.quad(P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, h / 2), P(-w / 2, h / 2), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
    box.box(s.x - s.nx * 0.05, s.y, s.z - s.nz * 0.05, s.nx !== 0 ? 0.2 : w + 0.3, h + 0.3, s.nz !== 0 ? 0.2 : w + 0.3, 0);
    gen.neonLights.push({ x: s.x + s.nx * 0.5, y: s.y, z: s.z + s.nz * 0.5, color: new THREE.Color(BRANDS[brand].color), w });
  }
  // Rooftop billboards on mid-height buildings facing the avenues.
  const rng = gen.rng;
  // Three of the billboards along the main boulevards advertise the GRAFIGATOR studio,
  // drawn exactly like every other fictional brand.
  let grafLeft = 3;
  for (const bd of gen.buildings) {
    if (bd.y0 > 1 || bd.h < 30 || bd.h > 80 || !rng.chance(0.18)) continue;
    let brand = rng.int(0, RANDOM_BRANDS - 1);
    if (grafLeft > 0 && (Math.abs(bd.x) < 140 || Math.abs(bd.z) < 140) && Math.hypot(bd.x, bd.z) > 150) {
      brand = GRAFIGATOR_BRAND;
      grafLeft--;
    }
    const top = bd.y0 + bd.h;
    const w = Math.min(bd.hx * 1.6, 22);
    const h = w * 0.3;
    const side = rng.chance(0.5) ? 1 : -1;
    const z = bd.z + side * (bd.hz - 1.5);
    const y = top + 2.5 + h / 2;
    const b = getBatch(brand);
    const P = (u, v) => new THREE.Vector3(bd.x + u * side, y + v, z + side * 0.3);
    b.quad(P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, h / 2), P(-w / 2, h / 2), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    gen.solidBox('darkMetal', bd.x, y, z, w + 0.6, h + 0.6, 0.4, 0);
    gen.solidBox('darkMetal', bd.x - w / 3, top + 1.25, z, 0.4, 2.5, 0.4, 0);
    gen.solidBox('darkMetal', bd.x + w / 3, top + 1.25, z, 0.4, 2.5, 0.4, 0);
    gen.neonLights.push({ x: bd.x, y, z: z + side * 1.5, color: new THREE.Color(BRANDS[brand].color), w, high: true });
  }
  for (const [brand, b] of brandBatches) {
    const mat = new THREE.MeshBasicMaterial({ map: neonSign(brand), color: new THREE.Color(2.6, 2.6, 2.6) });
    const mesh = new THREE.Mesh(b.toGeometry(), mat);
    mesh.name = `neon_${BRANDS[brand].text}`;
    gen.addStatic(mesh, false, { shadows: false });
    mesh.userData.decal = true;
  }
  // Aviation beacons (blinking red), Air Stations.
  const bgeo = new THREE.SphereGeometry(0.45, 8, 6);
  gen.beaconMesh = new THREE.InstancedMesh(bgeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2010).multiplyScalar(8) }), Math.max(1, gen.beacons.length));
  gen.beacons.forEach((p, i) => gen.beaconMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
  gen.beaconMesh.count = gen.beacons.length;
  gen.beaconMesh.userData.noCollider = true;
  gen.root.add(gen.beaconMesh);
  for (const p of gen.airStations) gen.props.add('airStation', p.x, p.y + 0.01, p.z, 0);
}
