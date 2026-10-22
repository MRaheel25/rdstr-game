// Player car sound: layered electric motor (whine that tracks speed, sub under load, inverter
// harmonics, turbine whistle at very high speed, regen whine), tyre squeal from slip, road
// roar, gravel crackle and puddle spray by surface, wind, metal scrape, cold-gas hiss for
// Hover Jets / air control and a deep roar for the Rear Rockets.
import { clamp, lerp } from '../util/math.js';

export class CarAudio {
  constructor(engine) {
    this.e = engine;
    const e = engine;
    this.out = e.gain(1);
    this.out.connect(e.world);

    // --- Motor (V3): warm, deep EV hum. Sine + soft triangle layers through a low-pass, a
    // gentle speed tone with capped pitch, a sub surge on hard acceleration, all into a soft
    // compressor. No square / saw layers and nothing above ~2 kHz.
    this.motor = e.gain(0);
    this.motorComp = e.ctx.createDynamicsCompressor();
    this.motorComp.threshold.value = -22;
    this.motorComp.knee.value = 18;
    this.motorComp.ratio.value = 3;
    this.motorComp.attack.value = 0.02;
    this.motorComp.release.value = 0.25;
    this.motorLP = e.filter('lowpass', 900, 0.5);
    this.motor.connect(this.motorLP);
    this.motorLP.connect(this.motorComp);
    this.motorComp.connect(this.out);
    this.hum = e.osc('sine', 60);
    this.hum2 = e.osc('triangle', 120);
    this.hum3 = e.osc('sine', 180);
    this.humG = e.gain(0);
    const h2 = e.gain(0.35);
    const h3 = e.gain(0.12);
    this.hum.connect(this.humG);
    this.hum2.connect(h2);
    h2.connect(this.humG);
    this.hum3.connect(h3);
    h3.connect(this.humG);
    this.humG.connect(this.motor);
    this.tone = e.osc('sine', 240);
    this.toneF = e.filter('lowpass', 700, 0.4);
    this.toneG = e.gain(0);
    this.tone.connect(this.toneF);
    this.toneF.connect(this.toneG);
    this.toneG.connect(this.motor);
    this.sub = e.osc('sine', 38);
    this.subG = e.gain(0);
    this.sub.connect(this.subG);
    this.subG.connect(this.motor);
    this.surge = 0;

    // --- Tyres / road / wind ------------------------------------------------------
    const tyreNoise = e.noiseSource('white');
    this.squealF1 = e.filter('bandpass', 900, 4);
    this.squealF2 = e.filter('bandpass', 1300, 5);
    this.squealG = e.gain(0);
    tyreNoise.connect(this.squealF1);
    tyreNoise.connect(this.squealF2);
    this.squealF1.connect(this.squealG);
    this.squealF2.connect(this.squealG);
    // A wobbling tone gives the squeal its rubbery chirp.
    this.squealTone = e.osc('triangle', 980);
    this.squealToneG = e.gain(0);
    this.squealTone.connect(this.squealToneG);
    this.squealToneG.connect(this.squealG);
    this.squealG.connect(this.out);

    const brown = e.noiseSource('brown');
    this.roadF = e.filter('lowpass', 300, 0.7);
    this.roadG = e.gain(0);
    brown.connect(this.roadF);
    this.roadF.connect(this.roadG);
    this.roadG.connect(this.out);

    const gravelNoise = e.noiseSource('white', 0.6);
    this.gravelF = e.filter('bandpass', 700, 0.9);
    this.gravelAM = e.gain(0);
    this.gravelG = e.gain(0);
    gravelNoise.connect(this.gravelF);
    this.gravelF.connect(this.gravelAM);
    this.gravelAM.connect(this.gravelG);
    this.gravelG.connect(this.out);
    // Random crackle: a noise-driven gain modulation.
    const crackle = e.noiseSource('white', 0.05);
    const crackleF = e.filter('lowpass', 40, 0.5);
    const crackleAmt = e.gain(2.2);
    crackle.connect(crackleF);
    crackleF.connect(crackleAmt);
    crackleAmt.connect(this.gravelAM.gain);

    const spray = e.noiseSource('white', 1.3);
    this.sprayF = e.filter('highpass', 2200, 0.6);
    this.sprayG = e.gain(0);
    spray.connect(this.sprayF);
    this.sprayF.connect(this.sprayG);
    this.sprayG.connect(this.out);

    const pink = e.noiseSource('pink');
    this.windF = e.filter('lowpass', 400, 0.9);
    this.windF2 = e.filter('peaking', 900, 1.5);
    this.windF2.gain.value = 6;
    this.windG = e.gain(0);
    pink.connect(this.windF);
    this.windF.connect(this.windF2);
    this.windF2.connect(this.windG);
    this.windG.connect(this.out);

    // --- Metal scrape loop --------------------------------------------------------
    const scrapeN = e.noiseSource('white', 0.8);
    this.scrapeF = e.filter('bandpass', 1800, 2);
    this.scrapeTone = e.osc('sawtooth', 137);
    this.scrapeToneF = e.filter('bandpass', 1900, 8);
    this.scrapeG = e.gain(0);
    scrapeN.connect(this.scrapeF);
    this.scrapeF.connect(this.scrapeG);
    this.scrapeTone.connect(this.scrapeToneF);
    this.scrapeToneF.connect(this.scrapeG);
    this.scrapeG.connect(this.out);

    // --- Thrusters -----------------------------------------------------------------
    const hiss = e.noiseSource('white', 1.1);
    // Soft cold-gas whoosh (no piercing peak).
    this.hissF = e.filter('bandpass', 1800, 0.5);
    this.hissF2 = e.filter('lowpass', 4200, 0.6);
    this.hissG = e.gain(0);
    hiss.connect(this.hissF);
    this.hissF.connect(this.hissF2);
    this.hissF2.connect(this.hissG);
    this.hissG.connect(this.out);

    const roarN = e.noiseSource('brown', 1.4);
    const roarW = e.noiseSource('white', 0.7);
    this.roarF = e.filter('lowpass', 700, 0.8);
    this.roarWF = e.filter('bandpass', 1400, 0.7);
    this.roarRumble = e.osc('sine', 46);
    this.roarG = e.gain(0);
    roarN.connect(this.roarF);
    roarW.connect(this.roarWF);
    const roarWG = e.gain(0.35);
    this.roarWF.connect(roarWG);
    roarWG.connect(this.roarG);
    this.roarF.connect(this.roarG);
    const rumbleG = e.gain(0.5);
    this.roarRumble.connect(rumbleG);
    rumbleG.connect(this.roarG);
    this.roarG.connect(this.out);

    this.hissLevel = 0;
    this.roarLevel = 0;
    this.load = 0;
  }

