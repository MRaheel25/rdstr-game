// Menus: title screen (rotating Roadster in the showroom, glitch title), mission and race
// lists, Garage (paint, upgrades, stat bars), Settings (graphics, audio, gameplay, key
// rebinding, career reset), Pause and Controls. Keyboard, mouse and gamepad navigation.
import { GarageScene } from './GarageScene.js';
import { ACTION_LABELS, QUALITY_PRESETS, QUALITY_ORDER } from '../core/Settings.js';
import { UPGRADES, PAINT_COSTS, DISTRICT_UNLOCKS } from '../game/Progress.js';
import { PAINTS } from '../vehicle/models/CarMaterials.js';
import { stars } from './ActivityUI.js';
import { clamp } from '../util/math.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const TYPE = { getaway: 'GETAWAY', datarun: 'DATA RUN', bounty: 'BOUNTY', skygap: 'SKY GAP', ghost: 'GHOST PROTOCOL' };
const TOD = [['night', 'Night'], ['dusk', 'Dusk'], ['rain', 'Rainy Night']];
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
    else if (k === 'ArrowLeft' || k === 'KeyA') this.adjust(-1);
    else if (k === 'ArrowRight' || k === 'KeyD') this.adjust(1);
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
    else if (edge('left')) this.adjust(-1);
    else if (edge('right')) this.adjust(1);
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
  render(html, items, { focus = 0, cls = '' } = {}) {
    this.root.className = `menu ${cls}`;
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
    const label = `<span class="mi-label">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>`;
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
    }
  }

  // ---- screens -------------------------------------------------------------------------------
  careerLine() {
    const p = this.game.progress;
    const done = Object.values(p.data.missions).filter((m) => m.done).length;
    return `<div class="career"><span>$${p.cash.toLocaleString()}</span><span>${p.rep.toLocaleString()} REP</span><span>${done}/10 MISSIONS</span></div>`;
  }

  showTitle() {
    const g = this.game;
    this.screen = 'title';
    g.state = 'title';
    this.enterShowroom('title');
    const p = g.progress;
    const items = [];
    if (p.hasSave || p.rep > 0 || Object.keys(p.data.missions).length) items.push({ label: 'CONTINUE', sub: this.nextJobText(), action: () => g.startPlay({ continueStory: true }) });
    items.push(
      { label: 'FREE ROAM', sub: 'Halcyon Bay, after the rain', action: () => g.startPlay({}) },
      { label: 'MISSIONS', sub: 'Jobs for CIPHER', action: () => this.showList('mission', 'title') },
      { label: 'STREET RACES', sub: 'Ring · Downtown · Canyon', action: () => this.showList('race', 'title') },
      { label: 'GARAGE', sub: 'Paint and upgrades', action: () => this.showGarage('title') },
      { label: 'SETTINGS', sub: 'Graphics, audio, controls', action: () => this.showSettings('title') },
    );
    this.render(`
      <div class="title-col">
        <div class="title-logo" data-text="RDSTR">RDSTR</div>
        <div class="title-sub">// COLD GAS PURSUIT</div>
        <div class="menu-list"></div>
        ${this.careerLine()}
        <div class="menu-foot">↑↓ SELECT · ENTER CONFIRM · <span class="pad">Ⓐ / Ⓑ</span></div>
      </div>`, items, { cls: 'title-screen' });
    this.onBack = null;
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
        onFocus: () => g.playerVisual.setPaint(id),
        action: () => {
          if (!owned && !p.buyPaint(id)) {
            this.flash('NOT ENOUGH CASH');
            this.sound('back');
            return;
          }
          p.setPaint(id);
          g.playerVisual.setPaint(id);
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
          g.playerVisual.setPaint(p.data.paint);
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
      g.playerVisual.setPaint(p.data.paint);
      if (from === 'pause') this.showPause();
      else this.showTitle();
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
    const s = g.settings;
    this.screen = 'settings';
    if (from === 'title') this.enterShowroom('title');
    const set = (k) => (v) => s.set(k, v);
    const items = [
      { type: 'header', label: 'GRAPHICS' },
      {
        type: 'select', label: 'Quality', options: QUALITY_ORDER.map((q) => [q, QUALITY_PRESETS[q].label]), get: () => s.get('quality'),
        set: (v) => {
          s.set('quality', v);
          g.applyQuality();
        },
      },
      { type: 'select', label: 'Auto quality', sub: 'Drop a level if FPS stays below 45', options: [[true, 'On'], [false, 'Off']], get: () => s.get('autoQuality'), set: set('autoQuality') },
      { type: 'select', label: 'Motion blur', options: [[true, 'On'], [false, 'Off']], get: () => s.get('motionBlur'), set: set('motionBlur') },
      { type: 'slider', label: 'Camera shake', get: () => s.get('cameraShake') ?? 1, set: set('cameraShake') },
      {
        type: 'select', label: 'Time of day', options: TOD, get: () => s.get('timeOfDay'),
        set: (v) => {
          s.set('timeOfDay', v);
          g.world.env.apply(v);
        },
      },
      { type: 'select', label: 'Rain', options: [[true, 'On'], [false, 'Off']], get: () => s.get('rain'), set: set('rain') },
      { type: 'header', label: 'AUDIO' },
      { type: 'slider', label: 'Master volume', get: () => s.get('masterVolume'), set: set('masterVolume') },
      { type: 'slider', label: 'Music volume', get: () => s.get('musicVolume'), set: set('musicVolume') },
      { type: 'slider', label: 'SFX volume', get: () => s.get('sfxVolume'), set: set('sfxVolume') },
      { type: 'header', label: 'GAMEPLAY' },
      { type: 'select', label: 'Speed units', options: [['mph', 'MPH'], ['kmh', 'KM/H']], get: () => s.get('units'), set: set('units') },
      { type: 'header', label: 'CONTROLS (KEYBOARD)' },
    ];
    for (const action of Object.keys(ACTION_LABELS)) {
      const it = { type: 'bind', label: ACTION_LABELS[action], actionName: action };
      it.action = () => this.capture(it, action);
      items.push(it);
    }
    items.push(
      {
        label: 'Reset controls to defaults', action: () => {
          s.resetBindings();
          this.showSettings(from, this.index);
        },
      },
      { type: 'header', label: 'CAREER' },
      {
        label: 'Reset career', sub: 'Erase cash, rep, records and upgrades', cls: 'danger', action: () => this.confirmReset(from),
      },
      { label: 'BACK', action: () => this.back(), cls: 'back' },
    );
    this.render(`
      <div class="panel settings-panel">
        <div class="panel-title">SETTINGS</div>
        <div class="menu-list scroll"></div>
      </div>`, items, { cls: `settings-screen ${from === 'pause' ? 'over-game' : ''}`, focus });
    this.refreshBinds();
    this.onBack = () => (from === 'pause' ? this.showPause() : this.showTitle());
  }

  refreshBinds() {
    for (const it of this.items) {
      if (it.type !== 'bind') continue;
      const codes = this.game.settings.get('bindings')[it.actionName] || [];
      it.el.innerHTML = `<span class="mi-label">${esc(it.label)}</span><span class="mi-value keys">${codes.map((c) => `<kbd>${esc(keyName(c))}</kbd>`).join('')}${it.waiting ? '<em>PRESS A KEY · ESC CANCELS</em>' : ''}</span>`;
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

  confirmReset(from) {
    const items = [
      {
        label: 'YES, ERASE MY CAREER', cls: 'danger', action: () => {
          this.game.progress.reset();
          this.game.progress.apply(this.game.player);
          this.game.playerVisual.setPaint('pearlWhite');
          this.game.activities.buildStartMarkers();
          this.showSettings(from);
        },
      },
      { label: 'CANCEL', action: () => this.showSettings(from) },
    ];
    this.render(`<div class="panel confirm-panel"><div class="panel-title">RESET CAREER?</div><p>All cash, rep, unlocked districts, mission stars, race records, paints and upgrades will be lost.</p><div class="menu-list"></div></div>`, items, { cls: 'settings-screen', focus: 1 });
    this.onBack = () => this.showSettings(from);
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

function fmt(t) {
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(2).padStart(5, '0')}`;
}
