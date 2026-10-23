// Рендер ролика: node render.mjs [--check] [--stills 12,40,95] [--from 0 --to 60] [--out file.mp4]
// Требует: собранный public/ в один файл (tools/build_artifact.py --standalone), аудио в video/audio/<id>.mp3.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENES, sentences } from './script.mjs';
import { demoState } from '../public/js/demo.js';
import * as K from '../public/js/calc.js';
import { money, pct, num, curMonth, addMonths, monthsBetween, isPartialMonth, monLong } from '../public/js/util.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const arg = k => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const has = k => process.argv.includes(k);
const FPS = 30, PRE = 0.45, POST = 0.8, DIP = 0.35;
const APP = arg('--page') || path.join(DIR, 'out', 'pulse_local.html');
const OUT = arg('--out') || path.join(DIR, 'out', 'pulse-clinic.mp4');

// ---------- аудио: длительность и паузы ----------
function probe(file) {
  const dur = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim();
  const log = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'silencedetect=noise=-38dB:d=0.16', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const sil = []; let s0 = null;
  for (const line of log.split('\n')) {
    const a = line.match(/silence_start: ([\d.]+)/), b = line.match(/silence_end: ([\d.]+)/);
    if (a) s0 = +a[1];
    if (b && s0 != null) { sil.push({ s: s0, e: +b[1], m: (s0 + +b[1]) / 2 }); s0 = null; }
  }
  return { dur, sil };
}
// Начала фраз: ожидаемые по доле символов, притянутые к ближайшей паузе
function alignSentences(sents, dur, sil) {
  const lens = sents.map(s => s.length), total = lens.reduce((a, b) => a + b, 0);
  const starts = [0]; let acc = 0; const used = new Set();
  for (let k = 1; k < sents.length; k++) {
    acc += lens[k - 1];
    const exp = dur * acc / total;
    let best = null;
    sil.forEach((p, j) => { if (used.has(j) || p.m <= starts[k - 1] + 0.3) return; const d = Math.abs(p.m - exp); if (d < 1.8 && (!best || d < best.d)) best = { j, d, t: p.e - 0.05 }; });
    if (best) { used.add(best.j); starts.push(best.t); } else starts.push(Math.max(exp, starts[k - 1] + 0.4));
  }
  return starts;
}
// Длинные фразы делим на субтитры по запятым и тире
function chunks(text, max = 96) {
  if (text.length <= max) return [text];
  const parts = text.split(/(?<=[,:;]|\s—)\s/);
  const out = []; let cur = '';
  for (const p of parts) { if ((cur + ' ' + p).trim().length > max && cur) { out.push(cur.trim()); cur = p; } else cur = (cur + ' ' + p).trim(); }
  if (cur) out.push(cur.trim());
  return out;
}

