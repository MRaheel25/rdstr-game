// Adaptive dark synthwave generated in code. A look-ahead sequencer schedules a pad, arpeggio,
// bass, drums and lead on Web Audio time. Layers fade in with intensity (driven by Heat):
//   0 pad + soft arp, 1 + bass, 2 + kick/snare, 3 + hats & open filter, 4 + lead, 5 double-time.
// Ghost Mode and Cold Snap drop everything to a muffled pad.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Chords as MIDI notes (A minor): i - VI - III - VII, alternating with iv - i - VI - V.
const PROGS = [
  [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
  [[50, 53, 57], [57, 60, 64], [53, 57, 60], [52, 56, 59]],
];
// Lead motifs: [step, semitone offset from chord root + 12, length in steps].
const MOTIFS = [
  [[0, 12, 3], [3, 15, 3], [6, 19, 2], [8, 17, 4], [12, 15, 2], [14, 12, 2]],
  [[0, 19, 4], [4, 17, 2], [6, 15, 2], [8, 12, 6], [14, 10, 2]],
  [[2, 12, 2], [4, 15, 2], [6, 17, 2], [8, 19, 3], [11, 22, 3], [14, 19, 2]],
];

// V3 music styles: tempo, chords and drum patterns per style (Settings > Sound).
const CHILL_PROGS = [
  [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]],
  [[50, 53, 57, 60], [55, 59, 62, 65], [52, 55, 59, 62], [57, 60, 64, 67]],
];
export const MUSIC_STYLES = {
  synthwave: {
    label: 'Synthwave', bpm: 96, progs: PROGS,
    kick: (s16, i) => (i >= 3 ? s16 % 4 === 0 : s16 % 8 === 0 || s16 === 10),
    snare: (s16) => s16 === 4 || s16 === 12,
    hat: (step, s16, hot) => hot || step % 2 === 0,
    arpDiv: (i, hot) => (hot || i >= 2 ? 1 : 2),
    levels: null,
  },
  chill: {
    label: 'Chill', bpm: 80, progs: CHILL_PROGS,
    kick: (s16) => s16 === 0 || s16 === 10,
    snare: (s16) => s16 === 8,
    hat: (step) => step % 4 === 2,
    arpDiv: () => 2,
    levels: (i) => ({ pad: 0.6, arp: 0.26, bass: 0.4, kick: 0.45, snare: 0.22, hats: 0.16, lead: 0 }),
    cutoff: (i) => 1800 + i * 500,
  },
  dnb: {
    label: 'Drum & Bass', bpm: 172, progs: PROGS,
    kick: (s16) => s16 === 0 || s16 === 10,
    snare: (s16) => s16 === 4 || s16 === 12,
    hat: (step) => step % 2 === 0,
    arpDiv: (i) => (i >= 3 ? 2 : 4),
    levels: (i) => ({ pad: 0.45, arp: i >= 1 ? 0.25 : 0.12, bass: 0.55, kick: 0.75, snare: 0.5, hats: 0.28, lead: i >= 4 ? 0.26 : 0 }),
    cutoff: (i) => 3500 + i * 2500,
  },
};

export class Music {
  constructor(engine) {
    this.e = engine;
    const e = engine;
    this.out = e.gain(1);
    this.filter = e.filter('lowpass', 18000, 0.7);
    this.out.connect(this.filter);
    this.filter.connect(e.music);
    this.delay = e.ctx.createDelay(1.5);
    this.setStyle('synthwave');
    this.delay.delayTime.value = this.stepDur * 3;
    this.fb = e.gain(0.38);
    this.delayF = e.filter('lowpass', 2600, 0.7);
    this.delay.connect(this.delayF);
    this.delayF.connect(this.fb);
    this.fb.connect(this.delay);
    this.delayF.connect(this.out);
    this.verb = e.gain(0.5);
    this.verb.connect(e.reverbSend);
    this.layers = {};
    for (const k of ['pad', 'arp', 'bass', 'kick', 'snare', 'hats', 'lead']) {
      const g = e.gain(0);
      g.connect(this.out);
      this.layers[k] = { g, level: 0 };
    }
    this.layers.arp.g.connect(this.delay);
    this.layers.lead.g.connect(this.delay);
    this.layers.lead.g.connect(this.verb);
    this.layers.pad.g.connect(this.verb);
    this.step = 0;
    this.nextTime = 0;
    this.intensity = 0;
    this.muted = false;
    this.calm = false;
    this.running = false;
  }

  setStyle(name) {
    this.st = MUSIC_STYLES[name] || MUSIC_STYLES.synthwave;
    this.stepDur = 60 / this.st.bpm / 4; // 16th note
    if (this.delay) this.delay.delayTime.setTargetAtTime(this.stepDur * 3, this.e.now, 0.1);
    if (this.lastState) this.setState(this.lastState);
  }

