// Charge economy: 200 kWh battery with a BMS thermal model, COPV cold-gas pressure,
// Ghost Mode and the EMP lockout. Every boost is a decision.
import { clamp } from '../util/math.js';

export class EnergySystem {
  constructor(upgrades = {}) {
    this.battery = 100; // percent
    this.temp = 32; // deg C
    this.pressure = 100; // COPV percent
    this.ghost = false;
    this.emp = 0; // seconds remaining
    this.thermalLimit = false;
    this.lowPower = false;
    this.ghostSpeedCap = 112 * 0.6;
    this.applyUpgrades(upgrades);
    this.cost = { rocket: 26, hover: 22, hop: 9, air: 7, coldSnap: 18 };
    this.regenAccum = 0;
  }

  applyUpgrades(u) {
    const lvl = (k) => u[k] || 0;
    this.coolingRate = 2.2 + lvl('cooling') * 0.9; // deg/s toward ambient
    this.pressureMax = 100 + lvl('copv') * 25;
    this.pressureRefill = 2.6 + lvl('copv') * 0.8;
    this.thrusterPower = 1 + lvl('thrusters') * 0.12;
  }

  get powerScale() {
    let s = 1;
    if (this.thermalLimit) s *= 0.7;
    if (this.battery <= 0.5) s *= 0.18;
    else if (this.battery < 8) s *= 0.55;
    return s;
  }

  get pressurePct() {
    return (this.pressure / this.pressureMax) * 100;
  }

  usePressure(amount) {
    if (this.emp > 0) return false;
    if (this.pressure < amount) return false;
    this.pressure -= amount;
    return true;
  }

  refillPressure() {
    this.pressure = this.pressureMax;
  }

  heat(deg) {
    this.temp += deg;
  }

  charge(pct) {
    this.battery = clamp(this.battery + pct, 0, 100);
  }

  // Called once per fixed step with the vehicle's current state.
  update(dt, v) {
    const throttle = v.controls.throttle;
    const speed = v.speed;
    // Drain proportional to traction power (scaled up for gameplay; a full battery
    // lasts roughly 10 minutes of flat-out driving).
    const powerFrac = throttle * clamp(speed / 30, 0.15, 1);
    let drain = powerFrac * 0.11 + (speed > 80 ? (speed - 80) * 0.004 : 0);
    if (v.thrust.rocket) drain += 0.65;
    if (this.ghost) drain += 0.35;
    this.battery = clamp(this.battery - drain * dt, 0, 100);

    // Regenerative braking, drifting and near misses recharge.
    if ((v.controls.brake > 0.1 || throttle < 0.05) && v.fwdSpeed > 4 && v.groundedCount >= 2) {
      this.battery = clamp(this.battery + (v.controls.brake > 0.1 ? 0.35 : 0.08) * dt, 0, 100);
    }
    if (v.drifting) this.battery = clamp(this.battery + 0.45 * dt, 0, 100);

    // Thermal model.
    const load = powerFrac * 1.4 + (speed > 85 ? (speed - 85) * 0.08 : 0);
    this.temp += load * dt;
    const ambient = 30;
    let cool = this.coolingRate * (this.ghost ? 2.4 : 1) * (speed < 25 ? 1.6 : 1);
    this.temp -= Math.min(this.temp - ambient, cool * dt * ((this.temp - ambient) / 40 + 0.15));
    this.temp = clamp(this.temp, ambient, 115);
    if (this.temp > 90) this.thermalLimit = true;
    else if (this.temp < 80) this.thermalLimit = false;
    this.lowPower = this.battery < 8;

    // COPV slowly refills from the onboard compressor.
    if (!v.thrust.rocket && !v.thrust.hover) {
      this.pressure = Math.min(this.pressureMax, this.pressure + this.pressureRefill * dt);
    }
    if (this.emp > 0) this.emp = Math.max(0, this.emp - dt);
    if (this.ghost && this.battery <= 0.5) this.ghost = false;
  }
}
