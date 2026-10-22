// V3 full-screen map (M key / pause menu): the whole city with district and neighbourhood
// names, roads, key-location icons with a legend, mission / race starts, the player and the
// GPS route. Click an icon or any spot to set a waypoint; drag to pan, wheel to zoom.
import { DISTRICTS, AREAS } from '../world/Layout.js';
import { POI_STYLE } from './Minimap.js';

const LABELS = {
  downtown: [0, -60], highway: [600, -380], harbor: [0, 820], construction: [1120, 0], canyon: [0, -1050], waterfront: [-665, 360],
};
const AREA_POS = { citypark: [-360, -240], shopping: [-240, 300], residential: [300, -300] };
const LEGEND = [
  ['charge', 'Charging station'], ['repair', 'Repair shop'], ['tuning', 'Garage / tuning'], ['police', 'Police station'],
  ['grafigator', 'Design studio'], ['taxi', 'Taxi stand'], ['mission', 'Mission start'], ['race', 'Race start'],
];

export class MapView {
  constructor(game) {
    this.game = game;
    this.open = false;
    const root = document.createElement('div');
    root.id = 'mapview';
    root.className = 'hidden';
    root.innerHTML = `
      <canvas></canvas>
      <div class="map-head"><b>HALCYON BAY</b><span>CLICK A LOCATION TO SET A WAYPOINT · DRAG TO PAN · SCROLL TO ZOOM</span></div>
      <div class="map-legend">${LEGEND.map(([k, t]) => `<div data-k="${k}"><i class="ico ${k}">${(POI_STYLE[k] || {}).icon || ''}</i>${t}</div>`).join('')}
        <div class="map-actions"><button class="clear">CLEAR WAYPOINT</button><button class="close">CLOSE  [M]</button></div></div>
      <div class="map-tip hidden"></div>`;
    document.body.appendChild(root);
    this.root = root;
    this.canvas = root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.tip = root.querySelector('.map-tip');
    this.zoom = 1;
    this.pan = { x: 0, z: 0 };
    root.querySelector('.close').addEventListener('click', () => this.toggle(false));
    root.querySelector('.clear').addEventListener('click', () => {
      game.nav.clear();
      this.draw();
    });
    const c = this.canvas;
    let drag = null;
    c.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, px: this.pan.x, pz: this.pan.z, moved: false };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        this.pan.x = drag.px - dx / this.scale;
        this.pan.z = drag.pz - dy / this.scale;
        this.draw();
      } else this.hover(e);
    });
    c.addEventListener('pointerup', (e) => {
      if (drag && !drag.moved) this.click(e);
      drag = null;
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = Math.min(6, Math.max(0.8, this.zoom * (e.deltaY > 0 ? 0.88 : 1.14)));
      this.draw();
    }, { passive: false });
    window.addEventListener('resize', () => this.open && this.draw());
  }

  toggle(on = !this.open) {
    const g = this.game;
    if (on === this.open) return;
    if (on && g.state !== 'playing' && g.state !== 'paused') return;
    this.open = on;
    this.root.classList.toggle('hidden', !on);
    if (on) {
      this.wasState = g.state;
      if (g.state === 'playing') g.state = 'paused';
      const p = g.player.position;
      this.pan = { x: p.x, z: p.z };
      this.zoom = 1.6;
      this.draw();
    } else if (this.wasState === 'playing' && !g.menu.screen) g.state = 'playing';
  }

  // Everything that can be clicked: key locations, activity starts, taxi stands.
  icons() {
    const out = [];
    for (const p of this.game.world.gen.pois || []) out.push({ kind: p.kind, x: p.x, z: p.z, label: p.label });
    for (const m of this.game.minimap.markers || []) out.push({ kind: m.kind === 'race' ? 'race' : 'mission', x: m.x, z: m.z, label: m.label || (m.kind === 'race' ? 'Race start' : 'Mission start'), color: m.color });
    for (const t of this.game.taxi ? this.game.taxi.standIcons() : []) out.push(t);
    return out;
  }

  layout() {
    const c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (c.width !== W * dpr || c.height !== H * dpr) {
      c.width = W * dpr;
      c.height = H * dpr;
    }
    const b = this.game.minimap.b;
    this.scale = Math.min(W / (b.x1 - b.x0), H / (b.z1 - b.z0)) * this.zoom;
    this.W = W;
    this.H = H;
    this.dpr = dpr;
  }

  toScreen(x, z) {
    return [this.W / 2 + (x - this.pan.x) * this.scale, this.H / 2 + (z - this.pan.z) * this.scale];
  }

  toWorld(sx, sy) {
    return [this.pan.x + (sx - this.W / 2) / this.scale, this.pan.z + (sy - this.H / 2) / this.scale];
  }

  pickIcon(e) {
    let best = null;
    let bd = 22;
    for (const ic of this.icons()) {
      const [sx, sy] = this.toScreen(ic.x, ic.z);
      const d = Math.hypot(sx - e.clientX, sy - e.clientY);
      if (d < bd) {
        bd = d;
        best = ic;
      }
    }
    return best;
  }

  hover(e) {
    const ic = this.pickIcon(e);
    this.tip.classList.toggle('hidden', !ic);
    if (ic) {
      this.tip.textContent = ic.label;
      this.tip.style.left = `${e.clientX + 16}px`;
      this.tip.style.top = `${e.clientY - 10}px`;
    }
    this.canvas.style.cursor = ic ? 'pointer' : 'crosshair';
  }

  click(e) {
    const ic = this.pickIcon(e);
    const nav = this.game.nav;
    if (ic) nav.setWaypoint(ic.x, ic.z, ic.label.toUpperCase());
    else {
      const [x, z] = this.toWorld(e.clientX, e.clientY);
      nav.setWaypoint(x, z, 'WAYPOINT');
    }
    this.game.audio && this.game.audio.sfx.ui('click');
    this.draw();
  }

  draw() {
    this.layout();
    const g = this.game;
    const x = this.ctx;
    const s = this.scale;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.fillStyle = '#050a12';
    x.fillRect(0, 0, this.W, this.H);
    const mm = g.minimap;
    const b = mm.b;
    const [ox, oy] = this.toScreen(b.x0, b.z0);
    x.imageSmoothingEnabled = true;
    x.drawImage(mm.layer, ox, oy, (b.x1 - b.x0) * s, (b.z1 - b.z0) * s);
    // Route.
    const route = g.nav.route;
    if (route.length > 1) {
      x.strokeStyle = g.nav.color;
      x.lineWidth = Math.max(3, 9 * s);
      x.lineJoin = 'round';
      x.lineCap = 'round';
      x.shadowColor = g.nav.color;
      x.shadowBlur = 12;
      x.beginPath();
      route.forEach((p, i) => {
        const [sx, sy] = this.toScreen(p.x, p.z);
        if (i) x.lineTo(sx, sy);
        else x.moveTo(sx, sy);
      });
      x.stroke();
      x.shadowBlur = 0;
    }
    // Names.
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    for (const d of DISTRICTS) {
      const p = LABELS[d.id];
      if (!p) continue;
      const [sx, sy] = this.toScreen(p[0], p[1]);
      x.font = `800 ${Math.round(13 + 4 * Math.min(2, this.zoom))}px "Arial Black", Impact, sans-serif`;
      x.fillStyle = 'rgba(238,244,255,0.85)';
      x.fillText(d.name.toUpperCase(), sx, sy);
    }
    x.font = '600 12px sans-serif';
    for (const a of AREAS) {
      const p = AREA_POS[a.id];
      const [sx, sy] = this.toScreen(p[0], p[1]);
      x.fillStyle = 'rgba(160,210,255,0.8)';
      x.fillText(a.name.toUpperCase(), sx, sy);
    }
    // Icons.
    x.font = 'bold 12px sans-serif';
    for (const ic of this.icons()) {
      const [sx, sy] = this.toScreen(ic.x, ic.z);
      const st = POI_STYLE[ic.kind] || { bg: ic.color || '#ffd23f', fg: '#000', icon: ic.kind === 'race' ? '⚑' : '◆' };
      x.fillStyle = ic.kind === 'mission' || ic.kind === 'race' ? ic.color || st.bg : st.bg;
      x.strokeStyle = '#fff';
      x.lineWidth = 1.5;
      x.beginPath();
      x.arc(sx, sy, 11, 0, Math.PI * 2);
      x.fill();
      x.stroke();
      x.fillStyle = st.fg;
      x.fillText(st.icon, sx, sy + 0.5);
    }
    // Waypoint pin.
    const t = g.nav.target;
    if (t) {
      const [sx, sy] = this.toScreen(t.x, t.z);
      x.fillStyle = g.nav.color;
      x.beginPath();
      x.moveTo(sx, sy);
      x.arc(sx, sy - 22, 9, Math.PI * 0.8, Math.PI * 2.2);
      x.closePath();
      x.fill();
      x.fillStyle = '#05070c';
      x.beginPath();
      x.arc(sx, sy - 22, 3.5, 0, Math.PI * 2);
      x.fill();
    }
    // Player arrow.
    const p = g.player.position;
    const [px, py] = this.toScreen(p.x, p.z);
    x.save();
    x.translate(px, py);
    x.rotate(-g.player.yaw);
    x.fillStyle = '#fff';
    x.shadowColor = '#3fe0ff';
    x.shadowBlur = 10;
    x.beginPath();
    x.moveTo(0, -13);
    x.lineTo(9, 10);
    x.lineTo(0, 5);
    x.lineTo(-9, 10);
    x.closePath();
    x.fill();
    x.restore();
  }
}
