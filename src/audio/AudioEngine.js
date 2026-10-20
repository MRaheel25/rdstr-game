// Web Audio core: context, mix buses (SFX through a "world" low-pass used by Ghost Mode and
// Cold Snap, music, UI), shared noise buffers, a generated reverb impulse, the 3D listener,
// and helpers for short spatial one-shots. Everything is synthesized; no audio files.
import { clamp } from '../util/math.js';

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ok = false;
    this.unlocked = false;
    this.volumes = { master: -1, music: -1, sfx: -1 };
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch (e) {
      console.info('Audio unavailable', e);
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 5;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.2;
    this.master.connect(this.comp);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.comp.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    // SFX: everything in the world passes through a low-pass (muffling) and a duck gain.
    this.sfx = ctx.createGain();
    this.world = ctx.createGain();
    this.worldFilter = ctx.createBiquadFilter();
    this.worldFilter.type = 'lowpass';
    this.worldFilter.frequency.value = 20000;
    this.worldFilter.Q.value = 0.8;
    this.world.connect(this.worldFilter);
    this.worldFilter.connect(this.sfx);
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.connect(this.master);
    this.ui = ctx.createGain();
    this.ui.connect(this.master);
    // Shared reverb send for big sounds (explosions, impacts, music lead).
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.6, 2.4);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.28;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.sfx);
    this.noise = {
      white: this.makeNoise('white', 2),
      pink: this.makeNoise('pink', 3),
      brown: this.makeNoise('brown', 3),
    };
    this.ok = true;
    this.applyVolumes();
    // Browsers start the context suspended until a user gesture.
    const unlock = () => this.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { passive: true });
    this.unlock();
  }

  get now() {
    return this.ctx.currentTime;
  }

  unlock() {
    if (!this.ok || this.ctx.state === 'running') {
      this.unlocked = this.ok;
      return;
    }
    this.ctx.resume().then(() => {
      this.unlocked = true;
    }).catch(() => {});
  }

  applyVolumes() {
    if (!this.ok) return;
    const s = this.settings;
    const m = clamp(s.get('masterVolume') ?? 0.8, 0, 1);
    const mu = clamp(s.get('musicVolume') ?? 0.55, 0, 1);
    const sf = clamp(s.get('sfxVolume') ?? 0.9, 0, 1);
    const v = this.volumes;
    const t = this.now;
    // Perceptual (squared) curves on the sliders.
    if (m !== v.master) this.master.gain.setTargetAtTime(m * m * 0.9, t, 0.05);
    if (mu !== v.music) this.music.gain.setTargetAtTime(mu * mu * 1.15, t, 0.05);
    if (sf !== v.sfx) {
      this.sfx.gain.setTargetAtTime(sf * sf, t, 0.05);
      this.ui.gain.setTargetAtTime(sf * sf * 0.7, t, 0.05);
    }
    v.master = m;
    v.music = mu;
    v.sfx = sf;
  }

  // 0 = clear, 1 = heavily muffled (Ghost Mode / Cold Snap / underwater).
  setMuffle(amount, tc = 0.12) {
    if (!this.ok) return;
    const f = 20000 * Math.pow(380 / 20000, clamp(amount, 0, 1));
    this.worldFilter.frequency.setTargetAtTime(f, this.now, tc);
  }

  // Duck the world (pause menus).
  setWorldGain(g, tc = 0.15) {
    if (!this.ok) return;
    this.world.gain.setTargetAtTime(g, this.now, tc);
  }

  updateListener(camera, velocity) {
    if (!this.ok) return;
    const l = this.ctx.listener;
    const p = camera.position;
    const e = camera.matrixWorld.elements;
    const t = this.now;
    const fx = -e[8];
    const fy = -e[9];
    const fz = -e[10];
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02);
      l.positionY.setTargetAtTime(p.y, t, 0.02);
      l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(fx, t, 0.02);
      l.forwardY.setTargetAtTime(fy, t, 0.02);
      l.forwardZ.setTargetAtTime(fz, t, 0.02);
      l.upX.setTargetAtTime(e[4], t, 0.02);
      l.upY.setTargetAtTime(e[5], t, 0.02);
      l.upZ.setTargetAtTime(e[6], t, 0.02);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(fx, fy, fz, e[4], e[5], e[6]);
    }
    this.listenerPos = p;
    this.listenerVel = velocity;
  }

  makeNoise(kind, seconds) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    // Crossfade the loop seam.
    const fade = Math.min(2048, n >> 3);
    for (let i = 0; i < fade; i++) {
      const a = i / fade;
      d[n - fade + i] = d[n - fade + i] * (1 - a) + d[i] * a;
    }
    return buf;
  }

  makeImpulse(seconds, decay) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return buf;
  }

  // Looping noise source (started immediately).
  noiseSource(kind = 'white', rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise[kind];
    s.loop = true;
    s.playbackRate.value = rate;
    s.loopStart = Math.random() * (s.buffer.duration - 0.5);
    s.start(this.now, s.loopStart);
    return s;
  }

  filter(type, freq, q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  gain(v = 0) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  osc(type, freq) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.start();
    return o;
  }

  panner(refDistance = 8, rolloff = 1.1, maxDistance = 600) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = refDistance;
    p.rolloffFactor = rolloff;
    p.maxDistance = maxDistance;
    return p;
  }

  setPannerPos(p, pos) {
    const t = this.now;
    if (p.positionX) {
      p.positionX.setTargetAtTime(pos.x, t, 0.03);
      p.positionY.setTargetAtTime(pos.y, t, 0.03);
      p.positionZ.setTargetAtTime(pos.z, t, 0.03);
    } else p.setPosition(pos.x, pos.y, pos.z);
  }

  // Output node for a one-shot: spatialized when a position is given, else straight to
  // the bus. Returns { input, dispose(afterSeconds) }.
  oneShotOut(pos = null, { bus = null, ref = 10, reverb = 0 } = {}) {
    const ctx = this.ctx;
    const input = ctx.createGain();
    let out = input;
    let pan = null;
    if (pos) {
      pan = this.panner(ref, 1);
      if (pan.positionX) {
        pan.positionX.value = pos.x;
        pan.positionY.value = pos.y;
        pan.positionZ.value = pos.z;
      } else pan.setPosition(pos.x, pos.y, pos.z);
      input.connect(pan);
      out = pan;
    }
    out.connect(bus || this.world);
    let send = null;
    if (reverb > 0) {
      send = this.gain(reverb);
      out.connect(send);
      send.connect(this.reverbSend);
    }
    return {
      input,
      dispose: (after) => {
        setTimeout(() => {
          input.disconnect();
          if (pan) pan.disconnect();
          if (send) send.disconnect();
        }, after * 1000 + 200);
      },
    };
  }

  // Exponential-ish decay envelope on a gain param.
  env(param, t, peak, attack, decay, sustain = 0.0001) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + attack);
    param.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + attack + decay);
  }

  // RMS of the master output (test hook).
  level() {
    if (!this.ok) return 0;
    const a = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(a);
    let s = 0;
    for (const x of a) s += x * x;
    return Math.sqrt(s / a.length);
  }
}
