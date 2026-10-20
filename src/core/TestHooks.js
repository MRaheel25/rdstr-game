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
      game.time += STEP;
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
      const base = typeof controls === 'function' ? controls : (c) => Object.assign(c, controls);
      const fn = controls === 'pilot' ? (c) => this.pilot(c) : base;
      let k = 0;
      step(n, (c, t) => {
        fn(c, t);
        if (sampleEvery && k++ % Math.round(sampleEvery / STEP) === 0) samples.push({ t, ...this.state() });
      });
      return { final: this.state(), samples };
    },
    async spawnFleet(x, z) {
      const V = await import('../vehicle/VehicleConfig.js');
      const P = await import('../vehicle/models/PoliceModels.js');
      const list = [
        [V.POLICE_CRUISER, new P.CruiserModel(V.POLICE_CRUISER, 7)],
        [V.POLICE_INTERCEPTOR, new P.InterceptorModel(V.POLICE_INTERCEPTOR, 21)],
        [V.SWAT_TRUCK, new P.SwatModel(V.SWAT_TRUCK, 4)],
      ];
      list.forEach(([cfg, model], i) => game.addNpc(cfg, model, { position: { x: x + i * 6, y: 1.2, z }, yaw: -Math.PI / 2 + 0.4 }));
      const heli = new P.HelicopterModel();
      heli.root.position.set(x + 8, 14, z + 12);
      game.scene.add(heli.root);
      const drone = new P.DroneModel();
      drone.root.position.set(x - 4, 3.5, z + 4);
      game.scene.add(drone.root);
      game.showcase = { heli, drone };
      step(60);
    },
    // Player autopilot along random road-graph routes (for AI tests).
    async autopilot(speed = 30) {
      const { Driver } = await import('../ai/Driver.js');
      const d = new Driver(game.player);
      d.targetSpeed = speed;
      this.pilot = (c) => {
        if (!d.path.length || d.pathDone) d.setPath(game.police.randomRoute(game.player.position, 8), speed);
        d.drive(1 / 120, Infinity);
      };
      return true;
    },
    report() {
      const P = game.police;
      const live = P.units.filter((u) => !u.v.wrecked);
      const near = live.map((u) => u.v.position.distanceTo(game.player.position)).sort((a, b) => a - b);
      return {
        heat: game.heat.level, phase: game.heat.phase, evade: +game.heat.evade.toFixed(2), cooldown: +game.heat.cooldown.toFixed(2), busted: +game.heat.busted.toFixed(2),
        units: live.length, wrecks: P.units.length - live.length, chase: P.chaseUnits.length, los: live.filter((u) => u.los).length,
        roles: live.map((u) => u.role + (u.boxRole ? ':' + u.boxRole : '')).join(','),
        nearest: near.slice(0, 3).map((x) => x.toFixed(0)).join('/'), roadblocks: P.roadblocks.length, spikes: P.spikes.length,
        heli: !!P.heli, heliSees: P.heli ? P.heli.sees : false, drones: P.drones.length, traffic: game.traffic.cars.length,
        hp: +game.player.hp.toFixed(0), speed: +game.player.speed.toFixed(1), emp: +game.player.energy.emp.toFixed(1),
        popped: game.player.wheels.filter((w) => w.popped).length,
      };
    },
    clearControls() {
      Object.assign(game.player.controls, { throttle: 0, brake: 0, steer: 0, handbrake: 0, rocket: false, hover: false, pitch: 0, yaw: 0, roll: 0 });
    },
  };
}
