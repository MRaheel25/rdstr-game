// Menus: title screen (rotating Roadster in the showroom, glitch title), mission and race
// lists, Garage (paint, upgrades, stat bars), Settings (graphics, audio, gameplay, key
// rebinding, career reset), Pause and Controls. Keyboard, mouse and gamepad navigation.
import * as THREE from 'three';
import { GarageScene } from './GarageScene.js';
import { ACTION_LABELS, QUALITY_PRESETS, QUALITY_ORDER, PAD_BUTTON_NAMES, DEFAULT_PAD_BINDINGS } from '../core/Settings.js';
import { UPGRADES, PAINT_COSTS, DISTRICT_UNLOCKS, SLOT_COUNT } from '../game/Progress.js';
import { PAINTS } from '../vehicle/models/CarMaterials.js';
import { stars } from './ActivityUI.js';
import { clamp } from '../util/math.js';
import { DISTRICTS } from '../world/Layout.js';
import { TODS, WEATHERS, makePreset } from '../world/Environment.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const TYPE = { getaway: 'GETAWAY', datarun: 'DATA RUN', bounty: 'BOUNTY', skygap: 'SKY GAP', ghost: 'GHOST PROTOCOL' };
const DISTRICT_BLURB = {
  downtown: 'Glass towers, neon and the shopping streets.', highway: 'Elevated six-lane ring around the city.',
  harbor: 'Containers, cranes and the piers.', construction: 'Half-built towers and the Broken Bridge.',
  canyon: 'Hairpins, tunnels and the lookout.', waterfront: 'The bay promenade.',
};
const TOD_BLURB = {
  morning: 'Low warm sun from the east, long shadows.', noon: 'Bright overhead sun. Best visibility.',
  golden: 'Warm light, glowing paint.', sunset: 'Orange sky, city lights coming on.', night: 'Street lights and neon.',
};
const WEATHER_BLURB = {
  clear: 'Dry roads, full sun.', cloudy: 'Soft light, overcast sky.', rain: 'Wet roads, spray, less grip.',
  fog: 'Thick fog, short view.', storm: 'Heavy rain and lightning.',
};

// Sky swatch for the time / weather cards: zenith -> horizon gradient with the sun disc.
function skyCard(p) {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 100;
  const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, 100);
  gr.addColorStop(0, p.zenith);
  gr.addColorStop(0.7, p.horizon);
  gr.addColorStop(1, p.glow);
  x.fillStyle = gr;
  x.fillRect(0, 0, 160, 100);
  const sy = 92 - Math.min(80, p.elev * 1.3);
  const sg = x.createRadialGradient(110, sy, 0, 110, sy, p.disk > 0.5 ? 34 : 18);
  sg.addColorStop(0, '#' + new THREE.Color(p.sun).getHexString());
  sg.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  x.globalAlpha = 1 - p.cloudCover * 0.6;
  x.fillStyle = sg;
  x.fillRect(0, 0, 160, 100);
  x.globalAlpha = p.cloudCover * 0.75;
  x.fillStyle = p.cloudLit;
  for (let i = 0; i < 7; i++) {
    x.beginPath();
    x.ellipse(15 + i * 24, 26 + (i % 3) * 9, 26, 7, 0, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;
  x.fillStyle = 'rgba(8,10,16,0.85)';
  for (let i = 0; i < 12; i++) x.fillRect(i * 14, 100 - (18 + ((i * 37) % 30)), 12, 40);
  if (p.rain) {
    x.strokeStyle = 'rgba(200,220,255,0.35)';
    for (let i = 0; i < 60; i++) {
      const rx = (i * 53) % 160;
      const ry = (i * 29) % 100;
      x.beginPath();
      x.moveTo(rx, ry);
      x.lineTo(rx - 3, ry + 9);
      x.stroke();
    }
  }
  return c.toDataURL();
}
const KEY_NAMES = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'SPACE', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT',
  ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', AltLeft: 'L-ALT', AltRight: 'R-ALT', Escape: 'ESC', Enter: 'ENTER', Tab: 'TAB', Backspace: 'BKSP',
};
export function keyName(code) {
  if (!code) return '—';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
  return code.toUpperCase();
}

const CONTROLS = [
  ['W / S', 'Throttle / Brake & Reverse'], ['A / D', 'Steer'], ['Shift', 'Rear Rockets'], ['Space', 'Hover Jets · tap mid-air: Cold Snap'],
  ['Ctrl', 'Handbrake'], ['Q / E', 'Air roll'], ['Arrows', 'Pitch / yaw in the air'], ['F', 'Ghost Mode (hold)'], ['1 2 3', 'Track / Drift / Flight'],
  ['C', 'Camera'], ['G', 'Doors'], ['X', 'X-Ray view'], ['R', 'Reset car (hold)'], ['P', 'Photo mode'], ['H', 'Show / hide hints'], ['Esc', 'Pause'],
  ['Enter', 'Start activity at a marker'], ['F8', 'FPS counter'], ['F9', 'Collider debug'],
];
const PAD = [
  ['RT / LT', 'Throttle / Brake'], ['Left stick', 'Steer · air pitch / yaw'], ['A', 'Hover Jets / Cold Snap'], ['X', 'Rear Rockets'], ['B', 'Handbrake'],
  ['Y', 'Ghost Mode'], ['LB / RB', 'Air roll'], ['D-pad', 'Handling modes / X-Ray'], ['View', 'Reset'], ['Menu', 'Pause'],
];

