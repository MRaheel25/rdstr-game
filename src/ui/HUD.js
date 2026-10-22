// In-game HUD: speedometer arc gauge with power/battery/COPV arcs, handling mode, chassis HP,
// heat stars + evade meter, minimap, style score, popups, radio subtitles, warnings, prompts.
import { clamp, MPS_TO_MPH, MPS_TO_KMH } from '../util/math.js';

const $ = (sel) => document.querySelector(sel);
const thrustText = (car) => {
  const t = car.thrust;
  if (t.rocket) return 'ROCKETS';
  if (t.hover) return 'HOVER JETS';
  if (t.air) return 'RCS';
  return car.flightAssist ? 'ASSISTED FLIGHT' : 'PRO FLIGHT';
};

export class HUD {
  constructor(settings) {
    this.settings = settings;
    this.root = $('#hud');
    this.speedEl = $('#speed-readout .speed');
    this.unitEl = $('#speed-readout .unit');
    this.modeEl = $('#mode-indicator');
    this.hpFill = $('#hp-bar .hp-fill');
    this.battEl = $('#energy-readout .batt');
    this.tempEl = $('#energy-readout .temp');
    this.copvEl = $('#energy-readout .copv');
    this.warnEl = $('#warnings');
    this.promptEl = $('#prompt');
    this.hintsEl = $('#hints');
    this.gauge = $('#gauge');
    this.g = this.gauge.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.gauge.width = 300 * dpr;
    this.gauge.height = 300 * dpr;
    this.g.scale(dpr, dpr);
    this.starsEl = $('#heat .stars');
    this.evadeEl = $('#heat .evade');
    this.evadeFill = $('#heat .evade-fill');
    this.evadeLabel = $('#heat .evade-label');
    this.starKey = '';
    this.warnings = new Map();
    this.lastWarnKey = '';
    this.visible = false;
    this.gaugeTimer = 0;
    // V2 gauge tiles.
    this.tiles = {};
    for (const k of ['batt', 'hp', 'copv']) {
      const el = $(`#cluster .gt.${k}`);
      this.tiles[k] = { el, val: el.querySelector('.gt-head b'), bar: el.querySelector('.gt-bar i'), sub: el.querySelector('.gt-sub'), cls: '' };
    }
    this.tv = $('#thrust-view');
    this.tg = this.tv.getContext('2d');
    this.tv.width = 120 * dpr;
    this.tv.height = 120 * dpr;
    this.tg.scale(dpr, dpr);
    this.tagEl = $('#player-tag');
    this.applyLayout();
  }

  // Settings > HUD: show / hide elements and gauge position.
  applyLayout() {
    const h = this.settings.get('hud') || {};
    const r = this.root;
    for (const pos of ['bottom', 'side', 'top']) r.classList.toggle(`pos-${pos}`, (h.position || 'bottom') === pos);
    for (const k of ['speed', 'battery', 'health', 'thrusters', 'minimap', 'score']) r.classList.toggle(`hide-${k}`, h[k] === false);
  }

  setPlayerName(name) {
    this.tagEl.textContent = name ? `▸ ${String(name).toUpperCase()}` : '';
  }

  // One gauge tile: fraction, value text, sub line; green / yellow / red with a pulse when low.
  tile(k, f, text, sub, mid = 0.5, low = 0.25) {
    const t = this.tiles[k];
    const cls = f <= low ? 'low' : f <= mid ? 'mid' : '';
    if (cls !== t.cls) {
      t.el.classList.toggle('low', cls === 'low');
      t.el.classList.toggle('mid', cls === 'mid');
      t.cls = cls;
    }
    t.bar.style.width = `${(clamp(f, 0, 1) * 100).toFixed(1)}%`;
    if (t.text !== text) t.val.textContent = t.text = text;
    if (t.subText !== sub) t.sub.textContent = t.subText = sub;
  }

