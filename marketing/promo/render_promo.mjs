// Рендер промо-ролика 9:16: node render_promo.mjs [--voice] [--stills 2,6,10] [--out promo.mp4]
// --voice — с озвучкой (audio/01…09.mp3): сцена растягивается, если фраза диктора в неё не помещается,
//           по умолчанию пишет promo-voice.mp4. Без флага — немой ролик promo.mp4 (для ленты без звука).
// Нужны Playwright с Chromium и ffmpeg (PLAYWRIGHT_MODULE, CHROMIUM_PATH — как в ../../video/render.mjs).
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const DIR = path.dirname(fileURLToPath(import.meta.url));
const arg = k => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const VOICE = process.argv.includes('--voice');
const FPS = 30, OUT = arg('--out') || path.join(DIR, VOICE ? 'promo-voice.mp4' : 'promo.mp4');

// Озвучка: одна фраза на сцену (ElevenLabs, голос «Pavel — Warm Conversational Narrator», модель eleven_v4).
// Текст — для переозвучки: поменяли фразу → сгенерировать заново и положить mp3 с тем же номером в audio/.
const CUTS = [0, 4.4, 8.6, 11.8, 17, 22.2, 27.2, 32.4, 36.6, 42]; // границы сцен в promo.html
const LINES = [
  'Сколько ваша клиника реально заработала в прошлом месяце?',
  'Бухгалтерия, МИС, таблицы, чаты... а цельной картины нет.',
  '«Пульс клиники» — вся экономика клиники в одном окне.',
  'Прибыль, деньги и долги клиники — за минуту, на одном экране.',
  'Кассовый разрыв видно заранее: программа прогнозирует остаток на три месяца вперёд.',
  'А это деньги в простаивающих кабинетах — почти семьдесят миллионов за год.',
  'Себестоимость и маржа каждой услуги — видно, где пора пересмотреть цену.',
  'Любой отчёт — в Эксель, с настоящими формулами.',
  'Первый месяц — бесплатно. Оставьте заявку на сайте.',
];
const TEMPO = 1.07, LEAD = 0.35, TAIL = 0.55; // темп диктора; пауза до фразы и после неё внутри сцены

let seg = CUTS.slice(1).map((c, i) => ({ a: CUTS[i], b: c, len: c - CUTS[i] })), clips = [];
if (VOICE) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'promo-voice-'));
  const trim = 'silenceremove=start_periods=1:start_threshold=-45dB';
  clips = LINES.map((_, i) => {
    const src = path.join(DIR, 'audio', String(i + 1).padStart(2, '0') + '.mp3'), wav = path.join(tmp, i + '.wav');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-af', `${trim},areverse,${trim},areverse,atempo=${TEMPO}`, '-ar', '48000', '-ac', '2', wav]);
    return { wav, dur: +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString() };
  });
  seg = seg.map((s, i) => ({ ...s, len: Math.max(s.len, LEAD + clips[i].dur + TAIL) }));
}
let acc = 0; seg.forEach(s => { s.start = acc; acc += s.len; });
const TOTAL = acc;
// время готового ролика → время в promo.html (внутри растянутой сцены анимация идёт чуть медленнее)
const warp = T => { const s = seg.find(x => T < x.start + x.len) || seg[seg.length - 1]; return s.a + Math.min(1, (T - s.start) / s.len) * (s.b - s.a); };

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--force-color-profile=srgb', '--font-render-hinting=none'], proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
const p = await (await b.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true })).newPage();
await p.goto('file://' + path.join(DIR, 'promo.html'));
await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600);
if (arg('--stills')) {
  for (const t of arg('--stills').split(',').map(Number)) { await p.evaluate(x => window.seek(x), warp(t)); await p.screenshot({ path: path.join(DIR, `still_${t}.jpg`), type: 'jpeg', quality: 85 }); }
  await b.close(); process.exit(0);
}
const audioIn = VOICE ? clips.flatMap(c => ['-i', c.wav]) : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'];
const mix = VOICE ? ['-filter_complex', clips.map((c, i) => { const ms = Math.round((seg[i].start + LEAD) * 1000); return `[${i + 1}:a]adelay=${ms}|${ms}[v${i}]`; }).join(';') + ';' + clips.map((_, i) => `[v${i}]`).join('') + `amix=inputs=${clips.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad[a]`, '-map', '0:v', '-map', '[a]'] : [];
const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-', ...audioIn, ...mix,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-b:a', VOICE ? '160k' : '96k', '-ar', '48000', '-shortest', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
const write = buf => new Promise(r => (ff.stdin.write(buf) ? r() : ff.stdin.once('drain', r)));
const N = Math.round(TOTAL * FPS);
if (VOICE) console.log('сцены, с:', seg.map(s => s.len.toFixed(2)).join(' '), '· всего', TOTAL.toFixed(1));
for (let f = 0; f < N; f++) { await p.evaluate(x => window.seek(x), warp(f / FPS)); await write(await p.screenshot({ type: 'jpeg', quality: 92 })); if (f % 300 === 0) console.log(`кадр ${f}/${N}`); }
ff.stdin.end(); await new Promise(r => ff.on('close', r)); await b.close();
console.log('готово:', OUT);
