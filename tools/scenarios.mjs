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
      const r = t.simulate(4, { throttle: 0, brake: 1 });
      return { dist: Math.abs(r.final.x - x0), v0, speed: r.final.speed };
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
};
