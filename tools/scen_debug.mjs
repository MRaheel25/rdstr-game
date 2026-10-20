export default {
  async boot({ page, sleep, shot, log }) {
    await page.evaluate(async () => {
      __game.test.hold(true);
      __game.test.teleport(-20, 0.7, 1150, -Math.PI / 2, 0);
      await __game.test.spawnFleet(-6, 1130);
    });
    await page.keyboard.press('F8');
    await page.evaluate(() => {
      const THREE = __game.THREE;
      __game.cameraCtl.playShot({ type: 'fixed', position: new THREE.Vector3(-30, 6, 1105), target: new THREE.Vector3(2, 2, 1132), fov: 50, duration: 999 });
    });
    await sleep(2000);
    log('detail calls:', await page.evaluate(() => __game.gfx.renderer.info.render.calls));
    await shot('lod_near');
    await page.evaluate(() => { for (const n of __game.npcs) n.model.setDetail(false); });
    await sleep(2000);
    log('lod calls:', await page.evaluate(() => __game.gfx.renderer.info.render.calls));
    await shot('lod_far');
  },
};
