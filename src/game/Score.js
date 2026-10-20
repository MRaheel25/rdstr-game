// Style score: base values per move, a chain that grows a multiplier (x1..x10) when moves
// follow each other within 3 s, banking after 3 s of clean driving, losing the unbanked chain
// on a crash. Popups spawn at the move's 3D position, punch in, then fly into the counter.
import * as THREE from 'three';
import { clamp } from '../util/math.js';

export const STYLE = {
  drift: 10, // per second
  airTime: 25, // per second
  nearMiss: 50,
  perfectLanding: 150,
  flip: 200,
  barrelRoll: 200,
  spin: 150,
  coldSnapLanding: 300,
  takedown: 500,
  roadblockSmash: 250,
  stuntJump: 250,
};
const CHAIN_WINDOW = 3;
const MAX_MULT = 10;
const _p = new THREE.Vector3();

export class StyleScore {
  constructor(game) {
    this.game = game;
    this.total = 0; // banked, this session
    this.chain = { points: 0, moves: 0, last: -10, active: false, best: 0 };
    this.bestCombo = 0;
    this.drift = { active: false, points: 0, popup: null };
    this.air = 0;
    this.popups = [];
    this.layer = document.getElementById('popups');
    this.box = document.getElementById('style-score');
    this.totalEl = this.box.querySelector('.score-total');
    this.ptsEl = this.box.querySelector('.chain-pts');
    this.multEl = this.box.querySelector('.chain-mult');
    this.shown = -1;
    this.enabled = true;
    this.onBank = null; // (points) => void
    this.bind();
  }

  get mult() {
    return Math.min(MAX_MULT, 1 + Math.floor(this.chain.moves / 2));
  }

  bind() {
    const g = this.game;
    const ev = g.events;
    ev.on('nearMiss', (e) => this.add('NEAR MISS', STYLE.nearMiss, e.car.pos));
    ev.on('stuntLanding', (e) => {
      if (!e.clean) return;
      const p = g.player.position;
      if (e.airTime > 1) this.add(`AIR ${e.airTime.toFixed(1)}s`, Math.round(e.airTime * STYLE.airTime), p, { quiet: true });
      if (e.flips) this.add(e.flips > 1 ? `${e.flips}x FLIP` : 'FLIP', STYLE.flip * e.flips, p);
      if (e.rolls) this.add(e.rolls > 1 ? `${e.rolls}x BARREL ROLL` : 'BARREL ROLL', STYLE.barrelRoll * e.rolls, p);
      if (e.spins) this.add(e.spins > 1 ? `${e.spins * 360}° SPIN` : '360 SPIN', STYLE.spin * e.spins, p);
      if (e.perfect) this.add('PERFECT LANDING', STYLE.perfectLanding, p);
      if (e.coldSnap) this.add('COLD SNAP LANDING', STYLE.coldSnapLanding, p);
    });
    ev.on('takedown', (e) => this.add(e.type === 'swat' ? 'SWAT TAKEDOWN' : 'TAKEDOWN', STYLE.takedown * (e.type === 'swat' ? 1.5 : 1), e.unit.v.position));
    ev.on('roadblockSmash', (e) => this.add('ROADBLOCK SMASH', STYLE.roadblockSmash, e.position));
    ev.on('jumpLanded', (e) => this.add(e.jump.name.toUpperCase(), STYLE.stuntJump, g.player.position));
    ev.on('impact', (e) => {
      // A real crash (not a police ram or a scrape) loses the unbanked chain.
      const other = e.info.other;
      const byPolice = other && other.kind === 'vehicle' && other.ref && other.ref.kind === 'police';
      if (e.info.strength > 16 && !byPolice) this.lose('CRASHED');
    });
    ev.on('gameOver', () => this.lose(null));
  }

  reset() {
    this.chain.points = 0;
    this.chain.moves = 0;
    this.chain.active = false;
    this.drift.active = false;
    this.clearPopups();
    this.render(true);
  }

  clearPopups() {
    for (const p of this.popups) p.el.remove();
    this.popups.length = 0;
  }

  add(label, points, pos = null, { quiet = false } = {}) {
    if (!this.enabled || points <= 0) return;
    const g = this.game;
    const c = this.chain;
    const t = g.time;
    if (!c.active || t - c.last > CHAIN_WINDOW) {
      c.points = 0;
      c.moves = 0;
    }
    c.active = true;
    c.moves++;
    c.points += points;
    c.last = t;
    if (pos) this.popup(`${label} +${Math.round(points)}`, pos, points >= 300 ? 'big' : points >= 150 ? 'mid' : '');
    if (points >= 300) {
      g.gfx.setFlash(0.12, 0xbfefff);
      if (g.audio && g.audio.ok) g.audio.sfx.pop(true);
    } else if (!quiet && g.audio && g.audio.ok) g.audio.sfx.pop(false);
  }

