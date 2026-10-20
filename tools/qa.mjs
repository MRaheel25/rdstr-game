// QA checklist (GAME_SPEC.md acceptance tests). Run one with:
//   SCEN=./qa.mjs node tools/smoke.mjs <test> screenshots/qa
// Test #1 is the `wall` scenario in scenarios.mjs; #7 is `evade`; #15 is `race`.
const waitFor = async (page, sleep, fn, ms = 20000, arg) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate(fn, arg)) return true;
    await sleep(250);
  }
  return false;
};

export default {
  // #2 Camera never shows the inside of a building.
  async t2({ page, log, shot, sleep }) {
    const r = await page.evaluate(() => {
      const g = __game;
      const R = g.physics.R;
      const ball = new R.Ball(0.22);
      g.test.hold(true);
      const insideCount = { frames: 0, inside: 0, worst: null };
      const check = (label) => {
        const c = g.camera.position;
        let hit = null;
        g.physics.world.intersectionsWithShape({ x: c.x, y: c.y, z: c.z }, { x: 0, y: 0, z: 0, w: 1 }, ball, (col) => {
          const m = g.physics.meta.get(col.handle);
          if (m && (m.kind === 'building' || m.kind === 'ground' || m.kind === 'terrain')) hit = m.kind;
          return !hit;
        });
        insideCount.frames++;
        if (hit) {
          insideCount.inside++;
          if (!insideCount.worst) insideCount.worst = `${label} ${hit} cam(${c.x.toFixed(1)},${c.y.toFixed(1)},${c.z.toFixed(1)})`;
        }
      };
      const run = (label, seconds, controls) => {
        const n = Math.round(seconds * 30);
        for (let i = 0; i < n; i++) {
          g.test.simulate(1 / 30, typeof controls === 'function' ? (c, t) => controls(c, i / 30) : controls);
          g.cameraCtl.update(1 / 30, 1 / 30, g.player, g.playerVisual.root, {});
          g.camera.updateMatrixWorld();
          check(label);
        }
      };
      const out = {};
      for (const mode of ['chaseNear', 'chaseFar']) {
        g.cameraCtl.mode = mode;
        // a) Drive into a building wall at the side of the street and keep pushing.
        g.test.teleport(4, 0.7, 60, Math.PI / 2, 25);
        g.cameraCtl.initialized = false;
        run(`${mode}:wall-push`, 4, { throttle: 1 });
        // b) Reverse into the wall (camera would be behind the car, inside the building).
        g.test.teleport(-4, 0.7, 60, -Math.PI / 2, 0);
        g.cameraCtl.initialized = false;
        run(`${mode}:reverse`, 4, { brake: 1 });
        // c) Spin in a narrow spot next to walls.
        g.test.teleport(-6, 0.7, 60, 0.3, 12);
        g.cameraCtl.initialized = false;
        run(`${mode}:spin`, 5, (c, t) => Object.assign(c, { throttle: 1, steer: Math.sin(t * 2) > 0 ? 1 : -1, handbrake: 1 }));
        // d) Garage interior (low ceilings).
        g.test.teleport(150, 0.7, -180, Math.PI / 2, 10);
        g.cameraCtl.initialized = false;
        run(`${mode}:garage`, 4, (c, t) => Object.assign(c, { throttle: 0.6, steer: 0.5 }));
        out[mode] = { ...insideCount };
        insideCount.frames = 0;
        insideCount.inside = 0;
        insideCount.worst = null;
      }
      g.cameraCtl.mode = 'chaseNear';
      return out;
    });
    log(JSON.stringify(r, null, 1));
    const bad = Object.values(r).reduce((a, x) => a + x.inside, 0);
    log(bad === 0 ? 'QA#2 PASS' : `QA#2 FAIL (${bad} frames inside geometry)`);
  },

  // #3 Broken Bridge jump: arc, thruster rotation control, landing.
  async t3({ page, log }) {
    const r = await page.evaluate(() => {
      const g = __game;
      g.test.hold(true);
      const y = g.activities.groundY({ x: 820, y: 4, z: 240 });
      g.test.teleport(820, y + 0.8, 240, -Math.PI / 2, 42);
      const samples = [];
      let landed = null;
      let maxH = 0;
      let air = false;
      let rollApplied = 0;
      const offL = g.events.on('stuntLanding', (e) => { landed = e; });
      const offJ = g.events.on('jumpLanded', (e) => { samples.push(`jumpLanded ${e.jump.name} ${e.distance.toFixed(0)}m`); });
      let startX = null;
      for (let i = 0; i < 300 && !landed; i++) {
        g.test.simulate(1 / 60, (c) => {
          c.throttle = 1;
          if (g.player.groundedCount === 0 && g.player.airTime > 0.2) {
            if (startX == null) startX = g.player.position.x;
            // Roll right then back with the air thrusters.
            const t = g.player.airTime;
            c.roll = t < 0.5 ? 1 : t < 1.0 ? -1 : 0;
            if (c.roll) rollApplied++;
          }
        });
        if (g.player.groundedCount === 0) air = true;
        maxH = Math.max(maxH, g.player.position.y);
        if (air && i % 10 === 0) samples.push(`x${g.player.position.x.toFixed(0)} y${g.player.position.y.toFixed(1)} upY${g.player.up.y.toFixed(2)} right.y ${g.player.right.y.toFixed(2)}`);
      }
      offL();
      offJ();
      return { maxH: maxH.toFixed(1), landed: landed && { airTime: landed.airTime.toFixed(2), clean: landed.clean, vy: landed.vy.toFixed(1), rolls: landed.rolls }, dist: startX != null ? (g.player.position.x - startX).toFixed(0) : null, hp: g.player.hp.toFixed(0), samples };
    });
    log(JSON.stringify(r, null, 1));
    const ok = r.landed && r.landed.clean && Number(r.dist) > 30;
    const rolled = r.samples.some((s) => /right\.y (0\.[3-9]|-0\.[3-9])/.test(s));
    log(ok && rolled ? 'QA#3 PASS' : `QA#3 FAIL (landed=${!!r.landed} rolled=${rolled})`);
  },

  // #4 Land upside down: crash, damage, "Hold R to Reset" (physics stepped deterministically,
  // then the real per-frame control code runs with R held).
  async t4({ page, log, shot, sleep }) {
    const r = await page.evaluate(() => {
      const g = __game;
      g.test.hold(true);
      // Roll over at speed off a kicker-like launch: 25 m/s sideways roll, 3 m up, upside down.
      g.test.teleport(4, 3.5, 60, 0, 18);
      const q = new g.THREE.Quaternion().setFromAxisAngle(new g.THREE.Vector3(0, 0, 1), Math.PI);
      g.player.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      const hp0 = g.player.hp;
      const impacts = [];
      const off = g.events.on('impact', (e) => impacts.push(e.info.strength.toFixed(1) + (e.info.roof ? ' roof' : '')));
      g.test.simulate(6, {});
      off();
      const landed = { upY: g.player.up.y.toFixed(2), hp: g.player.hp.toFixed(0), speed: g.player.speed.toFixed(2), impacts };
      for (let i = 0; i < 25; i++) g.updatePlayerControls(0.1);
      const prompt = document.querySelector('#prompt');
      const shown = !prompt.classList.contains('hidden') && prompt.textContent.includes('RESET');
      const text = prompt.textContent;
      g.input.keys.add('KeyR');
      for (let i = 0; i < 15; i++) g.updatePlayerControls(0.1);
      g.input.keys.delete('KeyR');
      g.test.simulate(1, {});
      return { hp0, landed, prompt: shown, text, afterReset: { upY: g.player.up.y.toFixed(2) } };
    });
    log(JSON.stringify(r));
    await sleep(500);
    log(r.prompt && Number(r.landed.hp) < r.hp0 && Number(r.landed.upY) < 0 && Number(r.afterReset.upY) > 0.9 ? 'QA#4 PASS' : 'QA#4 FAIL');
  },

  // #5 Drift mode on the canyon road. (a) The canyon road has real hairpins; (b) a Drift-mode
  // slide on steady inputs is sustained, lays skid marks and smoke and recharges the battery;
  // (c) a scripted hairpin attempt on the canyon itself (informational: a bot is no drifter).
  async t5({ page, log, shot, sleep }) {
    const r = await page.evaluate(() => {
      const g = __game;
      g.test.hold(true);
      // (a) Hairpins: turns of > 140 deg completed within 110 m of road.
      const hairpins = [];
      for (const key of ['up', 'down']) {
        const pts = g.world.gen.canyon[key];
        const head = (i) => Math.atan2(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
        for (let i = 0; i + 28 < pts.length - 1; i += 2) {
          let d = head(i + 27) - head(i);
          while (d > Math.PI) d -= 2 * Math.PI;
          while (d < -Math.PI) d += 2 * Math.PI;
          if (Math.abs(d) > 2.45 && !hairpins.some((h) => h.key === key && Math.abs(h.i - i) < 40)) {
            hairpins.push({ key, i, turn: Math.round(Math.abs(d) * 57.3), at: `${Math.round(pts[i + 14].x)},${Math.round(pts[i + 14].z)}` });
          }
        }
      }
      // (b) Sustained slide with FX and recharge.
      let skids = 0;
      const orig = g.vfx.skids.add.bind(g.vfx.skids);
      g.vfx.skids.add = (...a) => { skids++; return orig(...a); };
      let smoke = 0;
      const origSmoke = g.vfx.tireSmoke.bind(g.vfx);
      g.vfx.tireSmoke = (...a) => { smoke++; return origSmoke(...a); };
      g.player.setMode('drift');
      g.player.energy.battery = 60;
      g.test.teleport(-400, 0.9, 500, -Math.PI / 2, 26);
      const b0 = g.player.energy.battery;
      let longest = 0;
      let cur = 0;
      let slipSum = 0;
      let n = 0;
      for (let i = 0; i < 60 * 6; i++) {
        g.test.simulate(1 / 60, (c, t) => { c.throttle = 0.85; c.steer = 0.7; c.handbrake = i < 12 ? 1 : 0; });
        g.playerFX.update(1 / 60, { wet: false });
        if (g.player.drifting) {
          cur += 1 / 60;
          longest = Math.max(longest, cur);
          slipSum += Math.abs(g.player.slipAngle);
          n++;
        } else cur = 0;
      }
      g.vfx.skids.add = orig;
      g.vfx.tireSmoke = origSmoke;
      g.player.setMode('track');
      return { hairpins, slide: { longest: +longest.toFixed(1), avgSlipDeg: n ? Math.round((slipSum / n) * 57.3) : 0, battery: +(g.player.energy.battery - b0).toFixed(2), skids, smoke } };
    });
    log(JSON.stringify(r));
    await page.evaluate(() => { __game.cameraCtl.initialized = false; });
    await sleep(800);
    await shot('t5_drift');
    const ok = r.hairpins.length >= 3 && r.slide.longest >= 3 && r.slide.skids > 50 && r.slide.smoke > 20 && r.slide.battery > 0;
    log(ok ? 'QA#5 PASS' : 'QA#5 FAIL');
  },

  // #6 Heat 3 -> 5: roadblocks, spikes, helicopter, boxing in, drones at 5.
  async t6({ page, log, shot, sleep }) {
    await page.evaluate(async () => {
      __game.test.hold(true);
      __game.test.teleport(3.8, 0.7, 300, 0, 20);
      await __game.test.autopilot(30);
      window.__seen = { roadblocks: 0, spikes: 0, heli: false, box: 0, drones: 0, rolling: 0, maxUnits: 0 };
      __game.events.on('roadblock', () => window.__seen.roadblocks++);
    });
    for (const level of [3, 4, 5]) {
      const r = await page.evaluate((level) => {
        const g = __game;
        g.heat.setLevel(level);
        const s = window.__seen;
        for (let k = 0; k < 30; k++) {
          g.test.simulate(1, 'pilot');
          if (g.player.hp < 40) { g.player.hp = 100; }
          const P = g.police;
          s.spikes = Math.max(s.spikes, P.spikes.length);
          s.heli = s.heli || !!P.heli;
          s.box = Math.max(s.box, P.units.filter((u) => u.boxRole).length);
          s.rolling = Math.max(s.rolling, P.units.filter((u) => u.role === 'rolling').length);
          s.drones = Math.max(s.drones, P.drones.length);
          s.maxUnits = Math.max(s.maxUnits, P.units.filter((u) => !u.v.wrecked).length);
        }
        return { level, heat: g.heat.level, ...s };
      }, level);
      log(JSON.stringify(r));
    }
    await page.evaluate(() => { __game.cameraCtl.initialized = false; });
    await sleep(800);
    await shot('t6_heat5');
    const s = await page.evaluate(() => window.__seen);
    log(s.roadblocks > 0 && s.spikes > 0 && s.heli && s.box > 0 && s.drones > 0 && s.maxUnits <= 12 ? 'QA#6 PASS' : 'QA#6 FAIL');
  },

  // #7 Break line of sight: search cones (minimap), EVADE meter fills, heat drops.
  async t7({ page, log, shot, sleep }) {
    const r = await page.evaluate(() => {
      const g = __game;
      g.test.hold(true);
      g.test.teleport(3.8, 0.7, 300, 0, 0);
      g.heat.setLevel(2);
      g.test.simulate(10, { handbrake: 1 });
      const seenUnits = g.police.units.length;
      // Slip out of sight two blocks over (the units stay in the area and search).
      g.test.teleport(244, 0.7, 180, 0, 0);
      const log = [];
      let maxCones = 0;
      let maxEvade = 0;
      let cooldown = false;
      for (let k = 0; k < 90 && g.heat.phase !== 'none'; k++) {
        g.test.simulate(1, { handbrake: 1 });
        if (g.heat.phase === 'evade') maxCones = Math.max(maxCones, g.police.cones.length);
        maxEvade = Math.max(maxEvade, g.heat.evade);
        if (g.heat.phase === 'cooldown') cooldown = true;
        if (k % 5 === 0) log.push(`${k}s ${g.heat.phase} evade ${g.heat.evade.toFixed(2)} cool ${g.heat.cooldown.toFixed(2)} cones ${g.police.cones.length} hidden ${g.world.underCover(g.player.position)}`);
      }
      return { seenUnits, maxCones, maxEvade: +maxEvade.toFixed(2), cooldown, end: g.heat.phase, level: g.heat.level, log };
    });
    log(JSON.stringify(r, null, 1));
    log(r.maxCones > 0 && r.maxEvade >= 1 && r.cooldown && r.end === 'none' && r.level === 0 ? 'QA#7 PASS' : 'QA#7 FAIL');
  },

  // #8 Ghost Mode: lights off, near-silent motor, speed capped, battery drains.
  async t8({ page, log, sleep }) {
    const r = await page.evaluate(() => {
      const g = __game;
      g.test.hold(true);
      g.test.teleport(3.8, 0.7, 300, 0, 0);
      g.player.energy.battery = 90;
      const b0 = g.player.energy.battery;
      let vmax = 0;
      for (let i = 0; i < 15 * 10; i++) {
        g.test.simulate(0.1, (c) => { c.throttle = 1; g.player.energy.ghost = true; });
        vmax = Math.max(vmax, g.player.speed);
      }
      g.playerVisual.update(1, g.player);
      g.audio.update(0.016);
      return {
        vmaxMph: (vmax * 2.237).toFixed(0), capMph: (g.player.energy.ghostSpeedCap * 2.237).toFixed(0),
        headlights: g.playerVisual.headlights.map((h) => h.intensity.toFixed(0)), battDrop: (b0 - g.player.energy.battery).toFixed(1),
      };
    });
    // Let the audio params ramp (ghost stays on), then read them.
    await page.evaluate(() => { window.__ghostHold = setInterval(() => { __game.player.energy.ghost = true; __game.audio.update(0.05); }, 50); });
    await sleep(1500);
    const a = await page.evaluate(() => {
      clearInterval(window.__ghostHold);
      const au = __game.audio;
      return au.ok ? { motor: +au.car.motor.gain.value.toFixed(3), muffleHz: Math.round(au.engine.worldFilter.frequency.value) } : null;
    });
    r.audio = a;
    log(JSON.stringify(r));
    const quiet = !a || (a.motor < 0.1 && a.muffleHz < 2000);
    const ok = Number(r.vmaxMph) <= Number(r.capMph) + 3 && r.headlights.every((h) => Number(h) < 5) && Number(r.battDrop) > 1 && quiet;
    log(ok ? 'QA#8 PASS' : 'QA#8 FAIL');
  },

  // #9 Cold Snap: slow motion, cinematic camera, frost shockwave on landing.
  async t9({ page, log, shot, sleep }) {
    const r = await page.evaluate(() => {
      const g = __game;
      g.test.hold(true);
      // Launch off the Broken Bridge: high enough for a Cold Snap.
      const y = g.activities.groundY({ x: 820, y: 4, z: 240 });
      g.test.teleport(820, y + 0.8, 240, -Math.PI / 2, 44);
      const u = g.police.spawnUnit('cruiser', { x: 1010, y: 1.2, z: 236 }, Math.PI / 2, 'chase');
      let shock = null;
      let cs = null;
      const off1 = g.events.on('frostShockwave', (e) => { shock = e; });
      const off2 = g.events.on('coldSnap', () => { cs = { scale: g.slowmo.scale, shot: g.cameraCtl.shot && g.cameraCtl.shot.type, h: g.player.position.y }; });
      let triggered = false;
      for (let i = 0; i < 400 && !shock; i++) {
        g.test.simulate(1 / 60, (c) => { c.throttle = 1; });
        const above = g.player.position.y - g.activities.groundY({ x: g.player.position.x, y: g.player.position.y - 1, z: g.player.position.z });
        if (!triggered && g.player.groundedCount === 0 && g.player.airTime > 0.25 && above > 8) {
          triggered = true;
          g.stunts.startColdSnap(g.player);
        }
        if (g.player.groundedCount > 0 && g.player.airTime === 0 && triggered && i > 200) break;
      }
      off1();
      off2();
      const frost = g.gfx.grade.uniforms.get('frost').value;
      return { triggered, coldSnap: cs, shockwave: shock && { radius: shock.radius }, frostUniform: +frost.toFixed(2), unitV: u.v.speed.toFixed(1), unitHp: u.v.hp.toFixed(0) };
    });
    log(JSON.stringify(r));
    log(r.coldSnap && r.coldSnap.scale === 0.25 && r.coldSnap.shot === 'orbit' && r.shockwave ? 'QA#9 PASS' : 'QA#9 FAIL');
  },

  // #10 Takedown: slow-motion crash cam, style points, wreck stays on the map.
  async t10({ page, log, shot, sleep }) {
    const r = await page.evaluate(() => {
      const g = __game;
      g.test.hold(true);
      // Find a street spot with a building face 20-35 m to the west.
      let start = null;
      const dir = new g.THREE.Vector3(-1, 0, 0);
      for (const x of [-360, -240, -120, 0, 120, 240, 360]) {
        for (let z = -450; z <= 450 && !start; z += 15) {
          if (Math.abs(((z % 120) + 120) % 120 - 60) > 40) continue; // mid-block only
          const o = new g.THREE.Vector3(x + 4, 1.6, z);
          const hit = g.physics.raycast(o, dir, 45, g.police.losGroups, null);
          if (hit && hit.timeOfImpact > 10) {
            const m = g.physics.meta.get(hit.collider.handle);
            if (m && m.kind === 'building') start = o;
          }
        }
        if (start) break;
      }
      if (!start) return { error: 'no building face found' };
      g.test.teleport(start.x + 6, 0.7, start.z + 30, 0, 0);
      g.heat.setLevel(2);
      const chain0 = g.score.chain.points;
      // A cruiser hit by the player, sent into the building at speed.
      const u = g.police.spawnUnit('cruiser', { x: start.x, y: 1.0, z: start.z }, Math.PI / 2, 'chase');
      u.v.lastHitBy = g.player;
      u.v.lastHitTime = u.v.time;
      u.v.hp = 8;
      u.v.body.setLinvel({ x: -38, y: 0, z: 0 }, true);
      u.parked = true; // no AI braking: it's already out of control
      let td = null;
      const off = g.events.on('takedown', (e) => { td = { type: e.type, reason: e.reason }; });
      for (let i = 0; i < 120 && !td; i++) {
        g.test.simulate(1 / 60, { handbrake: 1 });
        u.v.lastHitTime = u.v.time;
      }
      if (td) {
        // The crash cam starts right after the event.
        td.cam = g.takedownCam.cooldown > 0;
        td.slow = g.slowmo.scale;
        td.shot = g.cameraCtl.shot && g.cameraCtl.shot.type;
      }
      off();
      const points = g.score.chain.points - chain0;
      g.test.simulate(20, { handbrake: 1 });
      return { takedown: td, points: Math.round(points), stillOnMap: g.police.units.includes(u), wrecked: u.v.wrecked };
    });
    log(JSON.stringify(r));
    log(r.takedown && r.takedown.cam && r.takedown.slow < 1 && r.points >= 500 && r.stillOnMap ? 'QA#10 PASS' : 'QA#10 FAIL');
  },

  // #11 Score after a 2-3 minute pursuit: a scripted, skilled 150 s run through the real
  // StyleScore (drifts, near misses, takedowns, jumps, a crash) on the game clock.
  async t11({ page, log }) {
    const r = await page.evaluate(() => {
      const g = __game;
      g.test.hold(true);
      const S = g.score;
      S.reset();
      S.total = 0;
      const p = g.player.position;
      const timeline = [];
      // Every ~10 s: a cluster of near misses, a drift, sometimes a takedown / jump; one crash at 95 s.
      for (let t = 2; t < 150; t += 10) {
        timeline.push([t, 'nearMiss'], [t + 1.2, 'nearMiss'], [t + 2.0, 'drift', 2.5], [t + 4.8, 'nearMiss']);
        if (t % 30 === 2) timeline.push([t + 5.5, 'takedown']);
        if (t % 40 === 12) timeline.push([t + 6, 'jump']);
        if (t % 50 === 22) timeline.push([t + 6.5, 'roadblock']);
      }
      timeline.push([95, 'crash']);
      timeline.sort((a, b) => a[0] - b[0]);
      let k = 0;
      const t0 = g.time;
      const step = 1 / 30;
      let driftUntil = -1;
      for (let t = 0; t < 150; t += step) {
        g.time = t0 + t;
        while (k < timeline.length && timeline[k][0] <= t) {
          const [, e, d] = timeline[k++];
          if (e === 'nearMiss') S.add('NEAR MISS', 50, p);
          else if (e === 'takedown') S.add('TAKEDOWN', 500, p);
          else if (e === 'roadblock') S.add('ROADBLOCK SMASH', 250, p);
          else if (e === 'jump') { S.add('AIR 2.1s', 52, p); S.add('FLIP', 200, p); S.add('PERFECT LANDING', 150, p); }
          else if (e === 'drift') driftUntil = t + d;
          else if (e === 'crash') S.lose('CRASHED');
        }
        g.player.drifting = t < driftUntil;
        g.player.speed = 25;
        S.step(step);
      }
      g.player.drifting = false;
      g.time = t0 + 160;
      S.step(step);
      return { total: S.total, best: S.bestCombo };
    });
    log(JSON.stringify(r));
    log(r.total >= 20000 && r.total <= 60000 ? 'QA#11 PASS' : `QA#11 FAIL (${r.total})`);
  },

  // #12 Long play: particles, debris, scene objects and GPU memory stay bounded.
  async t12({ page, log }) {
    const r = await page.evaluate(async () => {
      const g = __game;
      g.test.hold(true);
      g.test.teleport(3.8, 0.7, 300, 0, 20);
      await g.test.autopilot(30);
      g.heat.setLevel(4);
      const sample = () => {
        const v = g.vfx;
        g.gfx.renderer.info.reset();
        g.gfx.render(0.016);
        return {
          t: Math.round(g.time), sceneObjs: g.scene.children.length, npcs: g.npcs.length, traffic: g.traffic.cars.length,
          smoke: v.smoke.count, sparks: v.sparks.count, fire: v.fire.count, debris: v.debris.length, emitters: (v.emitters || []).length,
          geoms: g.gfx.renderer.info.memory.geometries, tex: g.gfx.renderer.info.memory.textures, calls: g.gfx.renderer.info.render.calls,
          heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
        };
      };
      const out = [sample()];
      for (let k = 0; k < 10; k++) {
        for (let j = 0; j < 12; j++) {
          // Keep the pursuit alive: undo busts / wrecks and keep Heat 4.
          if (g.state !== 'playing') {
            g.activities.ui.close();
            g.state = 'playing';
            g.hud.show(true);
          }
          g.player.wrecked = false;
          g.police.bustedFired = false;
          g.heat.busted = 0;
          if (g.heat.level < 4) g.heat.setLevel(4);
          g.test.simulate(5, 'pilot');
          if (g.player.hp < 30) g.player.hp = 100;
          // Extra stress: explosions and debris every 5 s.
          g.vfx.explosion(g.player.position.clone().add(new g.THREE.Vector3(8, 0, 8)), 1);
          g.vfx.spawnDebris(g.player.position, g.player.velocity, 'metal', 6);
          g.vfx.update(0.5, 0.5);
        }
        out.push(sample());
      }
      return out;
    });
    for (const s of r) log(JSON.stringify(s));
    const a = r[1];
    const z = r[r.length - 1];
    const ok = z.debris <= 40 && z.geoms < a.geoms * 1.5 + 50 && z.tex < a.tex + 30 && z.sceneObjs < a.sceneObjs + 40;
    log(ok ? 'QA#12 PASS' : 'QA#12 FAIL');
  },

  // #13 Gamepad: throttle, steering, thrusters, vibration (mocked Gamepad API).
  async t13({ page, log, sleep }) {
    await page.evaluate(() => {
      const pad = {
        connected: true, id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', mapping: 'standard', axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
        vibrationActuator: { playEffect: (type, p) => { window.__rumble = (window.__rumble || 0) + 1; return Promise.resolve('complete'); } },
      };
      window.__pad = pad;
      navigator.getGamepads = () => [pad];
      __game.test.teleport(3.8, 0.7, 300, 0, 0);
    });
    // Sample input the way a frame does: poll the pad, then map it to the car's controls.
    const frame = () => page.evaluate(() => {
      const g = __game;
      g.input.update();
      g.updatePlayerControls(0.016);
      const c = g.player.controls;
      const out = { throttle: +c.throttle.toFixed(2), steer: +c.steer.toFixed(2), rocket: c.rocket, hover: c.hover, ghost: g.player.energy.ghost, device: g.input.lastDevice };
      g.input.endFrame();
      return out;
    });
    await page.evaluate(() => { __pad.buttons[7] = { pressed: true, value: 1 }; __pad.axes[0] = -0.8; });
    const a = await frame();
    await page.evaluate(() => { __pad.buttons[2] = { pressed: true, value: 1 }; __pad.buttons[3] = { pressed: true, value: 1 }; });
    const b = await frame();
    await page.evaluate(() => { __pad.buttons[2] = { pressed: false, value: 0 }; __pad.buttons[3] = { pressed: false, value: 0 }; __pad.buttons[0] = { pressed: true, value: 1 }; });
    const c = await frame();
    await page.evaluate(() => { __pad.buttons[0] = { pressed: false, value: 0 }; __game.input.rumble(0.8, 200); });
    const rumble = await page.evaluate(() => window.__rumble || 0);
    log(JSON.stringify({ a, b, c, rumble }));
    const ok = a.throttle > 0.9 && a.steer < -0.5 && a.device === 'gamepad' && b.rocket && b.ghost && c.hover && rumble > 0;
    log(ok ? 'QA#13 PASS' : 'QA#13 FAIL');
  },

  // #14 Settings: presets, volume sliders, rebinding all work and persist across a reload.
  async t14({ page, log, sleep }) {
    await page.evaluate(() => {
      const s = __game.settings;
      s.set('quality', 'low');
      __game.applyQuality();
      s.set('masterVolume', 0.3);
      s.set('musicVolume', 0.2);
      const b = structuredClone(s.get('bindings'));
      b.throttle = ['KeyI', 'ArrowUp'];
      b.brake = ['KeyK', 'ArrowDown'];
      s.set('bindings', b);
    });
    const before = await page.evaluate(() => ({ pr: __game.gfx.pixelRatio, master: __game.audio.ok ? __game.audio.engine.master.gain.value : null }));
    await page.reload();
    await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 120000 });
    await sleep(1000);
    const after = await page.evaluate(() => ({ quality: __game.settings.get('quality'), pr: __game.gfx.pixelRatio, master: __game.settings.get('masterVolume'), music: __game.settings.get('musicVolume'), throttleKeys: __game.settings.get('bindings').throttle }));
    await page.keyboard.down('KeyI');
    await sleep(1500);
    const th = await page.evaluate(() => __game.input.axes.throttle);
    await page.keyboard.up('KeyI');
    await page.evaluate(() => { localStorage.removeItem('rdstr.settings.v1'); });
    log(JSON.stringify(before), JSON.stringify(after), 'throttle via I', th);
    log(after.quality === 'low' && after.master === 0.3 && after.throttleKeys[0] === 'KeyI' && th > 0.9 ? 'QA#14 PASS' : 'QA#14 FAIL');
  },

  // #16 Five-star heat for 3 minutes: police count stays capped, simulation cost steady.
  async t16({ page, log }) {
    const r = await page.evaluate(async () => {
      const g = __game;
      g.test.hold(true);
      g.test.teleport(3.8, 0.7, 300, 0, 20);
      await g.test.autopilot(32);
      g.heat.setLevel(5);
      const rows = [];
      let maxUnits = 0;
      let maxDrones = 0;
      for (let k = 0; k < 18; k++) {
        const t0 = performance.now();
        g.test.simulate(10, 'pilot');
        const ms = (performance.now() - t0) / 1200;
        if (g.player.hp < 30) g.player.hp = 100;
        if (g.heat.level < 5) g.heat.setLevel(5);
        const live = g.police.units.filter((u) => !u.v.wrecked).length;
        maxUnits = Math.max(maxUnits, live);
        maxDrones = Math.max(maxDrones, g.police.drones.length);
        rows.push(`t=${(k + 1) * 10}s units ${live} total ${g.police.units.length} drones ${g.police.drones.length} heli ${!!g.police.heli} npcs ${g.npcs.length} step ${ms.toFixed(2)}ms`);
      }
      return { rows, maxUnits, maxDrones };
    });
    for (const x of r.rows) log(x);
    log(r.maxUnits <= 12 && r.maxDrones <= 2 ? 'QA#16 PASS' : 'QA#16 FAIL');
  },
};
