// Рендер промо-ролика 9:16: node render_promo.mjs [--stills 2,6,10] [--out promo.mp4]
// Нужны Playwright с Chromium и ffmpeg (PLAYWRIGHT_MODULE, CHROMIUM_PATH — как в ../../video/render.mjs).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const DIR = path.dirname(fileURLToPath(import.meta.url));
const arg = k => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const FPS = 30, OUT = arg('--out') || path.join(DIR, 'promo.mp4');
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--force-color-profile=srgb', '--font-render-hinting=none'], proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
const p = await (await b.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true })).newPage();
await p.goto('file://' + path.join(DIR, 'promo.html'));
await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600);
const total = await p.evaluate(() => window.TOTAL);
if (arg('--stills')) {
  for (const t of arg('--stills').split(',').map(Number)) { await p.evaluate(x => window.seek(x), t); await p.screenshot({ path: path.join(DIR, `still_${t}.jpg`), type: 'jpeg', quality: 85 }); }
  await b.close(); process.exit(0);
}
const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-b:a', '96k', '-shortest', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
const write = buf => new Promise(r => (ff.stdin.write(buf) ? r() : ff.stdin.once('drain', r)));
const N = Math.round(total * FPS);
for (let f = 0; f < N; f++) { await p.evaluate(x => window.seek(x), f / FPS); await write(await p.screenshot({ type: 'jpeg', quality: 92 })); if (f % 300 === 0) console.log(`кадр ${f}/${N}`); }
ff.stdin.end(); await new Promise(r => ff.on('close', r)); await b.close();
console.log('готово:', OUT);