// ---------- примеры для формульных карточек (те же демо-данные, что в программе) ----------
function cards(lastFullMonth) {
  const s = demoState(), months = monthsBetween(addMonths(curMonth(), -11), curMonth());
  const full = months.filter(m => !isPartialMonth(m));
  const mL = [lastFullMonth], L = K.pnl(s, mL), be = K.breakEven(L, K.avgCheck(s, mL, L));
  const cap = K.capacity(s, months), orx = cap.rows.find(x => x.r.name === 'Операционная');
  const sv = K.services(s, full).rows.find(r => r.v.name === 'Лечение кариеса');
  const Lp = K.pnl(s, months), mr = Lp.margin.total / Lp.net.total, ac = K.avgCheck(s, months, Lp);
  const mk = K.marketing(s, months, mr, ac);
  return {
    breakeven: `<h3>Точка безубыточности</h3><p class="vc-f">(<b>Постоянные расходы</b> + <b>амортизация</b>) ÷ <b>доля маржинальной прибыли</b></p>
      <div class="vc-ex">${monLong(lastFullMonth)}: ${money(be.fixedM)} ÷ ${pct(be.mr, 1)} = <b>${money(be.be)} ₸</b> выручки в месяц.<br>Запас прочности: <b>${pct(be.safety, 1)}</b> · около <b>${money(be.visits)}</b> приёмов</div>`,
    potential: `<h3>Потенциал до цели</h3><p class="vc-f">(<b>Доступные часы</b> × 85% − <b>занятые часы</b>) × <b>выручка за час</b></p>
      <div class="vc-ex">Операционная за год: (${num(orx.avail)} × 85% − ${num(orx.booked)}) × ${money(orx.rate)} = <b>+${money(orx.potTarget)} ₸</b><br>Загрузка сейчас: <b>${pct(orx.util)}</b></div>`,
    cost: `<h3>Себестоимость услуги</h3><p class="vc-f"><b>Материалы</b> + <b>% врачу</b> + <b>эквайринг</b> + <b>накладные</b></p>
      <p class="vc-f" style="font-size:19px">Накладные = постоянные расходы ÷ часы врачей × длительность</p>
      <div class="vc-ex">Лечение кариеса, ${money(sv.v.price)} ₸: ${money(sv.mat)} + ${money(sv.docPay)} + ${money(sv.acq)} + ${money(sv.over)} = ${money(sv.cost)}<br>Маржа: <b>${money(sv.margin)} ₸ · ${pct(sv.mPct)}</b></div>`,
    ltv: `<h3>Ценность и стоимость пациента</h3><p class="vc-f"><b>LTV</b> = средний чек × визитов в год × лет × маржа</p>
      <p class="vc-f"><b>CAC</b> = расход на рекламу ÷ новые пациенты</p><p class="vc-f" style="font-size:20px"><b>ROMI</b> = (выручка новых × маржа − расход) ÷ расход</p>
      <div class="vc-ex">${money(ac)} × ${num(s.settings.visitsPerYear, 1)} × ${num(s.settings.ltvYears)} × ${pct(mr)} = <b>${money(mk.ltv)} ₸</b> · CAC <b>${money(mk.total.cac)} ₸</b> · LTV/CAC <b>${num(mk.total.ltvCac, 1)}</b></div>`,
  };
}

