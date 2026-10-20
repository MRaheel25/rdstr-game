// Heat (wanted level 0-5), offences, and the GTA-style escape loop:
// visible -> (line of sight lost) -> EVADE meter fills outside all search cones ->
// COOLDOWN -> heat cleared. Also tracks the BUSTED timer.
import { clamp } from '../util/math.js';

export const HEAT_LEVELS = [
  { stars: 0, threshold: 0 },
  { stars: 1, threshold: 60, units: 2, types: ['cruiser'], ram: false, pit: false, roadblocks: false, spikes: false, heli: false, box: false, drones: 0 },
  { stars: 2, threshold: 300, units: 4, types: ['cruiser', 'interceptor'], ram: true, pit: true, roadblocks: false, spikes: false, heli: false, box: false, drones: 0 },
  { stars: 3, threshold: 800, units: 5, types: ['cruiser', 'interceptor', 'interceptor'], ram: true, pit: true, roadblocks: true, spikes: true, heli: true, box: false, drones: 0 },
  { stars: 4, threshold: 1700, units: 6, types: ['cruiser', 'interceptor', 'swat'], ram: true, pit: true, roadblocks: true, spikes: true, heli: true, box: true, drones: 0 },
  { stars: 5, threshold: 3000, units: 8, types: ['interceptor', 'interceptor', 'swat', 'cruiser'], ram: true, pit: true, roadblocks: true, spikes: true, heli: true, box: true, drones: 2, heavy: true },
];

export class Heat {
  constructor(game) {
    this.game = game;
    this.points = 0;
    this.level = 0;
    this.phase = 'none'; // none | pursuit | evade | cooldown
    this.evade = 0; // 0..1
    this.cooldown = 0; // 0..1
    this.lastSeen = -100;
    this.seen = false;
    this.lastKnown = null;
    this.busted = 0;
    this.locked = 0; // missions can force a minimum heat level
    this.maxLevel = 5;
    this.pursuitTime = 0;
  }

  get config() {
    return HEAT_LEVELS[this.level];
  }

  add(points, reason = '') {
    if (points <= 0) return;
    const before = this.level;
    this.points += points;
    while (this.level < this.maxLevel && this.points >= HEAT_LEVELS[this.level + 1].threshold) this.level++;
    if (this.phase === 'none' && this.level > 0) this.startPursuit();
    if (this.level > before) this.game.events.emit('heatUp', { level: this.level, reason });
    // Being reported again resets the escape progress.
    if (this.phase === 'evade' || this.phase === 'cooldown') {
      this.evade = Math.max(0, this.evade - points / 300);
    }
  }

  // Direct heat (missions, scanners): the player's position has been reported, so the police
  // know where to go for a few seconds before the escape loop can start.
  setLevel(level) {
    const before = this.level;
    this.level = clamp(level, 0, this.maxLevel);
    this.points = Math.max(this.points, HEAT_LEVELS[this.level].threshold);
    if (this.level > 0 && this.phase === 'none') this.startPursuit();
    if (this.level > before) {
      this.lastSeen = Math.max(this.lastSeen, this.game.time + 6);
      this.lastKnown = this.game.player.position.clone();
      this.game.events.emit('heatUp', { level: this.level, reason: 'reported' });
    }
  }

  startPursuit() {
    this.phase = 'pursuit';
    this.evade = 0;
    this.cooldown = 0;
    this.pursuitTime = 0;
    this.lastSeen = this.game.time;
    this.lastKnown = this.game.player.position.clone();
    this.game.events.emit('pursuitStart', { level: this.level });
  }

  clear(reason = 'evaded') {
    const was = this.level;
    this.level = Math.max(0, this.locked);
    this.points = HEAT_LEVELS[this.level].threshold;
    this.phase = this.level > 0 ? 'pursuit' : 'none';
    this.evade = 0;
    this.cooldown = 0;
    this.busted = 0;
    if (was > 0) this.game.events.emit('pursuitEnd', { reason, level: was, time: this.pursuitTime });
  }

  // seen: any police unit/heli/drone currently sees the player.
  // inCone: the player is inside at least one search cone. hidden: under cover.
  update(dt, { seen, inCone, hidden, ghost }) {
    if (this.phase === 'none') return;
    this.pursuitTime += dt;
    if (seen) {
      this.seen = true;
      this.lastSeen = this.game.time;
      if (this.phase !== 'pursuit') {
        this.phase = 'pursuit';
        this.game.events.emit('reacquired', {});
      }
      this.evade = Math.max(0, this.evade - dt * 0.8);
      this.cooldown = 0;
      return;
    }
    this.seen = false;
    const lost = this.game.time - this.lastSeen;
    if (this.phase === 'pursuit' && lost > 2.5) {
      this.phase = 'evade';
      this.game.events.emit('lostVisual', {});
    }
    if (this.phase === 'evade') {
      if (!inCone) {
        // Higher heat takes longer; hiding and Ghost Mode speed it up.
        const rate = (1 / (6 + this.level * 3)) * (hidden ? 1.8 : 1) * (ghost ? 1.7 : 1);
        this.evade = Math.min(1, this.evade + dt * rate);
      } else this.evade = Math.max(0, this.evade - dt * 0.25);
      if (this.evade >= 1) {
        this.phase = 'cooldown';
        this.cooldown = 0;
        this.game.events.emit('cooldown', {});
      }
    } else if (this.phase === 'cooldown') {
      if (inCone) {
        this.phase = 'evade';
        this.evade = 0.6;
      } else {
        this.cooldown = Math.min(1, this.cooldown + dt / (4 + this.level * 1.5) * (ghost ? 1.5 : 1));
        if (this.cooldown >= 1) this.clear('evaded');
      }
    }
  }
}
