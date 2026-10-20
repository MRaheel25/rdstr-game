// In-game HUD: speedometer arc gauge with power/battery/COPV arcs, handling mode, chassis HP,
// heat stars + evade meter, minimap, style score, popups, radio subtitles, warnings, prompts.
import { clamp, MPS_TO_MPH, MPS_TO_KMH } from '../util/math.js';

const $ = (sel) => document.querySelector(sel);

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
