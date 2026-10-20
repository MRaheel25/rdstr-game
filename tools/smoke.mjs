// Headless smoke test: loads the game, records console errors, runs an optional
// scripted scenario and saves screenshots.
// Usage: node tools/smoke.mjs [scenario] [outPrefix]
import { chromium } from 'playwright-core';
import { startServer } from './serve.mjs';
import fs from 'node:fs';

const scenario = process.argv[2] || 'boot';
const out = process.argv[3] || 'screenshots/smoke';
const port = 8123 + Math.floor(Math.random() * 500);
const server = await startServer(port);

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
const external = [];
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${t}`);
  if (process.env.VERBOSE) console.log(`[${m.type()}] ${t}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
page.on('request', (r) => { if (!r.url().startsWith(`http://localhost:${port}`)) external.push(r.url()); });

const url = `http://localhost:${port}/index.html?test=1&scenario=${scenario}`;
await page.goto(url);
await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 120000 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => {
  await page.screenshot({ path: `${out}_${name}.png` });
  console.log('screenshot', `${out}_${name}.png`);
};

const scenarios = (await import(process.env.SCEN || './scenarios.mjs')).default;
const fn = scenarios[scenario] || scenarios.boot;
try {
  await fn({ page, sleep, shot, log: console.log });
} catch (e) {
  errors.push(`[scenario] ${e.stack}`);
}

console.log('--- console errors/warnings ---');
for (const e of errors) console.log(e);
console.log('--- external requests ---');
for (const e of external) console.log(e);
fs.writeFileSync(`${out}_log.txt`, errors.join('\n'));
await browser.close();
server.close();
process.exit(0);
