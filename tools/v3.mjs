// V3 smoke scenarios (one quick pass per milestone).
// Usage: SCEN=./v3.mjs EXTRA='&menu=1' node tools/smoke.mjs m1 screenshots/v3m1
export default {
  async m1({ page, sleep, shot, log }) {
    await page.evaluate(() => __game.menu.showPlay());
    await sleep(600);
    await shot('modes');
    await page.evaluate(() => __game.startPlay({ district: 'downtown', tod: 'noon', weather: 'clear' }));
    await sleep(1500);
    await page.keyboard.press('Enter');
    await sleep(4000);
    await page.keyboard.press('h');
    log(await page.evaluate(() => {
      const g = __game.world.gen;
      const charge = g.pois.filter((p) => p.kind === 'charge');
      return JSON.stringify({ charge: charge.length, hubs: __game.world.hubs, services: g.services.filter((s) => s.type === 'charge').length, missing: __game.world.selfCheck(), locked: __game.activities.defs.filter((d) => !__game.activities.available(d)).length });
    }));
    // Waypoint to the nearest repair shop; low battery for the charge arrow.
    await page.evaluate(() => {
      const r = __game.world.gen.pois.find((p) => p.kind === 'repair');
      __game.nav.setWaypoint(r.x, r.z, 'REPAIR SHOP');
      __game.player.energy.battery = 18;
    });
    await sleep(3000);
    log(await page.evaluate(() => JSON.stringify({ route: __game.nav.route.length, len: Math.round(__game.nav.length), chevrons: __game.nav.mesh.count })));
    await shot('gps');
    await page.evaluate(() => __game.mapView.toggle(true));
    await sleep(800);
    await shot('map');
    await page.evaluate(() => __game.mapView.toggle(false));
    // A charging hub outside the grid.
    await page.evaluate(() => {
      const h = __game.world.hubs[0];
      if (h) __game.activities.teleport({ x: h.x - 30, y: 0, z: h.z }, -Math.PI / 2);
    });
    await sleep(3000);
    await shot('hub');
  },
  // M2: motor spectrum (share of energy above 2.5 kHz), music styles, settings.
  async m2({ page, sleep, shot, log }) {
    await page.evaluate(() => __game.startPlay({ district: 'downtown' }));
    await sleep(1500);
    await page.keyboard.press('Enter');
    await sleep(2000);
    const spec = () => page.evaluate(() => {
      const a = __game.audio.engine;
      const n = a.analyser.frequencyBinCount;
      const d = new Float32Array(n);
      a.analyser.getFloatFrequencyData(d);
      const hz = a.ctx.sampleRate / 2 / n;
      let lo = 0;
      let hi = 0;
      let peakHz = 0;
      let peak = -Infinity;
      for (let i = 1; i < n; i++) {
        const p = Math.pow(10, d[i] / 10);
        if (i * hz > 2500) hi += p;
        else lo += p;
        if (d[i] > peak) { peak = d[i]; peakHz = i * hz; }
      }
      return { highShare: +(hi / (hi + lo + 1e-12)).toFixed(4), peakHz: Math.round(peakHz), rms: +a.level().toFixed(4) };
    });
    await page.evaluate(() => { __game.settings.set('musicOn', false); });
    await page.keyboard.down('KeyW');
    await sleep(4000);
    log('motor under throttle', JSON.stringify(await spec()), await page.evaluate(() => __game.player.speed.toFixed(1)));
    await page.keyboard.up('KeyW');
    for (const st of ['synthwave', 'chill', 'dnb']) {
      await page.evaluate((st) => { __game.settings.set('musicOn', true); __game.settings.set('sfxVolume', 0); __game.settings.set('engineVolume', 0); __game.settings.set('musicStyle', st); }, st);
      await sleep(2500);
      log('music', st, JSON.stringify(await spec()), await page.evaluate(() => __game.audio.music.stepDur.toFixed(3)));
    }
    await page.evaluate(() => { __game.settings.set('sfxVolume', 0.9); __game.settings.set('engineVolume', 0.8); __game.settings.set('musicStyle', 'synthwave'); __game.menu.showSettingsCat('title', 'SOUND'); });
    await sleep(600);
    await shot('sound');
  },
  // M3: bright showroom, player card, part click + hover outline, cards, night studio, sizes.
  async m3({ page, sleep, shot, log }) {
    await sleep(3500);
    await shot('title');
    // Hover + click the near door: project the car's side to the screen.
    const pt = [[900, 405], [900, 345], [1140, 400], [700, 385]];
    let part = null;
    for (const [x, y] of pt) {
      await page.mouse.move(x, y);
      await sleep(300);
      part = await page.evaluate(() => __game.menu.garage.hoverPart);
      if (part) {
        await shot('hover_' + part);
        await page.mouse.click(x, y);
        await sleep(1500);
        log('clicked', part, await page.evaluate(() => JSON.stringify({ doors: __game.playerVisual.state.doorTarget, hot: __game.menu.garage.hot })));
        break;
      }
    }
    log('parts at test points', await page.evaluate((pt) => pt.map(([x, y]) => __game.menu.garage.pick(x, y)).join(','), pt));
    await page.mouse.move(5, 5);
    await page.evaluate(() => __game.menu.showPlay());
    await sleep(1500);
    await shot('modes');
    await page.evaluate(() => { __game.settings.set('studioNight', true); __game.menu.garage.setLook('night'); __game.menu.showTitle(); });
    await sleep(1500);
    await shot('night');
    await page.evaluate(() => { __game.settings.set('studioNight', false); __game.menu.garage.setLook('light'); __game.menu.showTitle(); });
    for (const [w, h] of [[1920, 1080], [2560, 1080], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      await sleep(1500);
      await shot(`size_${w}x${h}`);
    }
  },
  // M4: new HUD (healthy, damaged + low, charging), positions.
  async m4({ page, sleep, shot, log }) {
    await page.evaluate(() => __game.startPlay({ district: 'downtown', tod: 'golden' }));
    await sleep(1500);
    await page.keyboard.press('Enter');
    await sleep(5000);
    await page.keyboard.press('h');
    await page.keyboard.down('KeyW');
    await sleep(2500);
    await shot('drive');
    await page.keyboard.up('KeyW');
    await page.evaluate(() => {
      const p = __game.player;
      p.hp = p.maxHp * 0.22;
      p.zoneDamage = { front: 0.8, rear: 0.1, left: 0.45, right: 0 };
      p.energy.battery = 14;
      p.energy.pressure = p.energy.pressureMax * 0.3;
    });
    await sleep(1500);
    await shot('low');
    await page.evaluate(() => { __game.hud.charging = true; });
    await sleep(800);
    await shot('charging');
    await page.evaluate(() => { __game.hud.charging = false; __game.settings.setHud('position', 'top'); __game.hud.applyLayout(); });
    await sleep(800);
    await shot('top');
    await page.evaluate(() => { __game.settings.setHud('position', 'bottom'); __game.hud.applyLayout(); });
  },
  // M5: big jump (45 m up, 30 m/s, tilted) with Assisted vs Pro Flight.
  async m5({ page, sleep, shot, log }) {
    await page.evaluate(() => __game.startPlay({ district: 'downtown' }));
    await sleep(1500);
    await page.keyboard.press('Enter');
    await sleep(2000);
    const res = await page.evaluate(() => {
      const g = __game;
      const out = {};
      for (const mode of ['assist', 'pro']) {
        g.settings.set('flightAssist', mode === 'assist');
        g.restorePlayer();
        g.test.teleport(2.6, 45, 300, 0, 30);
        g.player.body.setRotation({ x: 0, y: 0, z: Math.sin(0.3), w: Math.cos(0.3) }, true);
        const hp0 = g.player.hp;
        let maxSink = 0;
        let landed = null;
        let pMin = 999;
        g.test.simulate(7, (c, t) => {
          g.flightAssist(1 / 120);
          const v = g.player;
          if (v.groundedCount === 0) maxSink = Math.max(maxSink, -v.velocity.y);
          if (landed === null && v.groundedCount >= 3 && t > 0.3) landed = { t: +t.toFixed(2), vy: +v.velocity.y.toFixed(1), upY: +v.up.y.toFixed(2) };
          pMin = Math.min(pMin, v.energy.pressurePct);
        });
        const v = g.player;
        out[mode] = { hpLoss: +((hp0 - v.hp) / v.maxHp * 100).toFixed(1), landed, endUp: +v.up.y.toFixed(2), maxSinkInAir: +maxSink.toFixed(1), minPressurePct: Math.round(pMin) };
      }
      g.settings.set('flightAssist', true);
      return JSON.stringify(out);
    });
    log('jump', res);
    await sleep(1000);
    await shot('after');
  },
};
