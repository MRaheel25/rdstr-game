export default {
  async boot({ page, log }) {
    await page.evaluate(() => __game.test.hold(true));
    const tests = {
      driftRecover: ['drift', (c, t) => { c.throttle = t < 2.5 ? 1 : 0.3; c.steer = t < 1.0 ? 1 : (t < 2.5 ? 0.3 : 0); }],
      trackPower: ['track', (c, t) => { c.throttle = 1; c.steer = t < 1.0 ? 1 : 0.3; }],
      trackHB: ['track', (c, t) => { c.throttle = 0.6; c.steer = t < 0.8 ? 1 : 0.2; c.handbrake = t > 0.1 && t < 0.5 ? 1 : 0; }],
      flightPower: ['flight', (c, t) => { c.throttle = 1; c.steer = t < 1.0 ? 1 : 0.3; }],
    };
    for (const name of Object.keys(tests)) {
      const [mode, fn] = tests[name];
      const out = await page.evaluate(({ src, v0, mode }) => {
        const fn = eval(src);
        const t = __game.test;
        __game.player.setMode(mode);
        t.teleport(-400, 0.6, 500, -Math.PI / 2, v0);
        const r = t.simulate(5, fn, 0.25);
        __game.player.setMode('track');
        return r.samples.map((s) => `${s.speed.toFixed(0)}/${(s.slip * 57).toFixed(0)}${s.drifting ? 'D' : ''}`).join(' ');
      }, { src: fn.toString(), v0: 22, mode });
      log(name.padEnd(12), out);
    }
  },
};
