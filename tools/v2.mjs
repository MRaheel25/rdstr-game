// V2 smoke scenarios (one quick pass per milestone).
// Usage: SCEN=./v2.mjs EXTRA='&menu=1' node tools/smoke.mjs m1 screenshots/v2
export default {
  async m1({ page, sleep, shot, log }) {
    await sleep(3000);
    await shot('title');
    const st = () => page.evaluate(() => `${__game.state}/${__game.menu.screen}/${__game.menu.items.map((i) => i.label).join(',')}`);
    log(await st());
    // Hotspots: open doors + roof + thrusters.
    await page.evaluate(() => { const g = __game.menu.garage; g.toggle('doors'); g.toggle('roof'); g.toggle('thrusters'); });
    await sleep(2500);
    await shot('hotspots');
    await page.evaluate(() => __game.menu.showSettingsCat('title', 'CONTROLS'));
    await sleep(500);
    await shot('settings');
    await page.evaluate(() => __game.menu.showInfo());
    await sleep(400);
    await shot('info');
    await page.evaluate(() => { __game.progress.saveSlot(0); __game.menu.showSaves('title'); });
    await sleep(400);
    await shot('saves');
    await page.evaluate(() => __game.menu.showPlay());
    await sleep(600);
    await shot('play');
    await page.evaluate(() => __game.menu.showName());
    await sleep(400);
    await shot('name');
    await page.evaluate(() => __game.menu.showThanks());
    await sleep(400);
    await shot('thanks');
    await page.evaluate(() => __game.progress.deleteSlot(0));
  },
  // M2: play setup cards, then each time of day / weather in the city.
  async m2({ page, sleep, shot, log }) {
    await sleep(2000);
    await page.evaluate(() => { __game.menu.playSetup = { mode: 'free' }; __game.menu.showPlayStep2(); });
    await sleep(800);
    await shot('district');
    await page.evaluate(() => __game.menu.showPlayStep3());
    await sleep(300);
    await shot('tod');
    await page.evaluate(() => { __game.menu.playSetup.tod = 'noon'; __game.menu.showPlayStep4(); });
    await sleep(300);
    await shot('weather');
    await page.evaluate(() => __game.startPlay({ district: 'downtown', tod: 'noon', weather: 'clear' }));
    await sleep(1500);
    await page.keyboard.press('Enter');
    await sleep(2500);
    for (const [t, w] of [['noon', 'clear'], ['morning', 'cloudy'], ['golden', 'clear'], ['sunset', 'fog'], ['night', 'clear'], ['noon', 'storm']]) {
      await page.evaluate(([t, w]) => __game.setConditions(t, w), [t, w]);
      await sleep(1800);
      await shot(`${t}_${w}`);
    }
    log(await page.evaluate(() => JSON.stringify({ state: __game.state, p: __game.world.env.preset.label, wet: __game.world.env.preset.wet })));
  },
  async m2b({ page, sleep, shot, log }) {
    await sleep(1500);
    log(await page.evaluate(() => JSON.stringify(['downtown', 'highway', 'harbor', 'canyon'].map((d) => __game.world.districtStart(d).position))));
    await page.evaluate(() => { __game.menu.playSetup = { mode: 'free' }; __game.menu.showPlayStep2(); });
    await sleep(800);
    await shot('district');
    await page.evaluate(() => __game.startPlay({ district: 'downtown', tod: 'noon', weather: 'clear' }));
    await sleep(1500);
    await page.keyboard.press('Enter');
    await sleep(3500);
    await shot('noon');
  },
  // M3: city overhaul tour (spawn + Grafigator, shopping, residential, park, police, services).
  async m3({ page, sleep, shot, log }) {
    await page.evaluate(() => __game.startPlay({ district: 'downtown', tod: 'noon', weather: 'clear' }));
    await sleep(1500);
    await page.keyboard.press('Enter');
    await sleep(6000);
    await page.keyboard.press('h');
    await shot('spawn');
    const g = (expr) => page.evaluate(expr);
    log(await g(() => JSON.stringify({ pois: (__game.world.gen.pois || []).map((p) => p.kind), services: (__game.world.gen.services || []).length, peds: __game.peds.count, alive: __game.peds.peds.filter((p) => p.alive).length, missing: __game.world.selfCheck() })));
    const spots = [['grafigator', -14, 66, -Math.PI / 2 - 0.35], ['shopping', -60, 136, 1.2], ['residential', 300, -236, 1.0], ['park', -300, -240, 1.4], ['police', -170, 6, 0.3]];
    for (const [n, x, z, yaw] of spots) {
      await page.evaluate(([x, z, yaw]) => __game.activities.teleport({ x, y: 0, z }, yaw), [x, z, yaw]);
      await sleep(2500);
      await shot(n);
    }
    // Charging: drop the battery, park in a bay.
    const r = await g(async () => {
      const s = __game.world.gen.services.find((v) => v.type === 'charge');
      __game.progress.data.cash = 5000;
      __game.activities.teleport({ x: s.x, y: 0, z: s.z }, s.yaw);
      __game.player.energy.battery = 40;
      await new Promise((res) => setTimeout(res, 7000));
      return { battery: __game.player.energy.battery, cash: __game.progress.cash };
    });
    log('charge', JSON.stringify(r));
    await shot('charged');
    const r2 = await g(async () => {
      const s = __game.world.gen.services.find((v) => v.type === 'repair');
      __game.player.hp = __game.player.maxHp * 0.4;
      __game.activities.teleport({ x: s.x, y: 0, z: s.z }, s.yaw);
      await new Promise((res) => setTimeout(res, 2500));
      return { hp: __game.player.hp };
    });
    await shot('repairing');
    await sleep(3500);
    log('repair', JSON.stringify(r2), await g(() => __game.player.hp / __game.player.maxHp));
  },
  // M3 services: charge and repair (timers forced: headless frames are slow).
  async m3s({ page, sleep, shot, log }) {
    await page.evaluate(() => __game.startPlay({ district: 'downtown', tod: 'golden' }));
    await sleep(1500);
    await page.keyboard.press('Enter');
    await sleep(2000);
    for (const type of ['charge', 'repair']) {
      await page.evaluate((type) => {
        const s = __game.world.gen.services.find((v) => v.type === type);
        __game.progress.data.cash = 5000;
        __game.player.energy.battery = 40;
        __game.player.hp = __game.player.maxHp * 0.4;
        __game.activities.teleport({ x: s.x, y: 0, z: s.z }, s.yaw);
        __game.services.cooldown = 0;
        __game.services.stopped = 5;
      }, type);
      await sleep(2500);
      log(type, await page.evaluate(() => JSON.stringify({ active: !!__game.services.active })));
      await shot(type);
      await page.evaluate(() => { const a = __game.services.active; if (a) a.t = a.dur - 0.01; });
      await page.waitForFunction(() => !__game.services.active, null, { timeout: 60000 });
      log(type, await page.evaluate(() => JSON.stringify({ battery: Math.round(__game.player.energy.battery), hp: Math.round(__game.player.hp / __game.player.maxHp * 100), cash: __game.progress.cash })));
    }
  },
};
