// Police sound in 3D: a pool of siren voices assigned to the nearest units (wail / yelp /
// hi-lo patterns, Doppler shift from relative velocity, PannerNode distance falloff, a pursuit
// engine growl underneath), the helicopter rotor thump and the drones' buzz.
import * as THREE from 'three';
import { clamp } from '../util/math.js';

const C = 343; // speed of sound, m/s
const VOICES = 4;
const _d = new THREE.Vector3();

class SirenVoice {
  constructor(e) {
    this.e = e;
    this.pan = e.panner(9, 1.05, 900);
    this.pan.connect(e.world);
    this.out = e.gain(0);
    this.out.connect(this.pan);
    this.a = e.osc('sawtooth', 700);
    this.b = e.osc('square', 703);
    const bg = e.gain(0.35);
    this.b.connect(bg);
    this.f = e.filter('lowpass', 2600, 1.2);
    this.a.connect(this.f);
    bg.connect(this.f);
    this.sirenG = e.gain(0);
    this.f.connect(this.sirenG);
    this.sirenG.connect(this.out);
    this.engine = e.osc('sawtooth', 55);
    this.engineF = e.filter('lowpass', 320, 1);
    this.engineG = e.gain(0);
    this.engine.connect(this.engineF);
    this.engineF.connect(this.engineG);
    this.engineG.connect(this.out);
    this.unit = null;
    this.phase = Math.random() * 10;
  }

  update(dt, u, listenerPos, listenerVel, active) {
    const e = this.e;
    const t = e.now;
    if (!u) {
      this.out.gain.setTargetAtTime(0, t, 0.25);
      this.unit = null;
      return;
    }
    if (this.unit !== u) {
      // Fade in on reassignment, snap the panner to avoid sweeping across the world.
      this.unit = u;
      this.out.gain.value = 0.0001;
      if (this.pan.positionX) {
        this.pan.positionX.value = u.v.position.x;
        this.pan.positionY.value = u.v.position.y;
        this.pan.positionZ.value = u.v.position.z;
      }
    }
    const v = u.v;
    e.setPannerPos(this.pan, v.position);
    // Doppler: f' = f (c + v_listener->src) / (c - v_src->listener).
    _d.subVectors(listenerPos, v.position);
    const dist = _d.length() || 1;
    _d.divideScalar(dist);
    const vs = v.velocity.dot(_d);
    const vl = -listenerVel.dot(_d);
    const doppler = clamp((C + vl) / Math.max(120, C - vs), 0.75, 1.35);
    this.phase += dt;
    const p = this.phase;
    let f;
    const yelp = dist < 45 || u.type === 'interceptor';
    if (u.type === 'swat') f = Math.floor(p / 0.55) % 2 ? 640 : 860; // hi-lo
    else if (yelp) {
      const k = (p % 0.34) / 0.34;
      f = 680 + 720 * Math.sin(k * Math.PI * 0.5);
    } else f = 660 + 700 * (0.5 - 0.5 * Math.cos((p / 4.4) * Math.PI * 2));
    f *= doppler;
    this.a.frequency.setTargetAtTime(f, t, 0.012);
    this.b.frequency.setTargetAtTime(f * 1.004, t, 0.012);
    this.sirenG.gain.setTargetAtTime(active && !v.wrecked ? 0.16 : 0, t, 0.08);
    this.engine.frequency.setTargetAtTime((45 + v.speed * 2.2) * doppler, t, 0.05);
    this.engineG.gain.setTargetAtTime(v.wrecked ? 0 : 0.05 + clamp(v.controls.throttle, 0, 1) * 0.1, t, 0.08);
    this.out.gain.setTargetAtTime(1, t, 0.3);
  }
}

