// Рендер промо-ролика 9:16: node render_promo.mjs [--voice] [--stills 2,6,10] [--out promo.mp4]
// --voice — с озвучкой (audio/01…09.mp3): сцена растягивается, если фраза диктора в неё не помещается,
//           по умолчанию пишет promo-voice.mp4. Без флага — promo.mp4 только с музыкой.
// Музыка (music.py) синтезируется под длину ролика; под голосом она приглушается (сайдчейн).
// Нужны Playwright с Chromium, ffmpeg и python3 с numpy (PLAYWRIGHT_MODULE, CHROMIUM_PATH — как в ../../video/render.mjs).
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'promo-audio-'));
if (VOICE) {
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
const MUSIC = path.join(tmp, 'music.wav');
execFileSync('python3', [path.join(DIR, 'music.py'), TOTAL.toFixed(2), seg[2].start.toFixed(3), MUSIC]); // 5-й такт — на логотипе
// время готового ролика → время в promo.html (внутри растянутой сцены анимация идёт чуть медленнее)
const warp = T => { const s = seg.find(x => T < x.start + x.len) || seg[seg.length - 1]; return s.a + Math.min(1, (T - s.start) / s.len) * (s.b - s.a); };

// Громкость: голос ≈ −20 LUFS, музыка из music.py ≈ −9,5 LUFS. Музыка ставится на 8 дБ тише голоса и ещё
// на ~6 дБ приглушается, пока диктор говорит; итог ≈ −16 LUFS (норма соцсетей), пики не выше −1,5 дБ.
const audioIn = [...clips.flatMap(c => ['-i', c.wav]), '-i', MUSIC];
const mi = clips.length + 1, music = `[${mi}:a]highpass=f=45`;
const graph = VOICE
  ? clips.map((c, i) => { const ms = Math.round((seg[i].start + LEAD) * 1000); return `[${i + 1}:a]adelay=${ms}|${ms}[v${i}]`; }).join(';')
    + ';' + clips.map((_, i) => `[v${i}]`).join('') + `amix=inputs=${clips.length}:normalize=0,apad=whole_dur=${TOTAL},asplit=2[vk][vs];` // без apad сайдчейн обрезал бы музыку после последней фразы
    + `${music},equalizer=f=2800:t=q:w=1:g=-4,volume=-19dB[mu];[mu][vs]sidechaincompress=threshold=0.016:ratio=2:attack=25:release=450[md];`
    + '[vk][md]amix=inputs=2:normalize=0,volume=5dB,alimiter=limit=0.84:level=false,apad[a]'
  : `${music},volume=-7dB,alimiter=limit=0.84:level=false,apad[a]`;
const mix = ['-filter_complex', graph, '-map', '0:v', '-map', '[a]'];
if (arg('--audio')) { // только звуковая дорожка — проверить сведение, не рендеря кадры
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=black:s=16x16:d=${TOTAL}`, ...audioIn, ...mix.slice(0, 2), '-map', '[a]', '-t', String(TOTAL), arg('--audio')]);
  console.log('звук:', arg('--audio'), TOTAL.toFixed(1), 'с'); process.exit(0);
}
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--force-color-profile=srgb', '--font-render-hinting=none'], proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
const p = await (await b.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true })).newPage();
await p.goto('file://' + path.join(DIR, 'promo.html'));
await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600);
if (arg('--stills')) {
  for (const t of arg('--stills').split(',').map(Number)) { await p.evaluate(x => window.seek(x), warp(t)); await p.screenshot({ path: path.join(DIR, `still_${t}.jpg`), type: 'jpeg', quality: 85 }); }
  await b.close(); process.exit(0);
}

const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-', ...audioIn, ...mix,
  // H.264 High@4.0, ≤3 Мбит/с, AAC 44,1 кГц — открывается на любом телефоне, файл ~5 МБ
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-profile:v', 'high', '-level:v', '4.0', '-maxrate', '3M', '-bufsize', '6M', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-shortest', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
const write = buf => new Promise(r => (ff.stdin.write(buf) ? r() : ff.stdin.once('drain', r)));
const N = Math.round(TOTAL * FPS);
if (VOICE) console.log('сцены, с:', seg.map(s => s.len.toFixed(2)).join(' '), '· всего', TOTAL.toFixed(1));
for (let f = 0; f < N; f++) { await p.evaluate(x => window.seek(x), warp(f / FPS)); await write(await p.screenshot({ type: 'jpeg', quality: 92 })); if (f % 300 === 0) console.log(`кадр ${f}/${N}`); }
ff.stdin.end(); await new Promise(r => ff.on('close', r)); await b.close();
console.log('готово:', OUT);