// ---------- слайды ----------
const LOGO = s => `<svg width="${s}" height="${s}" viewBox="0 0 32 32"><rect width="32" height="32" rx="8"/><path d="M5 17h5l2.5-6 4 11 3-8 1.5 3H27"/></svg>`;
const PULSE = `<svg class="pulse" viewBox="0 0 1440 160" preserveAspectRatio="none"><path data-draw data-len="1800" d="M0 96 H560 l26 -52 l34 112 l34 -96 l22 36 H1440"/></svg>`;
const SLIDES = {
  title: `<div class="vs">${PULSE}<div class="logo" data-s="0">${LOGO(68)}<b>Пульс клиники</b></div>
    <h1 data-s="0" data-d="0.25">Управленческий учёт для частной клиники</h1>
    <p class="lead" data-s="1">Что умеет программа, откуда берутся цифры и что находится в каждом разделе</p></div>`,
  problem: `<div class="vs"><div class="eyebrow" data-s="0">Зачем это нужно</div><h2 data-s="0">Данные клиники разбросаны по разным местам</h2>
    <div class="row" data-s="0" data-d="0.35">
      <div class="box"><h4>Бухгалтерия</h4><p>официальная часть, видит деньги</p></div>
      <div class="box"><h4>Маркетинг</h4><p>свои таблицы по рекламе</p></div>
      <div class="box"><h4>МИС</h4><p>расписание, приёмы, услуги</p></div>
      <div class="box"><h4>Вручную</h4><p>Excel, блокноты, чаты</p></div></div>
    <div style="margin-top:38px"><p class="q" data-s="2"><span>?</span>Сколько мы реально заработали</p>
      <p class="q" data-s="3"><span>?</span>Где деньги и кто нам должен</p>
      <p class="q" data-s="4"><span>?</span>Насколько загружены врачи и оборудование — и сколько ещё можно заработать</p></div>
    <div class="box accent" data-s="5" style="flex:none;margin-top:18px;max-width:780px"><h4 style="margin:0">«Пульс клиники» собирает всё в одном месте</h4></div></div>`,
  dates: `<div class="vs"><div class="eyebrow" data-s="0">Главное правило</div><h2 data-s="0">У каждой операции две даты</h2>
    <div class="row" style="margin-bottom:18px"><div class="box" data-s="1"><h4>1 · Дата оказания услуги или начисления</h4><p>когда клиника заработала или потратила</p></div>
      <div class="box accent" data-s="2"><h4>→ Прибыли и убытки</h4><p>Заработали ли мы?</p></div></div>
    <div class="row" style="margin-bottom:18px"><div class="box" data-s="3"><h4>2 · Дата оплаты</h4><p>когда деньги реально пришли или ушли</p></div>
      <div class="box accent" data-s="4"><h4>→ Движение денег</h4><p>Пришли ли деньги?</p></div></div>
    <div class="box" data-s="5" style="flex:none;border-color:rgba(250,178,25,.6)"><h4 style="color:#fab219;margin:0">Даты оплаты нет → это долг: дебиторка или кредиторка</h4></div></div>`,
  example: `<div class="vs"><div class="eyebrow" data-s="0">Пример: реестр ДМС</div><h2 data-s="1">Услуги в сентябре, деньги в ноябре</h2>
    <div class="tl"><div class="axis"></div>
      <div class="mon" style="left:188px">сентябрь</div><div class="mon" style="left:612px">октябрь</div><div class="mon" style="left:1006px">ноябрь</div>
      <div class="band" data-s="5" data-w="549" style="left:389px;width:0"></div><div class="bandlbl" data-s="5" style="left:663px">Дебиторка · ждёт оплаты 41 день</div>
      <div class="ev" data-s="1" style="left:389px;top:6px"><div class="lbl"><b>30.09 · реестр</b>600 000 ₸</div><div class="dot" style="margin-top:46px"></div></div>
      <div class="ev" data-s="2" style="left:938px;top:139px"><div class="dot"></div><div class="lbl" style="margin-top:44px"><b>10.11 · оплата</b>580 000 ₸, отказ 20 000 ₸</div></div></div>
    <div class="row"><div class="box" data-s="3"><h4>Прибыли и убытки · сентябрь</h4><p>выручка +600 000 ₸, отказ страховой −20 000 ₸</p></div>
      <div class="box" data-s="4"><h4>Движение денег · ноябрь</h4><p>поступило +580 000 ₸</p></div></div>
    <div style="margin-top:22px" data-s="6"><span class="vp">Так же: предоплата пациента</span><span class="vp">отсрочка поставщику</span><span class="vp">зарплата за месяц</span></div></div>`,
  groups: `<div class="vs"><div class="eyebrow" data-s="0">Главное правило</div><h2 data-s="0">Куда попадает операция — решает группа статьи</h2>
    <table><thead data-s="0"><tr><th>Группа статьи</th><th>Прибыли и убытки</th><th>Движение денег</th></tr></thead><tbody>
      <tr data-s="1"><td>Выручка, переменные и постоянные расходы, налоги</td><td class="yes">✓ да</td><td class="yes">✓ да</td></tr>
      <tr data-s="2"><td>Покупка оборудования, капитальный ремонт</td><td>частями — через амортизацию</td><td class="yes">✓ да</td></tr>
      <tr data-s="3"><td>Кредиты, выплаты собственникам</td><td class="no">— нет</td><td class="yes">✓ да</td></tr></tbody></table></div>`,
  storage: `<div class="vs"><div class="eyebrow" data-s="0">Данные и доступ</div><h2 data-s="0">Где хранятся данные и кто их видит</h2>
    <div class="row"><div class="box" data-s="1"><h4>Сейчас</h4><p>В браузере на этом устройстве. Резервная копия — в разделе «Настройки».</p></div>
      <div class="box" data-s="2"><h4>Для всей команды</h4><p style="margin-bottom:14px">Защищённая база: у каждой клиники своё пространство, доступ по ролям.</p>
        <span class="vp">Владелец</span><span class="vp">Бухгалтер</span><span class="vp">Управляющий</span><span class="vp">Просмотр</span></div></div>
    <div class="box accent" data-s="3" style="flex:none;margin-top:22px;max-width:900px"><h4 style="margin:0">Без персональных данных пациентов — только суммы, часы и количества</h4></div></div>`,
  routine: `<div class="vs"><div class="eyebrow" data-s="0">Как работать</div><h2 data-s="0">Простой ритм работы с программой</h2>
    <div class="row"><div class="box" data-s="1"><h4>Каждый день</h4><p>Внести операции или загрузить выписку банка</p></div>
      <div class="box" data-s="2"><h4>Раз в месяц</h4><p>Часы и услуги из МИС · оплаты страховых · зарплата врачей · списание по нормам</p><p data-s="3" style="margin-top:12px;color:#fff">План-факт и бюджет на следующий месяц</p></div>
      <div class="box accent" data-s="4"><h4>Руководителю</h4><p>Открыть «Обзор» — всё важное уже там</p></div></div></div>`,
  outro: `<div class="vs">${PULSE}<div class="logo" data-s="0">${LOGO(68)}<b>Пульс клиники</b></div>
    <h1 data-s="0" data-d="0.25">Деньги, прибыль, долги и мощность клиники — в одном окне</h1>
    <p class="lead" data-s="1">Спасибо за внимание</p></div>`,
};

