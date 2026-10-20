// Draw-call reduction: merge a static sub-hierarchy into one mesh per material, and bake
// a whole vehicle into a single vertex-coloured mesh for distant LOD.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();

function prepared(geo, matrix) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  g.applyMatrix4(matrix);
  if (matrix.determinant() < 0) {
    // Mirrored transform: flip winding so faces stay front-facing.
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const u = g.attributes.uv;
    for (let i = 0; i < p.count; i += 3) {
      for (const a of [p, n, u]) {
        const s = a.itemSize;
        for (let k = 0; k < s; k++) {
          const t = a.array[(i + 1) * s + k];
          a.array[(i + 1) * s + k] = a.array[(i + 2) * s + k];
          a.array[(i + 2) * s + k] = t;
        }
      }
    }
  }
  g.groups = [];
  return g;
}

// Returns a Group with one Mesh per material containing all meshes under `root`.
export function mergeByMaterial(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    _m.multiplyMatrices(inv, o.matrixWorld);
    const g = prepared(o.geometry, _m);
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(g);
  });
  const out = new THREE.Group();
  for (const [mat, list] of buckets) {
    const merged = mergeGeometries(list, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}

// Bake everything under `root` (except objects flagged userData.noBake) into one mesh
// with vertex colours taken from each material's base colour.
export function bakeLOD(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const list = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.noBake || !o.visible) return;
    let skip = false;
    o.traverseAncestors((a) => {
      if (a.userData.noBake) skip = true;
    });
    if (skip) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!mat || mat.transparent || mat.isShaderMaterial) return;
    _m.multiplyMatrices(inv, o.matrixWorld);
    const g = prepared(o.geometry, _m);
    const c = (mat.color || new THREE.Color(1, 1, 1)).clone();
    if (mat.isMeshBasicMaterial) c.multiplyScalar(0.6);
    const cols = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < cols.length; i += 3) {
      cols[i] = c.r;
      cols[i + 1] = c.g;
      cols[i + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    list.push(g);
  });
  const merged = mergeGeometries(list, false);
  const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.4 }));
  mesh.castShadow = true;
  return mesh;
}
