// Keyboard + gamepad input with rebindable actions and edge detection.
import { clamp } from '../util/math.js';

// Xbox layout (standard mapping) -> actions
const PAD_BUTTONS = {
  0: 'hover', // A
  1: 'handbrake', // B
  2: 'rocket', // X
  3: 'ghost', // Y
  4: 'rollLeft', // LB
  5: 'rollRight', // RB
  8: 'reset', // View
  9: 'pause', // Menu
  10: 'doors', // LS click
  11: 'camera', // RS click
  12: 'modeDrift', // D-pad up
  13: 'xray', // D-pad down
  14: 'modeTrack', // D-pad left
  15: 'modeFlight', // D-pad right
};
const DEADZONE = 0.16;

function dz(v) {
  const a = Math.abs(v);
  if (a < DEADZONE) return 0;
  return Math.sign(v) * ((a - DEADZONE) / (1 - DEADZONE));
}

export class Input {
  constructor(settings) {
    this.settings = settings;
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.padDown = new Set();
    this.padPressed = new Set();
    this.prevPad = new Set();
    this.lastDevice = 'keyboard';
    this.enabled = true;
    this.captureCb = null;
    this.mouse = { dx: 0, dy: 0, locked: false };
    this.axes = { throttle: 0, brake: 0, steer: 0, pitch: 0, yaw: 0, roll: 0 };
    this.pad = null;
    this.rumbleUntil = 0;

    window.addEventListener('keydown', (e) => {
      if (this.captureCb) {
        e.preventDefault();
        const cb = this.captureCb;
        this.captureCb = null;
        cb(e.code);
        return;
      }
      if (this.isGameKey(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressedKeys.add(e.code);
      this.keys.add(e.code);
      this.lastDevice = 'keyboard';
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) {
        this.mouse.dx += e.movementX;
        this.mouse.dy += e.movementY;
      }
    });
  }

  isGameKey(code) {
    const b = this.settings.get('bindings');
    for (const k in b) if (b[k].includes(code)) return code !== 'F12';
    return false;
  }

  captureNext(cb) {
    this.captureCb = cb;
  }

  // Call once per rendered frame before reading input.
  update() {
    this.pollGamepad();
    const kb = (a) => (this.keyDown(a) ? 1 : 0);
    const p = this.pad;
    const padThrottle = p ? p.buttons[7]?.value || 0 : 0;
    const padBrake = p ? p.buttons[6]?.value || 0 : 0;
    const lsx = p ? dz(p.axes[0] || 0) : 0;
    const lsy = p ? dz(p.axes[1] || 0) : 0;
    const rsx = p ? dz(p.axes[2] || 0) : 0;
    const a = this.axes;
    a.throttle = Math.max(kb('throttle'), padThrottle);
    a.brake = Math.max(kb('brake'), padBrake);
    a.steer = clamp(kb('right') - kb('left') + lsx, -1, 1);
    const mouseScale = 0.02;
    a.pitch = clamp(kb('throttle') - kb('brake') - lsy + this.mouse.dy * mouseScale * -1, -1, 1);
    a.yaw = clamp(kb('right') - kb('left') + lsx + this.mouse.dx * mouseScale, -1, 1);
    a.roll = clamp(kb('rollRight') - kb('rollLeft') + rsx, -1, 1);
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    if (this.rumbleUntil && performance.now() > this.rumbleUntil) this.rumbleUntil = 0;
  }

  // Call at the end of each rendered frame.
  endFrame() {
    this.pressedKeys.clear();
    this.padPressed.clear();
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    this.pad = null;
    for (const p of pads) if (p && p.connected) { this.pad = p; break; }
    this.padDown.clear();
    if (!this.pad) return;
    this.pad.buttons.forEach((b, i) => {
      const action = PAD_BUTTONS[i];
      if (action && b.pressed) {
        this.padDown.add(action);
        if (!this.prevPad.has(action)) this.padPressed.add(action);
      }
      if (b.pressed || b.value > 0.2) this.lastDevice = 'gamepad';
    });
    this.prevPad = new Set(this.padDown);
  }

  keyDown(action) {
    const codes = this.settings.get('bindings')[action] || [];
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  down(action) {
    if (!this.enabled) return false;
    return this.keyDown(action) || this.padDown.has(action);
  }

  pressed(action) {
    if (!this.enabled && action !== 'pause') return false;
    const codes = this.settings.get('bindings')[action] || [];
    for (const c of codes) if (this.pressedKeys.has(c)) return true;
    return this.padPressed.has(action);
  }

  anyKeyPressed() {
    return this.pressedKeys.size > 0 || this.padPressed.size > 0;
  }

  rumble(strength = 0.5, durationMs = 150) {
    const p = this.pad;
    if (!p || !p.vibrationActuator) return;
    try {
      p.vibrationActuator.playEffect('dual-rumble', {
        duration: durationMs,
        strongMagnitude: clamp(strength, 0, 1),
        weakMagnitude: clamp(strength * 0.7, 0, 1),
      });
      this.rumbleUntil = performance.now() + durationMs;
    } catch (e) {
      // Vibration unsupported on this pad; ignore.
    }
  }
}
