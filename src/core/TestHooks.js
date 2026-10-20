// Deterministic test API (enabled with ?test=1): steps physics synchronously so the
// headless QA scenarios can measure acceleration, collisions and stunts precisely.
import { STEP } from './Physics.js';

export function installTestHooks(game) {
  const step = (n, controlsFn) => {
    const p = game.physics;
    for (let i = 0; i < n; i++) {
      if (controlsFn) controlsFn(game.player.controls, i * STEP);
      for (const o of p.interp) o.savePrev();
      game.prePhysics(STEP);
      p.world.step(p.eventQueue);
      game.postPhysics(STEP);
      for (const o of p.interp) o.saveCurr();
      if (game.updateGameplay) game.updateGameplay(STEP, STEP);
    }
    for (const o of p.interp) o.apply(1);
  };

  game.test = {
    // Freeze the normal loop's player input.
    hold(on) {
      game.testHold = on;
    },
    teleport(x, y, z, yaw = 0, speed = 0) {
      const v = game.player;
      v.reset({ x, y, z }, yaw);
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      v.body.setLinvel({ x: fx * speed, y: 0, z: fz * speed }, true);
      game.playerInterp.snap();
      game.cameraCtl.initialized = false;
    },
    state() {
      const v = game.player;
      v.readState();
      return {
        x: v.position.x, y: v.position.y, z: v.position.z, speed: v.speed, fwd: v.fwdSpeed,
        upY: v.up.y, hp: v.hp, grounded: v.groundedCount, slip: v.slipAngle, drifting: v.drifting,
        battery: v.energy.battery, pressure: v.energy.pressure, temp: v.energy.temp,
        yaw: v.yaw, slide: v.slide,
      };
    },
    // Run `seconds` of simulation with constant controls (object) or a function(controls, t).
    simulate(seconds, controls, sampleEvery = 0) {
      const samples = [];
      const n = Math.round(seconds / STEP);
      this.clearControls();
      const fn = typeof controls === 'function' ? controls : (c) => Object.assign(c, controls);
      let k = 0;
      step(n, (c, t) => {
        fn(c, t);
        if (sampleEvery && k++ % Math.round(sampleEvery / STEP) === 0) samples.push({ t, ...this.state() });
      });
      return { final: this.state(), samples };
    },
    clearControls() {
      Object.assign(game.player.controls, { throttle: 0, brake: 0, steer: 0, handbrake: 0, rocket: false, hover: false, pitch: 0, yaw: 0, roll: 0 });
    },
  };
}