// ---------- таймлайн ----------
function buildTimeline() {
  const lastFull = addMonths(curMonth(), -1);
  let t = 0; const scenes = [], subs = [];
  SCENES.forEach((sc, i) => {
    const file = path.join(DIR, 'audio', sc.id + '.mp3');
    if (!fs.existsSync(file)) throw new Error('нет озвучки: ' + sc.id);
    const { dur, sil } = probe(file);
    const prev = SCENES[i - 1];
    const dipIn = i > 0 && (prev.kind !== sc.kind || (sc.kind === 'app' && prev.view !== sc.view));
    const pre = PRE + (dipIn ? DIP : 0), post = POST + (sc.id === 'outro' ? 2.2 : 0);
    const start = t, a0 = start + pre, end = a0 + dur + post;
    const ss = sentences(sc.text), st = alignSentences(ss, dur, sil);
    const sents = ss.map((text, k) => ({ text, t: a0 + st[k], e: a0 + (k + 1 < ss.length ? st[k + 1] : dur) }));
    sents.forEach(s => {
      const cs = chunks(s.text), L = cs.reduce((a, c) => a + c.length, 0); let c0 = s.t;
      cs.forEach(c => { const c1 = c0 + (s.e - s.t) * c.length / L; subs.push({ t0: c0, t1: Math.max(c1, c0 + 0.6), text: c }); c0 = c1; });
    });
    const at = sv => { const k = Math.floor(sv), f = sv - k, s = sents[Math.min(k, sents.length - 1)]; return s.t + f * (s.e - s.t); };
    const acts = [];
    (sc.steps || []).forEach(stp => {
      const tt = at(stp.s);
      const base = { t: tt };
      if (sc.id === 'budget' && stp.s === 1) acts.push({ t: at(0) + 0.4, set: ['#budMonth', lastFull] });
      acts.push({ ...base, ...stp });
    });
    if (sc.id === 'breakeven') acts.unshift({ t: start + 0.1, set: ['#budMonth', lastFull] });
    acts.sort((a, b) => a.t - b.t);
    scenes.push({ id: sc.id, kind: sc.kind, view: sc.view, slide: sc.slide, chapter: sc.chapter || '', start, end, audioAt: a0, dur, dipIn, sents, acts });
    t = end;
  });
  // последняя пауза субтитров — до начала следующего
  subs.forEach((s, k) => { const n = subs[k + 1]; if (n && s.t1 > n.t0) s.t1 = n.t0; if (n && n.t0 - s.t1 < 0.5) s.t1 = n.t0; });
  return { scenes, subs, total: t, slides: SLIDES, cards: cards(lastFull), files: { 'sample-ops.csv': fs.readFileSync(path.join(DIR, 'sample-ops.csv'), 'utf8') } };
}

// ---------- браузер ----------
async function openPage(TL) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--force-color-profile=srgb', '--font-render-hinting=none', '--disable-background-networking', '--disable-component-update', '--no-pings'], proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3, colorScheme: 'light', locale: 'ru-RU', ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + APP + '#overview');
  await page.waitForSelector('#view .tiles');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.addStyleTag({ content: '*{transition:none!important;animation:none!important;caret-color:transparent!important} html{scrollbar-width:none} ::-webkit-scrollbar{display:none} #toasts{display:none!important}' });
  await page.addScriptTag({ path: path.join(DIR, 'director.js') });
  await page.evaluate(tl => window.__vo.setup(tl), TL);
  return { browser, page, errs };
}