  show(v) {
    this.visible = v;
    this.root.classList.toggle('hidden', !v);
  }

  setWarning(key, text, cls = '') {
    if (text) this.warnings.set(key, { text, cls });
    else this.warnings.delete(key);
  }

  prompt(text) {
    if (text) {
      this.promptEl.textContent = text;
      this.promptEl.classList.remove('hidden');
    } else this.promptEl.classList.add('hidden');
  }

  setHints(html) {
    if (html) {
      this.hintsEl.innerHTML = html;
      this.hintsEl.classList.remove('hidden');
    } else this.hintsEl.classList.add('hidden');
  }

  update(dt, car) {
    if (!this.visible) return;
    const units = this.settings.get('units');
    const sp = Math.abs(car.fwdSpeed) * (units === 'kmh' ? MPS_TO_KMH : MPS_TO_MPH);
    this.speedEl.textContent = Math.round(sp);
    this.unitEl.textContent = units === 'kmh' ? 'KM/H' : 'MPH';
    const mode = car.mode.id;
    if (this.modeEl.dataset.mode !== mode) {
      this.modeEl.dataset.mode = mode;
      this.modeEl.textContent = car.mode.label;
      this.modeEl.className = mode;
    }
    this.hpFill.style.height = `${(car.hp / car.maxHp) * 100}%`;
    const e = car.energy;
    if (e) {
      this.battEl.textContent = `BATT ${Math.round(e.battery)}%`;
      this.tempEl.textContent = `${Math.round(e.temp)}°C`;
      this.tempEl.style.color = e.temp > 85 ? '#ff3b4a' : e.temp > 70 ? '#ffb02e' : '';
      this.copvEl.textContent = `COPV ${Math.round(e.pressurePct)}%`;
      this.setWarning('thermal', e.thermalLimit ? 'THERMAL LIMIT' : null);
      this.setWarning('lowbatt', e.lowPower ? 'LOW BATTERY' : null);
      this.setWarning('emp', e.emp > 0 ? 'EMP — THRUSTERS OFFLINE' : null);
      this.setWarning('ghost', e.ghost ? 'GHOST MODE' : null, 'cool');
    }
    this.setWarning('launch', car.launch.ready ? 'LAUNCH READY' : null, 'info');
    this.setWarning('hp', car.hp < 25 ? 'CHASSIS CRITICAL' : null);
    const key = [...this.warnings.values()].map((w) => w.text + w.cls).join('|');
    if (key !== this.lastWarnKey) {
      this.lastWarnKey = key;
      this.warnEl.innerHTML = [...this.warnings.values()].map((w) => `<div class="warn ${w.cls}">${w.text}</div>`).join('');
    }
    this.drawGauge(car, sp, units);
    if (e) {
      this.tile('batt', e.battery / 100, `${Math.round(e.battery)}%`, `${Math.round(e.temp)}°C${e.thermalLimit ? ' · HOT' : ''}`, 0.4, 0.15);
      this.tile('copv', e.pressurePct / 100, `${Math.round(e.pressurePct)}%`, e.emp > 0 ? 'EMP OFFLINE' : thrustText(car), 0.4, 0.15);
      this.tiles.copv.el.classList.toggle('firing', !!(car.thrust.rocket || car.thrust.hover || car.thrust.air));
    }
    const hpF = car.hp / car.maxHp;
    this.tile('hp', hpF, `${Math.round(hpF * 100)}%`, hpF < 0.25 ? 'CRITICAL' : hpF < 0.5 ? 'DAMAGED' : 'OK', 0.5, 0.25);
    this.drawThrusters(car);
  }

