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
    // V3 dash: segmented thruster (nitro) bar, battery bar, per-zone damage silhouette.
    this.nitroEl = $('#dash .nitro');
    const bar = this.nitroEl.querySelector('.nitro-bar');
    this.segs = [];
    for (let i = 0; i < 20; i++) {
      const seg = document.createElement('i');
      bar.appendChild(seg);
      this.segs.push(seg);
    }
    this.nitroVal = this.nitroEl.querySelector('b');
    this.battW = $('#dash .batt-w');
    this.battBar = this.battW.querySelector('.bw-bar i');
    this.battVal = this.battW.querySelector('b');
    this.carW = $('#dash .car-w');
    this.carBar = this.carW.querySelector('.cw-bar i');
    this.carVal = this.carW.querySelector('b');
    this.zones = Object.fromEntries(['front', 'rear', 'left', 'right'].map((z) => [z, this.carW.querySelector(`.z-${z}`)]));
    this.cache = {};
    this.tv = $('#thrust-view');
    this.tg = this.tv.getContext('2d');
    this.tv.width = 88 * dpr;
    this.tv.height = 88 * dpr;
    this.tvScale = 88 / 120;
    this.tg.scale(dpr * this.tvScale, dpr * this.tvScale);
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

  // Set text / class only when it changes (no layout churn every frame).
  put(el, key, v, prop = 'textContent') {
    if (this.cache[key] === v) return;
    this.cache[key] = v;
    if (prop === 'class') el.setAttribute('class', v);
    else if (prop === 'width') el.style.width = v;
    else el[prop] = v;
  }

  level(f, mid, low) {
    return f <= low ? 'low' : f <= mid ? 'mid' : 'ok';
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
      // Thruster (COPV) bar: 20 segments, glows while firing, drains / refills live.
      const p = clamp(e.pressurePct / 100, 0, 1);
      const lit = Math.round(p * 20);
      const firing = !!(car.thrust.rocket || car.thrust.hover || car.thrust.air);
      if (this.cache.lit !== lit) {
        this.cache.lit = lit;
        this.segs.forEach((sg, i) => sg.classList.toggle('on', i < lit));
      }
      this.put(this.nitroEl, 'nitroCls', `nitro ${firing ? 'firing' : ''} ${e.emp > 0 ? 'emp' : ''} ${this.level(p, 0.35, 0.15)}`, 'class');
      this.put(this.nitroVal, 'nitroVal', e.emp > 0 ? 'EMP' : `${Math.round(p * 100)}%`);
      const b = clamp(e.battery / 100, 0, 1);
      const charging = this.charging;
      this.put(this.battW, 'battCls', `batt-w ${this.level(b, 0.45, 0.2)} ${charging ? 'charging' : ''}`, 'class');
      this.put(this.battBar, 'battW', `${(b * 100).toFixed(1)}%`, 'width');
      this.put(this.battVal, 'battVal', `${Math.round(e.battery)}%`);
    }
    const hpF = clamp(car.hp / car.maxHp, 0, 1);
    this.put(this.carW, 'carCls', `car-w ${this.level(hpF, 0.5, 0.25)}`, 'class');
    this.put(this.carBar, 'carW', `${(hpF * 100).toFixed(1)}%`, 'width');
    this.put(this.carVal, 'carVal', `${Math.round(hpF * 100)}%`);
    const zd = car.zoneDamage || {};
    for (const z in this.zones) {
      const d = zd[z] || 0;
      const k = d > 0.66 ? 'z bad' : d > 0.33 ? 'z hurt' : d > 0.05 ? 'z worn' : 'z';
      this.put(this.zones[z], `z_${z}`, `${k} z-${z}`, 'class');
    }
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

  // V3 speedometer: one thick smooth arc (240°), fine ticks, power sweep inside.
  drawGauge(car, sp, units) {
    const g = this.g;
    const cx = 150;
    const cy = 150;
    g.clearRect(0, 0, 300, 300);
    const a0 = Math.PI * (5 / 6);
    const sweep = Math.PI * (4 / 3);
    const maxSp = units === 'kmh' ? 400 : 250;
    const f = clamp(sp / maxSp, 0, 1);
    this.needle = this.needle == null ? f : this.needle + (f - this.needle) * 0.35;
    const n = this.needle;
    g.lineCap = 'round';
    g.lineWidth = 14;
    g.strokeStyle = 'rgba(255,255,255,0.1)';
    g.beginPath();
    g.arc(cx, cy, 124, a0, a0 + sweep);
    g.stroke();
    const grad = g.createConicGradient ? g.createConicGradient(a0, cx, cy) : null;
    if (grad) {
      grad.addColorStop(0, '#2b8cff');
      grad.addColorStop(0.45, '#33e0ff');
      grad.addColorStop(0.62, '#ffffff');
      grad.addColorStop(0.67, '#ff4a5a');
      grad.addColorStop(1, '#ff4a5a');
    }
    g.strokeStyle = grad || '#33e0ff';
    g.shadowColor = 'rgba(51,224,255,0.7)';
    g.shadowBlur = 16;
    if (n > 0.002) {
      g.beginPath();
      g.arc(cx, cy, 124, a0, a0 + sweep * n);
      g.stroke();
    }
    g.shadowBlur = 0;
    // Ticks + numbers.
    const step = units === 'kmh' ? 20 : 10;
    g.fillStyle = 'rgba(238,244,255,0.6)';
    g.font = '600 13px Rajdhani, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let v = 0; v <= maxSp; v += step) {
      const a = a0 + sweep * (v / maxSp);
      const major = v % (step * 5) === 0;
      g.strokeStyle = major ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.28)';
      g.lineWidth = major ? 2.5 : 1.2;
      g.lineCap = 'butt';
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 102, cy + Math.sin(a) * 102);
      g.lineTo(cx + Math.cos(a) * (major ? 92 : 97), cy + Math.sin(a) * (major ? 92 : 97));
      g.stroke();
      if (major) g.fillText(String(v), cx + Math.cos(a) * 80, cy + Math.sin(a) * 80);
    }
    // Power / regen sweep (inner, slim).
    const e = car.energy;
    const power = clamp(car.controls.throttle * (e ? e.powerScale : 1), 0, 1);
    const regen = car.controls.brake > 0.1 && car.fwdSpeed > 3 ? car.controls.brake : 0;
    this.pw = (this.pw || 0) + ((car.thrust.rocket ? 1 : power * 0.85) - (this.pw || 0)) * 0.2;
    g.lineCap = 'round';
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    g.beginPath();
    g.arc(cx, cy, 110, a0, a0 + sweep);
    g.stroke();
    if (this.pw > 0.01) {
      g.strokeStyle = car.thrust.rocket ? '#ffb02e' : 'rgba(238,244,255,0.85)';
      g.beginPath();
      g.arc(cx, cy, 110, a0, a0 + sweep * this.pw);
      g.stroke();
    }
    if (regen > 0) {
      g.strokeStyle = '#6cff8f';
      g.beginPath();
      g.arc(cx, cy, 110, a0, a0 + sweep * regen * 0.3);
      g.stroke();
    }
  }
}