  // The sequencer runs on its own timer (independent of the frame rate) and schedules
  // notes ahead on the audio clock, so a slow frame never leaves gaps in the music.
  start() {
    if (this.running) return;
    this.running = true;
    this.nextTime = this.e.now + 0.1;
    this.step = 0;
    this.timer = setInterval(() => this.update(), 50);
  }

  // intensity 0..5; calm = Ghost Mode / Cold Snap (pad only, muffled); menu = title screen.
  setState({ intensity = 0, calm = false, menu = false }) {
    this.lastState = { intensity, calm, menu };
    const e = this.e;
    const t = e.now;
    this.intensity = intensity;
    this.calm = calm;
    const L = this.layers;
    const want = calm
      ? { pad: 0.7, arp: 0, bass: 0, kick: 0, snare: 0, hats: 0, lead: 0 }
      : menu
        ? { pad: 0.65, arp: 0.35, bass: 0.35, kick: 0, snare: 0, hats: 0, lead: 0 }
        : {
            pad: intensity >= 4 ? 0.45 : 0.6,
            arp: intensity === 0 ? 0.28 : 0.42,
            bass: intensity >= 1 ? 0.55 : 0,
            kick: intensity >= 2 ? 0.8 : 0,
            snare: intensity >= 2 ? 0.45 : 0,
            hats: intensity >= 3 ? 0.3 : 0,
            lead: intensity >= 4 ? 0.32 : 0,
          };
    if (!calm && !menu && this.st.levels) Object.assign(want, this.st.levels(intensity));
    for (const k in want) {
      if (Math.abs(L[k].level - want[k]) > 0.001) {
        L[k].level = want[k];
        L[k].g.gain.setTargetAtTime(want[k], t, want[k] > 0 ? 1.2 : 0.8);
      }
    }
    const cutoff = calm ? 650 : menu ? 5000 : this.st.cutoff ? this.st.cutoff(intensity) : 2600 + intensity * 3000;
    this.filter.frequency.setTargetAtTime(cutoff, t, 0.6);
  }

  update() {
    if (!this.running || !this.e.ok || this.e.ctx.state !== 'running') return;
    const e = this.e;
    // Re-sync after the context was suspended.
    if (this.nextTime < e.now - 0.5) this.nextTime = e.now + 0.05;
    while (this.nextTime < e.now + 0.4) {
      this.schedule(this.step, this.nextTime);
      this.step++;
      this.nextTime += this.stepDur;
    }
  }

  schedule(step, t) {
    const L = this.layers;
    const s16 = step % 16;
    const bar = Math.floor(step / 16);
    const st = this.st;
    const STEP = this.stepDur;
    const prog = st.progs[Math.floor(bar / 8) % 2];
    const chord = prog[bar % 4];
    const root = chord[0];
    const hot = this.intensity >= 5 && !this.calm;
    if (s16 === 0 && L.pad.level > 0) this.pad(chord, t, STEP * 16);
    if (L.arp.level > 0) {
      const div = st.arpDiv(this.intensity, hot);
      if (step % div === 0) {
        const seq = [0, 1, 2, 1, 0, 2, 1, 2];
        const i = (step / div) % 8;
        const oct = Math.floor(((step / div) % 16) / 8) * 12 + 12;
        this.pluck(midi(chord[seq[i]] + oct), t, STEP * div * 0.9);
      }
    }
    if (L.bass.level > 0 && step % 2 === 0) {
      const octave = this.intensity >= 3 && step % 4 === 2 ? 12 : 0;
      this.bass(midi(root - 12 + octave), t, STEP * 1.8, hot);
    }
    if (L.kick.level > 0) {
      if (st.kick(s16, this.intensity)) this.kick(t);
    }
    if (L.snare.level > 0 && st.snare(s16)) this.snare(t);
    if (L.hats.level > 0) {
      if (st.hat(step, s16, hot)) this.hat(t, s16 % 4 === 2 ? 0.16 : 0.035, s16 % 4 === 2 ? 0.5 : 0.3);
    }
    if (L.lead.level > 0) {
      const motif = MOTIFS[Math.floor(bar / 2) % MOTIFS.length];
      const inBar = s16 + (bar % 2) * 16;
      if (inBar < 16) {
        for (const [st, off, len] of motif) if (st === inBar) this.lead(midi(root + off), t, STEP * len);
      }
    }
  }

  voice(type, f, detune = 0) {
    const o = this.e.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    return o;
  }

