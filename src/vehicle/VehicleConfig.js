// Physical specifications for every drivable vehicle type.
// Coordinates are body-local: +X right, +Y up, -Z forward. Body origin sits ~0.55 m above ground.

export const ROADSTER = {
  id: 'roadster',
  mass: 1900,
  com: [0, -0.16, 0.1],
  inertia: [3300, 3900, 1050], // pitch (x), yaw (y), roll (z)
  chassis: [
    { half: [0.98, 0.27, 2.12], offset: [0, -0.15, 0] },
    { half: [0.7, 0.2, 1.05], offset: [0, 0.32, 0.25] },
  ],
  wheels: [
    { x: -0.85, z: -1.38, front: true, radius: 0.355 },
    { x: 0.85, z: -1.38, front: true, radius: 0.355 },
    { x: -0.87, z: 1.32, front: false, radius: 0.37 },
    { x: 0.87, z: 1.32, front: false, radius: 0.37 },
  ],
  mountY: 0.0,
  suspension: { rest: 0.28, k: [56000, 60000], c: [5200, 5600], antiRoll: [26000, 19000], bumpK: 260000, maxForce: 60000 },
  tire: { mu: 1.5, alphaPeak: 0.14, rollRes: 0.012 },
  drive: { maxForce: 28500, power: 920000, reverseSpeed: 17, brakeForce: 33000, brakeFront: 0.6, regenForce: 2600 },
  aero: { dragK: 0.56, downforceK: 1.45, downforceFront: 0.45 },
  steer: { max: 0.6, speedRef: 16, rate: 3.2, returnRate: 5 },
  thrusters: true,
  hp: 100,
};

export const POLICE_CRUISER = {
  id: 'cruiser',
  mass: 1850,
  com: [0, -0.12, 0.05],
  inertia: [3400, 3800, 1100],
  chassis: [
    { half: [0.96, 0.32, 2.4], offset: [0, -0.08, 0] },
    { half: [0.8, 0.26, 1.15], offset: [0, 0.48, 0.15] },
  ],
  wheels: [
    { x: -0.82, z: -1.45, front: true, radius: 0.36 },
    { x: 0.82, z: -1.45, front: true, radius: 0.36 },
    { x: -0.82, z: 1.4, front: false, radius: 0.36 },
    { x: 0.82, z: 1.4, front: false, radius: 0.36 },
  ],
  mountY: 0.05,
  suspension: { rest: 0.3, k: [48000, 50000], c: [4800, 5000], antiRoll: [22000, 16000], bumpK: 220000, maxForce: 55000 },
  tire: { mu: 1.35, alphaPeak: 0.15, rollRes: 0.013 },
  drive: { maxForce: 19000, power: 420000, reverseSpeed: 14, brakeForce: 28000, brakeFront: 0.6, regenForce: 1500 },
  aero: { dragK: 0.62, downforceK: 0.9, downforceFront: 0.45 },
  steer: { max: 0.62, speedRef: 15, rate: 3.5, returnRate: 5 },
  thrusters: false,
  hp: 100,
};

export const POLICE_INTERCEPTOR = {
  ...POLICE_CRUISER,
  id: 'interceptor',
  mass: 1750,
  chassis: [
    { half: [0.97, 0.28, 2.3], offset: [0, -0.12, 0] },
    { half: [0.74, 0.21, 1.0], offset: [0, 0.34, 0.2] },
  ],
  mountY: 0.0,
  tire: { mu: 1.45, alphaPeak: 0.14, rollRes: 0.012 },
  drive: { maxForce: 24000, power: 720000, reverseSpeed: 15, brakeForce: 31000, brakeFront: 0.6, regenForce: 1500 },
  aero: { dragK: 0.58, downforceK: 1.3, downforceFront: 0.45 },
  hp: 90,
};

export const SWAT_TRUCK = {
  id: 'swat',
  mass: 6200,
  com: [0, -0.05, 0],
  inertia: [16000, 17000, 6000],
  chassis: [
    { half: [1.2, 0.55, 3.1], offset: [0, 0.15, 0] },
    { half: [1.15, 0.5, 2.0], offset: [0, 1.15, 0.8] },
  ],
  wheels: [
    { x: -1.0, z: -2.05, front: true, radius: 0.48 },
    { x: 1.0, z: -2.05, front: true, radius: 0.48 },
    { x: -1.0, z: 1.95, front: false, radius: 0.48 },
    { x: 1.0, z: 1.95, front: false, radius: 0.48 },
  ],
  mountY: 0.0,
  suspension: { rest: 0.34, k: [150000, 160000], c: [17000, 18000], antiRoll: [90000, 80000], bumpK: 900000, maxForce: 220000 },
  tire: { mu: 1.15, alphaPeak: 0.16, rollRes: 0.016 },
  drive: { maxForce: 52000, power: 900000, reverseSpeed: 10, brakeForce: 80000, brakeFront: 0.6, regenForce: 3000 },
  aero: { dragK: 1.4, downforceK: 0, downforceFront: 0.5 },
  steer: { max: 0.55, speedRef: 14, rate: 2.6, returnRate: 4 },
  thrusters: false,
  hp: 260,
};

export const CIVILIAN = {
  ...POLICE_CRUISER,
  id: 'civilian',
  drive: { maxForce: 12000, power: 200000, reverseSpeed: 10, brakeForce: 22000, brakeFront: 0.6, regenForce: 1200 },
  hp: 60,
};

// Dynamic Handling Modes.
export const MODES = {
  track: {
    id: 'track', label: 'TRACK',
    grip: [1.0, 1.0], tc: true, frontShare: 0.42, steerMul: 1.0,
    falloff: [1.62, 1.6], alphaPeakMul: [1, 1], countersteer: 0.0,
    airRate: 2.6, airAccel: 6.5, hover: 1.0, thrusterLock: false, torqueVector: 0.18,
  },
  drift: {
    id: 'drift', label: 'DRIFT',
    grip: [1.02, 0.78], tc: false, frontShare: 0.15, steerMul: 1.3,
    falloff: [1.55, 1.38], alphaPeakMul: [1.05, 0.78], countersteer: 0.6,
    airRate: 2.6, airAccel: 6.5, hover: 1.0, thrusterLock: false, torqueVector: 0.3,
  },
  flight: {
    id: 'flight', label: 'FLIGHT',
    grip: [0.96, 0.96], tc: true, frontShare: 0.4, steerMul: 1.0,
    falloff: [1.6, 1.58], alphaPeakMul: [1, 1], countersteer: 0.0,
    airRate: 4.6, airAccel: 15, hover: 1.28, thrusterLock: false, torqueVector: 0.18,
  },
};
