// QA scenarios for tools/smoke.mjs. Each receives { page, sleep, shot, log }.
export default {
  async boot({ sleep, shot }) {
    await sleep(2500);
    await shot('boot');
  },

  async physics({ page, log }) {
    await page.evaluate(() => __game.test.hold(true));
    // Open ground strip north of the grid: z = 500, x from -650 to 650, heading +x.
    const accel = await page.evaluate(() => {
      const t = __game.test;
      t.teleport(-600, 0.9, 500, -Math.PI / 2, 0);
      t.simulate(1.0, { throttle: 0 });
      const r = t.simulate(6, { throttle: 1 }, 0.05);
      let t60 = null;
      let t100 = null;
      for (const s of r.samples) {
        if (t60 === null && s.speed >= 26.82) t60 = s.t;
        if (t100 === null && s.speed >= 44.7) t100 = s.t;
      }
      return { t60, t100, after6: r.final.speed, upY: r.final.upY };
    });
    log('0-60 mph (s):', accel.t60, '0-100 mph (s):', accel.t100, 'speed after 6s (mph):', (accel.after6 * 2.237).toFixed(0), 'upY', accel.upY.toFixed(2));
    const top = await page.evaluate(() => {
      const t = __game.test;
      let speed = 60;
      const hist = [];
      for (let k = 0; k < 8; k++) {
        t.teleport(-600, 0.9, 500, -Math.PI / 2, speed);
        const r = t.simulate(5, { throttle: 1 });
        speed = r.final.speed;
        hist.push((speed * 2.237).toFixed(0));
      }
      const rk = (() => { t.teleport(-600, 0.9, 500, -Math.PI / 2, speed); return t.simulate(5, { throttle: 1, rocket: true }).final; })();
      return { hist, rocket: rk.speed * 2.237 };
    });
    log('top speed progression (mph, every 5s):', top.hist.join(' '), ' with rockets 5s more:', top.rocket.toFixed(0));
    const brake = await page.evaluate(() => {
      const t = __game.test;
      t.teleport(-600, 0.9, 500, -Math.PI / 2, 26.8);
      t.simulate(0.3, { throttle: 0.25 });
      const x0 = __game.player.position.x;
      const v0 = __game.player.speed;
      let stopX = null;
      t.simulate(4, (c) => {
        c.brake = 1;
        if (stopX === null && __game.player.fwdSpeed < 0.2) stopX = __game.player.position.x;
      });
      return { dist: Math.abs((stopX ?? __game.player.position.x) - x0), v0, speed: 0 };
    });
    log('60-0 braking distance (m):', brake.dist.toFixed(1), 'from', brake.v0.toFixed(1), 'end speed', brake.speed.toFixed(2));
    for (const mode of ['track', 'drift']) {
      const corner = await page.evaluate((mode) => {
        const t = __game.test;
        __game.player.setMode(mode);
        console.log('ENERGY', JSON.stringify(t.state()));
        t.teleport(-400, 0.9, 500, -Math.PI / 2, 30);
        const r = t.simulate(4, { throttle: mode === 'drift' ? 0.8 : 0.4, steer: mode === 'drift' ? 0.7 : 0.6 }, 0.25);
        __game.player.setMode('track');
        return r.samples.map((s) => `${s.speed.toFixed(0)}/${(s.slip * 57).toFixed(0)}/${s.upY.toFixed(2)}`);
      }, mode);
      log(mode, 'corner speed/slip°/upY:', corner.join(' '));
    }
    const hb = await page.evaluate(() => {
      const t = __game.test;
      __game.player.setMode('drift');
      t.teleport(-400, 0.9, 500, -Math.PI / 2, 25);
      const r = t.simulate(3, (c, tt) => { c.throttle = 0.7; c.steer = tt < 0.6 ? 1 : 0.2; c.handbrake = tt < 0.4 ? 1 : 0; }, 0.25);
      __game.player.setMode('track');
      return r.samples.map((s) => `${s.speed.toFixed(0)}/${(s.slip * 57).toFixed(0)}/${s.drifting ? 'D' : '-'}`);
    });
    log('handbrake drift speed/slip/drifting:', hb.join(' '));
    await page.evaluate(() => __game.test.clearControls());
    await page.evaluate(() => __game.test.hold(false));
  },

  async wall({ page, log, shot, sleep }) {
    await page.evaluate(() => __game.test.hold(true));
    // QA #1: top speed + Rear Rockets straight into a building (head-on and glancing).
    for (const angle of [0, 30, 60]) {
      const res = await page.evaluate((angle) => {
        const t = __game.test;
        const p = __game.player;
        p.hp = p.maxHp;
        p.energy.refillPressure();
        // A ground-level building whose +z face fronts the avenue at z = 0.
        const b = __game.world.city.buildings.find((b) => b.y0 < 1 && b.z + b.hz > -22 && b.z + b.hz < -8 && b.hx > 12);
        const face = b.z + b.hz;
        const a = (angle * Math.PI) / 180;
        // Start 20 m from the face (on the avenue), aimed at it at the given incidence angle.
        const sx = b.x + Math.sin(a) * 20;
        const sz = face + Math.cos(a) * 20;
        t.teleport(sx, 0.6, sz, a, 112);
        let minZ = Infinity;
        let inside = false;
        const r = t.simulate(2.0, { throttle: 1, rocket: true }, 1 / 120);
        let maxSpeedAfter = 0;
        for (const s of r.samples) {
          if (Math.abs(s.x - b.x) < b.hx - 1) minZ = Math.min(minZ, s.z);
          if (Math.abs(s.x - b.x) < b.hx && s.z < face && s.y < 30) inside = true;
        }
        const end = r.samples[r.samples.length - 1];
        return { face, minZ, inside, hp: p.hp, speed: end.speed, building: { x: b.x, hx: b.hx } };
      }, angle);
      const pass = !res.inside;
      log(`angle ${angle}°: face z ${res.face.toFixed(2)} min car z ${res.minZ.toFixed(2)} hp ${res.hp.toFixed(0)} speed after ${(res.speed * 2.237).toFixed(0)} mph`, pass ? 'PASS' : 'FAIL');
    }
    await page.evaluate(() => { __game.player.hp = __game.player.maxHp; __game.test.hold(false); });
    await sleep(800);
    await shot('wall');
  },

  async drive({ page, sleep, shot }) {
    await page.keyboard.down('KeyW');
    await sleep(3000);
    await shot('drive1');
    await page.keyboard.down('KeyD');
    await sleep(1200);
    await page.keyboard.up('KeyD');
    await sleep(1000);
    await shot('drive2');
    await page.keyboard.up('KeyW');
  },

  async keys({ page, sleep, shot }) {
    for (const k of ['F8', 'F9', 'KeyC', 'Digit2', 'Digit3', 'Digit1', 'KeyC', 'KeyC', 'KeyC']) {
      await page.keyboard.press(k);
      await sleep(150);
    }
    await page.keyboard.down('KeyR');
    await sleep(1600);
    await page.keyboard.up('KeyR');
    await sleep(500);
    await shot('keys');
  },

  async tour({ page, sleep, shot, log }) {
    const spots = [
      ['downtown', [3.8, 0.7, 70, 0]],
      ['ring', [0, 12.8, 594, Math.PI / 2]],
      ['harbor', [0, 0.7, 700, Math.PI]],
      ['containers', [-520, 0.7, 930, -Math.PI / 2]],
      ['construction', [790, 1.6, 236, -Math.PI / 2]],
      ['canyon', [-160, 14, -868, Math.PI / 2]],
      ['lookout', [-412, 105, -1280, Math.PI * 0.9]],
      ['waterfront', [-646, 0.7, 0, 0]],
      ['tunnel', [280, 12.8, -594, -Math.PI / 2]],
      ['garage', [120, 0.7, -140, 0]],
    ];
    await page.evaluate(() => __game.test.hold(true));
    for (const [name, [x, y, z, yaw]] of spots) {
      await page.evaluate(([x, y, z, yaw]) => { __game.test.teleport(x, y, z, yaw, 0); __game.test.simulate(0.5, {}); }, [x, y, z, yaw]);
      await sleep(1500);
      await shot(name);
    }
    // Aerial overview.
    await page.evaluate(() => {
      const THREE = __game.THREE;
      __game.cameraCtl.playShot({ type: 'fixed', position: new THREE.Vector3(700, 380, 900), target: new THREE.Vector3(0, 0, 0), fov: 55, duration: 100 });
    });
    await sleep(2500);
    await shot('aerial');
    await page.evaluate(() => {
      const THREE = __game.THREE;
      __game.cameraCtl.playShot({ type: 'fixed', position: new THREE.Vector3(-200, 160, -1500), target: new THREE.Vector3(0, 40, 0), fov: 55, duration: 100 });
    });
    await sleep(2500);
    await shot('aerial_north');
  },

  async car({ page, sleep, shot }) {
    await page.evaluate(() => { __game.test.hold(true); __game.test.teleport(0, 0.7, 1120, -Math.PI / 2, 0); __game.test.simulate(0.6, {}); });
    // Car faces +x: camera angle a puts the camera at (sin a, cos a) * r.
    const views = [
      ['side', [0, 1.0, 0], 0, 6.5, 0.7, 40],
      ['front34', [0, 0.8, 0], Math.PI / 4, 6.0, 1.3, 40],
      ['front', [0, 0.7, 0], Math.PI / 2, 6.5, 0.9, 38],
      ['rear34', [0, 0.8, 0], -Math.PI / 4 - 0.2, 6.2, 1.3, 40],
      ['top', [0, 0.5, 0], Math.PI / 3, 4.0, 4.2, 45],
    ];
    for (const [name, off, ang, r, h, fov] of views) {
      await page.evaluate(([ang, r, h, fov]) => {
        const g = __game;
        const t = g.playerVisual.root.position.clone();
        g.cameraCtl.playShot({ type: 'orbit', target: t, startAngle: ang, speed: 0, radius: r, height: h, lookY: 0.45, fov, duration: 999, collide: false });
      }, [ang, r, h, fov]);
      await sleep(1200);
      await shot('car_' + name);
    }
    await page.keyboard.press('KeyG');
    await sleep(1500);
    await shot('car_doors');
  },

  async fleet({ page, sleep, shot }) {
    await page.evaluate(async () => {
      __game.test.hold(true);
      __game.test.teleport(-20, 0.7, 1150, -Math.PI / 2, 0);
      await __game.test.spawnFleet(-6, 1130);
      const THREE = __game.THREE;
      const s = __game.showcase;
      const loop = () => { s.heli.update(1 / 60); s.drone.update(1 / 60); s.heli.aim(new THREE.Vector3(0, 0, 1132), 1); requestAnimationFrame(loop); };
      loop();
    });
    const views = [
      ['fleet_wide', [-30, 6, 1105], [2, 2, 1132], 50],
      ['fleet_cruiser', [-3, 1.8, 1124], [-6, 0.6, 1130], 45],
      ['fleet_interceptor', [3, 1.6, 1124], [0, 0.5, 1130], 45],
      ['fleet_swat', [10, 2.5, 1122], [6, 1.2, 1130], 50],
      ['fleet_heli', [-8, 10, 1120], [2, 14, 1142], 50],
    ];
    for (const [name, pos, tgt, fov] of views) {
      await page.evaluate(([pos, tgt, fov]) => {
        const THREE = __game.THREE;
        __game.cameraCtl.playShot({ type: 'fixed', position: new THREE.Vector3(...pos), target: new THREE.Vector3(...tgt), fov, duration: 999 });
      }, [pos, tgt, fov]);
      await sleep(1300);
      await shot(name);
    }
  },

  async fx({ page, sleep, shot }) {
    const tp = (x, y, z, yaw, speed) => page.evaluate(([x, y, z, yaw, speed]) => __game.test.teleport(x, y, z, yaw, speed), [x, y, z, yaw, speed]);
    // Drift on Harbor Blvd.
    await tp(-300, 0.7, 676, -Math.PI / 2, 22);
    await page.keyboard.press('Digit2');
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyD');
    await page.keyboard.down('ControlLeft');
    await sleep(500);
    await page.keyboard.up('ControlLeft');
    await sleep(2500);
    await shot('drift');
    await page.keyboard.up('KeyD');
    await page.keyboard.up('KeyW');
    // Rockets down the boulevard.
    await page.keyboard.press('Digit1');
    await tp(-200, 0.7, 676, -Math.PI / 2, 40);
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft');
    await sleep(1800);
    await shot('rockets');
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
    // Airborne over the yard: Cold Snap.
    await tp(100, 30, 760, -Math.PI / 2, 30);
    await sleep(600);
    await page.keyboard.press('Space');
    await sleep(700);
    await shot('coldsnap');
    await page.keyboard.down('KeyQ');
    await sleep(900);
    await page.keyboard.up('KeyQ');
    await sleep(2500);
    await shot('landed');
    // Explosion in front of the car.
    await page.evaluate(() => {
      const p = __game.player.position.clone().addScaledVector(__game.player.forward, 14);
      __game.vfx.explosion(p, 1.2);
    });
    await sleep(500);
    await shot('explosion');
    // Hover jets.
    await tp(0, 6, 700, Math.PI, 5);
    await page.keyboard.down('Space');
    await sleep(900);
    await shot('hover');
    await page.keyboard.up('Space');
    // Photo mode.
    await sleep(1500);
    await page.keyboard.press('KeyP');
    await sleep(1200);
    await shot('photo');
    await page.keyboard.press('KeyP');
  },

  async pursuit({ page, sleep, shot, log }) {
    await page.evaluate(async () => {
      __game.test.hold(true);
      __game.test.teleport(3.8, 0.7, 300, 0, 20);
      await __game.test.autopilot(28);
      __game.test.simulate(2, 'pilot');
      __game.heat.setLevel(3);
    });
    for (let k = 0; k < 10; k++) {
      const r = await page.evaluate(() => { __game.test.simulate(3, 'pilot'); return __game.test.report(); });
      log(`t=${(k + 1) * 3}s`, JSON.stringify(r));
      if (k === 4 || k === 9) { await page.evaluate(() => { __game.cameraCtl.initialized = false; }); await sleep(800); await shot('pursuit_' + k); }
    }
    // Heat 5 stress.
    await page.evaluate(() => __game.heat.setLevel(5));
    for (let k = 0; k < 8; k++) {
      const r = await page.evaluate(() => { __game.test.simulate(3, 'pilot'); return __game.test.report(); });
      log(`H5 t=${(k + 1) * 3}s`, JSON.stringify(r));
    }
    await page.evaluate(() => { __game.cameraCtl.initialized = false; });
    await sleep(800);
    await shot('pursuit_h5');
    log('player', JSON.stringify(await page.evaluate(() => __game.test.state())));
  },

  async evade({ page, sleep, shot, log }) {
    // Start a 2-star pursuit, then teleport far away and park: heat should go
    // pursuit -> evade -> cooldown -> none.
    await page.evaluate(async () => {
      __game.test.hold(true);
      __game.test.teleport(3.8, 0.7, 300, 0, 0);
      __game.heat.setLevel(2);
      __game.test.simulate(6, {});
      __game.test.teleport(-480, 0.7, -480, 0, 0);
    });
    for (let k = 0; k < 16; k++) {
      const r = await page.evaluate(() => { __game.test.simulate(3, { handbrake: 1 }); return __game.test.report(); });
      log(`t=${(k + 1) * 3}s`, JSON.stringify(r));
      if (k === 2) await shot('evade_meter');
      if (r.phase === 'none') break;
    }
    await sleep(600);
    await shot('evade_done');
  },

  async busted({ page, sleep, shot, log }) {
    await page.evaluate(async () => {
      __game.test.hold(true);
      __game.test.teleport(3.8, 0.7, 300, 0, 0);
      __game.heat.setLevel(1);
      const p = __game.player.position;
      __game.police.spawnUnit('cruiser', { x: p.x - 5, y: 1, z: p.z }, 0, 'chase');
      __game.police.spawnUnit('cruiser', { x: p.x + 5, y: 1, z: p.z }, 0, 'chase');
    });
    let r;
    for (let k = 0; k < 8; k++) {
      r = await page.evaluate(() => { __game.test.simulate(0.5, { handbrake: 1 }); return { ...__game.test.report(), state: __game.state }; });
      log(`t=${((k + 1) * 0.5).toFixed(1)}s`, JSON.stringify(r));
    }
    await sleep(500);
    await shot('busted');
  },

  async audio({ page, sleep, log }) {
    const lvl = () => page.evaluate(() => {
      const a = __game.audio;
      let m = 0;
      for (let i = 0; i < 4; i++) m = Math.max(m, a.engine.level());
      return { state: a.engine.ctx.state, rms: +m.toFixed(4), time: +a.engine.now.toFixed(2) };
    });
    await page.evaluate(() => __game.test.teleport(3.8, 0.7, 300, 0, 0));
    await sleep(1500);
    log('idle', JSON.stringify(await lvl()));
    // Music only.
    await page.evaluate(() => { __game.settings.set('sfxVolume', 0); });
    await sleep(800);
    log('music only', JSON.stringify(await lvl()));
    await page.evaluate(() => { __game.settings.set('sfxVolume', 0.9); __game.settings.set('musicVolume', 0); });
    await sleep(800);
    log('sfx only idle', JSON.stringify(await lvl()));
    await page.keyboard.down('KeyW');
    await sleep(2500);
    log('throttle', JSON.stringify(await lvl()), JSON.stringify(await page.evaluate(() => ({ speed: __game.player.speed.toFixed(1) }))));
    await page.keyboard.down('ShiftLeft');
    await sleep(800);
    log('rockets', JSON.stringify(await lvl()));
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
    await page.evaluate(() => { __game.settings.set('masterVolume', 0); });
    await sleep(800);
    log('master 0', JSON.stringify(await lvl()));
    await page.evaluate(() => { __game.settings.set('masterVolume', 0.8); __game.settings.set('musicVolume', 0.55); __game.heat.setLevel(5); });
    await sleep(4000);
    log('heat 5', JSON.stringify(await lvl()), JSON.stringify(await page.evaluate(() => ({ units: __game.police.units.length, voices: __game.audio.police.voices.filter((v) => v.unit).length, layers: Object.fromEntries(Object.entries(__game.audio.music.layers).map(([k, v]) => [k, v.level])) }))));
    await page.evaluate(() => { __game.test.hold(true); __game.player.energy.ghost = true; __game.audio.update(0.016); });
    await sleep(1500);
    log('ghost', JSON.stringify(await lvl()), JSON.stringify(await page.evaluate(() => ({ cutoff: __game.audio.engine.worldFilter.frequency.value.toFixed(0), layers: Object.fromEntries(Object.entries(__game.audio.music.layers).map(([k, v]) => [k, v.level])) }))));
  },

  async missions({ page, sleep, shot, log }) {
    const st = () => page.evaluate(() => {
      const a = __game.activities.active;
      return { state: __game.state, stage: a && a.stage ? a.stage.label : null, heat: __game.heat.level, phase: __game.heat.phase, obj: document.querySelector('#objective .obj-text').textContent, prompt: document.querySelector('#prompt').textContent, cash: __game.progress.cash, rep: __game.progress.rep };
    });
    const waitFor = async (fn, ms = 15000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (await page.evaluate(fn)) return true;
        await sleep(250);
      }
      return false;
    };
    await page.evaluate(() => { __game.progress.reset(); __game.test.hold(true); __game.test.teleport(-116, 0.7, 304, Math.PI, 0); __game.test.simulate(0.5, {}); });
    await waitFor(() => document.querySelector('#prompt').textContent.includes('CLEAN EXIT'));
    log('at marker', JSON.stringify(await st()));
    await shot('marker');
    await page.keyboard.press('Enter');
    log('briefing open', await waitFor(() => __game.state === 'briefing'));
    await sleep(800);
    await shot('briefing');
    await page.keyboard.press('Enter');
    log('started', await waitFor(() => !!__game.activities.active), JSON.stringify(await st()));
    await page.evaluate(() => { __game.test.teleport(244, 0.7, -300, 0, 0); __game.test.simulate(3.2, { handbrake: 1 }); });
    log('after pickup', JSON.stringify(await st()));
    await page.evaluate(() => { __game.test.simulate(2, { handbrake: 1 }); __game.police.clearAll(); __game.heat.clear('evaded'); __game.test.simulate(0.5, {}); });
    log('evaded', JSON.stringify(await st()));
    await page.evaluate(() => { __game.test.teleport(-600, 0.7, 124, 0, 0); __game.test.simulate(1, { handbrake: 1 }); });
    await waitFor(() => !!document.querySelector('.overlay.results'));
    await sleep(1500);
    log('done', JSON.stringify(await st()));
    await shot('results');
    await page.keyboard.press('Enter');
    await waitFor(() => __game.state === 'playing');
    log('after continue', JSON.stringify(await st()), JSON.stringify(await page.evaluate(() => __game.progress.data.missions)));
    // Fail path: timed Data Run running out of time.
    await page.evaluate(() => {
      const def = __game.activities.defs.find((d) => d.id === 'cold-storage');
      __game.activities.begin(def);
      __game.test.simulate(92, { handbrake: 1 });
    });
    await waitFor(() => !!document.querySelector('.overlay.results'));
    await sleep(1200);
    log('timeout', JSON.stringify(await st()), await page.evaluate(() => document.querySelector('.res-sub').textContent));
    await shot('results_fail');
    await page.keyboard.press('Enter');
  },

  async race({ page, sleep, shot, log }) {
    const id = process.env.RACE || 'downtown-circuit';
    await page.evaluate(async (id) => {
      __game.test.hold(true);
      __game.progress.data.rep = 5000;
      __game.progress.data.districts = ['downtown', 'highway', 'harbor', 'construction', 'canyon'];
      const def = __game.activities.defs.find((d) => d.id === id);
      __game.activities.begin(def);
      if (!window.location.search.includes('police')) __game.heat.maxLevel = 0;
      const { Driver } = await import('./src/ai/Driver.js');
      const race = __game.activities.active.race;
      const d = new Driver(__game.player);
      const line = [];
      for (let k = 0; k < def.laps + 1; k++) line.push(...race.center.map((p) => { const q = p.clone(); q.y += 0.4; return q; }));
      d.setPath(line, def.speed * (def.id === 'downtown-circuit' ? 1 : 0.8));
      window.__pilot = d;
    }, id);
    await sleep(800);
    await shot('race_grid_' + id);
    for (let k = 0; k < 70; k++) {
      const r = await page.evaluate(() => {
        __game.test.simulate(3, (c) => { if (!__game.inputLock) window.__pilot.drive(1 / 120, Infinity); });
        // Keep the scripted driver in the race (it is not a careful driver).
        if (__game.player.hp < 40) __game.player.hp = 100;
        const a = __game.activities.active;
        if (!a) return { done: true, state: __game.state, title: document.querySelector('.res-title') && document.querySelector('.res-title').textContent };
        const race = a.race;
        return { t: +race.time.toFixed(1), state: race.state, pos: race.positionOf(race.player), cp: race.player.cp + '/' + race.totalCps, rivals: race.racers.slice(1).map((r) => r.cp + (r.finished ? 'F' : '')).join(','), speed: +__game.player.speed.toFixed(1), heat: __game.heat.level, drift: Math.round(race.player.drift) };
      });
      log(JSON.stringify(r));
      if (k === 3) { await page.evaluate(() => { __game.cameraCtl.initialized = false; }); await sleep(600); await shot('race_mid_' + id); }
      if (r.done) break;
    }
    await sleep(1200);
    await shot('race_results_' + id);
  },

  async score({ page, log }) {
    await page.evaluate(async () => {
      __game.test.hold(true);
      window.__ev = { nearMiss: 0, takedown: 0, stunt: 0, bank: 0, lost: 0 };
      for (const k of ['nearMiss', 'takedown']) __game.events.on(k, () => window.__ev[k]++);
      __game.events.on('stuntLanding', () => window.__ev.stunt++);
      __game.test.teleport(3.8, 0.7, 300, 0, 20);
      await __game.test.autopilot(34);
      __game.heat.setLevel(3);
    });
    for (let k = 0; k < 10; k++) {
      const r = await page.evaluate(() => {
        __game.test.simulate(15, 'pilot');
        const s = __game.score;
        return { t: (s.game.time | 0), total: s.total, chain: Math.round(s.chain.points), mult: s.mult, best: s.bestCombo, ev: window.__ev, heat: __game.heat.level, hp: Math.round(__game.player.hp), units: __game.police.units.length };
      });
      log(JSON.stringify(r));
    }
  },

  // Run with EXTRA='&menu=1' so the game starts on the title screen.
  async menus({ page, sleep, shot, log }) {
    const waitFor = async (fn, ms = 20000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (await page.evaluate(fn)) return true;
        await sleep(250);
      }
      return false;
    };
    const st = () => page.evaluate(() => ({ state: __game.state, screen: __game.menu.screen, focus: __game.menu.items[__game.menu.index] && __game.menu.items[__game.menu.index].label }));
    await page.evaluate(() => __game.progress.reset());
    await sleep(2500);
    log('title', JSON.stringify(await st()));
    await shot('title');
    // Garage: FREE ROAM, MISSIONS, STREET RACES, GARAGE.
    for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowDown'); await sleep(150); }
    await page.keyboard.press('Enter');
    await waitFor(() => __game.menu.screen === 'garage');
    await page.evaluate(() => { __game.progress.data.cash = 50000; __game.menu.showGarage('title', 3); });
    await sleep(2500);
    log('garage', JSON.stringify(await st()));
    await shot('garage');
    await page.keyboard.press('Enter');
    await sleep(800);
    log('bought paint', JSON.stringify(await page.evaluate(() => ({ paint: __game.progress.data.paint, cash: __game.progress.cash }))));
    await page.keyboard.press('Escape');
    await waitFor(() => __game.menu.screen === 'title');
    await page.evaluate(() => __game.menu.showSettings('title'));
    await sleep(1500);
    await shot('settings');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await sleep(500);
    log('quality after right', await page.evaluate(() => __game.settings.get('quality')));
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Escape');
    await waitFor(() => __game.menu.screen === 'title');
    await page.evaluate(() => __game.menu.showList('mission', 'title'));
    await sleep(1500);
    await shot('missions');
    await page.keyboard.press('Escape');
    await waitFor(() => __game.menu.screen === 'title');
    // Free roam -> intro flyover.
    await page.evaluate(() => __game.menu.focus(__game.menu.items.findIndex((i) => i.label === 'FREE ROAM')));
    await page.keyboard.press('Enter');
    await waitFor(() => __game.state === 'intro');
    await sleep(2500);
    log('intro', JSON.stringify(await st()));
    await shot('intro');
    await page.keyboard.press('Enter');
    await waitFor(() => __game.state === 'playing', 60000);
    log('playing', JSON.stringify(await st()));
    await sleep(1500);
    await page.keyboard.press('Escape');
    await waitFor(() => __game.state === 'paused');
    await sleep(1200);
    log('paused', JSON.stringify(await st()));
    await shot('pause');
    await page.keyboard.press('Escape');
    await waitFor(() => __game.state === 'playing');
    log('resumed', JSON.stringify(await st()));
    await sleep(1000);
    await page.keyboard.press('KeyX');
    await waitFor(() => __game.xray.on);
    await page.evaluate(() => { __game.heat.setLevel(2); __game.test.hold(true); __game.test.simulate(8, { handbrake: 1 }); });
    await sleep(3000);
    await shot('xray');
    log('xray', await page.evaluate(() => ({ on: __game.xray.on, ghosts: __game.xray.ghosts.size })));
  },
};
