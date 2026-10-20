export default {
  async boot({ page, sleep, shot }) {
    await page.evaluate(() => { __game.test.hold(true); __game.test.teleport(0, 0.7, 700, Math.PI, 0); __game.test.simulate(0.3, {}); });
    await sleep(800);
    const names = ['smoke', 'dust', 'water', 'frost', 'fire', 'sparks', 'shards'];
    for (const n of names) {
      await page.evaluate((n) => {
        const v = __game.vfx;
        for (const k of ['smoke', 'dust', 'water', 'frost', 'fire', 'sparks', 'shards']) v[k].clear();
        const p = __game.player.position;
        for (let i = 0; i < 12; i++) v[n].spawn({ x: p.x + (i % 4 - 1.5) * 1.2, y: p.y + 1.5 + Math.floor(i / 4), z: p.z - 3, vx: 3, vy: 0, vz: 0, life: 50, size: 0.9, color: [1, 1, 1], alpha: 1 });
        __game.vfx.update(0.016, 0.016);
      }, n);
      await sleep(900);
      await page.screenshot({ path: `screenshots/dbg_p_${n}.png`, clip: { x: 340, y: 160, width: 600, height: 400 } });
    }
  },
};
