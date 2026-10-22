// Player settings: quality presets, audio volumes, key bindings and visual options.
// Persisted to localStorage so they survive reloads.
const STORAGE_KEY = 'rdstr.settings.v1';

export const QUALITY_PRESETS = {
  low: {
    label: 'Low', pixelRatio: 0.75, shadowMapSize: 1024, shadows: true, drawDistance: 520,
    particles: 0.45, lampLights: 0, policeLights: 2, bloom: true, bloomResolution: 0.35,
    smaa: false, motionBlur: false, rainDensity: 0.4, buildingLod: 0.6, propDistance: 160,
  },
  medium: {
    label: 'Medium', pixelRatio: 1, shadowMapSize: 2048, shadows: true, drawDistance: 760,
    particles: 0.75, lampLights: 3, policeLights: 4, bloom: true, bloomResolution: 0.5,
    smaa: true, motionBlur: true, rainDensity: 0.7, buildingLod: 0.8, propDistance: 240,
  },
  high: {
    label: 'High', pixelRatio: 1.5, shadowMapSize: 2048, shadows: true, drawDistance: 1050,
    particles: 1, lampLights: 5, policeLights: 4, bloom: true, bloomResolution: 0.5,
    smaa: true, motionBlur: true, rainDensity: 1, buildingLod: 1, propDistance: 320,
  },
  ultra: {
    label: 'Ultra', pixelRatio: 2, shadowMapSize: 4096, shadows: true, drawDistance: 1500,
    particles: 1.3, lampLights: 6, policeLights: 4, bloom: true, bloomResolution: 0.75,
    smaa: true, motionBlur: true, rainDensity: 1.3, buildingLod: 1.2, propDistance: 420,
  },
};
export const QUALITY_ORDER = ['low', 'medium', 'high', 'ultra'];

export const DEFAULT_BINDINGS = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  rocket: ['ShiftLeft', 'ShiftRight'],
  hover: ['Space'],
  handbrake: ['ControlLeft', 'ControlRight'],
  rollLeft: ['KeyQ'],
  rollRight: ['KeyE'],
  ghost: ['KeyF'],
  modeTrack: ['Digit1'],
  modeDrift: ['Digit2'],
  modeFlight: ['Digit3'],
  camera: ['KeyC'],
  doors: ['KeyG'],
  reset: ['KeyR'],
  photo: ['KeyP'],
  pause: ['Escape'],
  help: ['KeyH'],
  xray: ['KeyX'],
  map: ['KeyM'],
  fps: ['F8'],
  colliders: ['F9'],
};

export const ACTION_LABELS = {
  throttle: 'Throttle', brake: 'Brake / Reverse', left: 'Steer Left', right: 'Steer Right',
  rocket: 'Rear Rockets', hover: 'Hover Jets', handbrake: 'Handbrake',
  rollLeft: 'Air Roll Left', rollRight: 'Air Roll Right', ghost: 'Ghost Mode',
  modeTrack: 'Mode: Track', modeDrift: 'Mode: Drift', modeFlight: 'Mode: Flight',
  camera: 'Camera', doors: 'Doors', reset: 'Reset Car', photo: 'Photo Mode', pause: 'Pause',
  help: 'Show / Hide Controls', xray: 'X-Ray View', map: 'Map', fps: 'FPS Counter', colliders: 'Collider Debug',
};

const DEFAULTS = {
  quality: 'medium',
  autoQuality: true,
  masterVolume: 0.8,
  musicVolume: 0.55,
  sfxVolume: 0.9,
  // V3 sound options.
  engineVolume: 0.8,
  uiVolume: 0.7,
  musicOn: true,
  musicStyle: 'synthwave', // synthwave | chill | dnb
  units: 'mph',
  rain: true,
  timeOfDay: 'night', // night | dusk | rain
  cameraShake: 1,
  motionBlur: true,
  particleAmount: 1, // multiplier on the quality preset's particle budget
  resScale: 1, // render resolution scale (0.5 - 1)
  bindings: DEFAULT_BINDINGS,
  padBindings: null, // filled from DEFAULT_PAD_BINDINGS
  // V2: time of day / weather picked before play.
  tod: 'noon', // morning | noon | golden | sunset | night
  weather: 'clear', // clear | cloudy | rain | fog | storm
  // V2 HUD layout (Settings > HUD).
  hud: { speed: true, battery: true, health: true, thrusters: true, minimap: true, score: true, position: 'bottom' },
  flightAssist: true, // Assisted Flight (true) / Pro Flight (false)
};

// Gamepad (standard mapping) button index -> action. Rebindable in Settings > Controls.
export const DEFAULT_PAD_BINDINGS = {
  hover: 0, handbrake: 1, rocket: 2, ghost: 3, rollLeft: 4, rollRight: 5, reset: 8, pause: 9,
  doors: 10, camera: 11, modeDrift: 12, xray: 13, modeTrack: 14, modeFlight: 15,
};
export const PAD_BUTTON_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'VIEW', 'MENU', 'LS', 'RS', 'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT', 'HOME'];

export class Settings {
  constructor() {
    this.data = structuredClone(DEFAULTS);
    this.listeners = new Set();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        Object.assign(this.data, saved);
        this.data.bindings = { ...structuredClone(DEFAULT_BINDINGS), ...(saved.bindings || {}) };
        this.data.hud = { ...DEFAULTS.hud, ...(saved.hud || {}) };
      }
    } catch (e) {
      console.info('Settings: using defaults', e);
    }
    this.data.padBindings = { ...DEFAULT_PAD_BINDINGS, ...(this.data.padBindings || {}) };
  }
  get(key) {
    return this.data[key];
  }
  set(key, value) {
    this.data[key] = value;
    this.save();
    for (const fn of this.listeners) fn(key, value);
  }
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  get preset() {
    return QUALITY_PRESETS[this.data.quality] || QUALITY_PRESETS.medium;
  }
  resetBindings() {
    this.set('bindings', structuredClone(DEFAULT_BINDINGS));
    this.set('padBindings', { ...DEFAULT_PAD_BINDINGS });
  }
  setHud(key, value) {
    this.set('hud', { ...this.data.hud, [key]: value });
  }
  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.info('Settings: could not save', e);
    }
  }
}
