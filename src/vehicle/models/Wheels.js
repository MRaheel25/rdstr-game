// Wheels: low-profile tyre (lathe), black rim lip, aero disc sectors with gaps, twisted
// turbine blades, centre cap, spinning brake disc and a fixed (non-rotating) caliper.
import * as THREE from 'three';
import { carMat } from './CarMaterials.js';
import { mergeByMaterial } from './MergeUtils.js';

const cache = new Map();

function tireGeometry(R, w, rim) {
  const key = `tire_${R}_${w}_${rim}`;
  if (cache.has(key)) return cache.get(key);
  const h = w / 2;
  const pts = [
    [rim, -h + 0.02], [rim + 0.01, -h], [R - 0.035, -h], [R - 0.008, -h + 0.02], [R, -h + 0.05],
    [R, h - 0.05], [R - 0.008, h - 0.02], [R - 0.035, h], [rim + 0.01, h], [rim, h - 0.02],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 36);
  g.rotateZ(-Math.PI / 2);
  cache.set(key, g);
  return g;
}

// style: 'aero' (Roadster) | 'police' (steel-ish multi-spoke) | 'truck'
export function makeWheel(radius, width, style = 'aero') {
  const spin = new THREE.Group();
  const fixed = new THREE.Group();
  const rim = radius * 0.79;
  const outer = width / 2;
  spin.add(new THREE.Mesh(tireGeometry(radius, width, rim), carMat('rubber')));
  // Rim lip.
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(rim + 0.004, rim + 0.004, width * 0.92, 32, 1, true), carMat('rimBlack'));
  lip.rotation.z = Math.PI / 2;
  spin.add(lip);
  const faceX = outer - 0.025;
  if (style === 'aero') {
    // Inner disc and outer sectors (gaps reveal brake + caliper).
    const inner = new THREE.Mesh(new THREE.CircleGeometry(rim * 0.72, 32), carMat('aeroDisc'));
    inner.rotation.y = Math.PI / 2;
    inner.position.x = faceX - 0.012;
    spin.add(inner);
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * Math.PI * 2 + 0.14;
      const sector = new THREE.Mesh(new THREE.RingGeometry(rim * 0.72, rim * 0.98, 8, 1, a0, Math.PI / 3 - 0.28), carMat('aeroDisc'));
      sector.rotation.y = Math.PI / 2;
      sector.position.x = faceX - 0.01;
      spin.add(sector);
      // Turbine blade.
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.014, rim * 0.9, 0.04), carMat('rimBlack'));
      blade.position.set(faceX, 0, 0);
      const holder = new THREE.Group();
      holder.rotation.x = (k / 6) * Math.PI * 2;
      blade.position.y = rim * 0.5;
      blade.rotation.y = 0.35;
      holder.add(blade);
      spin.add(holder);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.03, 16), carMat('rimBlack'));
    cap.rotation.z = Math.PI / 2;
    cap.position.x = faceX + 0.005;
    spin.add(cap);
  } else {
    // Multi-spoke wheel.
    const disc = new THREE.Mesh(new THREE.CircleGeometry(rim * 0.98, 24), carMat(style === 'truck' ? 'rimBlack' : 'brakeDisc'));
    disc.rotation.y = Math.PI / 2;
    disc.position.x = faceX - 0.04;
    spin.add(disc);
    for (let k = 0; k < (style === 'truck' ? 8 : 5); k++) {
      const holder = new THREE.Group();
      holder.rotation.x = (k / (style === 'truck' ? 8 : 5)) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, rim * 0.85, 0.06), carMat(style === 'truck' ? 'brakeDisc' : 'chrome'));
      spoke.position.set(faceX - 0.01, rim * 0.48, 0);
      holder.add(spoke);
      spin.add(holder);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 12), carMat('chrome'));
    hub.rotation.z = Math.PI / 2;
    hub.position.x = faceX;
    spin.add(hub);
  }
  // Brake disc spins, caliper stays put.
  const bd = new THREE.Mesh(new THREE.CylinderGeometry(rim * 0.86, rim * 0.86, 0.03, 28), carMat('brakeDisc'));
  bd.rotation.z = Math.PI / 2;
  bd.position.x = outer - 0.11;
  spin.add(bd);
  const cal = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.1), carMat('caliper'));
  cal.position.set(outer - 0.09, rim * 0.6, rim * 0.35);
  cal.rotation.x = -0.5;
  fixed.add(cal);
  // One draw call per material instead of ~15 meshes per wheel.
  return { spin: mergeByMaterial(spin), fixed };
}