async function main() {
  const TL = buildTimeline();
  console.log(`сцен ${TL.scenes.length}, длительность ${(TL.total / 60).toFixed(2)} мин, субтитров ${TL.subs.length}`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(path.join(DIR, 'out', 'timeline.json'), JSON.stringify({ scenes: TL.scenes.map(s => ({ id: s.id, start: +s.start.toFixed(2), end: +s.end.toFixed(2), audioAt: +s.audioAt.toFixed(2), acts: s.acts.map(a => +a.t.toFixed(2)) })), total: TL.total }, null, 1));
  const tc = x => { const ms = Math.round(x * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
  fs.writeFileSync(OUT.replace(/\.mp4$/, '.srt'), TL.subs.map((x, k) => `${k + 1}\n${tc(x.t0)} --> ${tc(x.t1)}\n${x.text}\n`).join('\n'));
  if (has('--timeline')) return;
  const { browser, page, errs } = await openPage(TL);
  const warns = new Set();
  const seek = async t => { const r = await page.evaluate(x => window.__vo.seek(x), t); r.warn.forEach(w => warns.add(w)); return r; };

  if (has('--check')) { // быстрый прогон с шагом 0.25 с — проверка селекторов
    for (let t = 0; t < TL.total; t += 0.25) await seek(t);
    console.log('предупреждения:', [...warns]); console.log('ошибки страницы:', errs);
    await browser.close(); return;
  }
  if (arg('--stills')) {
    const ts = arg('--stills').split(',').map(Number);
    let last = 0;
    for (const T of ts) { for (let t = last; t < T; t += 1 / FPS * 3) await seek(t); await seek(T); last = T; await page.screenshot({ path: path.join(DIR, 'out', `still_${String(T).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 85 }); }
    console.log('кадры готовы; предупреждения:', [...warns], 'ошибки:', errs);
    await browser.close(); return;
  }

  const from = +(arg('--from') || 0), to = Math.min(TL.total, +(arg('--to') || TL.total));
  const vtmp = OUT.replace(/\.mp4$/, '.video.mp4');
  const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-r', String(FPS), vtmp], { stdio: ['pipe', 'inherit', 'inherit'] });
  const write = buf => new Promise(r => (ff.stdin.write(buf) ? r() : ff.stdin.once('drain', r)));
  // догоняем состояние до from
  for (let t = 0; t < from; t += 1 / FPS) await seek(t);
  let last = null, shots = 0; const N = Math.round((to - from) * FPS), t0 = Date.now();
  for (let f = 0; f < N; f++) {
    const t = from + f / FPS;
    const r = await seek(t);
    if (r.dirty || !last) { last = await page.screenshot({ type: 'jpeg', quality: 93 }); shots++; }
    await write(last);
    if (f % 600 === 0) console.log(`кадр ${f}/${N} (${(t / 60).toFixed(1)} мин), снимков ${shots}, ${((Date.now() - t0) / 1000).toFixed(0)} с`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
  console.log('видео готово, снимков', shots, 'из', N, '; предупреждения:', [...warns], 'ошибки:', errs);

  // звук: каждая сцена со своей задержкой, затем нормализация громкости
  const inputs = [], filt = [], use = [];
  TL.scenes.filter(s => s.audioAt + s.dur > from && s.audioAt < to).forEach((s, k) => {
    inputs.push('-i', path.join(DIR, 'audio', s.id + '.mp3'));
    const d = Math.round((s.audioAt - from) * 1000);
    filt.push(`[${k}:a]aresample=48000${d >= 0 ? `,adelay=${d}:all=1` : `,atrim=start=${-d / 1000},asetpts=PTS-STARTPTS`}[a${k}]`);
    use.push(`[a${k}]`);
  });
  const fc = filt.join(';') + ';' + use.join('') + `amix=inputs=${use.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad[out]`;
  const atmp = OUT.replace(/\.mp4$/, '.audio.m4a');
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', fc, '-map', '[out]', '-t', String(to - from), '-c:a', 'aac', '-b:a', '192k', atmp]);
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', vtmp, '-i', atmp, '-c:v', 'copy', '-c:a', 'copy', '-movflags', '+faststart', '-shortest', OUT]);
  fs.rmSync(vtmp); fs.rmSync(atmp);
  console.log('готово:', OUT);
}
main().catch(e => { console.error(e); process.exit(1); });
