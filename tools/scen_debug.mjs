export default {
  async boot({ page, shot, sleep }) {
    await page.evaluate(() => { __game.test.hold(true); __game.progress.reset(); __game.activities.openBriefing(__game.activities.defs.find((d) => d.id === 'clean-exit')); });
    await sleep(2500);
    await shot('dbg_brief');
    await page.evaluate(() => { __game.activities.ui.close(); __game.activities.openBriefing(__game.activities.defs.find((d) => d.id === 'ring-sprint')); });
    await sleep(2500);
    await shot('dbg_brief_race');
    await page.evaluate(() => {
      __game.activities.ui.close();
      __game.state = 'playing';
      const def = __game.activities.defs.find((d) => d.id === 'leap-of-faith');
      __game.activities.begin(def);
      __game.test.simulate(1, {});
      __game.score.add('FLIP', 200, __game.player.position);
      __game.score.add('PERFECT LANDING', 150, __game.player.position);
      __game.score.add('COLD SNAP LANDING', 300, __game.player.position);
    });
    await sleep(1500);
    await shot('dbg_popups');
    await page.evaluate(() => { __game.test.simulate(4, {}); __game.activities.finish({ ok: true }); });
    await sleep(2500);
    await shot('dbg_results_ok');
  },
};
