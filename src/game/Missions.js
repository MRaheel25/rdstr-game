// The ten VOLT story missions (two of each type: Getaway, Data Run, Bounty, Sky Gap, Ghost
// Protocol). Each mission is a list of stages; a stage sets the objective text and marker,
// and reports when it is done. Mission-wide rules (time limit, max heat) are checked by the
// runner in Activities.js.
import * as THREE from 'three';

export const CONTACT = 'CIPHER';

// ---- stage helpers -------------------------------------------------------------------------
// Reach a point. opts: radius, maxSpeed (must slow down inside), heat0 (must have lost the
// police), label (objective), color.
export function reach(pos, label, { radius = 10, maxSpeed = null, heat0 = false, color = 0xffd23f, onEnter = null, hold = 0 } = {}) {
  return {
    label,
    enter(ctx) {
      ctx.target(pos, { color, label: null });
      this.held = 0;
      if (onEnter) onEnter(ctx);
    },
    update(ctx, dt) {
      const p = ctx.player.position;
      const inside = Math.hypot(p.x - pos.x, p.z - pos.z) < radius && Math.abs(p.y - ctx.groundY(pos)) < 6;
      if (!inside) {
        this.held = 0;
        ctx.objectiveNote(null);
        return false;
      }
      if (heat0 && ctx.heat.level > 0) {
        ctx.objectiveNote('LOSE THE POLICE FIRST');
        return false;
      }
      if (maxSpeed != null && ctx.player.speed > maxSpeed) {
        ctx.objectiveNote('STOP IN THE MARKER');
        return false;
      }
      if (hold > 0) {
        this.held += dt;
        ctx.objectiveNote(`${label.toUpperCase()}… ${Math.max(0, hold - this.held).toFixed(1)}s`);
        if (this.held < hold) return false;
      }
      ctx.objectiveNote(null);
      return true;
    },
  };
}

export function evade(label = 'Lose the police') {
  return {
    label,
    enter(ctx) {
      ctx.clearTarget();
    },
    update(ctx) {
      return ctx.heat.phase === 'none';
    },
  };
}

// Pass checkpoints in order.
export function checkpoints(points, label = 'Reach the checkpoints', color = 0x40e8ff) {
  return {
    label,
    enter(ctx) {
      this.i = 0;
      this.show(ctx);
    },
    show(ctx) {
      const next = points[this.i + 1];
      ctx.target(points[this.i], { color, kind: 'gate', next: next || null });
      ctx.objectiveCount(this.i, points.length);
    },
    update(ctx) {
      const p = ctx.player.position;
      const c = points[this.i];
      if (Math.hypot(p.x - c.x, p.z - c.z) < 14 && Math.abs(p.y - ctx.groundY(c)) < 8) {
        this.i++;
        ctx.sound('checkpoint');
        if (ctx.addTime) ctx.addTime(c.bonus || 0);
        if (this.i >= points.length) return true;
        this.show(ctx);
      }
      return false;
    },
  };
}

// Take down N police units (optionally only one type).
export function takedowns(n, type = null, label = null) {
  return {
    label: label || `Take down ${type ? type + 's' : 'police units'}`,
    enter(ctx) {
      this.count = 0;
      ctx.clearTarget();
      ctx.objectiveCount(0, n);
      this.off = ctx.on('takedown', (e) => {
        if (type && e.type !== type) return;
        this.count++;
        ctx.objectiveCount(this.count, n);
      });
    },
    update() {
      return this.count >= n;
    },
    exit() {
      if (this.off) this.off();
    },
  };
}

// Land named stunt jumps in any order.
export function jumps(names, label = 'Land the jumps') {
  return {
    label,
    enter(ctx) {
      this.done = new Set();
      this.list = names.map((name) => ({ name, jump: ctx.jumps.byName(name)[0] }));
      this.refresh(ctx);
      this.off = ctx.on('jumpLanded', (e) => {
        if (names.includes(e.jump.name) && !this.done.has(e.jump.name)) {
          this.done.add(e.jump.name);
          ctx.sound('checkpoint');
          ctx.banner(e.jump.name.toUpperCase(), `${e.distance.toFixed(0)} m`);
          this.refresh(ctx);
        }
      });
    },
    refresh(ctx) {
      ctx.clearMarkers();
      for (const it of this.list) {
        if (this.done.has(it.name) || !it.jump) continue;
        ctx.marker(it.jump.takeoff, { color: 0x6cf2ff, label: it.name.toUpperCase() });
      }
      const left = this.list.filter((it) => !this.done.has(it.name));
      if (left[0] && left[0].jump) ctx.mapTarget(left[0].jump.takeoff);
      ctx.objectiveList(this.list.map((it) => ({ text: it.name, done: this.done.has(it.name) })));
    },
    update() {
      return this.done.size >= names.length;
    },
    exit() {
      if (this.off) this.off();
    },
  };
}

