// Рекламные картинки из creatives.html: node render_creatives.mjs [--only feed-1-profit]
// PNG ×2 кладутся в out/, превью ссылки — ещё и в ../../public/img/og.png.
// Нужен Playwright с Chromium (PLAYWRIGHT_MODULE, CHROMIUM_PATH — как в ../../video/render.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const DIR = path.dirname(fileURLToPath(import.meta.url));
const arg = k => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const OUT = path.join(DIR, 'out');
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--force-color-profile=srgb', '--font-render-hinting=none'], proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
const p = await (await b.newContext({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true })).newPage();
await p.goto('file://' + path.join(DIR, 'creatives.html'));
await p.evaluate(() => document.fonts.ready);
await p.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
await p.waitForTimeout(500);
for (const name of await p.$$eval('.cr', els => els.map(e => e.dataset.name))) {
  if (arg('--only') && arg('--only') !== name) continue;
  const file = path.join(OUT, name + '.png');
  await p.locator(`.cr[data-name="${name}"]`).screenshot({ path: file });
  if (name === 'og') fs.copyFileSync(file, path.join(DIR, '..', '..', 'public', 'img', 'og.png'));
  console.log(file);
}
await b.close();
