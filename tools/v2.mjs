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
};
