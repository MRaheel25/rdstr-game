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
};
