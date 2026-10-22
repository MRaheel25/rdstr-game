// Synthesized one-shot sound effects: impacts (low crunch + metal clank), glass shatter,
// explosions, landings, splashes, spike pops, EMP zaps, near-miss whooshes, horns, prop hits,
// Cold Snap shimmer, frost shockwave, launch kick, radio squelch and UI clicks.
import { clamp } from '../util/math.js';

export class SFX {
  constructor(engine) {
    this.e = engine;
    this.last = new Map(); // rate limiting per kind
  }

  // Avoid machine-gunning identical sounds within `gap` seconds.
  gate(kind, gap) {
    const t = this.e.now;
    if (t - (this.last.get(kind) ?? -1) < gap) return false;
    this.last.set(kind, t);
    return true;
  }

  noiseBurst(out, { kind = 'white', type = 'bandpass', f0 = 1000, f1 = null, q = 1, peak = 0.5, attack = 0.002, decay = 0.3, at = 0, rate = 1 }) {
    const e = this.e;
    const t = e.now + at;
    const s = e.ctx.createBufferSource();
    s.buffer = e.noise[kind];
    s.playbackRate.value = rate;
    const f = e.filter(type, f0, q);
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + attack + decay);
    const g = e.gain(0);
    s.connect(f);
    f.connect(g);
    g.connect(out);
    e.env(g.gain, t, peak, attack, decay);
    const off = Math.random() * (s.buffer.duration - attack - decay - 0.1);
    s.start(t, Math.max(0, off));
    s.stop(t + attack + decay + 0.05);
  }

  tone(out, { type = 'sine', f0 = 440, f1 = null, peak = 0.3, attack = 0.002, decay = 0.3, at = 0, glide = null }) {
    const e = this.e;
    const t = e.now + at;
    const o = e.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + (glide ?? attack + decay));
    const g = e.gain(0);
    o.connect(g);
    g.connect(out);
    e.env(g.gain, t, peak, attack, decay);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  impact(strength, pos, { metal = true } = {}) {
    const e = this.e;
    if (!e.ok || strength < 2 || !this.gate('impact', 0.07)) return;
    const k = clamp(strength / 30, 0.05, 1.2);
    const o = e.oneShotOut(pos, { ref: 12, reverb: k * 0.5 });
    // Low-end crunch.
    this.tone(o.input, { f0: 120 + k * 40, f1: 38, peak: 0.55 * k, decay: 0.25 + k * 0.35 });
    this.noiseBurst(o.input, { kind: 'brown', type: 'lowpass', f0: 900 + k * 1500, f1: 120, q: 0.8, peak: 0.9 * k, decay: 0.2 + k * 0.4 });
    this.noiseBurst(o.input, { kind: 'white', type: 'bandpass', f0: 2200, f1: 700, q: 0.8, peak: 0.35 * k, decay: 0.12 + k * 0.12 });
    if (metal) {
      // Inharmonic clank partials.
      for (const r of [1, 2.76, 5.4]) {
        this.tone(o.input, { type: 'triangle', f0: (180 + Math.random() * 120) * r, peak: 0.07 * k, decay: 0.25 + Math.random() * 0.4 });
      }
    }
    if (strength > 18) this.glass(pos, clamp(strength / 40, 0.3, 1));
    o.dispose(1.5);
  }

  glass(pos, amount = 0.6) {
    const e = this.e;
    if (!e.ok || !this.gate('glass', 0.12)) return;
    const o = e.oneShotOut(pos, { ref: 10, reverb: 0.3 });
    this.noiseBurst(o.input, { type: 'highpass', f0: 3500, q: 0.7, peak: 0.35 * amount, decay: 0.35 });
    const n = Math.round(8 + amount * 14);
    for (let i = 0; i < n; i++) {
      this.tone(o.input, { f0: 2400 + Math.random() * 5200, peak: 0.05 * amount, decay: 0.05 + Math.random() * 0.25, at: Math.random() * 0.25 * amount });
    }
    o.dispose(1);
  }

  explosion(pos, size = 1) {
    const e = this.e;
    if (!e.ok || !this.gate('explosion', 0.15)) return;
    const o = e.oneShotOut(pos, { ref: 30, reverb: 0.9 });
    this.tone(o.input, { f0: 70, f1: 24, peak: 0.9 * size, attack: 0.005, decay: 1.4 });
    this.noiseBurst(o.input, { kind: 'brown', type: 'lowpass', f0: 2000, f1: 60, q: 0.7, peak: 1.2 * size, attack: 0.004, decay: 2.2 });
    this.noiseBurst(o.input, { kind: 'white', type: 'bandpass', f0: 1800, f1: 300, q: 0.6, peak: 0.4 * size, decay: 0.6 });
    // Debris rattle tail.
    for (let i = 0; i < 6; i++) this.noiseBurst(o.input, { type: 'bandpass', f0: 1500 + Math.random() * 2500, q: 4, peak: 0.12, decay: 0.08, at: 0.2 + Math.random() * 0.9 });
    o.dispose(3);
  }

  // Storm: a crack followed by a long rolling rumble.
  thunder(strength = 1) {
    const e = this.e;
    if (!e.ok || !this.gate('thunder', 1)) return;
    const o = e.oneShotOut(null, { reverb: 1 });
    const at = 0.25 + Math.random() * 1.2;
    this.noiseBurst(o.input, { kind: 'white', type: 'highpass', f0: 1200, q: 0.5, peak: 0.25 * strength, attack: 0.003, decay: 0.25, at });
    this.noiseBurst(o.input, { kind: 'brown', type: 'lowpass', f0: 420, f1: 60, q: 0.6, peak: 1.0 * strength, attack: 0.08, decay: 2.6, at: at + 0.05 });
    this.noiseBurst(o.input, { kind: 'brown', type: 'lowpass', f0: 200, q: 0.5, peak: 0.6 * strength, attack: 0.4, decay: 2.2, at: at + 0.9 });
    o.dispose(at + 5);
  }

  land(heaviness, pos) {
    const e = this.e;
    if (!e.ok || !this.gate('land', 0.1)) return;
    const k = clamp(heaviness, 0.1, 1.2);
    const o = e.oneShotOut(pos, { ref: 10, reverb: 0.2 * k });
    this.tone(o.input, { f0: 90, f1: 32, peak: 0.6 * k, decay: 0.35 + 0.3 * k });
    this.noiseBurst(o.input, { kind: 'brown', type: 'lowpass', f0: 700, f1: 90, peak: 0.7 * k, decay: 0.3 + 0.2 * k });
    // Suspension clunk.
    this.tone(o.input, { type: 'triangle', f0: 240, f1: 120, peak: 0.12 * k, decay: 0.12, at: 0.03 });
    o.dispose(1.2);
  }

  splash(pos, size = 1) {
    const e = this.e;
    if (!e.ok || !this.gate('splash', 0.3)) return;
    const o = e.oneShotOut(pos, { ref: 14, reverb: 0.4 });
    this.noiseBurst(o.input, { type: 'bandpass', f0: 600, f1: 2400, q: 0.8, peak: 0.7 * size, attack: 0.02, decay: 0.6 });
    this.noiseBurst(o.input, { kind: 'brown', type: 'lowpass', f0: 400, f1: 100, peak: 0.8 * size, decay: 0.9 });
    for (let i = 0; i < 10; i++) this.tone(o.input, { f0: 500 + Math.random() * 900, f1: 1400 + Math.random() * 1500, peak: 0.04, attack: 0.005, decay: 0.07, at: 0.15 + Math.random() * 0.8 });
    o.dispose(2);
  }

  spikePop(pos) {
    const e = this.e;
    if (!e.ok) return;
    const o = e.oneShotOut(pos, { ref: 8 });
    this.noiseBurst(o.input, { type: 'highpass', f0: 1500, q: 0.6, peak: 0.6, attack: 0.001, decay: 0.08 });
    this.noiseBurst(o.input, { type: 'bandpass', f0: 4000, f1: 1500, q: 1, peak: 0.2, attack: 0.02, decay: 0.9 });
    o.dispose(1.2);
  }

  emp() {
    const e = this.e;
    if (!e.ok || !this.gate('emp', 0.5)) return;
    const o = e.oneShotOut(null, { reverb: 0.5 });
    this.tone(o.input, { type: 'sawtooth', f0: 2200, f1: 50, peak: 0.25, attack: 0.005, decay: 0.9 });
    this.tone(o.input, { type: 'square', f0: 90, f1: 40, peak: 0.12, decay: 0.8 });
    for (let i = 0; i < 12; i++) this.noiseBurst(o.input, { type: 'highpass', f0: 3000, peak: 0.12, attack: 0.001, decay: 0.03, at: Math.random() * 0.8 });
    o.dispose(1.5);
  }

  whoosh(pan = 0, strength = 1) {
    const e = this.e;
    if (!e.ok || !this.gate('whoosh', 0.25)) return;
    const p = e.ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    p.connect(e.world);
    this.noiseBurst(p, { kind: 'pink', type: 'bandpass', f0: 400, f1: 2400, q: 1.2, peak: 0.35 * strength, attack: 0.12, decay: 0.35 });
    setTimeout(() => p.disconnect(), 1000);
  }

  horn(pos) {
    const e = this.e;
    if (!e.ok || !this.gate('horn', 0.6)) return;
    const o = e.oneShotOut(pos, { ref: 8 });
    const f = e.filter('lowpass', 1800, 1);
    f.connect(o.input);
    const len = 0.25 + Math.random() * 0.4;
    for (const fr of [392, 494]) this.tone(f, { type: 'square', f0: fr, peak: 0.12, attack: 0.01, decay: len, glide: len });
    setTimeout(() => f.disconnect(), (len + 0.5) * 1000);
    o.dispose(len + 0.3);
  }

  prop(type, pos, speed = 10) {
    const e = this.e;
    if (!e.ok || !this.gate('prop', 0.05)) return;
    const k = clamp(speed / 30, 0.3, 1);
    const o = e.oneShotOut(pos, { ref: 8, reverb: 0.2 });
    const metal = ['lamp', 'highwayLamp', 'signal', 'newsBox', 'busStop', 'airStation', 'fence', 'barrier', 'parkedCar', 'hydrant', 'bin', 'vent'].includes(type);
    const wood = ['bench', 'stall', 'palm', 'tree', 'pine'].includes(type);
    if (metal) {
      this.tone(o.input, { type: 'triangle', f0: 330 + Math.random() * 200, peak: 0.16 * k, decay: 0.6 });
      this.tone(o.input, { type: 'triangle', f0: 910 + Math.random() * 300, peak: 0.08 * k, decay: 0.4 });
      this.noiseBurst(o.input, { type: 'bandpass', f0: 2500, q: 1, peak: 0.3 * k, decay: 0.12 });
    } else if (wood) {
      this.noiseBurst(o.input, { type: 'bandpass', f0: 500, q: 1.5, peak: 0.5 * k, decay: 0.18 });
      this.noiseBurst(o.input, { type: 'bandpass', f0: 1800, q: 2, peak: 0.25 * k, decay: 0.1, at: 0.04 });
    } else {
      // Plastic (cones, barriers).
      this.tone(o.input, { f0: 220, f1: 120, peak: 0.25 * k, decay: 0.12 });
      this.noiseBurst(o.input, { type: 'bandpass', f0: 1200, q: 2, peak: 0.25 * k, decay: 0.08 });
    }
    if (type === 'hydrant') this.noiseBurst(o.input, { type: 'highpass', f0: 2500, peak: 0.25, attack: 0.05, decay: 2.5 });
    if (type === 'lamp' || type === 'highwayLamp') this.glass(pos, 0.4);
    o.dispose(3);
  }

  coldSnap() {
    const e = this.e;
    if (!e.ok) return;
    const o = e.oneShotOut(null, { bus: e.ui, reverb: 0.8 });
    this.noiseBurst(o.input, { kind: 'pink', type: 'bandpass', f0: 6000, f1: 800, q: 0.8, peak: 0.4, attack: 0.25, decay: 0.6 });
    const notes = [1318, 1760, 1975, 2637, 3520];
    notes.forEach((f, i) => this.tone(o.input, { f0: f, peak: 0.06, attack: 0.01, decay: 1.4, at: i * 0.06 }));
    this.tone(o.input, { f0: 60, f1: 30, peak: 0.3, attack: 0.1, decay: 1.2 });
    o.dispose(2.5);
  }

  frostShockwave(pos) {
    const e = this.e;
    if (!e.ok) return;
    const o = e.oneShotOut(pos, { ref: 25, reverb: 0.9 });
    this.tone(o.input, { f0: 55, f1: 22, peak: 0.9, attack: 0.005, decay: 1.2 });
    this.noiseBurst(o.input, { kind: 'brown', type: 'lowpass', f0: 1500, f1: 80, peak: 0.9, decay: 1.2 });
    this.noiseBurst(o.input, { type: 'highpass', f0: 5000, peak: 0.3, attack: 0.02, decay: 1.4 });
    for (let i = 0; i < 14; i++) this.tone(o.input, { f0: 3000 + Math.random() * 4000, peak: 0.03, decay: 0.3, at: Math.random() * 0.8 });
    o.dispose(2.5);
  }

  launch() {
    const e = this.e;
    if (!e.ok) return;
    const o = e.oneShotOut(null, {});
    this.tone(o.input, { f0: 70, f1: 35, peak: 0.5, decay: 0.5 });
    this.noiseBurst(o.input, { type: 'bandpass', f0: 3000, f1: 600, q: 0.7, peak: 0.25, attack: 0.01, decay: 0.6 });
    o.dispose(1);
  }

  airStation(pos) {
    const e = this.e;
    if (!e.ok || !this.gate('air', 1)) return;
    const o = e.oneShotOut(pos, { ref: 8 });
    this.noiseBurst(o.input, { type: 'highpass', f0: 2500, q: 0.7, peak: 0.4, attack: 0.05, decay: 1.2 });
    this.tone(o.input, { f0: 880, peak: 0.08, decay: 0.15, at: 1.1 });
    this.tone(o.input, { f0: 1320, peak: 0.08, decay: 0.3, at: 1.25 });
    o.dispose(2);
  }

  radioSquelch() {
    const e = this.e;
    if (!e.ok || !this.gate('radio', 0.4)) return;
    const o = e.oneShotOut(null, { bus: e.ui });
    this.noiseBurst(o.input, { type: 'bandpass', f0: 2200, q: 2, peak: 0.12, attack: 0.002, decay: 0.12 });
    this.tone(o.input, { type: 'square', f0: 1400, peak: 0.03, decay: 0.05, at: 0.12 });
    o.dispose(0.5);
  }

  alert(level = 1) {
    const e = this.e;
    if (!e.ok || !this.gate('alert', 0.5)) return;
    const o = e.oneShotOut(null, { bus: e.ui });
    for (let i = 0; i < 2; i++) this.tone(o.input, { type: 'square', f0: 660 + level * 40, peak: 0.05, decay: 0.12, at: i * 0.16 });
    o.dispose(0.6);
  }

  ui(kind = 'click') {
    const e = this.e;
    if (!e.ok || !this.gate('ui' + kind, 0.03)) return;
    const o = e.oneShotOut(null, { bus: e.ui });
    if (kind === 'hover') this.tone(o.input, { f0: 1800, peak: 0.025, decay: 0.04 });
    else if (kind === 'back') this.tone(o.input, { type: 'triangle', f0: 600, f1: 300, peak: 0.08, decay: 0.12 });
    else if (kind === 'buy') {
      this.tone(o.input, { type: 'triangle', f0: 880, peak: 0.08, decay: 0.12 });
      this.tone(o.input, { type: 'triangle', f0: 1320, peak: 0.08, decay: 0.25, at: 0.09 });
    } else this.tone(o.input, { type: 'triangle', f0: 1200, f1: 900, peak: 0.07, decay: 0.08 });
    o.dispose(0.5);
  }

  // Style popup blip (big moves get a brighter two-note chime).
  pop(big) {
    const e = this.e;
    if (!e.ok || !this.gate('pop', 0.05)) return;
    const o = e.oneShotOut(null, { bus: e.ui, reverb: big ? 0.3 : 0 });
    this.tone(o.input, { type: 'triangle', f0: big ? 988 : 1320, peak: big ? 0.09 : 0.05, decay: 0.12 });
    if (big) this.tone(o.input, { type: 'triangle', f0: 1480, peak: 0.08, decay: 0.3, at: 0.07 });
    o.dispose(0.6);
  }

  // Short musical stingers (bypass the world muffle).
  stinger(kind) {
    const e = this.e;
    if (!e.ok) return;
    const o = e.oneShotOut(null, { bus: e.music, reverb: 0.6 });
    const chords = {
      evaded: [[220, 277, 330], [247, 311, 370], [294, 370, 440, 587]],
      busted: [[110, 131, 165], [104, 123, 156], [82, 98, 123]],
      takedown: [[330, 415, 494]],
      checkpoint: [[660, 990]],
      win: [[262, 330, 392], [294, 370, 440], [330, 415, 494, 659]],
    }[kind] || [[440]];
    chords.forEach((ch, i) => ch.forEach((f) => this.tone(o.input, { type: 'sawtooth', f0: f, peak: 0.05, attack: 0.02, decay: 0.7, at: i * 0.22 })));
    o.dispose(chords.length * 0.22 + 1);
  }
}