export class PoliceAudio {
  constructor(engine) {
    this.e = engine;
    const e = engine;
    this.voices = [];
    for (let i = 0; i < VOICES; i++) this.voices.push(new SirenVoice(e));

    // Helicopter: brown-noise thump gated by a pulse LFO, plus blade slap and turbine.
    this.heliPan = e.panner(28, 1, 1200);
    this.heliPan.connect(e.world);
    this.heliG = e.gain(0);
    this.heliG.connect(this.heliPan);
    const thumpN = e.noiseSource('brown');
    const thumpF = e.filter('lowpass', 220, 1.4);
    this.thumpVCA = e.gain(0.05);
    thumpN.connect(thumpF);
    thumpF.connect(this.thumpVCA);
    this.thumpVCA.connect(this.heliG);
    const slapN = e.noiseSource('white');
    const slapF = e.filter('bandpass', 1100, 1.2);
    this.slapVCA = e.gain(0);
    const slapG = e.gain(0.25);
    slapN.connect(slapF);
    slapF.connect(this.slapVCA);
    this.slapVCA.connect(slapG);
    slapG.connect(this.heliG);
    this.rotorLfo = e.osc('sawtooth', 11);
    const shaper = e.ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.pow(Math.max(0, (x - 0.35) / 0.65), 2) * 1.4;
    }
    shaper.curve = curve;
    this.rotorLfo.connect(shaper);
    shaper.connect(this.thumpVCA.gain);
    shaper.connect(this.slapVCA.gain);
    this.turbine = e.osc('sine', 3300);
    const turbG = e.gain(0.012);
    this.turbine.connect(turbG);
    turbG.connect(this.heliG);

    // Drones.
    this.drones = [0, 1].map(() => {
      const pan = e.panner(6, 1.2, 300);
      pan.connect(e.world);
      const g = e.gain(0);
      g.connect(pan);
      const o = e.osc('sawtooth', 190);
      const o2 = e.osc('sawtooth', 383);
      const f = e.filter('bandpass', 900, 1.5);
      o.connect(f);
      o2.connect(f);
      f.connect(g);
      return { pan, g, o, o2 };
    });
  }

  update(dt, police, heat, listenerPos, listenerVel, paused) {
    const e = this.e;
    const t = e.now;
    const pursuit = heat.phase !== 'none';
    // Nearest live units with sirens get the voices; keep current assignments when possible.
    const cands = police.units
      .filter((u) => !u.v.wrecked && (pursuit || u.role !== 'patrol'))
      .map((u) => ({ u, d: u.v.position.distanceToSquared(listenerPos) }))
      .filter((c) => c.d < 520 * 520)
      .sort((a, b) => a.d - b.d)
      .slice(0, VOICES)
      .map((c) => c.u);
    const free = [];
    for (const voice of this.voices) {
      if (voice.unit && cands.includes(voice.unit)) {
        cands.splice(cands.indexOf(voice.unit), 1);
        voice.update(dt, voice.unit, listenerPos, listenerVel, pursuit && !paused);
      } else free.push(voice);
    }
    for (const voice of free) voice.update(dt, cands.shift() || null, listenerPos, listenerVel, pursuit && !paused);

    // Helicopter.
    const h = police.heli;
    if (h && !paused) {
      e.setPannerPos(this.heliPan, h.pos);
      _d.subVectors(listenerPos, h.pos);
      const dist = _d.length() || 1;
      _d.divideScalar(dist);
      const doppler = clamp((C - listenerVel.dot(_d)) / (C - h.vel.dot(_d)), 0.85, 1.2);
      this.rotorLfo.frequency.setTargetAtTime(10.5 * doppler, t, 0.1);
      this.heliG.gain.setTargetAtTime(0.75, t, 0.6);
    } else this.heliG.gain.setTargetAtTime(0, t, 0.6);

    for (let i = 0; i < this.drones.length; i++) {
      const s = this.drones[i];
      const d = police.drones[i];
      if (d && !d.dead && !paused) {
        e.setPannerPos(s.pan, d.pos);
        const wob = 1 + Math.sin(t * 7 + i) * 0.03 + (d.charge || 0) * 0.5;
        s.o.frequency.setTargetAtTime(190 * wob, t, 0.05);
        s.o2.frequency.setTargetAtTime(383 * wob, t, 0.05);
        s.g.gain.setTargetAtTime(0.09, t, 0.2);
      } else s.g.gain.setTargetAtTime(0, t, 0.2);
    }
  }
}
