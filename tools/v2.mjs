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
};
