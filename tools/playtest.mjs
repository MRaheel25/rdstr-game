// Playtest-fix smoke pass: speed cap / throttle in every mode, menu contrast, card stills,
// marker columns per mode, HUD tag layout.
// Usage: SCEN=./playtest.mjs EXTRA='&menu=1' node tools/smoke.mjs fixes screenshots/fix
export default {
  async fixes({ page, sleep, shot, log }) {
    await page.evaluate(() => __game.menu.showPlay());
    await sleep(800);
    await shot('modes');
    await page.evaluate(() => __game.menu.showPlayStep2 && (__game.menu.playSetup = { mode: 'free' }, __game.menu.showPlayStep2()));
    await sleep(800);
    await shot('districts');
    await page.evaluate(() => __game.menu.showRaceSetup());
    await sleep(800);
    await shot('tracks');
    await page.evaluate(() => __game.menu.showRaceOptions(__game.activities.defs.find((d) => d.kind === 'race')));
    await sleep(600);
    await shot('race_options');
    log('scroll', await page.evaluate(() => {
      const l = document.querySelector('.menu-list');
      return l ? `${l.scrollWidth} / ${l.clientWidth}` : 'none';
    }));
    // Throttle from the real keyboard path in each mode.
    for (const mode of ['free', 'taxi', 'kids', 'career']) {
      await page.evaluate((mode) => {
        const g = __game;
        if (mode === 'taxi' && g.startTaxi) g.startTaxi();
        else if (mode === 'career') g.startPlay({ continueStory: true });
        else g.startPlay({ district: 'downtown', tod: 'noon', weather: 'clear', mode });
      }, mode);
      await sleep(1200);
      await page.keyboard.press('Enter'); // skip intro / briefing
      await sleep(1500);
      await page.evaluate(() => {
        __game.activities.ui.close && __game.activities.ui.overlay && __game.activities.ui.handlers && __game.activities.ui.handlers.cancel && __game.activities.ui.handlers.cancel();
      });
      const v0 = await page.evaluate(() => __game.player.speed);
      await page.keyboard.down('ArrowUp');
      await sleep(5000);
      const held = await page.evaluate(() => ({ throttle: __game.player.controls.throttle, axis: __game.input.axes.throttle }));
      await page.keyboard.up('ArrowUp');
      const info = await page.evaluate(() => {
        const g = __game;
        const cols = g.activities.markers.items.filter((m) => m.kind === 'column');
        return { mode: g.mode, cap: g.player.speedCap, lock: g.inputLock, state: g.state, speed: g.player.speed.toFixed(1), columnsShown: cols.filter((m) => m.root.visible && m.root.children[0].visible).length, columns: cols.length };
      });
      log('mode', JSON.stringify({ v0: v0.toFixed(1), held, ...info }));
      if (mode === 'free') await shot('hud_day');
    }
    // Top speed: deterministic stepping on the Highway Ring straight, free roam caps.
    const top = await page.evaluate(() => {
      const g = __game;
      g.startPlay({ district: 'downtown', mode: 'free' });
      g.test.hold(true);
      g.test.teleport(-380, 13.2, 607.5, -Math.PI / 2, 30);
      const r = g.test.simulate(9, { throttle: 1 }, 1);
      return r.samples.map((s) => Math.round(s.speed * 2.237)).join(' ') + ' mph, final ' + Math.round(r.final.speed * 2.237);
    });
    log('accel (mph each 1s)', top);
  },
};
