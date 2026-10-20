export default {
  async boot({ page, log }) {
    const r = await page.evaluate(() => {
      const g = __game;
      const edges = g.world.graph.edges.filter((e) => /canyon/i.test(e.name || '') || e.kind === 'canyon');
      const out = { n: edges.length, names: [...new Set(g.world.graph.edges.map((e) => e.kind))] };
      const e = edges[0] || g.world.graph.edges.find((x) => x.points[0].y > 30);
      if (!e) return out;
      const p = e.points[Math.floor(e.points.length / 2)];
      const q = e.points[Math.floor(e.points.length / 2) + 1];
      g.test.hold(true);
      g.test.teleport(p.x, p.y + 1, p.z, Math.atan2(-(q.x - p.x), -(q.z - p.z)), 0);
      g.test.simulate(1, {});
      out.surfaces = g.player.wheels.map((w) => w.surface + (w.grounded ? '' : '(air)'));
      out.pos = [p.x, p.y, p.z].map(Math.round);
      return out;
    });
    log(JSON.stringify(r));
  },
};
