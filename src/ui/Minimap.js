// Circular minimap that rotates with the car: pre-rendered roads/land/buildings, police
// with search cones (while evading), helicopter searchlight, drones, Air Stations and the
// active mission marker (clamped to the rim when off-map).
import { LAND } from '../world/Layout.js';

const PX = 0.5; // pixels per metre in the pre-rendered layer
export const POI_STYLE = {
  police: { icon: 'P', bg: '#2a5cff', fg: '#fff' },
  charge: { icon: '⚡', bg: '#0c3a48', fg: '#40e8ff' },
  repair: { icon: 'R', bg: '#e07020', fg: '#fff' },
  tuning: { icon: 'T', bg: '#7a2ae0', fg: '#fff' },
  grafigator: { icon: 'G', bg: '#15171a', fg: '#e7f75b' },
  taxi: { icon: 'T', bg: '#ffc21a', fg: '#111' },
  mission: { icon: '◆', bg: '#ffd23f', fg: '#111' },
  race: { icon: '⚑', bg: '#ff3df0', fg: '#fff' },
};

export class Minimap {
  constructor(world) {
    this.world = world;
    this.canvas = document.getElementById('minimap');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.size = 260;
    this.canvas.width = this.size * dpr;
    this.canvas.height = this.size * dpr;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);
    this.zoom = 0.9;
    this.markers = []; // activity starts: {x, z, color, done, kind}
    this.mission = null;
    this.buildLayer();
  }

  buildLayer() {
    const b = this.world.gen.bounds;
    this.b = b;
    const W = Math.ceil((b.x1 - b.x0) * PX);
    const H = Math.ceil((b.z1 - b.z0) * PX);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    const X = (wx) => (wx - b.x0) * PX;
    const Z = (wz) => (wz - b.z0) * PX;
    // Water.
    x.fillStyle = '#071423';
    x.fillRect(0, 0, W, H);
    // Land.
    x.fillStyle = '#121822';
    x.fillRect(X(LAND.west), Z(LAND.north), (LAND.canalX0 - LAND.west) * PX, (LAND.south - LAND.north) * PX);
    x.fillRect(X(LAND.canalX1), Z(LAND.north), (LAND.east - LAND.canalX1) * PX, (LAND.south - LAND.north) * PX);
    x.fillStyle = '#141c18';
    x.fillRect(X(-1000), Z(-1720), 2320 * PX, (-700 + 1720) * PX);
    // Buildings.
    x.fillStyle = '#1d2533';
    for (const bd of this.world.gen.buildings) {
      if (bd.y0 > 1) continue;
      x.fillRect(X(bd.x - bd.hx), Z(bd.z - bd.hz), bd.hx * 2 * PX, bd.hz * 2 * PX);
    }
    // Roads from the graph (width by kind).
    x.lineCap = 'round';
    x.lineJoin = 'round';
    const draw = (filter, color, width) => {
      x.strokeStyle = color;
      x.lineWidth = width * PX;
      for (const e of this.world.graph.edges) {
        if (!filter(e)) continue;
        x.beginPath();
        e.points.forEach((p, i) => (i ? x.lineTo(X(p.x), Z(p.z)) : x.moveTo(X(p.x), Z(p.z))));
        x.stroke();
      }
    };
    // V2: roads stand out clearly (light edge + fill at their real width).
    const street = (e) => e.kind !== 'highway' && e.kind !== 'ramp' && e.kind !== 'stunt';
    const w = (e) => (e.laneWidth && e.lanes > 1 ? (e.laneWidth * e.lanes + 0.6) * 2 : 16);
    for (const [col, pad] of [['#8fa6c4', 4], ['#4a5d78', 0]]) {
      x.strokeStyle = col;
      for (const e of this.world.graph.edges) {
        if (!street(e)) continue;
        x.lineWidth = (w(e) + pad) * PX;
        x.beginPath();
        e.points.forEach((p, i) => (i ? x.lineTo(X(p.x), Z(p.z)) : x.moveTo(X(p.x), Z(p.z))));
        x.stroke();
      }
    }
    draw((e) => e.kind === 'ramp' || e.kind === 'stunt', '#6a7a92', 10);
    draw((e) => e.kind === 'highway', '#b8c8dc', 28);
    draw((e) => e.kind === 'highway', '#7f92ac', 24);
    // Parks.
    x.fillStyle = 'rgba(60,130,70,0.45)';
    for (const p of this.world.gen.parks || []) x.fillRect(X(p.x - p.w / 2), Z(p.z - p.d / 2), p.w * PX, p.d * PX);
    this.layer = c;
  }

  // Arrow at the rim (or a dot inside) pointing at a world position.
  rimArrow(player, heading, z, wx, wz, color, label, t, onlyOff = false) {
    const ctx = this.ctx;
    const R = this.size / 2;
    const dx = wx - player.position.x;
    const dz = wz - player.position.z;
    const c = Math.cos(heading);
    const sn = Math.sin(heading);
    let mx = (dx * c - dz * sn) * z;
    let my = (dx * sn + dz * c) * z;
    const d = Math.hypot(mx, my);
    const lim = R - 16;
    if (d <= lim) {
      if (onlyOff) return;
    } else {
      mx *= lim / d;
      my *= lim / d;
    }
    const a = Math.atan2(my, mx);
    const pulse = 1 + 0.15 * Math.sin(t * 2);
    ctx.save();
    ctx.translate(R + mx, R + my);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 11 * pulse, Math.sin(a) * 11 * pulse);
    ctx.lineTo(Math.cos(a + 2.4) * 9, Math.sin(a + 2.4) * 9);
    ctx.lineTo(Math.cos(a - 2.4) * 9, Math.sin(a - 2.4) * 9);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    if (label) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, -Math.cos(a) * 14, -Math.sin(a) * 14);
    }
    ctx.restore();
  }

  setMission(m) {
    this.mission = m; // {x, z, label} or null
  }

  setMarkers(list) {
    this.markers = list;
  }

  update(player, police, heat, airStations, nav = null) {
    const ctx = this.ctx;
    const S = this.size;
    const R = S / 2;
    const speed = player.speed;
    const targetZoom = 0.95 - Math.min(0.5, speed / 220);
    this.zoom += (targetZoom - this.zoom) * 0.05;
    const z = this.zoom;
    const heading = player.yaw;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(4,8,14,0.82)';
    ctx.fillRect(0, 0, S, S);
    // World transform: player at centre, heading up.
    ctx.translate(R, R);
    ctx.rotate(heading);
    ctx.scale(z, z);
    ctx.translate(-player.position.x, -player.position.z);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(this.layer, this.b.x0, this.b.z0, this.layer.width / PX, this.layer.height / PX);
    ctx.globalAlpha = 1;
    // Search cones while the player is out of sight.
    const evading = heat.phase === 'evade' || heat.phase === 'cooldown';
    if (evading) {
      ctx.fillStyle = 'rgba(255,60,60,0.16)';
      for (const c of police.cones) {
        const a = Math.atan2(c.dirz, c.dirx);
        ctx.beginPath();
        ctx.moveTo(c.x, c.z);
        ctx.arc(c.x, c.z, c.range, a - c.half, a + c.half);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Race: GPS racing line ahead with an arrow head.
    if (this.raceLine && this.raceLine.length > 1) {
      const L = this.raceLine;
      ctx.strokeStyle = '#ff3df0';
      ctx.lineWidth = 6 / z;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      L.forEach((p, i) => (i ? ctx.lineTo(p.x, p.z) : ctx.moveTo(p.x, p.z)));
      ctx.stroke();
      const a = L[L.length - 2];
      const b = L[L.length - 1];
      const ang = Math.atan2(b.z - a.z, b.x - a.x);
      ctx.fillStyle = '#ff3df0';
      ctx.beginPath();
      ctx.moveTo(b.x + Math.cos(ang) * 14 / z, b.z + Math.sin(ang) * 14 / z);
      ctx.lineTo(b.x + Math.cos(ang + 2.5) * 12 / z, b.z + Math.sin(ang + 2.5) * 12 / z);
      ctx.lineTo(b.x + Math.cos(ang - 2.5) * 12 / z, b.z + Math.sin(ang - 2.5) * 12 / z);
      ctx.fill();
    }
    // GPS route.
    if (nav && nav.route.length > 1) {
      ctx.strokeStyle = nav.color;
      ctx.lineWidth = 7 / z;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      nav.route.forEach((p, i) => (i ? ctx.lineTo(p.x, p.z) : ctx.moveTo(p.x, p.z)));
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Activity start markers: diamonds for missions, flags for races (dim when completed).
    for (const m of this.markers) {
      const s = 7 / z;
      ctx.save();
      ctx.translate(m.x, m.z);
      ctx.rotate(-heading);
      ctx.globalAlpha = m.done ? 0.55 : 1;
      ctx.fillStyle = m.color;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5 / z;
      ctx.beginPath();
      if (m.kind === 'race') {
        ctx.rect(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6);
      } else {
        ctx.moveTo(0, -s);
        ctx.lineTo(s, 0);
        ctx.lineTo(0, s);
        ctx.lineTo(-s, 0);
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    // Air stations.
    ctx.strokeStyle = '#40e8ff';
    ctx.lineWidth = 2.5 / z;
    for (const p of airStations) {
      ctx.beginPath();
      ctx.arc(p.x, p.z, 6 / z, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Key locations: police station, charging, repair, tuning, landmark.
    ctx.font = `bold ${12 / z}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.world.gen.pois || []) {
      const st = POI_STYLE[p.kind];
      if (!st) continue;
      ctx.save();
      ctx.translate(p.x, p.z);
      ctx.rotate(-heading);
      ctx.fillStyle = st.bg;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5 / z;
      ctx.beginPath();
      ctx.arc(0, 0, 10 / z, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = st.fg;
      ctx.fillText(st.icon, 0, 0.5 / z);
      ctx.restore();
    }
    // Police, helicopter, drones.
    const t = performance.now() * 0.006;
    for (const m of police.markers()) {
      if (m.kind === 'heli') {
        if (m.spot) {
          ctx.fillStyle = 'rgba(200,220,255,0.22)';
          ctx.beginPath();
          ctx.arc(m.spot.x, m.spot.z, 28, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#ffffff';
        ctx.save();
        ctx.translate(m.x, m.z);
        ctx.rotate(t);
        ctx.fillRect(-9 / z, -1.5 / z, 18 / z, 3 / z);
        ctx.fillRect(-1.5 / z, -9 / z, 3 / z, 18 / z);
        ctx.restore();
        continue;
      }
      if (m.kind === 'drone') {
        ctx.fillStyle = '#7fe0ff';
        ctx.beginPath();
        ctx.arc(m.x, m.z, 3.5 / z, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.fillStyle = m.kind === 'wreck' ? '#555' : Math.sin(t * 2 + m.x) > 0 ? '#ff3040' : '#3070ff';
      ctx.beginPath();
      ctx.arc(m.x, m.z, 5 / z, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Low battery: arrow on the rim towards the nearest charging station.
    if (player.energy && player.energy.battery < 25) {
      let best = null;
      let bd = Infinity;
      for (const p of this.world.gen.pois || []) {
        if (p.kind !== 'charge') continue;
        const d = Math.hypot(p.x - player.position.x, p.z - player.position.z);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (best) this.rimArrow(player, heading, z, best.x, best.z, '#40e8ff', '⚡', t);
    }
    if (nav && nav.target) this.rimArrow(player, heading, z, nav.target.x, nav.target.z, nav.color, '', t, true);
    // Mission marker (clamped to the rim).
    if (this.mission) {
      const dx = this.mission.x - player.position.x;
      const dz = this.mission.z - player.position.z;
      const c = Math.cos(heading);
      const s = Math.sin(heading);
      let mx = (dx * c - dz * s) * z;
      let my = (dx * s + dz * c) * z;
      const d = Math.hypot(mx, my);
      const lim = R - 12;
      const off = d > lim;
      if (off) {
        mx *= lim / d;
        my *= lim / d;
      }
      ctx.fillStyle = '#ffd23f';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (off) {
        const a = Math.atan2(my, mx);
        ctx.moveTo(R + mx + Math.cos(a) * 8, R + my + Math.sin(a) * 8);
        ctx.lineTo(R + mx + Math.cos(a + 2.4) * 7, R + my + Math.sin(a + 2.4) * 7);
        ctx.lineTo(R + mx + Math.cos(a - 2.4) * 7, R + my + Math.sin(a - 2.4) * 7);
      } else ctx.arc(R + mx, R + my, 6, 0, Math.PI * 2);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
    }
    // Player arrow and rim.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(R, R - 9);
    ctx.lineTo(R + 6, R + 7);
    ctx.lineTo(R, R + 3);
    ctx.lineTo(R - 6, R + 7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = heat.level > 0 && heat.phase === 'pursuit' ? (Math.sin(t) > 0 ? 'rgba(255,60,70,0.9)' : 'rgba(60,110,255,0.9)') : 'rgba(120,200,255,0.5)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(R, R, R - 2, 0, Math.PI * 2);
    ctx.stroke();
    // North marker.
    const nx = R + Math.sin(-heading) * (R - 12) * -1;
    const ny = R - Math.cos(-heading) * (R - 12);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny);
  }
}