  // Top view of the car: which thrusters fire (rear rockets, 4 hover jets, side RCS for
  // roll / yaw, nose / tail RCS for pitch) and the remaining COPV pressure as a ring.
  drawThrusters(car) {
    const g = this.tg;
    g.clearRect(0, 0, 120, 120);
    const e = car.energy;
    const p = e ? clamp(e.pressurePct / 100, 0, 1) : 0;
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.beginPath();
    g.arc(60, 60, 54, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = p < 0.15 ? '#ff3b4a' : p < 0.4 ? '#ffd23f' : '#bfe9ff';
    g.beginPath();
    g.arc(60, 60, 54, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
    g.stroke();
    // Car outline (nose up).
    g.strokeStyle = 'rgba(238,244,255,0.75)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(60, 22);
    g.lineTo(76, 34);
    g.lineTo(78, 86);
    g.lineTo(72, 96);
    g.lineTo(48, 96);
    g.lineTo(42, 86);
    g.lineTo(44, 34);
    g.closePath();
    g.stroke();
    const t = car.thrust;
    const jet = (x, y, on, r = 4, col = '#40e8ff') => {
      g.fillStyle = on ? col : 'rgba(255,255,255,0.14)';
      g.shadowColor = col;
      g.shadowBlur = on ? 10 : 0;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    };
    const flame = (x, y, dx, dy, on, col = '#40e8ff') => {
      if (!on) return;
      g.strokeStyle = col;
      g.lineWidth = 3;
      g.shadowColor = col;
      g.shadowBlur = 10;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + dx, y + dy);
      g.stroke();
    };
    // Hover jets (corners).
    for (const [x, y] of [[48, 40], [72, 40], [48, 84], [72, 84]]) jet(x, y, t.hover > 0);
    // Rear rockets.
    jet(54, 98, t.rocket > 0, 3.5, '#ffb02e');
    jet(66, 98, t.rocket > 0, 3.5, '#ffb02e');
    flame(54, 101, 0, 12, t.rocket > 0, '#ffb02e');
    flame(66, 101, 0, 12, t.rocket > 0, '#ffb02e');
    // RCS: roll (left / right sides), yaw (front corners), pitch (nose / tail).
    flame(42, 60, -10, 0, t.roll > 0.05 || t.yaw < -0.05);
    flame(78, 60, 10, 0, t.roll < -0.05 || t.yaw > 0.05);
    flame(60, 22, 0, -10, t.pitch < -0.05);
    flame(60, 90, 0, 8, t.pitch > 0.05);
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(238,244,255,0.7)';
    g.font = 'bold 9px monospace';
    g.textAlign = 'center';
    g.fillText('COPV', 60, 64);
  }

  updateHeat(heat) {
    const key = `${heat.level}_${heat.phase === 'pursuit' && heat.seen}`;
    if (key !== this.starKey) {
      this.starKey = key;
      let html = '';
      for (let i = 0; i < 5; i++) html += `<span class="${i < heat.level ? 'on' : ''}">★</span>`;
      this.starsEl.innerHTML = html;
      this.starsEl.classList.toggle('flash', heat.phase === 'pursuit' && heat.seen);
    }
    const ev = heat.phase === 'evade' || heat.phase === 'cooldown';
    this.evadeEl.classList.toggle('show', ev);
    this.evadeEl.classList.toggle('cool', heat.phase === 'cooldown');
    if (ev) {
      const v = heat.phase === 'cooldown' ? heat.cooldown : heat.evade;
      this.evadeFill.style.width = `${(v * 100).toFixed(1)}%`;
      this.evadeLabel.textContent = heat.phase === 'cooldown' ? 'COOLDOWN' : 'EVADE';
    }
    this.setWarning('busted', heat.busted > 0.4 ? `BUSTED ${'■'.repeat(Math.ceil(heat.busted * 3))}${'□'.repeat(Math.max(0, 9 - Math.ceil(heat.busted * 3)))}` : null);
  }

  drawGauge(car, sp, units) {
    const g = this.g;
    const cx = 150;
    const cy = 150;
    g.clearRect(0, 0, 300, 300);
    const a0 = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;
    const maxSp = units === 'kmh' ? 480 : 300;
    // Track.
    g.lineCap = 'butt';
    g.lineWidth = 9;
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.beginPath();
    g.arc(cx, cy, 128, a0, a0 + sweep);
    g.stroke();
    // Speed fill.
    const f = clamp(sp / maxSp, 0, 1);
    const grad = g.createLinearGradient(20, 280, 280, 20);
    grad.addColorStop(0, '#3fe0ff');
    grad.addColorStop(0.7, '#9af4ff');
    grad.addColorStop(1, '#ff3b4a');
    g.strokeStyle = grad;
    g.shadowColor = '#3fe0ff';
    g.shadowBlur = 12;
    g.beginPath();
    g.arc(cx, cy, 128, a0, a0 + sweep * f);
    g.stroke();
    g.shadowBlur = 0;
    // Ticks.
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.font = '10px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const step = units === 'kmh' ? 40 : 25;
    for (let s = 0; s <= maxSp; s += step) {
      const a = a0 + sweep * (s / maxSp);
      const major = s % (step * 2) === 0;
      g.lineWidth = major ? 2 : 1;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 138, cy + Math.sin(a) * 138);
      g.lineTo(cx + Math.cos(a) * (major ? 146 : 142), cy + Math.sin(a) * (major ? 146 : 142));
      g.stroke();
    }
    // Power bar (inner): traction power use, green for regen.
    const e = car.energy;
    const power = clamp(car.controls.throttle * (e ? e.powerScale : 1), 0, 1);
    const regen = car.controls.brake > 0.1 && car.fwdSpeed > 3 ? car.controls.brake : 0;
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    g.beginPath();
    g.arc(cx, cy, 114, a0, a0 + sweep);
    g.stroke();
    if (power > 0.01) {
      g.strokeStyle = car.thrust.rocket ? '#ffb02e' : '#eef4ff';
      g.beginPath();
      g.arc(cx, cy, 114, a0, a0 + sweep * power * (car.thrust.rocket ? 1 : 0.85));
      g.stroke();
    }
    if (regen > 0) {
      g.strokeStyle = '#6cff8f';
      g.beginPath();
      g.arc(cx, cy, 114, a0, a0 + sweep * regen * 0.3);
      g.stroke();
    }
    if (e) {
      // Battery arc (left, slim) colored by charge, with temperature as an outer tick band.
      const bA0 = Math.PI * 0.8;
      const bSweep = Math.PI * 0.55;
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(255,255,255,0.07)';
      g.beginPath();
      g.arc(cx, cy, 98, bA0, bA0 + bSweep);
      g.stroke();
      const b = e.battery / 100;
      g.strokeStyle = b > 0.3 ? '#6cff8f' : b > 0.12 ? '#ffb02e' : '#ff3b4a';
      g.beginPath();
      g.arc(cx, cy, 98, bA0 + bSweep * (1 - b), bA0 + bSweep);
      g.stroke();
      const tN = clamp((e.temp - 30) / 80, 0, 1);
      g.lineWidth = 2;
      g.strokeStyle = e.temp > 90 ? '#ff3b4a' : e.temp > 70 ? '#ffb02e' : 'rgba(150,200,255,0.6)';
      g.beginPath();
      g.arc(cx, cy, 91, bA0 + bSweep * (1 - tN), bA0 + bSweep);
      g.stroke();
      // COPV arc (right).
      const cA0 = Math.PI * 1.65;
      const cSweep = Math.PI * 0.55;
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(255,255,255,0.07)';
      g.beginPath();
      g.arc(cx, cy, 98, cA0, cA0 + cSweep);
      g.stroke();
      const p = clamp(e.pressurePct / 100, 0, 1);
      g.strokeStyle = e.emp > 0 ? '#ff3b4a' : '#bfe9ff';
      g.beginPath();
      g.arc(cx, cy, 98, cA0, cA0 + cSweep * p);
      g.stroke();
    }
  }
}
