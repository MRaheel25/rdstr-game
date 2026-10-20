// Ground-level connector network between districts: straight roads with junction pads,
// markings, lamps and road-graph edges.
import * as THREE from 'three';
import { ROAD_W } from '../CityGenerator.js';
import { GRID_XS, GRID_ZS, HARBOR_BLVD_Z, PROMENADE_X, RING } from '../Layout.js';

export class GroundNetwork {
  constructor(gen) {
    this.gen = gen;
    this.nodes = new Map();
    this.edges = [];
  }

  node(x, z) {
    const k = `${Math.round(x)}_${Math.round(z)}`;
    if (!this.nodes.has(k)) this.nodes.set(k, { x, z, deg: 0, gridNode: null });
    return this.nodes.get(k);
  }

  road(x0, z0, x1, z1, opts = {}) {
    const a = this.node(x0, z0);
    const b = this.node(x1, z1);
    a.deg++;
    b.deg++;
    this.edges.push({ a, b, opts });
    this.gen.groundRoads.push({ ax: x0, az: z0, bx: x1, bz: z1 });
  }

  // Chain of points: consecutive roads.
  chain(pts, opts) {
    for (let i = 0; i < pts.length - 1; i++) this.road(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], opts);
  }

  build() {
    const gen = this.gen;
    const hw = ROAD_W / 2;
    const isGridNode = (n) => GRID_XS.includes(Math.round(n.x)) && GRID_ZS.includes(Math.round(n.z)) && Math.abs(n.x) <= 480 && Math.abs(n.z) <= 480;
    for (const n of this.nodes.values()) {
      if (!isGridNode(n) && n.deg >= 2) gen.chunk(n.x, n.z).road.flatRect(n.x, 0.02, n.z, ROAD_W, ROAD_W, 0, 8);
      n.graph = gen.graph.node(n.x, 0, n.z, 'ground');
    }
    for (const e of this.edges) {
      const { a, b } = e;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      const ux = dx / len;
      const uz = dz / len;
      // Trim at pads (junctions or grid intersections).
      const trimA = a.deg >= 2 || isGridNode(a) ? hw : 0;
      const trimB = b.deg >= 2 || isGridNode(b) ? hw : 0;
      const x0 = a.x + ux * trimA;
      const z0 = a.z + uz * trimA;
      const x1 = b.x - ux * trimB;
      const z1 = b.z - uz * trimB;
      gen.roadSegment(x0, z0, x1, z1, { crosswalks: false });
      gen.graph.edge(a.graph, b.graph, [a.graph, b.graph], { name: e.opts.name || '', kind: 'street', speed: e.opts.speed ?? 24 });
      // Lamps along both sides.
      if (e.opts.lamps !== false) {
        const rx = -uz;
        const rz = ux;
        let k = 0;
        for (let s = 16; s < len - 10; s += 38, k++) {
          const side = k % 2 ? 1 : -1;
          const px = a.x + ux * s + rx * side * (hw + 1.2);
          const pz = a.z + uz * s + rz * side * (hw + 1.2);
          const rot = Math.atan2(-rx * side, -rz * side);
          gen.props.add('lamp', px, 0, pz, rot, { groundY: 0.02 });
        }
      }
    }
  }
}

export function buildConnectors(gen) {
  const net = new GroundNetwork(gen);
  const inner = RING.hx - RING.width / 2 - 4.5; // ramp centre lines on the ring's inner side
  // West: grid -> promenade (one through the ramp junction).
  net.chain([[-480, 120], [-inner, 120], [PROMENADE_X, 120]], { name: 'Pier Rd' });
  net.road(-480, -240, PROMENADE_X, -240, { name: 'Bay Rd' });
  net.road(-480, 360, PROMENADE_X, 360, { name: 'Copper St' });
  // Promenade road along the waterfront.
  net.chain([[PROMENADE_X, -640], [PROMENADE_X, -240], [PROMENADE_X, 120], [PROMENADE_X, 360], [PROMENADE_X, HARBOR_BLVD_Z]], { name: 'Waterfront Dr' });
  // South: grid -> Harbor Blvd.
  net.chain([[120, 480], [120, inner], [120, HARBOR_BLVD_Z]], { name: 'Dock St' });
  net.road(-360, 480, -360, HARBOR_BLVD_Z, { name: 'Crane Ave' });
  net.road(360, 480, 360, HARBOR_BLVD_Z, { name: 'Anchor Ave' });
  // Harbor Blvd.
  net.chain([[PROMENADE_X, HARBOR_BLVD_Z], [-360, HARBOR_BLVD_Z], [0, HARBOR_BLVD_Z], [120, HARBOR_BLVD_Z], [360, HARBOR_BLVD_Z], [760, HARBOR_BLVD_Z]], { name: 'Harbor Blvd' });
  // North: grid -> canyon start, ramp junction.
  net.road(0, -480, 0, -700, { name: 'Ridge Rd' });
  net.road(-360, -480, -360, -700, { name: 'Summit Rd' });
  net.road(-120, -480, -120, -inner, { name: 'Ring Access N' });
  net.road(PROMENADE_X, -640, -360, -640, { name: 'Shore Rd', lamps: true });
  // East: grid -> construction zone.
  net.road(480, -120, inner, -120, { name: 'Ring Access E' });
  net.chain([[480, -240], [760, -240], [880, -240]], { name: 'Foundry Ave' });
  net.road(480, 0, 760, 0, { name: 'Girder St' });
  net.chain([[480, 240], [760, 240]], { name: 'Span Ave' });
  net.chain([[760, -240], [760, 0], [760, 240], [760, HARBOR_BLVD_Z]], { name: 'Yard Rd' });
  // Yard B (east of the canal).
  net.chain([[1000, -240], [1100, -240], [1100, 240], [1100, 520]], { name: 'Rebar Rd' });
  // Harbor piers are built by the harbor district.
  // Missing ground under the ring junction south of the grid: Dock St already passes the junction.
  net.build();
  gen.net = net;
  return net;
}
