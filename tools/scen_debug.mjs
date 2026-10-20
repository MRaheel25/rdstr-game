import qa from './qa.mjs';
export default {
  async boot(ctx) {
    await ctx.page.evaluate(() => { window.__trace = true; });
    ctx.page.on('console', (m) => { if (m.text().includes(' pi')) ctx.log(m.text()); });
    await qa.t5(ctx);
  },
};