// Run a callback once (radio lines, heat changes) and continue.
export function action(fn) {
  return {
    label: null,
    enter(ctx) {
      fn(ctx);
    },
    update() {
      return true;
    },
  };
}

// ---- missions ------------------------------------------------------------------------------
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const MISSIONS = [
  {
    id: 'clean-exit', type: 'getaway', name: 'Clean Exit', district: 'downtown', rep: 0,
    start: V(-116, 0, 300), yaw: Math.PI,
    brief: 'VOLT. A crew just cleaned out the Meridian vault on Market St. They need a driver who can disappear. Pick them up, shake the heat, and bring them to the Pier Rd underpass.',
    summary: 'Pick up the crew, escape a Heat 3 pursuit, reach the safehouse.',
    reward: { cash: 3000, rep: 250 },
    stars: (s) => (s.time <= 170 ? 3 : s.time <= 270 ? 2 : 1),
    starText: ['Complete', 'Under 4:30', 'Under 2:50'],
    stages: () => [
      reach(V(244, 0, -300), 'Pick up the crew at Meridian Bank', { radius: 9, maxSpeed: 6, hold: 2.5 }),
      action((ctx) => {
        ctx.heat.setLevel(3);
        ctx.say('Silent alarm at Meridian Bank. Suspects leaving in a white Roadster!', 'DISPATCH');
        ctx.say('They tripped the alarm on the way out. Lose them, VOLT.');
      }),
      evade('Lose the police'),
      reach(V(-600, 0, 124), 'Reach the safehouse under the Ring', { radius: 11, heat0: true, maxSpeed: 12 }),
    ],
    outro: 'Crew delivered. Not bad for a first job. I will be in touch.',
  },
  {
    id: 'cold-storage', type: 'datarun', name: 'Cold Storage', district: 'downtown', rep: 0,
    start: V(4, 0, 420), yaw: 0,
    brief: 'A courier dropped a cold-storage drive in Downtown. Run it through five relay points before the encryption wipes it. Ninety seconds, no detours.',
    summary: 'Hit 5 checkpoints across Downtown before the timer runs out.',
    reward: { cash: 2500, rep: 200 },
    timeLimit: 90,
    stars: (s) => (s.timeLeft >= 25 ? 3 : s.timeLeft >= 12 ? 2 : 1),
    starText: ['Deliver in time', '12 s to spare', '25 s to spare'],
    stages: () => [
      action((ctx) => ctx.say('The drive is warming up. Go.')),
      checkpoints([V(0, 0, 240), V(240, 0, 240), V(240, 0, -120), V(0, 0, -120), V(-240, 0, -360)], 'Deliver the drive: relay points'),
    ],
    outro: 'Upload clean. The client sends regards and money.',
  },
  {
    id: 'black-and-white', type: 'bounty', name: 'Black & White', district: 'downtown', rep: 150,
    start: V(244, 0, 300), yaw: 0,
    brief: 'Someone in HBPD has been leaning on our people. Send a message: wreck four of their units. Walls, water, each other. Make it loud.',
    summary: 'Take down 4 police units within 4 minutes.',
    reward: { cash: 3500, rep: 300 },
    timeLimit: 240,
    lockHeat: 2,
    stars: (s) => (s.time <= 120 ? 3 : s.time <= 180 ? 2 : 1),
    starText: ['Complete', 'Under 3:00', 'Under 2:00'],
    stages: () => [
      action((ctx) => {
        ctx.heat.setLevel(2);
        ctx.say('Shots of you are all over the police scanners. Here they come.');
      }),
      takedowns(4, null, 'Take down police units'),
    ],
    outro: 'Message received, loud and clear.',
  },
  {
    id: 'silent-running', type: 'ghost', name: 'Silent Running', district: 'downtown', rep: 300,
    start: V(364, 0, 420), yaw: Math.PI / 2,
    brief: 'Package for a client who values discretion. Cross Downtown to the Waterfront drop without drawing more than a passing glance. Patrols are doubled tonight. Ghost Mode is your friend.',
    summary: 'Reach the Waterfront drop. Never go above Heat 1.',
    reward: { cash: 3000, rep: 300 },
    maxHeat: 1,
    patrols: [V(240, 0, 300), V(0, 0, 200), V(-120, 0, 0), V(-360, 0, -120), V(120, 0, -240), V(-480, 0, -300)],
    stars: (s) => (s.maxHeatSeen === 0 && s.time <= 120 ? 3 : s.time <= 160 ? 2 : 1),
    starText: ['Deliver at Heat 1 or lower', 'Under 2:40', 'Unseen and under 2:00'],
    stages: () => [reach(V(-646, 0, -420), 'Reach the Waterfront drop', { radius: 10, maxSpeed: 10, color: 0x9ad8ff })],
    outro: 'Nobody saw a thing. That is the job.',
  },
  {
    id: 'harbor-heist', type: 'getaway', name: 'Harbor Heist', district: 'harbor', rep: 400,
    start: V(-300, 0, 684), yaw: Math.PI / 2,
    brief: 'A shipment of prototype cells is sitting on Pier 1 with a crew already inside the fence. When they come out, HBPD will be right behind them, and they will be serious. Get the crew to the Downtown garage.',
    summary: 'Pick up the crew on Pier 1, survive Heat 4, reach the garage.',
    reward: { cash: 5000, rep: 400 },
    stars: (s) => (s.time <= 200 ? 3 : s.time <= 300 ? 2 : 1),
    starText: ['Complete', 'Under 5:00', 'Under 3:20'],
    stages: () => [
      reach(V(-356, 0, 900), 'Pick up the crew on Pier 1', { radius: 9, maxSpeed: 6, hold: 2.5 }),
      action((ctx) => {
        ctx.heat.setLevel(4);
        ctx.say('All units, break-in at Pier 1. Suspects armed and mobile. SWAT is rolling.', 'DISPATCH');
      }),
      evade('Lose the police (Heat 4)'),
      reach(V(124, 0, -180), 'Reach the Downtown garage', { radius: 11, heat0: true, maxSpeed: 12 }),
    ],
    outro: 'The cells are worth more than the harbor. Good work.',
  },
  {
    id: 'uplink', type: 'datarun', name: 'Uplink', district: 'highway', rep: 600,
    start: V(124, 0, 560), yaw: Math.PI,
    brief: 'The uplink only opens for seventy seconds. Take the South On-Ramp and run the Ring clockwise through every relay. The Roadster does 250 on a straight. Use it.',
    summary: 'Run the Highway Ring through 6 relays in 70 seconds.',
    reward: { cash: 4500, rep: 400 },
    timeLimit: 70,
    stars: (s) => (s.timeLeft >= 18 ? 3 : s.timeLeft >= 8 ? 2 : 1),
    starText: ['Finish in time', '8 s to spare', '18 s to spare'],
    stages: () => [
      action((ctx) => {
        ctx.heat.setLevel(1);
        ctx.say('Speed trap cameras on the Ring are live. Expect company.');
      }),
      checkpoints([V(-300, 12, 600), V(-600, 12, 250), V(-600, 12, -250), V(-250, 12, -600), V(250, 12, -600), V(600, 12, -250)], 'Hit the Ring relays'),
    ],
    outro: 'Upload complete. Somewhere a server farm is very unhappy.',
  },
  {
    id: 'interceptor-hunt', type: 'bounty', name: 'Interceptor Hunt', district: 'harbor', rep: 800,
    start: V(4, 0, 700), yaw: Math.PI / 2,
    brief: 'HBPD rolled out new interceptors and they are making our runners nervous. Bring three of them down. Use the docks: water and containers do not care how much horsepower you have.',
    summary: 'Take down 3 interceptors within 5 minutes.',
    reward: { cash: 5500, rep: 450 },
    timeLimit: 300,
    lockHeat: 3,
    policeTypes: ['interceptor', 'interceptor', 'cruiser'],
    stars: (s) => (s.time <= 150 ? 3 : s.time <= 220 ? 2 : 1),
    starText: ['Complete', 'Under 3:40', 'Under 2:30'],
    stages: () => [
      action((ctx) => {
        ctx.heat.setLevel(3);
        ctx.say('Interceptor squad, you are cleared to engage the Roadster.', 'DISPATCH');
      }),
      takedowns(3, 'interceptor', 'Take down interceptors'),
    ],
    outro: 'Three interceptors in the drink. They will think twice.',
  },
  {
    id: 'leap-of-faith', type: 'skygap', name: 'Leap of Faith', district: 'construction', rep: 1000,
    start: V(764, 0, 100), yaw: 0,
    brief: 'A film crew is paying for footage of the impossible. Clear the gap on the Broken Bridge and the unfinished Highway Gap spur. Hover Jets and air control will keep the nose straight.',
    summary: 'Land the Broken Bridge and the Highway Gap.',
    reward: { cash: 5000, rep: 450 },
    timeLimit: 300,
    stars: (s) => (s.time <= 120 ? 3 : s.time <= 200 ? 2 : 1),
    starText: ['Land both jumps', 'Under 3:20', 'Under 2:00'],
    stages: () => [jumps(['Broken Bridge', 'Highway Gap'])],
    outro: 'The footage is unreal. Literally: they think it is CGI.',
  },
  {
    id: 'steel-garden', type: 'skygap', name: 'Steel Garden', district: 'harbor', rep: 1300,
    start: V(364, 0, 700), yaw: Math.PI / 2,
    brief: 'The same film crew wants a sequel. Climb the container stack and fly it, launch off the car carrier, then drop off the Downtown garage roof.',
    summary: 'Land the Container Stack, Car Carrier and Garage Roof jumps.',
    reward: { cash: 6000, rep: 500 },
    timeLimit: 360,
    stars: (s) => (s.time <= 200 ? 3 : s.time <= 280 ? 2 : 1),
    starText: ['Land all three', 'Under 4:40', 'Under 3:20'],
    stages: () => [jumps(['Container Stack', 'Car Carrier', 'Garage Roof'])],
    outro: 'That is a wrap. Nobody believes you are real anymore.',
  },
  {
    id: 'blackout', type: 'ghost', name: 'Blackout', district: 'canyon', rep: 1800,
    start: V(4, 0, -640), yaw: 0,
    brief: 'Last job, VOLT. The Summit relay holds everything HBPD has on us. Police scanners line Canyon Road: pass them dark, with Ghost Mode on, or every unit in the city hears about it. Reach the lookout. Do not go above Heat 1.',
    summary: 'Climb Canyon Road past 3 scanners in Ghost Mode. Never exceed Heat 1.',
    reward: { cash: 10000, rep: 800 },
    maxHeat: 1,
    canyonPatrols: [0.3, 0.55, 0.8],
    stars: (s) => (s.maxHeatSeen === 0 && s.time <= 130 ? 3 : s.time <= 180 ? 2 : 1),
    starText: ['Reach the lookout', 'Under 3:00', 'Unseen and under 2:10'],
    stages: () => [scanners([0.25, 0.5, 0.75]), reach(V(-418, 104, -1279), 'Reach the Summit lookout', { radius: 14, maxSpeed: 14, color: 0x9ad8ff })],
    outro: 'Files wiped. HBPD just lost three years of work. Go dark, VOLT. You earned it.',
  },
];

// Police scanners along the canyon: pass each in Ghost Mode, or heat jumps to 2.
function scanners(fractions) {
  return {
    label: 'Pass the scanners in Ghost Mode',
    enter(ctx) {
      const up = ctx.world.gen.canyon.up;
      this.points = fractions.map((f) => up[Math.floor(f * (up.length - 1))].clone());
      this.passed = 0;
      this.marks = this.points.map((p) => ctx.marker(p, { color: 0xff3048, label: 'SCANNER' }));
      ctx.mapTarget(this.points[0]);
      ctx.objectiveCount(0, this.points.length);
    },
    update(ctx) {
      const p = ctx.player.position;
      const c = this.points[this.passed];
      if (Math.hypot(p.x - c.x, p.z - c.z) < 16) {
        if (!ctx.player.energy.ghost) {
          ctx.say('Scanner hit on Canyon Road. All units, the Roadster is on the mountain!', 'DISPATCH');
          ctx.heat.setLevel(2);
        }
        this.marks[this.passed].remove();
        this.passed++;
        ctx.sound('checkpoint');
        ctx.objectiveCount(this.passed, this.points.length);
        if (this.passed >= this.points.length) return true;
        ctx.mapTarget(this.points[this.passed]);
      }
      return false;
    },
  };
}
