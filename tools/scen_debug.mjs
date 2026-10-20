export default {
  async boot({ page, sleep, shot, log }) {
    await page.evaluate(() => { __game.test.hold(true); __game.test.teleport(3.8, 0.7, 70, 0, 0); __game.test.simulate(0.3, {}); });
    await page.keyboard.press('F8');
    await sleep(2500);
    await shot('perf_downtown');
    log(await page.evaluate(() => document.getElementById('debug').textContent));
    for (const tod of ['rain', 'dusk']) {
      await page.evaluate((t) => { __game.settings.set('timeOfDay', t); __game.world.env.apply(t); }, tod);
      await sleep(2500);
      await shot('tod_' + tod);
    }
    await page.evaluate(() => {
      const THREE = __game.THREE;
      __game.world.env.apply('night');
      __game.cameraCtl.playShot({ type: 'fixed', position: new THREE.Vector3(-412, 112, -1290), target: new THREE.Vector3(0, 40, 0), fov: 50, duration: 100 });
    });
    await sleep(2500);
    await shot('lookout_view');
  },
};