export class Menu {
  constructor(game) {
    this.game = game;
    this.root = document.createElement('div');
    this.root.id = 'menu';
    this.root.className = 'hidden';
    document.getElementById('ui-root').appendChild(this.root);
    this.garage = new GarageScene(game.gfx.renderer);
    this.screen = null;
    this.items = [];
    this.index = 0;
    this.stack = [];
    this.padPrev = {};
    this.padRepeat = 0;
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  get open() {
    return !!this.screen;
  }

  // ---- navigation ----------------------------------------------------------------------------
  onKey(e) {
    if (!this.screen) return;
    if (this.ignoreCode === e.code) {
      this.ignoreCode = null;
      return;
    }
    if (this.capturing) return;
    const k = e.code;
    let handled = true;
    if (k === 'ArrowUp' || k === 'KeyW') this.move(-1);
    else if (k === 'ArrowDown' || k === 'KeyS') this.move(1);
    else if (k === 'ArrowLeft' || k === 'KeyA') this.horizontal ? this.move(-1) : this.adjust(-1);
    else if (k === 'ArrowRight' || k === 'KeyD') this.horizontal ? this.move(1) : this.adjust(1);
    else if (k === 'Enter' || k === 'NumpadEnter' || k === 'Space') this.activate();
    else if (k === 'Escape' || k === 'Backspace') this.back();
    else handled = false;
    if (handled) {
      e.preventDefault();
      this.game.input.pressedKeys.delete(k);
    }
  }

  pollPad(realDt) {
    const p = this.game.input.pad;
    if (!p || !this.screen || this.capturing) return;
    const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    const ly = p.axes[1] || 0;
    const lx = p.axes[0] || 0;
    const now = { up: b(12) || ly < -0.6, down: b(13) || ly > 0.6, left: b(14) || lx < -0.6, right: b(15) || lx > 0.6, a: b(0), b: b(1), start: b(9) };
    const prev = this.padPrev;
    this.padRepeat -= realDt;
    const edge = (k) => now[k] && (!prev[k] || this.padRepeat <= 0);
    if (edge('up')) this.move(-1);
    else if (edge('down')) this.move(1);
    else if (edge('left')) this.horizontal ? this.move(-1) : this.adjust(-1);
    else if (edge('right')) this.horizontal ? this.move(1) : this.adjust(1);
    if (now.up || now.down || now.left || now.right) {
      if (!(prev.up || prev.down || prev.left || prev.right)) this.padRepeat = 0.4;
      else if (this.padRepeat <= 0) this.padRepeat = 0.12;
    }
    if (now.a && !prev.a) this.activate();
    if ((now.b && !prev.b) || (now.start && !prev.start && this.screen === 'pause')) this.back();
    this.padPrev = now;
  }

  move(d) {
    if (!this.items.length) return;
    let i = this.index;
    for (let n = 0; n < this.items.length; n++) {
      i = (i + d + this.items.length) % this.items.length;
      if (!this.items[i].disabled) break;
    }
    this.focus(i);
    this.sound('hover');
  }

  focus(i) {
    this.index = i;
    this.items.forEach((it, k) => it.el.classList.toggle('focus', k === i));
    const el = this.items[i] && this.items[i].el;
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    if (this.items[i] && this.items[i].onFocus) this.items[i].onFocus();
  }

  adjust(d) {
    const it = this.items[this.index];
    if (!it || it.disabled) return;
    if (it.type === 'slider') {
      it.set(clamp(Math.round((it.get() + d * 0.05) * 100) / 100, 0, 1));
      this.refresh(it);
      this.sound('hover');
    } else if (it.type === 'select') {
      const opts = it.options;
      const cur = opts.findIndex((o) => o[0] === it.get());
      const n = opts[(cur + d + opts.length) % opts.length];
      it.set(n[0]);
      this.refresh(it);
      this.sound('click');
    }
  }

  activate() {
    const it = this.items[this.index];
    if (!it || it.disabled) {
      this.sound('back');
      return;
    }
    if (it.type === 'select') return this.adjust(1);
    if (it.type === 'slider') return;
    this.sound(it.sound || 'click');
    if (it.action) it.action();
  }

  back() {
    this.sound('back');
    if (this.onBack) this.onBack();
  }

  sound(kind) {
    if (this.game.audio) this.game.audio.ui(kind);
  }

  // ---- rendering -------------------------------------------------------------------------------
  // items: { type: 'button'|'slider'|'select'|'bind'|'header', label, sub, action, get, set, options, disabled }
  render(html, items, { focus = 0, cls = '', horizontal = false } = {}) {
    this.root.className = `menu ${cls}`;
    this.horizontal = horizontal;
    this.capturing = false;
    // Buttons held while a screen opens must be released before they act again.
    this.padPrev = { up: true, down: true, left: true, right: true, a: true, b: true, start: true };
    this.root.innerHTML = html;
    const list = this.root.querySelector('.menu-list');
    this.items = [];
    for (const it of items) {
      if (it.type === 'header') {
        const h = document.createElement('div');
        h.className = 'menu-header';
        h.textContent = it.label;
        list.appendChild(h);
        continue;
      }
      const el = document.createElement('div');
      el.className = `menu-item ${it.type || 'button'} ${it.disabled ? 'disabled' : ''} ${it.cls || ''}`;
      it.el = el;
      list.appendChild(el);
      this.items.push(it);
      this.refresh(it);
      if (it.img) el.style.setProperty('--card-img', `url("${it.img}")`);
      const idx = this.items.length - 1;
      el.addEventListener('mouseenter', () => {
        if (this.index !== idx) {
          this.focus(idx);
          this.sound('hover');
        }
      });
      el.addEventListener('click', (e) => {
        this.focus(idx);
        if (it.type === 'slider') return;
        if (it.type === 'select') {
          const r = el.getBoundingClientRect();
          this.adjust(e.clientX < r.left + r.width * 0.55 ? -1 : 1);
          return;
        }
        this.activate();
      });
      if (it.type === 'slider') {
        const input = el.querySelector('input');
        input.addEventListener('input', () => {
          it.set(Number(input.value) / 100);
          this.refresh(it);
        });
      }
    }
    let f = clamp(focus, 0, this.items.length - 1);
    if (this.items[f] && this.items[f].disabled) f = this.items.findIndex((x) => !x.disabled);
    this.focus(Math.max(0, f));
  }

  refresh(it) {
    const el = it.el;
    const label = `${it.num ? `<span class="mi-num">${it.num}</span>` : ''}<span class="mi-label">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>`;
    if (it.type === 'slider') {
      const v = Math.round(it.get() * 100);
      if (!el.querySelector('input')) el.innerHTML = `${label}<span class="mi-value"><input type="range" min="0" max="100" step="1"><b></b></span>`;
      el.querySelector('input').value = v;
      el.querySelector('b').textContent = `${v}%`;
    } else if (it.type === 'select') {
      const o = it.options.find((x) => x[0] === it.get()) || it.options[0];
      el.innerHTML = `${label}<span class="mi-value sel">‹ <b>${esc(o[1])}</b> ›</span>`;
    } else if (it.type === 'bind') {
      const codes = this.game.settings.get('bindings')[it.actionName] || [];
      el.innerHTML = `${label}<span class="mi-value keys">${codes.map((c) => `<kbd>${esc(keyName(c))}</kbd>`).join('')}</span>`;
    } else {
      el.innerHTML = `${label}${it.value != null ? `<span class="mi-value">${it.value}</span>` : ''}`;
    }
  }

  close() {
    this.screen = null;
    this.items = [];
    this.root.className = 'hidden';
    this.root.innerHTML = '';
    this.onBack = null;
  }

  // ---- showroom ------------------------------------------------------------------------------
  enterShowroom(mode) {
    const g = this.game;
    this.garage.setMode(mode);
    if (!this.garage.active) {
      this.garage.enter(g.playerVisual);
      g.gfx.renderPass.scene = this.garage.scene;
      for (const k in g.gfx.fx) g.gfx.fx[k] = 0;
      g.hud.show(false);
    }
    if (g.audio) g.audio.setMenu(true);
  }

  leaveShowroom() {
    const g = this.game;
    if (this.garage.active) {
      this.garage.exit();
      g.gfx.renderPass.scene = g.scene;
    }
    if (g.audio) g.audio.setMenu(false);
  }

  update(realDt) {
    this.pollPad(realDt);
    if (this.garage.active) {
      this.garage.update(realDt, this.game.camera);
      // Keep the borrowed model's lights / wheels animating at rest.
      this.game.playerVisual.update(realDt, this.game.player);
      if (this.screen === 'title') this.updateHotspots();
    }
  }

  // ---- screens -------------------------------------------------------------------------------
  careerLine() {
    const p = this.game.progress;
    const done = Object.values(p.data.missions).filter((m) => m.done).length;
    return `<div class="career"><span>$${p.cash.toLocaleString()}</span><span>${p.rep.toLocaleString()} REP</span><span>LV ${p.level}</span><span>${done}/10 JOBS</span></div>`;
  }

  logoHtml() {
    return `<div class="logo-wrap"><div class="title-logo" data-text="RDSTR">RDSTR<i class="sweep"></i></div><div class="title-sub">// COLD GAS PURSUIT</div></div>`;
  }

  showTitle(focus = 0) {
    const g = this.game;
    this.screen = 'title';
    g.state = 'title';
    this.enterShowroom('title');
    const p = g.progress;
    const items = [];
    if (p.hasSave || p.rep > 0 || Object.keys(p.data.missions).length) items.push({ label: 'CONTINUE', sub: this.nextJobText(), action: () => g.startPlay({ continueStory: true }) });
    items.push(
      { label: 'PLAY', sub: 'Choose mode, district, time and weather', action: () => this.showPlay() },
      { label: 'GARAGE', sub: 'Paint and upgrades', action: () => this.showGarage('title') },
      { label: 'PLAYER NAME', sub: p.playerName, action: () => this.showName() },
      { label: 'SETTINGS', sub: 'Sound, VFX, graphics, controls, HUD', action: () => this.showSettings('title') },
      { label: 'GAME INFO', sub: 'Story, controls, modes, credits', action: () => this.showInfo() },
      { label: 'SAVE GAMES', sub: '3 slots', action: () => this.showSaves('title') },
      { label: 'EXIT', action: () => this.showExit(), cls: 'exit' },
    );
    items.forEach((it, i) => (it.num = String(i + 1).padStart(2, '0')));
    if (typeof focus === 'string') focus = Math.max(0, items.findIndex((it) => it.label === focus));
    this.render(`
      <div class="title-col">
        ${this.logoHtml()}
        <div class="player-tag"><span>DRIVER</span><b>${esc(p.playerName)}</b></div>
        <div class="menu-list"></div>
        ${this.careerLine()}
        <div class="menu-foot">↑↓ SELECT · ENTER CONFIRM · DRAG CAR TO ROTATE · SCROLL TO ZOOM</div>
      </div>
      <div class="hotspots">
        <button data-hot="doors"><i></i><span>DOORS</span></button>
        <button data-hot="roof"><i></i><span>ROOF</span></button>
        <button data-hot="lights"><i></i><span>LIGHTS</span></button>
        <button data-hot="thrusters"><i></i><span>THRUSTERS</span></button>
      </div>`, items, { cls: 'title-screen', focus });
    this.bindHotspots();
    this.onBack = null;
  }

  bindHotspots() {
    for (const b of this.root.querySelectorAll('.hotspots button')) {
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', () => {
        this.garage.toggle(b.dataset.hot);
        this.sound('click');
        this.syncHotspots();
      });
    }
    this.syncHotspots();
  }

  syncHotspots() {
    const h = this.garage.hot || {};
    const m = this.game.playerVisual;
    for (const b of this.root.querySelectorAll('.hotspots button')) {
      const k = b.dataset.hot;
      const on = k === 'doors' ? m.state.doorTarget > 0.5 : !!h[k];
      b.classList.toggle('on', on);
    }
  }

  // Hotspot anchors in car-local space (front is -z) and their outward normals.
  updateHotspots() {
    const el = this.root.querySelector('.hotspots');
    if (!el || !this.garage.active) return;
    const cam = this.game.camera;
    const root = this.game.playerVisual.root;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const anchors = {
      doors: [[0.95, 0.3, -0.1], [1, 0, 0]], roof: [[0, 0.72, 0.2], [0, 1, 0]],
      lights: [[0.62, 0.14, -2.0], [0.3, 0, -1]], thrusters: [[0, 0.15, 2.2], [0, 0, 1]],
    };
    const p = this._hp || (this._hp = new THREE.Vector3());
    const n = this._hn || (this._hn = new THREE.Vector3());
    const toCam = this._hc || (this._hc = new THREE.Vector3());
    for (const b of el.children) {
      const [pos, nrm] = anchors[b.dataset.hot];
      p.set(...pos).applyMatrix4(root.matrixWorld);
      n.set(...nrm).transformDirection(root.matrixWorld);
      toCam.copy(cam.position).sub(p).normalize();
      const facing = n.dot(toCam);
      // Mirror side hotspots to the visible side.
      if (b.dataset.hot === 'doors' && facing < 0) {
        p.set(-pos[0], pos[1], pos[2]).applyMatrix4(root.matrixWorld);
      }
      const vis = b.dataset.hot === 'doors' ? 1 : clamp((facing + 0.15) * 3, 0, 1);
      p.project(cam);
      b.style.transform = `translate(${((p.x + 1) / 2) * W}px, ${((1 - p.y) / 2) * H}px)`;
      b.style.opacity = vis.toFixed(2);
      b.style.pointerEvents = vis > 0.3 ? 'auto' : 'none';
    }
  }

  nextJobText() {
    const next = this.nextMission();
    return next ? `Next job: ${next.name}` : 'All jobs done. Free roam the city.';
  }

  nextMission() {
    const p = this.game.progress;
    return this.game.activities.defs.find((d) => d.kind === 'mission' && !(p.data.missions[d.id] && p.data.missions[d.id].done) && p.rep >= d.rep && p.districtOpen(d.district))
      || null;
  }

  // ---- PLAY: mode -> district -> time of day -> weather ------------------------------------
  showPlay() {
    const g = this.game;
    this.screen = 'play';
    this.enterShowroom('title');
    const modes = [
      { id: 'free', label: 'FREE ROAM', sub: 'The open city with every feature: jobs, races, pursuits, stunts.', on: true },
      { id: 'race', label: 'RACE', sub: 'Dedicated circuits with rival AI.', on: false },
      { id: 'heist', label: 'HEIST', sub: 'Plan, rob, escape a city-wide chase.', on: false },
      { id: 'career', label: 'CAREER', sub: '100+ tasks, levels and unlocks.', on: false },
      { id: 'kids', label: 'KIDS', sub: 'Daylight, no police, easy fun.', on: false },
    ];
    const items = modes.map((m) => ({
      label: m.label, sub: m.on ? m.sub : 'COMING SOON', disabled: !m.on, cls: `card mode-${m.id}`,
      action: () => {
        this.playSetup = { mode: m.id };
        this.showPlayStep2();
      },
    }));
    this.render(`
      <div class="play-wrap">
        <div class="step-head"><b>01</b><span>SELECT MODE</span>${this.stepDots(0)}</div>
        <div class="menu-list cards"></div>
        <div class="menu-foot">←→ SELECT · ENTER CONFIRM · ESC BACK</div>
      </div>`, items, { cls: 'play-screen', horizontal: true });
    this.onBack = () => this.showTitle();
  }

  stepDots(i) {
    return `<div class="step-dots">${[0, 1, 2, 3].map((k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>`;
  }

  // Step 2: district start point (cards with a still rendered from the game).
  showPlayStep2() {
    const g = this.game;
    const p = g.progress;
    this.previews = this.previews || {};
    const items = DISTRICTS.map((d) => {
      const open = p.districtOpen(d.id) || d.id === 'waterfront';
      if (!this.previews[d.id]) {
        try {
          this.previews[d.id] = g.renderPreview(g.world.districtStart(d.id));
        } catch (e) {
          this.previews[d.id] = null;
        }
      }
      const rep = (DISTRICT_UNLOCKS.find((u) => u.id === d.id) || {}).rep;
      return {
        label: d.name.toUpperCase(), sub: open ? DISTRICT_BLURB[d.id] || '' : `LOCKED · ${rep || '?'} REP`, disabled: !open,
        cls: `card district-${d.id}`, img: this.previews[d.id],
        action: () => {
          this.playSetup.district = d.id;
          this.showPlayStep3();
        },
      };
    });
    this.render(`
      <div class="play-wrap">
        <div class="step-head"><b>02</b><span>START DISTRICT</span>${this.stepDots(1)}</div>
        <div class="menu-list cards"></div>
        <div class="menu-foot">←→ SELECT · ENTER CONFIRM · ESC BACK</div>
      </div>`, items, { cls: 'play-screen', horizontal: true });
    this.onBack = () => this.showPlay();
  }

  // Step 3: time of day.
  showPlayStep3() {
    const cur = this.game.settings.get('tod') || 'noon';
    const ids = Object.keys(TODS);
    const items = ids.map((id) => {
      const t = makePreset(id, 'clear');
      return {
        label: TODS[id].label.toUpperCase(), sub: TOD_BLURB[id], cls: `card tod-${id}`, value: id === 'noon' ? 'DEFAULT' : null,
        img: skyCard(t),
        action: () => {
          this.playSetup.tod = id;
          this.showPlayStep4();
        },
      };
    });
    this.render(`
      <div class="play-wrap">
        <div class="step-head"><b>03</b><span>TIME OF DAY</span>${this.stepDots(2)}</div>
        <div class="menu-list cards"></div>
        <div class="menu-foot">←→ SELECT · ENTER CONFIRM · ESC BACK</div>
      </div>`, items, { cls: 'play-screen', horizontal: true, focus: Math.max(0, ids.indexOf(cur)) });
    this.onBack = () => this.showPlayStep2();
  }

  // Step 4: weather, then drive.
  showPlayStep4() {
    const g = this.game;
    const cur = g.settings.get('weather') || 'clear';
    const ids = Object.keys(WEATHERS);
    const items = ids.map((id) => ({
      label: WEATHERS[id].label.toUpperCase(), sub: WEATHER_BLURB[id], cls: `card weather-${id}`,
      img: skyCard(makePreset(this.playSetup.tod, id)),
      action: () => {
        const s = this.playSetup;
        s.weather = id;
        g.startPlay({ district: s.district, tod: s.tod, weather: s.weather });
      },
    }));
    this.render(`
      <div class="play-wrap">
        <div class="step-head"><b>04</b><span>WEATHER</span>${this.stepDots(3)}</div>
        <div class="menu-list cards"></div>
        <div class="menu-foot">←→ SELECT · ENTER DRIVE · ESC BACK</div>
      </div>`, items, { cls: 'play-screen', horizontal: true, focus: Math.max(0, ids.indexOf(cur)) });
    this.onBack = () => this.showPlayStep3();
  }

  // ---- player name ---------------------------------------------------------------------------
  showName() {
    const g = this.game;
    this.screen = 'name';
    const items = [
      { label: 'SAVE NAME', action: () => save() },
      { label: 'BACK', action: () => this.back(), cls: 'back' },
    ];
    this.render(`
      <div class="panel cut name-panel">
        <div class="panel-title">PLAYER NAME</div>
        <p class="panel-note">Shown on the HUD, results screens and save slots.</p>
        <input class="name-input" maxlength="16" spellcheck="false" autocomplete="off" value="${esc(g.progress.playerName)}">
        <div class="menu-list"></div>
      </div>`, items, { cls: 'settings-screen' });
    const input = this.root.querySelector('.name-input');
    const save = () => {
      g.progress.setPlayerName(input.value);
      g.hud.setPlayerName?.(g.progress.playerName);
      this.sound('buy');
      this.showTitle('PLAYER NAME');
    };
    this.capturing = true; // typing: menu keys off while the field has focus
    input.addEventListener('focus', () => (this.capturing = true));
    input.addEventListener('blur', () => (this.capturing = false));
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') save();
      else if (e.key === 'Escape') input.blur();
      else if (e.key === 'ArrowDown') input.blur();
    });
    setTimeout(() => {
      input.focus();
      input.select();
    }, 30);
    this.onBack = () => {
      this.capturing = false;
      this.showTitle('PLAYER NAME');
    };
  }

  // ---- game info -----------------------------------------------------------------------------
  showInfo(tab = 0) {
    this.screen = 'info';
    const tabs = [
      ['STORY', `<p>Halcyon Bay never sleeps. You are <b>${esc(this.game.progress.playerName)}</b>, driver of a stolen prototype electric roadster with cold-gas thrusters: four copper outlets, a rocket pack behind the plate and a canopy that has seen too many police spotlights.</p><p>A fixer called <b>CIPHER</b> sends you jobs: getaways, data runs, bounties, sky gaps and ghost protocols. Every job raises your rep, opens new districts and buys upgrades. The Halcyon Bay Police answer with cruisers, interceptors, SWAT, a helicopter and EMP drones.</p><p>Outrun them. Out-fly them. Disappear.</p>`],
      ['CONTROLS', this.controlsHtml(false)],
      ['MODES', `<div class="info-modes"><div><b>FREE ROAM</b>Open city: jobs and street races at markers, pursuits, stunts, Air Stations, charging and repair.</div><div class="soon"><b>RACE</b>Five circuits with rival AI, laps, checkpoints and records.</div><div class="soon"><b>HEIST</b>Rob a bank, jewelry store or armored truck, then escape to a safehouse.</div><div class="soon"><b>CAREER</b>100+ tasks with levels: deliveries, drifts, jumps, takedowns and more.</div><div class="soon"><b>KIDS</b>Daylight, no police, no damage: collect stars, pop balloons, find hidden animals.</div></div><p class="panel-note">Race, Heist, Career and Kids arrive in the next update.</p>`],
      ['CREDITS', `<p><b>RDSTR // COLD GAS PURSUIT</b></p><p>Game design, code, 3D models, procedural city, synthesized audio and music: built from scratch in the browser.</p><p>Built with <b>Three.js</b> (rendering), <b>Rapier</b> (physics) and <b>postprocessing</b> (bloom, tone mapping, SMAA).</p><p class="panel-note">All brands in Halcyon Bay are fictional.</p>`],
    ];
    const items = tabs.map(([name, html], i) => ({
      label: name, cls: 'tab',
      onFocus: () => {
        const c = this.root.querySelector('.info-body');
        if (c) c.innerHTML = html;
      },
      action: () => {},
    }));
    items.push({ label: 'BACK', action: () => this.back(), cls: 'back' });
    this.render(`
      <div class="panel cut info-panel">
        <div class="panel-title">GAME INFO</div>
        <div class="info-grid"><div class="menu-list"></div><div class="info-body"></div></div>
      </div>`, items, { cls: 'settings-screen', focus: tab });
    this.onBack = () => this.showTitle('GAME INFO');
  }

  // ---- save games ----------------------------------------------------------------------------
  showSaves(from, focus = 0) {
    const g = this.game;
    const p = g.progress;
    this.screen = 'saves';
    if (from === 'title') this.enterShowroom('title');
    const items = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const info = p.slotInfo(i);
      items.push({
        label: `SLOT ${i + 1}`,
        sub: info ? `${info.name} · LV ${info.level} · $${info.cash.toLocaleString()} · ${fmtTime(info.playtime)} · ${fmtDate(info.lastPlayed)}` : 'Empty',
        value: info ? `<span class="slot-lv">LV ${info.level}</span>` : '<span class="slot-empty">—</span>',
        cls: `slot ${info ? '' : 'empty'}`,
        action: () => this.showSlot(from, i, info),
      });
    }
    items.push({ label: 'BACK', action: () => this.back(), cls: 'back' });
    this.render(`
      <div class="panel cut saves-panel">
        <div class="panel-title">SAVE GAMES</div>
        <p class="panel-note">Current: ${esc(p.playerName)} · LV ${p.level} · $${p.cash.toLocaleString()} · ${fmtTime(p.data.playtime || 0)}</p>
        <div class="menu-list"></div>
        <div class="flash-msg"></div>
      </div>`, items, { cls: `settings-screen ${from === 'pause' ? 'over-game' : ''}`, focus });
    this.onBack = () => (from === 'pause' ? this.showPause() : this.showTitle('SAVE GAMES'));
  }

  showSlot(from, i, info) {
    const g = this.game;
    const p = g.progress;
    const items = [];
    if (info) {
      items.push({
        label: 'LOAD', sub: 'Replace the current career with this save', action: () => {
          p.loadSlot(i);
          p.apply(g.player);
          g.playerVisual.setPaint(p.data.paint, true);
          g.activities.buildStartMarkers();
          if (from === 'pause') g.quitToTitle();
          else this.showTitle();
        },
      });
    }
    items.push({
      label: info ? 'OVERWRITE' : 'SAVE HERE', sub: 'Save the current career to this slot', action: () => {
        const go = () => {
          p.saveSlot(i);
          this.sound('buy');
          this.showSaves(from, i);
        };
        if (info) this.confirm(`OVERWRITE SLOT ${i + 1}?`, `${info.name} · LV ${info.level} will be replaced.`, go, () => this.showSlot(from, i, info));
        else go();
      },
    });
    if (info) items.push({ label: 'DELETE', cls: 'danger', action: () => this.confirm(`DELETE SLOT ${i + 1}?`, 'This cannot be undone.', () => {
      p.deleteSlot(i);
      this.showSaves(from, i);
    }, () => this.showSlot(from, i, info)) });
    items.push({ label: 'BACK', action: () => this.back(), cls: 'back' });
    this.render(`<div class="panel cut confirm-panel"><div class="panel-title">SLOT ${i + 1}</div><p>${info ? `${esc(info.name)} · LV ${info.level} · $${info.cash.toLocaleString()}<br>${fmtTime(info.playtime)} played · ${fmtDate(info.lastPlayed)}` : 'Empty slot'}</p><div class="menu-list"></div></div>`, items, { cls: `settings-screen ${from === 'pause' ? 'over-game' : ''}` });
    this.onBack = () => this.showSaves(from, i);
  }

  confirm(title, text, yes, no) {
    const items = [{ label: 'CONFIRM', cls: 'danger', action: yes }, { label: 'CANCEL', action: no }];
    const over = this.root.classList.contains('over-game') ? 'over-game' : '';
    this.render(`<div class="panel cut confirm-panel"><div class="panel-title">${esc(title)}</div><p>${esc(text)}</p><div class="menu-list"></div></div>`, items, { cls: `settings-screen ${over}`, focus: 1 });
    this.onBack = no;
  }

  // ---- exit ----------------------------------------------------------------------------------
  showExit() {
    this.screen = 'exit';
    this.confirm('EXIT GAME?', 'Your career is saved automatically.', () => this.showThanks(), () => this.showTitle('EXIT'));
  }

  showThanks() {
    const g = this.game;
    this.screen = 'thanks';
    if (g.audio) g.audio.setMenu(true);
    this.render(`
      <div class="thanks">
        ${this.logoHtml()}
        <div class="thanks-text">THANKS FOR PLAYING, ${esc(g.progress.playerName)}</div>
        <p>You can close this tab now.</p>
        <div class="menu-list"></div>
      </div>`, [{ label: 'BACK TO TITLE', action: () => this.showTitle() }], { cls: 'thanks-screen' });
    this.onBack = () => this.showTitle();
  }

  showList(kind, from) {
    const g = this.game;
    const p = g.progress;
    this.screen = 'list';
    if (from === 'title') this.enterShowroom('title');
    const defs = g.activities.defs.filter((d) => d.kind === kind);
    const items = defs.map((d) => {
      const rec = kind === 'race' ? p.data.races[d.id] : p.data.missions[d.id];
      const districtOpen = p.districtOpen(d.district);
      const repOk = p.rep >= d.rep;
      const dist = DISTRICT_UNLOCKS.find((x) => x.id === d.district);
      const lockText = !districtOpen ? `Unlocks with ${dist.rep} rep` : !repOk ? `Requires ${d.rep} rep` : null;
      const best = rec && kind === 'race' && rec.bestTime != null ? ` · best ${fmt(rec.bestTime)}` : '';
      return {
        label: d.name.toUpperCase(),
        sub: `${kind === 'race' ? (d.scoring === 'drift' ? 'DRIFT RUN' : `${d.laps} LAPS`) : TYPE[d.type]} · ${dist ? dist.name : ''}${lockText ? ` · ${lockText}` : best}`,
        value: rec && (rec.done || rec.stars) ? `<span class="mstars">${stars(rec.stars)}</span>` : lockText ? '🔒' : '',
        disabled: !!lockText,
        action: () => g.startPlay({ activity: d }),
        onFocus: () => {
          const det = this.root.querySelector('.list-detail');
          if (det) det.innerHTML = `<div class="ld-type">${kind === 'race' ? 'STREET RACE' : TYPE[d.type]}</div><div class="ld-name">${esc(d.name)}</div><div class="ld-brief">${esc(d.brief)}</div><div class="ld-reward">$${d.reward.cash.toLocaleString()} · ${d.reward.rep} REP</div>${lockText ? `<div class="ld-lock">${esc(lockText.toUpperCase())}</div>` : ''}`;
        },
      };
    });
    items.push({ label: 'BACK', action: () => this.back(), cls: 'back' });
    this.render(`
      <div class="panel list-panel">
        <div class="panel-title">${kind === 'race' ? 'STREET RACES' : 'MISSIONS'}</div>
        <div class="menu-list scroll"></div>
      </div>
      <div class="list-detail"></div>`, items, { cls: 'list-screen' });
    this.onBack = () => this.showTitle();
  }

  // ---- garage --------------------------------------------------------------------------------
  showGarage(from, focus = 0) {
    const g = this.game;
    const p = g.progress;
    this.screen = 'garage';
    this.enterShowroom('garage');
    const items = [{ type: 'header', label: 'PAINT' }];
    for (const [id, paint] of Object.entries(PAINTS)) {
      const owned = p.paintUnlocked(id);
      const equipped = p.data.paint === id;
      const cost = PAINT_COSTS[id] ?? 5000;
      items.push({
        label: paint.label,
        sub: equipped ? 'EQUIPPED' : owned ? 'Owned' : `$${cost.toLocaleString()}`,
        value: `<i class="swatch" style="background:#${paint.color.toString(16).padStart(6, '0')};box-shadow:0 0 10px #${(paint.glow || paint.color).toString(16).padStart(6, '0')}"></i>`,
        cls: equipped ? 'equipped' : '',
        sound: owned ? 'click' : 'buy',
        onFocus: () => g.playerVisual.setPaint(id, true),
        action: () => {
          if (!owned && !p.buyPaint(id)) {
            this.flash('NOT ENOUGH CASH');
            this.sound('back');
            return;
          }
          p.setPaint(id);
          g.playerVisual.setPaint(id, true);
          this.showGarage(from, this.index + 1);
        },
      });
    }
    items.push({ type: 'header', label: 'UPGRADES' });
    for (const [key, u] of Object.entries(UPGRADES)) {
      const lvl = p.data.upgrades[key];
      const cost = p.upgradeCost(key);
      items.push({
        label: u.name,
        sub: cost == null ? 'MAXED' : `Level ${lvl + 1}: $${cost.toLocaleString()}`,
        value: `<span class="pips">${[0, 1, 2].map((i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</span>`,
        disabled: cost == null,
        sound: 'buy',
        onFocus: () => {
          if (g.playerVisual.paintKey !== p.data.paint) g.playerVisual.setPaint(p.data.paint, true);
          this.statPreview = key;
          this.renderStats();
        },
        action: () => {
          if (!p.buyUpgrade(key)) {
            this.flash('NOT ENOUGH CASH');
            this.sound('back');
            return;
          }
          p.apply(g.player);
          this.showGarage(from, this.index + 2);
        },
      });
    }
    items.push({ label: 'BACK', action: () => this.back(), cls: 'back' });
    this.render(`
      <div class="panel garage-panel">
        <div class="panel-title">GARAGE <span class="cash">$${p.cash.toLocaleString()}</span></div>
        <div class="menu-list scroll"></div>
        <div class="flash-msg"></div>
      </div>
      <div class="stats-panel"></div>
      <div class="garage-hint">DRAG TO ROTATE · SCROLL TO ZOOM</div>`, items, { cls: 'garage-screen', focus });
    this.renderStats();
    this.onBack = () => {
      g.playerVisual.setPaint(p.data.paint, true);
      if (from === 'pause') this.showPause();
      else this.showTitle('GARAGE');
    };
  }

  flash(text) {
    const el = this.root.querySelector('.flash-msg');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  renderStats() {
    const el = this.root.querySelector('.stats-panel');
    if (!el) return;
    const u = this.game.progress.data.upgrades;
    const prev = this.statPreview;
    const stat = (name, base, per, key) => {
      const v = clamp(base + per * u[key], 0, 1);
      const next = key === prev && u[key] < 3 ? clamp(base + per * (u[key] + 1), 0, 1) : v;
      return `<div class="stat"><span>${name}</span><div class="bar"><i style="width:${(v * 100).toFixed(0)}%"></i><em style="left:${(v * 100).toFixed(0)}%;width:${((next - v) * 100).toFixed(0)}%"></em></div></div>`;
    };
    el.innerHTML = `
      <div class="stat"><span>Top speed</span><div class="bar"><i style="width:84%"></i></div><b>253 mph</b></div>
      <div class="stat"><span>0-60</span><div class="bar"><i style="width:94%"></i></div><b>2.1 s</b></div>
      ${stat('Handling', 0.66, 0.1, 'grip')}
      ${stat('Thrusters', 0.55, 0.15, 'thrusters')}
      ${stat('Cold-gas tank', 0.5, 0.16, 'copv')}
      ${stat('Cooling', 0.45, 0.17, 'cooling')}
      ${stat('Armor', 0.4, 0.18, 'armor')}`;
  }

  // ---- settings ------------------------------------------------------------------------------
  showSettings(from, focus = 0) {
    const g = this.game;
    this.screen = 'settings';
    if (from === 'title') this.enterShowroom('title');
    const cats = [
      ['SOUND', 'Master, music, SFX'], ['VFX', 'Particles, motion blur, camera shake'], ['GRAPHICS', 'Quality preset, resolution scale'],
      ['CONTROLS', 'Keyboard and gamepad bindings, flight assist'], ['HUD', 'Show / hide elements, gauge position'], ['CAREER', 'Units, reset career'],
    ];
    const items = cats.map(([c, sub]) => ({ label: c, sub, action: () => this.showSettingsCat(from, c) }));
    items.push({ label: 'BACK', action: () => this.back(), cls: 'back' });
    this.render(`
      <div class="panel cut settings-panel narrow">
        <div class="panel-title">SETTINGS</div>
        <div class="menu-list"></div>
      </div>`, items, { cls: `settings-screen ${from === 'pause' ? 'over-game' : ''}`, focus });
    this.onBack = () => (from === 'pause' ? this.showPause() : this.showTitle('SETTINGS'));
  }

  showSettingsCat(from, cat, focus = 0) {
    const g = this.game;
    const s = g.settings;
    const set = (k) => (v) => s.set(k, v);
    const onOff = [[true, 'On'], [false, 'Off']];
    const hud = (k, label) => ({ type: 'select', label, options: [[true, 'Show'], [false, 'Hide']], get: () => s.get('hud')[k], set: (v) => { s.setHud(k, v); g.hud.applyLayout?.(); } });
    let items = [];
    if (cat === 'SOUND') {
      items = [
        { type: 'slider', label: 'Master volume', get: () => s.get('masterVolume'), set: set('masterVolume') },
        { type: 'slider', label: 'Music volume', get: () => s.get('musicVolume'), set: set('musicVolume') },
        { type: 'slider', label: 'SFX volume', get: () => s.get('sfxVolume'), set: set('sfxVolume') },
      ];
    } else if (cat === 'VFX') {
      items = [
        { type: 'slider', label: 'Particle amount', get: () => s.get('particleAmount') ?? 1, set: set('particleAmount') },
        { type: 'select', label: 'Motion blur', options: onOff, get: () => s.get('motionBlur'), set: set('motionBlur') },
        { type: 'select', label: 'Camera shake', options: [[1, 'On'], [0.5, 'Low'], [0, 'Off']], get: () => s.get('cameraShake') ?? 1, set: set('cameraShake') },
      ];
    } else if (cat === 'GRAPHICS') {
      items = [
        { type: 'select', label: 'Quality', options: QUALITY_ORDER.map((q) => [q, QUALITY_PRESETS[q].label]), get: () => s.get('quality'), set: (v) => { s.set('quality', v); g.applyQuality(); } },
        { type: 'select', label: 'Resolution scale', options: [[0.5, '50%'], [0.67, '67%'], [0.75, '75%'], [0.85, '85%'], [1, '100%']], get: () => s.get('resScale') ?? 1, set: (v) => { s.set('resScale', v); g.applyQuality(); } },
        { type: 'select', label: 'Auto quality', sub: 'Drop a level if FPS stays below 45', options: onOff, get: () => s.get('autoQuality'), set: set('autoQuality') },
        { type: 'select', label: 'Time of day', options: Object.keys(TODS).map((k) => [k, TODS[k].label]), get: () => s.get('tod') || 'noon', set: (v) => g.setConditions(v, s.get('weather') || 'clear') },
        { type: 'select', label: 'Weather', options: Object.keys(WEATHERS).map((k) => [k, WEATHERS[k].label]), get: () => s.get('weather') || 'clear', set: (v) => g.setConditions(s.get('tod') || 'noon', v) },
      ];
    } else if (cat === 'CONTROLS') {
      items = [
        { type: 'select', label: 'Flight mode', sub: 'Assisted: auto-level, one key per move. Pro: full manual thrusters', options: [[true, 'Assisted'], [false, 'Pro']], get: () => s.get('flightAssist') !== false, set: set('flightAssist') },
        { type: 'header', label: 'KEYBOARD' },
      ];
      for (const action of Object.keys(ACTION_LABELS)) {
        const it = { type: 'bind', label: ACTION_LABELS[action], actionName: action };
        it.action = () => this.capture(it, action);
        items.push(it);
      }
      items.push({ type: 'header', label: 'GAMEPAD' });
      for (const action of Object.keys(DEFAULT_PAD_BINDINGS)) {
        const it = { type: 'bind', pad: true, label: ACTION_LABELS[action], actionName: action };
        it.action = () => this.capturePad(it, action);
        items.push(it);
      }
      items.push({ label: 'Reset controls to defaults', action: () => { s.resetBindings(); this.showSettingsCat(from, cat, this.index); } });
    } else if (cat === 'HUD') {
      items = [
        hud('speed', 'Speedometer'), hud('battery', 'Battery'), hud('health', 'Chassis health'), hud('thrusters', 'Thrusters (COPV)'), hud('minimap', 'Minimap'), hud('score', 'Style score'),
        { type: 'select', label: 'Gauge position', options: [['bottom', 'Bottom'], ['side', 'Side'], ['top', 'Top']], get: () => s.get('hud').position, set: (v) => { s.setHud('position', v); g.hud.applyLayout?.(); } },
      ];
    } else if (cat === 'CAREER') {
      items = [
        { type: 'select', label: 'Speed units', options: [['mph', 'MPH'], ['kmh', 'KM/H']], get: () => s.get('units'), set: set('units') },
        { label: 'Reset career', sub: 'Erase cash, rep, records and upgrades', cls: 'danger', action: () => this.confirmReset(from) },
      ];
    }
    items.push({ label: 'BACK', action: () => this.back(), cls: 'back' });
    this.screen = 'settings';
    this.render(`
      <div class="panel cut settings-panel">
        <div class="panel-title">SETTINGS <span class="crumb">/ ${cat}</span></div>
        <div class="menu-list scroll"></div>
      </div>`, items, { cls: `settings-screen ${from === 'pause' ? 'over-game' : ''}`, focus });
    this.refreshBinds();
    const ci = ['SOUND', 'VFX', 'GRAPHICS', 'CONTROLS', 'HUD', 'CAREER'].indexOf(cat);
    this.onBack = () => this.showSettings(from, ci);
  }

  refreshBinds() {
    for (const it of this.items) {
      if (it.type !== 'bind') continue;
      const codes = it.pad ? [PAD_BUTTON_NAMES[this.game.settings.get('padBindings')[it.actionName]] || '—'] : (this.game.settings.get('bindings')[it.actionName] || []).map(keyName);
      it.el.innerHTML = `<span class="mi-label">${esc(it.label)}</span><span class="mi-value keys">${codes.map((c) => `<kbd>${esc(c)}</kbd>`).join('')}${it.waiting ? `<em>${it.pad ? 'PRESS A BUTTON · ESC CANCELS' : 'PRESS A KEY · ESC CANCELS'}</em>` : ''}</span>`;
    }
  }

  capture(it, action) {
    const g = this.game;
    this.capturing = true;
    it.waiting = true;
    this.refreshBinds();
    g.input.captureNext((code) => {
      this.capturing = false;
      it.waiting = false;
      this.ignoreCode = code;
      if (code !== 'Escape') {
        const b = structuredClone(g.settings.get('bindings'));
        // A key belongs to one action: remove it elsewhere, then make it this action's primary key.
        for (const k in b) b[k] = b[k].filter((c) => c !== code);
        b[action] = [code, ...(b[action] || []).filter((c) => c !== code)].slice(0, 2);
        g.settings.set('bindings', b);
        this.sound('buy');
      }
      this.refreshBinds();
    });
  }

  capturePad(it, action) {
    const g = this.game;
    this.capturing = true;
    it.waiting = true;
    this.refreshBinds();
    const done = (btn) => {
      this.capturing = false;
      it.waiting = false;
      window.removeEventListener('keydown', cancel, true);
      if (btn != null) {
        const b = { ...g.settings.get('padBindings') };
        // A button belongs to one action: swap with the action that had it.
        const prev = Object.keys(b).find((k) => b[k] === btn);
        if (prev && prev !== action) b[prev] = b[action];
        b[action] = btn;
        g.settings.set('padBindings', b);
        this.sound('buy');
      }
      // Ignore the held button for menu navigation.
      this.padPrev = { up: true, down: true, left: true, right: true, a: true, b: true, start: true };
      this.refreshBinds();
    };
    const cancel = (e) => {
      if (e.code !== 'Escape') return;
      e.stopPropagation();
      g.input.capturePadNext(null);
      done(null);
    };
    window.addEventListener('keydown', cancel, true);
    g.input.capturePadNext(done);
  }

  confirmReset(from) {
    const items = [
      {
        label: 'YES, ERASE MY CAREER', cls: 'danger', action: () => {
          this.game.progress.reset();
          this.game.progress.apply(this.game.player);
          this.game.playerVisual.setPaint('pearlWhite', true);
          this.game.activities.buildStartMarkers();
          this.showSettingsCat(from, 'CAREER');
        },
      },
      { label: 'CANCEL', action: () => this.showSettingsCat(from, 'CAREER') },
    ];
    this.render(`<div class="panel cut confirm-panel"><div class="panel-title">RESET CAREER?</div><p>All cash, rep, unlocked districts, mission stars, race records, paints and upgrades will be lost.</p><div class="menu-list"></div></div>`, items, { cls: 'settings-screen', focus: 1 });
    this.onBack = () => this.showSettingsCat(from, 'CAREER');
  }

  // ---- pause ---------------------------------------------------------------------------------
  showPause() {
    const g = this.game;
    this.screen = 'pause';
    if (g.state === 'playing') g.state = 'paused';
    const act = g.activities.active;
    const items = [{ label: 'RESUME', action: () => this.resume() }];
    if (act) {
      items.push({ label: act.def.kind === 'race' ? 'RESTART RACE' : 'RESTART MISSION', action: () => {
        this.close();
        g.state = 'playing';
        g.activities.restart();
      } });
      items.push({ label: act.def.kind === 'race' ? 'QUIT RACE' : 'QUIT MISSION', action: () => {
        g.activities.quit();
        this.resume();
      } });
    }
    items.push(
      { label: 'CONTROLS', action: () => this.showControls() },
      { label: 'SETTINGS', action: () => this.showSettings('pause') },
      { label: 'GARAGE', sub: 'Upgrades and paint', action: () => this.showGarage('pause') },
      { label: 'SAVE GAME', sub: '3 slots', action: () => this.showSaves('pause') },
      { label: 'QUIT TO TITLE', action: () => g.quitToTitle() },
    );
    const objective = act ? `<div class="pause-obj">${esc(act.def.name.toUpperCase())}</div>` : '';
    this.render(`
      <div class="panel pause-panel">
        <div class="panel-title">PAUSED</div>
        ${objective}
        <div class="menu-list"></div>
        ${this.careerLine()}
      </div>
      <div class="panel controls-mini">${this.controlsHtml(true)}</div>`, items, { cls: 'pause-screen over-game' });
    this.onBack = () => this.resume();
  }

  resume() {
    const g = this.game;
    if (this.garage.active) this.leaveShowroom();
    this.close();
    g.hud.show(true);
    if (g.state === 'paused') g.state = 'playing';
  }

  controlsHtml(compact = false) {
    const pad = g => g.map(([k, v]) => `<div class="ctl"><kbd>${esc(k)}</kbd><span>${esc(v)}</span></div>`).join('');
    const kb = this.game.settings.get('bindings');
    const rows = compact ? CONTROLS.slice(0, 16) : CONTROLS;
    // Show the player's current bindings for rebindable actions.
    const live = rows.map(([k, v]) => {
      const map = { 'Shift': 'rocket', 'Space': 'hover', 'Ctrl': 'handbrake', 'F': 'ghost', 'C': 'camera', 'G': 'doors', 'X': 'xray', 'R': 'reset', 'P': 'photo', 'H': 'help' };
      const a = map[k];
      return a && kb[a] ? [kb[a].map(keyName).join(' / '), v] : [k, v];
    });
    return `<div class="panel-title small">KEYBOARD</div>${pad(live)}${compact ? '' : `<div class="panel-title small">GAMEPAD</div>${pad(PAD)}`}`;
  }

  showControls() {
    this.screen = 'controls';
    this.render(`
      <div class="panel controls-panel">
        <div class="panel-title">CONTROLS</div>
        <div class="controls-cols"><div>${this.controlsHtml(false).split('<div class="panel-title small">GAMEPAD</div>')[0]}</div><div><div class="panel-title small">GAMEPAD</div>${PAD.map(([k, v]) => `<div class="ctl"><kbd>${esc(k)}</kbd><span>${esc(v)}</span></div>`).join('')}</div></div>
        <div class="menu-list"></div>
      </div>`, [{ label: 'BACK', action: () => this.back(), cls: 'back' }], { cls: 'pause-screen over-game' });
    this.onBack = () => this.showPause();
  }
}

function fmtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(Math.floor(sec % 60)).padStart(2, '0')}s`;
}

function fmtDate(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

function fmt(t) {
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(2).padStart(5, '0')}`;
}
