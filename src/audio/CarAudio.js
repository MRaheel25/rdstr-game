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

    // --- Motor -------------------------------------------------------------------
    this.motor = e.gain(0);
    this.motor.connect(this.out);
    this.whine = e.osc('sawtooth', 200);
    this.whine2 = e.osc('triangle', 400);
    this.whineF = e.filter('bandpass', 600, 2.2);
    this.whineG = e.gain(0);
    this.whine.connect(this.whineF);
    this.whine2.connect(this.whineF);
    this.whineF.connect(this.whineG);
    this.whineG.connect(this.motor);
    this.sub = e.osc('sine', 40);
    this.subG = e.gain(0);
    this.sub.connect(this.subG);
    this.subG.connect(this.motor);
    this.inverter = e.osc('square', 1100);
    this.invF = e.filter('bandpass', 2400, 6);
    this.invG = e.gain(0);
    this.inverter.connect(this.invF);
    this.invF.connect(this.invG);
    this.invG.connect(this.motor);
    this.turbine = e.osc('sine', 2600);
    this.turbine2 = e.osc('sine', 3910);
    this.turbG = e.gain(0);
    this.turbine.connect(this.turbG);
    this.turbine2.connect(this.turbG);
    this.turbG.connect(this.motor);

    // --- Tyres / road / wind ------------------------------------------------------
    const tyreNoise = e.noiseSource('white');
    this.squealF1 = e.filter('bandpass', 1050, 9);
    this.squealF2 = e.filter('bandpass', 1650, 12);
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
    this.scrapeF = e.filter('bandpass', 2600, 4);
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
    this.hissF = e.filter('highpass', 3000, 0.8);
    this.hissF2 = e.filter('peaking', 6500, 2);
    this.hissF2.gain.value = 8;
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
    const motorVol = alive ? (ghost ? 0.06 : 1) : 0;
    this.set(this.motor.gain, motorVol, 0.15);
    // Single-speed EV: whine rises with wheel speed.
    const f = (160 + sp * 24) * ts;
    this.set(this.whine.frequency, f, 0.03);
    this.set(this.whine2.frequency, f * 2.01, 0.03);
    this.set(this.whineF.frequency, f * 1.9 + 300, 0.05);
    this.set(this.whineG.gain, 0.012 + this.load * 0.14 + Math.min(1, sp / 40) * 0.06, 0.05);
    this.set(this.sub.frequency, (34 + sp * 0.9) * ts, 0.05);
    this.set(this.subG.gain, this.load * 0.32 * clamp(1 - sp / 90, 0.25, 1), 0.05);
    this.set(this.inverter.frequency, (900 + sp * 55) * ts, 0.03);
    this.set(this.invF.frequency, (1800 + sp * 70) * ts, 0.05);
    this.set(this.invG.gain, this.load * 0.035 * clamp(1 - sp / 50, 0, 1) + regen * 0.03, 0.05);
    const turb = clamp((sp - 55) / 35, 0, 1);
    this.set(this.turbine.frequency, (2200 + sp * 14) * ts, 0.05);
    this.set(this.turbine2.frequency, (3300 + sp * 21) * ts, 0.05);
    this.set(this.turbG.gain, turb * (0.02 + this.load * 0.035), 0.08);

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
    this.set(this.squealG.gain, squeal * 0.22, 0.04);
    this.set(this.squealToneG.gain, squeal * 0.02, 0.04);
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
    this.set(this.scrapeG.gain, scrape * 0.18, 0.03);
    this.set(this.scrapeTone.frequency, 110 + Math.random() * 60, 0.02);
    this.set(this.scrapeF.frequency, 2000 + Math.random() * 1500, 0.02);

    // Cold gas hiss bursts (hover / air control) and rocket roar.
    const t = car.thrust;
    const gas = alive ? Math.max(t.hover, t.air ? 0.55 : 0) : 0;
    this.hissLevel = gas > this.hissLevel ? gas : lerp(this.hissLevel, gas, 1 - Math.exp(-dt * 14));
    this.set(this.hissG.gain, this.hissLevel * 0.2, gas > 0 ? 0.008 : 0.05);
    const roar = alive ? t.rocket : 0;
    this.roarLevel = lerp(this.roarLevel, roar, 1 - Math.exp(-dt * (roar ? 18 : 6)));
    this.set(this.roarG.gain, this.roarLevel * 0.42, 0.02);
    this.set(this.roarF.frequency, (500 + this.roarLevel * 500) * ts, 0.05);
  }
}