  lose(reason) {
    const c = this.chain;
    if (c.active && c.points > 0 && reason) this.popup(`${reason} — CHAIN LOST`, this.game.player.position, 'lost');
    c.active = false;
    c.points = 0;
    c.moves = 0;
    this.drift.active = false;
  }

  bank() {
    const c = this.chain;
    const pts = Math.round(c.points * this.mult);
    c.active = false;
    if (pts <= 0) return;
    this.total += pts;
    this.bestCombo = Math.max(this.bestCombo, pts);
    c.points = 0;
    c.moves = 0;
    const el = document.createElement('div');
    el.className = 'bank';
    el.textContent = `+${pts.toLocaleString()}`;
    this.box.appendChild(el);
    setTimeout(() => el.remove(), 1200);
    if (this.onBank) this.onBank(pts);
  }

  popup(text, pos, cls) {
    const el = document.createElement('div');
    el.className = `pop ${cls}`;
    el.textContent = text;
    this.layer.appendChild(el);
    // Stack popups that appear together so they don't overlap.
    const stack = this.popups.filter((q) => q.age < 0.5).length;
    this.popups.push({ el, pos: pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z), age: 0, life: cls === 'big' ? 1.5 : 1.1, x: 0, y: 0, dy: -stack * 36 });
    if (this.popups.length > 10) this.popups.shift().el.remove();
  }

  // Fixed-step scoring: drifting (10/s) and banking after 3 s without a new move.
  step(dt) {
    const g = this.game;
    const p = g.player;
    const c = this.chain;
    if (!this.enabled || g.state !== 'playing') return;
    if (p.drifting && !p.wrecked && p.speed > 11) {
      if (!this.drift.active) {
        this.drift.active = true;
        this.drift.points = 0;
        this.add('DRIFT', 0.001, null, { quiet: true });
      }
      const pts = STYLE.drift * dt;
      this.drift.points += pts;
      c.points += pts;
      c.last = g.time;
    } else if (this.drift.active) {
      this.drift.active = false;
      if (this.drift.points >= 5) this.popup(`DRIFT +${Math.round(this.drift.points)}`, p.position, this.drift.points >= 150 ? 'mid' : '');
    }
    // Air time keeps the chain alive (it is scored on landing).
    if (p.groundedCount === 0 && p.airTime > 0.3) c.last = Math.max(c.last, g.time - 0.01);
    if (c.active && g.time - c.last > CHAIN_WINDOW) this.bank();
  }

  update(realDt) {
    const g = this.game;
    // Popups.
    const cam = g.camera;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const target = this.box.getBoundingClientRect();
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const q = this.popups[i];
      q.age += realDt;
      const k = q.age / q.life;
      if (k >= 1) {
        q.el.remove();
        this.popups.splice(i, 1);
        continue;
      }
      if (k < 0.65) {
        _p.copy(q.pos);
        _p.y += 1.6 + q.age * 2.2;
        _p.project(cam);
        const behind = _p.z > 1;
        q.x = clamp((_p.x * 0.5 + 0.5) * W, 40, W - 40);
        q.y = clamp((-_p.y * 0.5 + 0.5) * H, 60, H - 60) + q.dy;
        if (behind) q.y = H * 0.4 + q.dy;
        const s = k < 0.12 ? 0.4 + (k / 0.12) * 0.9 : 1.3 - Math.min(0.3, (k - 0.12) * 2);
        q.el.style.transform = `translate(${q.x}px, ${q.y}px) translate(-50%, -50%) scale(${s.toFixed(3)})`;
        q.el.style.opacity = '1';
      } else {
        // Fly into the score counter.
        const f = (k - 0.65) / 0.35;
        const e = f * f;
        const tx = target.left + target.width / 2;
        const ty = target.top + target.height / 2;
        const x = q.x + (tx - q.x) * e;
        const y = q.y + (ty - q.y) * e;
        q.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${(1 - f * 0.6).toFixed(3)})`;
        q.el.style.opacity = String(1 - f * 0.7);
      }
    }
    this.render(false);
  }

  render(force) {
    const c = this.chain;
    const show = this.enabled && (this.total > 0 || c.active);
    this.box.classList.toggle('hidden', !show);
    if (!show) return;
    const key = `${this.total}|${c.active ? Math.round(c.points) : -1}|${this.mult}`;
    if (key === this.shown && !force) return;
    this.shown = key;
    this.totalEl.textContent = this.total.toLocaleString();
    if (c.active && c.points >= 1) {
      this.ptsEl.textContent = `+${Math.round(c.points).toLocaleString()}`;
      this.multEl.textContent = `x${this.mult}`;
      this.multEl.style.fontSize = `${15 + this.mult}px`;
    } else {
      this.ptsEl.textContent = '';
      this.multEl.textContent = '';
    }
  }
}
