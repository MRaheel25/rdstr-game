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
};