  set(param, v, tc = 0.05) {
    param.setTargetAtTime(v, this.e.now, tc);
  }

  update(dt, car, { ghost = false, wet = false, paused = false, timeScale = 1 } = {}) {
    const c = car.controls;
    const sp = Math.abs(car.fwdSpeed);
    const v = car.speed;
    const ts = 0.55 + 0.45 * timeScale; // slow-motion lowers pitch
    const alive = !paused && !car.wrecked;
    // Motor load: throttle (or regen braking) smoothed.
    const throttle = alive ? c.throttle * (car.energy ? car.energy.powerScale : 1) : 0;
    const regen = alive && c.brake > 0.1 && car.fwdSpeed > 3 ? c.brake : 0;
    this.load = lerp(this.load, Math.max(throttle, regen * 0.6), 1 - Math.exp(-dt * 10));
    const engineVol = clamp(this.e.settings ? this.e.settings.get('engineVolume') ?? 0.8 : 0.8, 0, 1);
    const motorVol = alive ? (ghost ? 0.06 : 1) * engineVol * engineVol * 1.2 : 0;
    this.set(this.motor.gain, motorVol, 0.15);
    // Pitch rises with wheel speed but is capped low; the filter opens a little with speed.
    const f = Math.min(58 + sp * 2.1, 230) * ts;
    this.set(this.hum.frequency, f, 0.05);
    this.set(this.hum2.frequency, f * 2, 0.05);
    this.set(this.hum3.frequency, f * 3, 0.05);
    this.set(this.humG.gain, 0.05 + this.load * 0.12 + Math.min(1, sp / 50) * 0.05, 0.08);
    this.set(this.tone.frequency, Math.min(180 + sp * 6.5, 820) * ts, 0.06);
    this.set(this.toneF.frequency, Math.min(500 + sp * 12, 1600), 0.1);
    this.set(this.toneG.gain, (0.015 + this.load * 0.035) * clamp(sp / 20, 0, 1), 0.08);
    this.set(this.motorLP.frequency, Math.min(700 + sp * 14 + this.load * 300, 2000), 0.1);
    // Punchy surge: a short sub swell when the throttle comes in hard.
    const dLoad = Math.max(0, throttle - (this.prevThrottle ?? 0));
    this.prevThrottle = throttle;
    this.surge = Math.max(this.surge * Math.exp(-dt * 3.5), dLoad > 0.3 ? 1 : 0);
    this.set(this.sub.frequency, (34 + sp * 0.5) * ts, 0.05);
    this.set(this.subG.gain, (this.load * 0.18 * clamp(1 - sp / 90, 0.3, 1) + this.surge * 0.22) * (alive ? 1 : 0), 0.04);

    // Tyres: squeal from slide amount of grounded wheels on hard surfaces.
    let hard = 0;
    let soft = 0;
    let grounded = 0;
    let slide = 0;
    for (const w of car.wheels) {
      if (!w.grounded) continue;
      grounded++;
      if (w.surface === 'dirt' || w.surface === 'grass') soft++;
      else {
        hard++;
        slide += w.slide || 0;
      }
    }
    const squeal = alive && hard ? clamp((slide / hard - 2.2) / 9, 0, 1) : 0;
    this.set(this.squealG.gain, squeal * 0.12, 0.04);
    this.set(this.squealToneG.gain, 0, 0.04);
    this.set(this.squealTone.frequency, (900 + Math.sin(performance.now() * 0.013) * 60 + squeal * 120) * ts, 0.02);
    this.set(this.squealF1.frequency, (950 + squeal * 250) * ts, 0.05);
    const gnd = grounded / 4;
    const roll = clamp(v / 60, 0, 1);
    this.set(this.roadG.gain, alive ? gnd * (0.04 + roll * 0.16) * (hard / Math.max(1, grounded)) : 0, 0.08);
    this.set(this.roadF.frequency, 160 + v * 6, 0.1);
    this.set(this.gravelG.gain, alive && grounded ? (soft / grounded) * clamp(v / 25, 0, 1) * 0.3 : 0, 0.06);
    this.set(this.sprayG.gain, alive && wet ? gnd * clamp(v / 50, 0, 1) * 0.07 : 0, 0.1);
    // Wind grows with the square of speed.
    const wind = clamp(v / 95, 0, 1.3);
    this.set(this.windG.gain, wind * wind * 0.22, 0.12);
    this.set(this.windF.frequency, 300 + v * 22, 0.12);
    // Scrape.
    const scrape = alive ? clamp(car.scrape * clamp(v / 10, 0, 1), 0, 1) : 0;
    this.set(this.scrapeG.gain, scrape * 0.1, 0.03);
    this.set(this.scrapeTone.frequency, 110 + Math.random() * 60, 0.02);
    this.set(this.scrapeF.frequency, 1400 + Math.random() * 800, 0.02);

    // Cold gas hiss bursts (hover / air control) and rocket roar.
    const t = car.thrust;
    const gas = alive ? Math.max(t.hover, t.air ? 0.55 : 0) : 0;
    this.hissLevel = gas > this.hissLevel ? gas : lerp(this.hissLevel, gas, 1 - Math.exp(-dt * 14));
    this.set(this.hissG.gain, this.hissLevel * 0.14, gas > 0 ? 0.03 : 0.08);
    const roar = alive ? t.rocket : 0;
    this.roarLevel = lerp(this.roarLevel, roar, 1 - Math.exp(-dt * (roar ? 18 : 6)));
    this.set(this.roarG.gain, this.roarLevel * 0.42, 0.02);
    this.set(this.roarF.frequency, (500 + this.roarLevel * 500) * ts, 0.05);
  }
}