  pad(chord, t, len) {
    const e = this.e;
    const f = e.filter('lowpass', 900, 0.8);
    const g = e.gain(0);
    f.connect(g);
    g.connect(this.layers.pad.g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.7);
    g.gain.setValueAtTime(0.07, t + len - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + len + 0.5);
    f.frequency.setValueAtTime(600, t);
    f.frequency.linearRampToValueAtTime(1300, t + len * 0.6);
    const oscs = [];
    for (const n of chord) {
      for (const d of [-9, 8]) {
        const o = this.voice('sawtooth', midi(n), d);
        o.connect(f);
        oscs.push(o);
      }
    }
    const sub = this.voice('sine', midi(chord[0] - 12));
    const sg = e.gain(0.5);
    sub.connect(sg);
    sg.connect(f);
    oscs.push(sub);
    for (const o of oscs) {
      o.start(t);
      o.stop(t + len + 0.6);
    }
    oscs[0].onended = () => {
      f.disconnect();
      g.disconnect();
      sg.disconnect();
    };
  }

  pluck(f0, t, len) {
    const e = this.e;
    const o = this.voice('square', f0);
    const f = e.filter('lowpass', 2400, 4);
    const g = e.gain(0);
    o.connect(f);
    f.connect(g);
    g.connect(this.layers.arp.g);
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(500, t + len);
    e.env(g.gain, t, 0.05, 0.004, len);
    o.start(t);
    o.stop(t + len + 0.05);
    o.onended = () => {
      f.disconnect();
      g.disconnect();
    };
  }

  bass(f0, t, len, hot) {
    const e = this.e;
    const o = this.voice('sawtooth', f0);
    const o2 = this.voice('square', f0 * 0.5);
    const f = e.filter('lowpass', 300, hot ? 8 : 5);
    const g = e.gain(0);
    o.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(this.layers.bass.g);
    f.frequency.setValueAtTime(hot ? 1400 : 900, t);
    f.frequency.exponentialRampToValueAtTime(140, t + len);
    e.env(g.gain, t, 0.16, 0.006, len);
    o.start(t);
    o2.start(t);
    o.stop(t + len + 0.05);
    o2.stop(t + len + 0.05);
    o.onended = () => {
      f.disconnect();
      g.disconnect();
    };
  }

  kick(t) {
    const e = this.e;
    const o = this.voice('sine', 150);
    const g = e.gain(0);
    o.connect(g);
    g.connect(this.layers.kick.g);
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    e.env(g.gain, t, 0.8, 0.002, 0.32);
    o.start(t);
    o.stop(t + 0.4);
    o.onended = () => g.disconnect();
  }

  snare(t) {
    const e = this.e;
    const s = e.ctx.createBufferSource();
    s.buffer = e.noise.white;
    const f = e.filter('bandpass', 1900, 0.8);
    const g = e.gain(0);
    s.connect(f);
    f.connect(g);
    g.connect(this.layers.snare.g);
    g.connect(this.verb);
    e.env(g.gain, t, 0.55, 0.002, 0.2);
    s.start(t, Math.random());
    s.stop(t + 0.25);
    const o = this.voice('triangle', 190);
    const og = e.gain(0);
    o.connect(og);
    og.connect(this.layers.snare.g);
    e.env(og.gain, t, 0.25, 0.002, 0.09);
    o.start(t);
    o.stop(t + 0.12);
    s.onended = () => {
      f.disconnect();
      g.disconnect();
      og.disconnect();
    };
  }

  hat(t, decay, peak) {
    const e = this.e;
    const s = e.ctx.createBufferSource();
    s.buffer = e.noise.white;
    const f = e.filter('highpass', 7200, 0.7);
    const g = e.gain(0);
    s.connect(f);
    f.connect(g);
    g.connect(this.layers.hats.g);
    e.env(g.gain, t, peak, 0.001, decay);
    s.start(t, Math.random());
    s.stop(t + decay + 0.02);
    s.onended = () => {
      f.disconnect();
      g.disconnect();
    };
  }

  lead(f0, t, len) {
    const e = this.e;
    const o = this.voice('sawtooth', f0, -6);
    const o2 = this.voice('sawtooth', f0, 7);
    const vib = this.voice('sine', 5.5);
    const vibG = e.gain(f0 * 0.008);
    vib.connect(vibG);
    vibG.connect(o.frequency);
    vibG.connect(o2.frequency);
    const f = e.filter('lowpass', 2400, 2);
    const g = e.gain(0);
    o.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(this.layers.lead.g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.03);
    g.gain.setValueAtTime(0.06, t + Math.max(0.05, len - 0.05));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.25);
    for (const x of [o, o2, vib]) {
      x.start(t);
      x.stop(t + len + 0.3);
    }
    o.onended = () => {
      f.disconnect();
      g.disconnect();
      vibG.disconnect();
    };
  }
}

