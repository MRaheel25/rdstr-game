// Career save (localStorage): cash, rep, unlocked districts, mission stars, race best times,
// garage upgrades and paints, lifetime stats. Upgrades are applied to the player car here.
import { PAINTS } from '../vehicle/models/CarMaterials.js';

const KEY = 'rdstr.save.v1';

// Rep thresholds that open districts (and the activities that live there).
export const DISTRICT_UNLOCKS = [
  { id: 'downtown', name: 'DOWNTOWN CORE', rep: 0 },
  { id: 'highway', name: 'HIGHWAY RING', rep: 0 },
  { id: 'harbor', name: 'HARBOR & DOCKS', rep: 400 },
  { id: 'construction', name: 'CONSTRUCTION ZONE', rep: 1000 },
  { id: 'canyon', name: 'HILLSIDE CANYON', rep: 1800 },
];

// Garage upgrades: 3 levels each, cost per level.
export const UPGRADES = {
  cooling: { name: 'Battery Cooling', desc: 'Lower heat build-up, faster cool-down. Delays the 90 °C thermal limit.', costs: [3000, 7000, 14000] },
  copv: { name: 'COPV Tank', desc: 'Larger cold-gas tank: more Hover Jets, air control and Cold Snaps.', costs: [3500, 8000, 15000] },
  thrusters: { name: 'Thruster Power', desc: 'Stronger Rear Rockets and Hover Jets.', costs: [4000, 9000, 18000] },
  armor: { name: 'Chassis Armor', desc: 'Reinforced crash structure: less damage from impacts and rams.', costs: [3000, 7500, 15000] },
  grip: { name: 'Tire Compound', desc: 'Stickier tires: more cornering and braking grip.', costs: [2500, 6000, 12000] },
};

export const PAINT_COSTS = {
  pearlWhite: 0, redMulti: 2000, midnightSilver: 2000, matteBlack: 3500, deepBlue: 2500,
  neonCyan: 6000, neonMagenta: 6000, neonLime: 6000,
};

function defaults() {
  return {
    version: 1,
    cash: 2500,
    rep: 0,
    missions: {}, // id -> { done, stars, best }
    races: {}, // id -> { done, stars, bestTime, bestLap, bestScore }
    upgrades: { cooling: 0, copv: 0, thrusters: 0, armor: 0, grip: 0 },
    paints: ['pearlWhite'],
    paint: 'pearlWhite',
    districts: ['downtown', 'highway'],
    stats: { takedowns: 0, evades: 0, busts: 0, bestCombo: 0, topSpeed: 0, styleTotal: 0, distance: 0 },
    lastActivity: null,
  };
}

export class Progress {
  constructor() {
    this.data = defaults();
    this.listeners = new Set();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const d = defaults();
        this.data = { ...d, ...saved, upgrades: { ...d.upgrades, ...(saved.upgrades || {}) }, stats: { ...d.stats, ...(saved.stats || {}) } };
      }
    } catch (e) {
      console.info('Progress: starting a new career', e);
    }
    this.hasSave = !!this.data.lastActivity || this.data.rep > 0;
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) {
      console.info('Progress: could not save', e);
    }
    for (const fn of this.listeners) fn(this.data);
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  reset() {
    this.data = defaults();
    this.save();
  }

  get cash() {
    return this.data.cash;
  }

  get rep() {
    return this.data.rep;
  }

  // Adds cash/rep; returns newly unlocked districts.
  reward(cash, rep) {
    this.data.cash += Math.round(cash);
    this.data.rep += Math.round(rep);
    const unlocked = [];
    for (const d of DISTRICT_UNLOCKS) {
      if (this.data.rep >= d.rep && !this.data.districts.includes(d.id)) {
        this.data.districts.push(d.id);
        unlocked.push(d);
      }
    }
    this.save();
    return unlocked;
  }

  districtOpen(id) {
    return this.data.districts.includes(id);
  }

  recordMission(id, stars, best) {
    const m = this.data.missions[id] || { done: false, stars: 0, best: null };
    const first = !m.done;
    m.done = true;
    m.stars = Math.max(m.stars, stars);
    if (best != null && (m.best == null || best < m.best)) m.best = best;
    this.data.missions[id] = m;
    this.data.lastActivity = id;
    this.save();
    return first;
  }

  // Returns which records were beaten.
  recordRace(id, { time, lap, score, stars, won }) {
    const r = this.data.races[id] || { done: false, stars: 0, bestTime: null, bestLap: null, bestScore: null };
    const out = { time: false, lap: false, score: false, first: !r.done && won };
    if (won) r.done = true;
    r.stars = Math.max(r.stars, stars);
    if (time != null && (r.bestTime == null || time < r.bestTime)) {
      r.bestTime = time;
      out.time = true;
    }
    if (lap != null && (r.bestLap == null || lap < r.bestLap)) {
      r.bestLap = lap;
      out.lap = true;
    }
    if (score != null && (r.bestScore == null || score > r.bestScore)) {
      r.bestScore = score;
      out.score = true;
    }
    this.data.races[id] = r;
    this.data.lastActivity = id;
    this.save();
    return out;
  }

  stat(key, value, mode = 'add') {
    const s = this.data.stats;
    if (mode === 'max') s[key] = Math.max(s[key] || 0, value);
    else s[key] = (s[key] || 0) + value;
  }

  upgradeCost(key) {
    const lvl = this.data.upgrades[key];
    return lvl >= 3 ? null : UPGRADES[key].costs[lvl];
  }

  buyUpgrade(key) {
    const cost = this.upgradeCost(key);
    if (cost == null || this.data.cash < cost) return false;
    this.data.cash -= cost;
    this.data.upgrades[key]++;
    this.save();
    return true;
  }

  buyPaint(id) {
    if (this.data.paints.includes(id)) return true;
    const cost = PAINT_COSTS[id] ?? 5000;
    if (this.data.cash < cost) return false;
    this.data.cash -= cost;
    this.data.paints.push(id);
    this.save();
    return true;
  }

  paintUnlocked(id) {
    return this.data.paints.includes(id);
  }

  setPaint(id) {
    if (!this.data.paints.includes(id) || !PAINTS[id]) return false;
    this.data.paint = id;
    this.save();
    return true;
  }

  // Apply garage upgrades to the player's car and energy system.
  apply(vehicle) {
    const u = this.data.upgrades;
    vehicle.armor = 1 - u.armor * 0.15;
    vehicle.gripMul = 1 + u.grip * 0.05;
    if (vehicle.energy) vehicle.energy.applyUpgrades({ cooling: u.cooling, copv: u.copv, thrusters: u.thrusters });
  }
}
