export default {
  async boot({ page, sleep, shot, log }) {
    await page.evaluate(async () => {
      __game.test.hold(true);
      __game.test.teleport(3.8, 0.7, 300, 0, 0);
      __game.heat.setLevel(1);
      const p = __game.player.position;
      __game.police.spawnUnit('cruiser', { x: p.x - 5, y: 1, z: p.z }, 0, 'chase');
      __game.police.spawnUnit('cruiser', { x: p.x + 5, y: 1, z: p.z }, 0, 'chase');
      __game.test.simulate(3.2, { handbrake: 1 });
    });
    for (let i = 0; i < 8; i++) {
      const r = await page.evaluate(() => { const c = __game.camera.position; const p = __game.player.position; return { cam: [c.x, c.y, c.z].map((v) => +v.toFixed(1)), p: [p.x, p.y, p.z].map((v) => +v.toFixed(1)), ts: __game.timeScale, slow: __game.slowmo, wrecked: __game.player.wrecked, banner: document.querySelector('.banner').className, heat: __game.heat.phase }; });
      log(i, JSON.stringify(r));
      if (i === 1 || i === 6) await shot('dbg_b' + i);
      await sleep(1000);
    }
  },
};
