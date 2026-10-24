// Выгрузка в Excel (.xlsx): настоящие таблицы с формулами, а не текст в одной ячейке.
// Правило: синие цифры — данные из программы, чёрные — формулы. Поменяли синюю — всё пересчиталось.
import { sum, div, today, ym, monLong, monShort, isPartialMonth, fmtDate, daysDiff, toast } from './util.js';
import { store } from './store.js';
import { GROUPS } from './model.js';
import { ctx, pnl, cashflow, cashForecast, debts, AGING, planFact, breakEven, avgCheck, capacity, doctors, payroll, services, marketing, stock } from './calc.js';

// ---------- библиотека Excel (с поддержкой цветов и жирного шрифта) ----------
const XL_SRC = ['js/vendor/xlsx.min.js', 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.min.js'];
let xlP = null;
export function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (xlP) return xlP;
  const tryLoad = i => new Promise((res, rej) => {
    if (i >= XL_SRC.length) return rej(new Error('Не удалось загрузить модуль Excel. Проверьте интернет и повторите.'));
    const sc = document.createElement('script');
    sc.src = XL_SRC[i];
    sc.onload = () => (window.XLSX ? res(window.XLSX) : tryLoad(i + 1).then(res, rej));
    sc.onerror = () => { sc.remove(); tryLoad(i + 1).then(res, rej); };
    document.head.appendChild(sc);
  });
  xlP = tryLoad(0).catch(e => { xlP = null; throw e; });
  return xlP;
}

// ---------- ячейки и стили ----------
const COL = i => { let s = '', n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const A = (r, c) => COL(c) + (r + 1);            // адрес ячейки по номеру строки и столбца (с нуля)
const AA = (r, c) => '$' + COL(c) + '$' + (r + 1);
const serial = iso => Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5);
const line = { style: 'thin', color: { rgb: '8FB3AB' } };
const ST = {
  title: { font: { bold: true, sz: 15, color: { rgb: '12332E' } } },
  sub: { font: { sz: 11, color: { rgb: '4F6560' } } },
  legend: { font: { italic: true, sz: 10, color: { rgb: '6B7C78' } } },
  head: { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1F6F63' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } },
  headL: { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1F6F63' } }, alignment: { horizontal: 'left', vertical: 'center', wrapText: true } },
  group: { font: { bold: true }, fill: { fgColor: { rgb: 'EAF3F1' } } },
  total: { font: { bold: true }, fill: { fgColor: { rgb: 'D3E8E3' } }, border: { top: line } },
  grand: { font: { bold: true, sz: 12 }, fill: { fgColor: { rgb: 'BFE0D8' } }, border: { top: line, bottom: line } },
  inp: { font: { color: { rgb: '1F4FBF' } } },
  note: { font: { italic: true, sz: 10, color: { rgb: '6B7C78' } } },
  kid: { alignment: { horizontal: 'left', indent: 1 } },
  warn: { font: { bold: true, color: { rgb: 'B3261E' } } },
  label: { font: { bold: true } },
};
const mix = (...a) => {
  const o = {};
  a.filter(Boolean).forEach(x => { for (const k in x) o[k] = k === 'font' ? { ...o.font, ...x.font } : x[k]; });
  return o;
};
const Z = { m: '#,##0;[Red]-#,##0', m2: '#,##0.00', p: '0.0%', p0: '0%', d: 'dd.mm.yy', h: '#,##0.0', i: '0' };
const T = (v, s) => ({ t: 's', v: String(v ?? ''), s });
const N = (v, z = Z.m, s) => ({ t: 'n', v: Number.isFinite(+v) ? +v : 0, z, s });
const DT = (iso, s) => (iso ? { t: 'n', v: serial(iso), z: Z.d, s: mix({ alignment: { horizontal: 'left' } }, s) } : undefined);
const F = (f, v, z = Z.m, s) => (typeof v === 'string' ? { t: 's', f, v, s } : { t: 'n', f, v: Number.isFinite(v) ? v : 0, z, s });
const INP = s => mix(ST.inp, s);

class Grid {
  constructor() { this.rows = []; this.cols = []; this.filter = null; this.merges = []; }
  get n() { return this.rows.length; }
  row(cells = []) { this.rows.push(cells); return this.rows.length - 1; }
  set(r, c, cell) { (this.rows[r] ||= [])[c] = cell; }
  blank() { return this.row([]); }
}
const clinicName = () => store.s.settings.clinicName || 'Клиника';
const stamp = () => { const t = today(); return t.slice(8, 10) + '.' + t.slice(5, 7) + '.' + t.slice(0, 4); };
const periodText = ms => (!ms || !ms.length ? '' : ms.length === 1 ? monLong(ms[0]) : monLong(ms[0]) + ' — ' + monLong(ms[ms.length - 1]));
const mh = m => monShort(m) + ' ' + m.slice(2, 4) + (isPartialMonth(m) ? '*' : '');
function intro(g, title, sub, legend) {
  g.row([T(clinicName() + ' — ' + title, ST.title)]);
  g.row([T(sub + ' · выгружено ' + stamp(), ST.sub)]);
  g.row([T(legend || 'Синие цифры — данные из программы, чёрные — формулы. Поменяйте синюю цифру — расчёт пересчитается.', ST.legend)]);
  g.blank();
}
const sheetName = s => s.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);

function toWs(X, g, noCache) {
  const ws = {}; let maxC = 0;
  g.rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (!cell) continue;
      const o = { ...cell };
      if (noCache && o.f) delete o.v;
      ws[X.utils.encode_cell({ r, c })] = o;
      if (c > maxC) maxC = c;
    }
  });
  ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, g.rows.length - 1), c: maxC } });
  ws['!cols'] = g.cols.map(w => ({ wch: w }));
  if (g.filter) ws['!autofilter'] = { ref: g.filter };
  if (g.merges.length) ws['!merges'] = g.merges;
  ws['!rows'] = g.rows.map((_, r) => (g.heights?.[r] ? { hpx: g.heights[r] } : {}));
  return ws;
}
export function buildWorkbook(X, sheets, noCache = false) {
  const wb = X.utils.book_new();
  sheets.forEach(sh => X.utils.book_append_sheet(wb, toWs(X, sh.grid, noCache), sheetName(sh.name)));
  return wb;
}
export async function downloadXlsx(file, sheets) {
  try {
    const X = await loadXLSX();
    X.writeFile(buildWorkbook(X, sheets), file.replace(/[\\/:*?"<>|]/g, ' ') + '.xlsx');
    toast('Файл Excel сохранён');
  } catch (e) { toast(e.message || 'Не удалось сформировать файл', 'err'); }
}
const fname = (what, ms) => `Пульс клиники — ${what}${ms ? ' ' + (ms.length === 1 ? ms[0] : ms[0] + '…' + ms[ms.length - 1]) : ''}`;

// ---------- кнопка ----------
export const xlButton = (label = 'Скачать Excel') => `<button type="button" class="btn ghost" data-xl>${label}</button>`;
export const noXl = html => html.replace(/<button[^>]*data-xl[^>]*>[^<]*<\/button>/, '');
export function bindXl(el, fn) {
  const b = el.querySelector('[data-xl]');
  if (!b) return;
  b.onclick = async () => { b.disabled = true; try { await fn(); } finally { b.disabled = false; } };
}

// ================= ОПЕРАЦИИ =================
const TYPE_RU = { income: 'доход', expense: 'расход', transfer: 'перевод' };
export function sheetsOps(s, list) {
  const C = ctx(s), g = new Grid();
  g.cols = [11, 11, 10, 28, 20, 18, 20, 22, 18, 16, 14, 13, 14, 30, 14];
  intro(g, 'Журнал операций', `${list.length} операций`, 'Синие цифры — данные из программы, чёрные — формулы. Столбцы можно фильтровать: итог в строке «видимые строки» пересчитывается.');
  const first = g.n + 6, last = first + list.length - 1;
  const rng = c => `${AA(first, c)}:${AA(Math.max(first, last), c)}`;
  const inc = sum(list.filter(o => o.type === 'income'), o => o.amount), exp = sum(list.filter(o => o.type === 'expense'), o => o.amount);
  g.row([T('Доходы', ST.label), F(`SUMIF(${rng(2)},"доход",${rng(10)})`, inc)]);                         // 4
  g.row([T('Расходы', ST.label), F(`SUMIF(${rng(2)},"расход",${rng(10)})`, exp)]);                       // 5
  g.row([T('Результат: доходы − расходы', ST.label), F('B5-B6', inc - exp, Z.m, ST.total)]);               // 6
  g.row([T('Итого по видимым строкам (после фильтра)', ST.label), F(`SUBTOTAL(109,${rng(14)})`, inc - exp, Z.m, ST.total)]); // 7
  g.blank();
  const hr = g.row(['Дата', 'Дата оплаты', 'Тип', 'Статья', 'Группа статьи', 'Отделение', 'Врач', 'Контрагент', 'Документ', 'Счёт', 'Сумма', 'Отказ страховой', 'Статус оплаты', 'Комментарий', 'Со знаком (+доход, −расход)'].map((h, i) => T(h, i === 13 ? ST.headL : ST.head)));
  g.heights = { [hr]: 34 };
  list.forEach((o, i) => {
    const r = first + i, cat = C.cat[o.category_id];
    const sign = o.type === 'income' ? o.amount : o.type === 'expense' ? -o.amount : 0;
    g.row([DT(o.date, ST.inp), DT(o.paid, ST.inp), T(TYPE_RU[o.type] || o.type), T(o.type === 'transfer' ? 'Перевод между счетами' : cat?.name || ''), T(o.type === 'transfer' ? '' : GROUPS[cat?.grp]?.name || ''),
      T(C.dep[o.department_id]?.name || ''), T(C.doc[o.doctor_id]?.name || ''), T(C.cp[o.counterparty_id]?.name || ''), T(o.doc || ''),
      T(o.type === 'transfer' ? `${C.acc[o.account_id]?.name || ''} → ${C.acc[o.to_account_id]?.name || ''}` : C.acc[o.account_id]?.name || ''),
      N(o.amount, Z.m, ST.inp), o.rejected ? N(o.rejected, Z.m, ST.inp) : undefined,
      F(`IF(${A(r, 1)}="","не оплачено","оплачено")`, o.paid ? 'оплачено' : 'не оплачено'), T(o.comment || ''),
      F(`IF(${A(r, 2)}="доход",${A(r, 10)},IF(${A(r, 2)}="расход",-${A(r, 10)},0))`, sign)]);
  });
  g.filter = `A${hr + 1}:O${Math.max(hr + 2, last + 1)}`;
  return [{ name: 'Операции', grid: g }];
}

// ================= ОПиУ =================
// Общий каркас для отчётов «статьи × месяцы»: группа = сумма статей под ней, итоги = формулы по строкам.
function reportGrid(title, sub, months, extraHead = []) {
  const g = new Grid(), n = months.length;
  g.cols = [44, ...months.map(() => 13), 15, 11, 52];
  intro(g, title, sub, 'Синие цифры — данные из программы, чёрные — формулы. * — месяц ещё идёт. Расходы показаны со знаком минус.');
  g.row([T('Статья', ST.headL), ...months.map(m => T(mh(m), ST.head)), T('Итого', ST.head), ...extraHead.map(h => T(h, ST.head)), T('Как считается', ST.headL)]);
  return g;
}
export function sheetsPnl(s, months) {
  const C = ctx(s), L = pnl(s, months), n = months.length, g = reportGrid('Прибыли и убытки', 'метод начисления (по дате оказания услуги) · ' + periodText(months), months, ['% выручки']);
  const cT = n + 1, cP = n + 2, cN = n + 3, mc = i => 1 + i;
  const meta = [], at = {};
  const emit = (key, label, vals, o = {}) => {
    const r = g.n, st = o.kind === 'total' ? ST.total : o.kind === 'grand' ? ST.grand : o.kind === 'group' ? ST.group : null;
    const cells = [T(o.kid ? label : label, mix(st, o.kid && ST.kid))];
    months.forEach((m, i) => {
      const v = vals[i];
      cells[mc(i)] = o.fn ? F(o.fn(mc(i), r), v, Z.m, st) : N(v, Z.m, o.kind ? st : INP(st));
    });
    const tot = sum(vals);
    cells[cT] = F(`SUM(${A(r, mc(0))}:${A(r, mc(n - 1))})`, tot, Z.m, st);
    cells[cN] = T(o.note || '', ST.note);
    g.row(cells); meta.push({ r, tot, st }); if (key) at[key] = r;
    return r;
  };
  const group = (key, label, vals, kids, note, sign = 1) => {
    const r = g.n, k = kids.length;
    emit(key, label, vals.map(v => sign * v), { kind: 'group', fn: k ? c => `SUM(${A(r + 1, c)}:${A(r + k, c)})` : null, note });
    kids.forEach(x => emit(null, x.label, x.vals.map(v => sign * v), { kid: true }));
  };
  const catsOf = grp => s.categories.filter(c => c.grp === grp).map(c => ({ label: c.name, l: L.cat(c.id) })).filter(x => x.l.total || months.some(m => x.l[m])).map(x => ({ label: x.label, vals: months.map(m => x.l[m]) }));
  const arr = l => months.map(m => l[m]);
  const calc = (...keys) => c => keys.map(k => A(at[k], c)).join('+');
  group('rev', 'Выручка', arr(L.revenue), catsOf('revenue'), 'Все доходы от пациентов по дате оказания услуги');
  const rej = L.rejected.total ? [{ label: 'Отказы страховых по реестрам', vals: arr(L.rejected) }] : [];
  group('adj', 'Возвраты и отказы страховых', arr(L.adj), [...catsOf('revenue_adj'), ...rej], 'Возвраты пациентам и суммы, которые страховая отказалась оплатить', -1);
  emit('net', 'Чистая выручка', arr(L.net), { kind: 'total', fn: calc('rev', 'adj'), note: 'Выручка − возвраты и отказы' });
  group('var', 'Переменные расходы', arr(L.variable), catsOf('variable'), 'Растут вместе с объёмом: зарплата врачей, материалы, эквайринг', -1);
  emit('margin', 'Маржинальная прибыль', arr(L.margin), { kind: 'total', fn: calc('net', 'var'), note: 'Чистая выручка − переменные расходы' });
  group('fix', 'Постоянные расходы', arr(L.fixed), catsOf('fixed'), 'Не зависят от объёма: аренда, оклады персонала, коммуналка, реклама', -1);
  emit('ebitda', 'Операционная прибыль (EBITDA)', arr(L.ebitda), { kind: 'total', fn: calc('margin', 'fix'), note: 'Маржинальная прибыль − постоянные расходы' });
  emit('amort', 'Амортизация оборудования', arr(L.amort).map(v => -v), { note: 'Стоимость купленного оборудования ÷ срок службы (мес.) — списывается по частям' });
  group('oth', 'Прочие доходы', arr(L.other), catsOf('other_income'), 'Доходы не от пациентов: аренда помещений, проценты и т. п.');
  emit('ebt', 'Прибыль до налогов', arr(L.ebt), { kind: 'total', fn: calc('ebitda', 'amort', 'oth'), note: 'EBITDA − амортизация + прочие доходы' });
  group('tax', 'Налоги на доход', arr(L.tax), catsOf('tax'), 'Налог на прибыль/доход', -1);
  emit('profit', 'Чистая прибыль', arr(L.profit), { kind: 'grand', fn: calc('ebt', 'tax'), note: 'Прибыль до налогов − налоги' });
  const netTot = L.net.total;
  meta.forEach(x => g.set(x.r, cP, F(`IF(${AA(at.net, cT)}=0,0,${A(x.r, cT)}/${AA(at.net, cT)})`, div(x.tot, netTot), Z.p, x.st)));
  g.blank();
  g.row([T('Покупка оборудования в отчёт целиком не попадает — она раскладывается по месяцам через амортизацию. Кредиты и выплаты собственникам в этот отчёт не входят (смотрите «Движение денег»).', ST.note)]);
  return [{ name: 'Прибыли и убытки', grid: g }];
}

// ================= ДДС =================
export function sheetsCash(s, months) {
  const C = ctx(s), F0 = cashflow(s, months), n = months.length, g = reportGrid('Движение денег', 'по дате оплаты · ' + periodText(months), months);
  const cT = n + 1, cN = n + 2, mc = i => 1 + i;
  const at = {};
  const arr = l => months.map(m => l[m]);
  const emit = (key, label, vals, o = {}) => {
    const r = g.n, st = o.kind === 'total' ? ST.total : o.kind === 'grand' ? ST.grand : o.kind === 'group' ? ST.group : null;
    const cells = [T(label, mix(st, o.kid && ST.kid))];
    months.forEach((m, i) => { cells[mc(i)] = o.fn ? F(o.fn(mc(i), r, i), vals[i], Z.m, st) : N(vals[i], Z.m, o.kind ? st : INP(st)); });
    cells[cT] = o.totFn ? F(o.totFn(r), o.tot ?? sum(vals), Z.m, st) : F(`SUM(${A(r, mc(0))}:${A(r, mc(n - 1))})`, sum(vals), Z.m, st);
    cells[cN] = T(o.note || '', ST.note);
    g.row(cells); if (key) at[key] = r;
  };
  const cats = (grps, type) => s.categories.filter(c => grps.includes(c.grp) && GROUPS[c.grp].type === type).map(c => ({ label: c.name, l: F0.cat(c.id) })).filter(x => x.l.total);
  const open = F0.open, close = F0.close;
  emit('open', 'Остаток на начало', months.map(m => open[m]), { kind: 'total', note: 'Деньги на счетах в начале месяца = остаток на конец прошлого месяца', totFn: r => A(r, mc(0)), tot: F0.opening });
  // первая ячейка «остатка на начало» — данные (сумма начальных остатков + все оплаты до периода)
  g.set(at.open, mc(0), N(open[months[0]], Z.m, mix(ST.total, { font: { bold: true, color: { rgb: '1F4FBF' } } })));
  const section = (key, label, l, kids, note, sign) => {
    const r = g.n, resid = l.total - sum(kids, x => x.l.total);
    const all = [...kids.map(x => ({ label: x.label, vals: arr(x.l) })), ...(Math.abs(resid) > 0.5 ? [{ label: 'Прочее', vals: months.map(m => l[m] - sum(kids, x => x.l[m])) }] : [])];
    const k = all.length;
    emit(key, label, arr(l).map(v => sign * v), { kind: 'group', fn: k ? c => `SUM(${A(r + 1, c)}:${A(r + k, c)})` : null, note });
    all.forEach(x => emit(null, x.label, x.vals.map(v => sign * v), { kid: true }));
  };
  const calc = (...keys) => c => keys.map(k => A(at[k], c)).join('+');
  section('opin', 'Поступления от операционной деятельности', F0.op_in, cats(['revenue', 'other_income'], 'income'), 'Деньги от пациентов и страховых, реально полученные в месяце', 1);
  section('opout', 'Выплаты по операционной деятельности', F0.op_out, cats(['revenue_adj', 'variable', 'fixed', 'tax'], 'expense'), 'Реально выплаченные расходы: зарплаты, материалы, аренда, налоги', -1);
  emit('opnet', 'Операционный денежный поток', arr(F0.op_net), { kind: 'total', fn: calc('opin', 'opout'), note: 'Поступления − выплаты по основной деятельности' });
  section('inv', 'Инвестиции: оборудование и ремонт', F0.inv_out, cats(['capex'], 'expense'), 'Покупка оборудования (в прибыль попадает через амортизацию)', -1);
  section('finin', 'Получено: кредиты и вложения', F0.fin_in, cats(['financing_in'], 'income'), 'Кредиты и вложения собственников', 1);
  section('finout', 'Выплачено: кредиты и собственникам', F0.fin_out, cats(['financing_out'], 'expense'), 'Погашение кредитов и выплаты собственникам', -1);
  emit('net', 'Чистый денежный поток', arr(F0.net), { kind: 'total', fn: calc('opnet', 'inv', 'finin', 'finout'), note: 'Операционный поток + инвестиции + финансирование' });
  emit('close', 'Остаток на конец', months.map(m => close[m]), { kind: 'grand', fn: c => `${A(at.open, c)}+${A(at.net, c)}`, note: 'Остаток на начало + чистый денежный поток', totFn: r => A(r, mc(n - 1)), tot: close[months[n - 1]] });
  // «остаток на начало» теперь можно связать с «остатком на конец» прошлого месяца
  for (let i = 1; i < n; i++) g.set(at.open, mc(i), F(A(at.close, mc(i - 1)), open[months[i]], Z.m, ST.total));
  const sheets = [{ name: 'Движение денег', grid: g }];
  const fc = cashForecast(s, 3);
  if (fc.rows.length) {
    const h = new Grid(); h.cols = [22, 16, 16, 16, 44];
    intro(h, 'Прогноз остатка денег', 'на 3 месяца вперёд', 'Синие цифры — расчёт программы по тренду, чёрные — формулы. Остаток = прошлый остаток + придёт − уйдёт.');
    h.row([T('Месяц', ST.headL), T('Придёт', ST.head), T('Уйдёт', ST.head), T('Остаток', ST.head), T('Откуда цифра', ST.headL)]);
    const r0 = h.n;
    h.row([T('Сейчас'), undefined, undefined, N(fc.start, Z.m, INP()), T('Деньги на счетах сегодня', ST.note)]);
    fc.rows.forEach((x, i) => {
      const r = r0 + 1 + i;
      h.row([T((x.rest ? 'Остаток ' + monShort(x.m) : monLong(x.m))), N(x.inflow, Z.m, INP()), N(x.outflow, Z.m, INP()), F(`${A(r - 1, 3)}+${A(r, 1)}-${A(r, 2)}`, x.close), T(x.src, ST.note)]);
    });
    h.blank();
    h.row([T('Поступления — по тренду последних 6 месяцев, выплаты — средние за 3 месяца. Если на месяц задан бюджет, берётся он.', ST.note)]);
    sheets.push({ name: 'Прогноз остатка', grid: h });
  }
  return sheets;
}

// ================= ПЛАН-ФАКТ =================
export function sheetsBudget(s, scope, onlyFilled = true) {
  const C = ctx(s), pf = planFact(s, scope), L = pnl(s, scope), be = breakEven(L, avgCheck(s, scope, L));
  const g = new Grid(); g.cols = [42, 16, 16, 16, 13, 46];
  intro(g, 'План-факт', periodText(scope), 'Синие цифры — данные из программы (план можно менять), чёрные — формулы.');
  g.row([T('Статья', ST.headL), T('План', ST.head), T('Факт', ST.head), T('Отклонение (факт − план)', ST.head), T('Исполнение', ST.head), T('Как считается', ST.headL)]);
  const byCat = Object.fromEntries(pf.rows.map(r => [r.cat.id, r]));
  const gr = {};
  Object.entries(GROUPS).forEach(([k, gg]) => {
    const rws = s.categories.filter(c => c.grp === k).map(c => byCat[c.id] || { cat: c, plan: 0, fact: 0 }).filter(r => !onlyFilled || r.plan || r.fact);
    if (!rws.length) return;
    const r = g.n, kn = rws.length, tp = sum(rws, x => x.plan), tf = sum(rws, x => x.fact);
    gr[k] = { r, plan: tp, fact: tf, income: gg.type === 'income' };
    g.row([T(gg.name, ST.group), F(`SUM(${A(r + 1, 1)}:${A(r + kn, 1)})`, tp, Z.m, ST.group), F(`SUM(${A(r + 1, 2)}:${A(r + kn, 2)})`, tf, Z.m, ST.group),
      F(`${A(r, 2)}-${A(r, 1)}`, tf - tp, Z.m, ST.group), F(`IF(${A(r, 1)}=0,"",${A(r, 2)}/${A(r, 1)})`, tp ? tf / tp : '', Z.p0, ST.group), T('', ST.note)]);
    rws.forEach(x => {
      const rr = g.n;
      g.row([T(x.cat.name, ST.kid), N(x.plan, Z.m, INP()), N(x.fact, Z.m, INP()), F(`${A(rr, 2)}-${A(rr, 1)}`, x.fact - x.plan), F(`IF(${A(rr, 1)}=0,"",${A(rr, 2)}/${A(rr, 1)})`, x.plan ? x.fact / x.plan : '', Z.p0)]);
    });
  });
  g.blank();
  const sum2 = (c, keys) => keys.filter(k => gr[k]).map(k => A(gr[k].r, c)).join('+') || '0';
  const pin = ['revenue', 'other_income'], pout = ['revenue_adj', 'variable', 'fixed', 'tax'];
  g.row([T('Итого', ST.headL), T('План', ST.head), T('Факт', ST.head), T('Отклонение', ST.head), T('', ST.head), T('Как считается', ST.headL)]);
  const rr = g.n;
  g.row([T('Выручка', ST.label), F(sum2(1, ['revenue']), pf.plan.revenue), F(sum2(2, ['revenue']), pf.fact.revenue), F(`${A(rr, 2)}-${A(rr, 1)}`, pf.fact.revenue - pf.plan.revenue), undefined, T('Группа «Доходы от пациентов»', ST.note)]);
  g.row([T('Расходы', ST.label), F(sum2(1, pout), pf.plan.expense), F(sum2(2, pout), pf.fact.expense), F(`${A(rr + 1, 2)}-${A(rr + 1, 1)}`, pf.fact.expense - pf.plan.expense), undefined, T('Возвраты, переменные и постоянные расходы, налоги', ST.note)]);
  g.row([T('Прибыль', ST.grand), F(`${sum2(1, pin)}-(${sum2(1, pout)})`, pf.plan.profit, Z.m, ST.grand), F(`${sum2(2, pin)}-(${sum2(2, pout)})`, pf.fact.profit, Z.m, ST.grand), F(`${A(rr + 2, 2)}-${A(rr + 2, 1)}`, pf.fact.profit - pf.plan.profit, Z.m, ST.grand), undefined, T('Доходы − расходы', ST.note)]);
  g.blank();
  g.row([T('Безубыточность', ST.headL), T('Значение', ST.head), T('', ST.head), T('', ST.head), T('', ST.head), T('Как считается', ST.headL)]);
  const b0 = g.n;
  g.row([T('Постоянные расходы + амортизация в месяц', ST.label), N(be.fixedM, Z.m, INP()), undefined, undefined, undefined, T('Из «Прибылей и убытков», в среднем за месяц периода', ST.note)]);
  g.row([T('Доля маржинальной прибыли в выручке', ST.label), N(be.mr, Z.p, INP()), undefined, undefined, undefined, T('Маржинальная прибыль ÷ чистая выручка', ST.note)]);
  g.row([T('Точка безубыточности (выручка в месяц)', ST.label), F(`IF(${A(b0 + 1, 1)}>0,${A(b0, 1)}/${A(b0 + 1, 1)},"нет")`, isFinite(be.be) ? be.be : 'нет', Z.m, ST.total), undefined, undefined, undefined, T('Постоянные расходы ÷ доля маржи — при такой выручке клиника выходит в ноль', ST.note)]);
  g.row([T('Фактическая выручка в месяц', ST.label), N(be.netM, Z.m, INP()), undefined, undefined, undefined, T('Чистая выручка за период ÷ число месяцев', ST.note)]);
  g.row([T('Запас прочности', ST.label), F(`IF(OR(${A(b0 + 3, 1)}=0,NOT(ISNUMBER(${A(b0 + 2, 1)}))),0,(${A(b0 + 3, 1)}-${A(b0 + 2, 1)})/${A(b0 + 3, 1)})`, isFinite(be.safety) ? be.safety : 0, Z.p, ST.total), undefined, undefined, undefined, T('На сколько % выручка может упасть, прежде чем клиника уйдёт в минус', ST.note)]);
  return [{ name: 'План-факт', grid: g }];
}

// ================= ДОЛГИ =================
export function sheetsDebts(s) {
  const d = debts(s), out = [];
  [['rec', 'Нам должны', d.rec, 'Кто должен', 'К получению'], ['pay', 'Мы должны', d.pay, 'Кому должны', 'К оплате']].forEach(([k, name, list, who, amt]) => {
    const g = new Grid(); g.cols = [34, 17, 17, 17, 17, 17, 17, 34];
    intro(g, name, 'на ' + stamp(), 'Синие цифры — данные из программы, чёрные — формулы. «Просрочка» считается от сегодняшней даты и пересчитывается при каждом открытии файла.');
    const aging = k === 'rec' ? d.recAging : d.payAging;
    // список документов (ниже), старение — формулами по нему
    const nA = aging.length, aStart = g.n + 2, listHead = aStart + nA + 3, first = listHead + 1, last = first + list.length - 1;
    const rng = c => `${AA(first, c)}:${AA(Math.max(first, last), c)}`;
    g.row([T('Старение долгов (дней после срока оплаты)', ST.label)]);
    g.row([T(who, ST.headL), ...AGING.map(a => T(a, ST.head)), T('Итого', ST.head), T('', ST.head)]);
    const rngA = c => `${A(aStart, c)}:${A(aStart + nA - 1, c)}`;
    const bounds = [['<=0'], ['>=1', '<=30'], ['>=31', '<=60'], ['>=61', '<=90'], ['>90']];
    aging.forEach((x, i) => {
      const r = aStart + i;
      g.row([T(x.name), ...x.b.map((v, b) => F(`SUMIFS(${rng(5)},${rng(1)},${AA(r, 0)},${bounds[b].map(c => `${rng(4)},"${c}"`).join(',')})`, v)), F(`SUM(${A(r, 1)}:${A(r, 5)})`, x.total, Z.m, ST.total)]);
    });
    g.row([T('Всего', ST.total), ...AGING.map((_, b) => (nA ? F(`SUM(${rngA(1 + b)})`, sum(aging, x => x.b[b]), Z.m, ST.total) : N(0, Z.m, ST.total))), nA ? F(`SUM(${rngA(6)})`, sum(aging, x => x.total), Z.m, ST.grand) : N(0, Z.m, ST.grand)]);
    g.blank();
    g.row([T('Документы', ST.label)]);
    g.row([T('Дата', ST.headL), T(k === 'rec' ? 'Плательщик' : 'Получатель', ST.headL), T('Документ · статья', ST.headL), T('Срок оплаты', ST.head), T('Просрочка, дн.', ST.head), T(amt, ST.head), T('Отказ страховой', ST.head), T('Комментарий', ST.headL)]);
    const t0 = serial(today());
    list.forEach((x, i) => {
      const r = first + i;
      g.row([DT(x.op.date, ST.inp), T(x.cp?.name || 'Без контрагента'), T([x.op.doc, x.cat?.name].filter(Boolean).join(' · ')), DT(x.due, ST.inp),
        F(`TODAY()-${A(r, 3)}`, t0 - serial(x.due), Z.i), N(x.out, Z.m, INP()), x.op.rejected ? N(x.op.rejected, Z.m, INP()) : undefined, T(x.op.comment || '')]);
    });
    g.row([T('Итого', ST.total), T('', ST.total), T('', ST.total), T('', ST.total), T('', ST.total), F(`SUM(${rng(5)})`, sum(list, x => x.out), Z.m, ST.grand), F(`SUM(${rng(6)})`, sum(list, x => x.op.rejected || 0), Z.m, ST.total), T('', ST.total)]);
    out.push({ name, grid: g });
  });
  return out;
}
// В «старении» ключ связи — название контрагента: у документов он записан так же.

// ================= МОЩНОСТЬ =================
export function sheetsCapacity(s, months) {
  const cap = capacity(s, months), C = ctx(s);
  const g = new Grid(); g.cols = [34, 13, 13, 13, 12, 11, 11, 11, 16, 18, 16];
  intro(g, 'Загрузка и потенциал выручки', periodText(months));
  g.row([T('Целевая загрузка', ST.label), N(cap.target, Z.p0, INP())]);
  g.row([T('Меняйте целевую загрузку — «потенциал до цели» пересчитается.', ST.note)]);
  g.blank();
  const hr = g.row(['Ресурс', 'Доступно, ч', 'Занято, ч', 'Загрузка', 'Приёмов', 'Неявки', '% неявок', 'Выручка за час', 'Потенциал до цели', 'Если загрузка 100%'].map((h, i) => T(h, i ? ST.head : ST.headL)));
  g.heights = { [hr]: 34 };
  const tgt = AA(4, 1);
  const deps = s.departments.map(d => ({ d, rows: cap.rows.filter(x => x.r.department_id === d.id) })).filter(x => x.rows.length);
  const orphan = cap.rows.filter(x => !s.departments.some(d => d.id === x.r.department_id));
  if (orphan.length) deps.push({ d: { name: 'Без отделения' }, rows: orphan });
  const groupRows = [];
  deps.forEach(({ d, rows }) => {
    const r = g.n, k = rows.length, ok = rows.filter(x => x.avail > 0);
    const av = sum(rows, x => x.avail), bk = sum(rows, x => x.booked);
    groupRows.push(r);
    g.row([T(d.name + ' — по узкому месту', ST.group), F(`SUM(${A(r + 1, 1)}:${A(r + k, 1)})`, av, Z.m, ST.group), F(`SUM(${A(r + 1, 2)}:${A(r + k, 2)})`, bk, Z.m, ST.group),
      F(`IF(${A(r, 1)}=0,0,${A(r, 2)}/${A(r, 1)})`, div(bk, av), Z.p0, ST.group), F(`SUM(${A(r + 1, 4)}:${A(r + k, 4)})`, sum(rows, x => x.visits), Z.m, ST.group),
      F(`SUM(${A(r + 1, 5)}:${A(r + k, 5)})`, sum(rows, x => x.noshow), Z.m, ST.group), undefined, undefined,
      F(`MAX(${A(r + 1, 8)}:${A(r + k, 8)})`, ok.length ? Math.max(...ok.map(x => x.potTarget)) : 0, Z.m, ST.group), F(`MAX(${A(r + 1, 9)}:${A(r + k, 9)})`, ok.length ? Math.max(...ok.map(x => x.potFull)) : 0, Z.m, ST.group)]);
    rows.forEach(x => {
      const rr = g.n;
      g.row([T(x.r.name + ' (' + ({ doctor: 'врач', room: 'кабинет', equipment: 'оборудование' }[x.r.kind] || x.r.kind) + ')', ST.kid), N(x.avail, Z.m, INP()), N(x.booked, Z.m, INP()),
        F(`IF(${A(rr, 1)}=0,0,${A(rr, 2)}/${A(rr, 1)})`, x.util, Z.p0), N(x.visits, Z.m, INP()), N(x.noshow, Z.m, INP()), F(`IF(${A(rr, 4)}+${A(rr, 5)}=0,0,${A(rr, 5)}/(${A(rr, 4)}+${A(rr, 5)}))`, x.noshowRate, Z.p0),
        N(x.rate, Z.m, INP()), F(`MAX(0,${A(rr, 1)}*${tgt}-${A(rr, 2)})*${A(rr, 7)}`, x.potTarget), F(`MAX(0,${A(rr, 1)}-${A(rr, 2)})*${A(rr, 7)}`, x.potFull)]);
    });
  });
  g.blank();
  const fullPot = sum(deps, ({ rows }) => Math.max(0, ...rows.filter(x => x.avail > 0).map(x => x.potFull)));
  g.row([T('Потенциал выручки клиники (сумма по отделениям)', ST.grand), undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    F(groupRows.map(r => A(r, 8)).join('+') || '0', sum(cap.deps, x => x.potential), Z.m, ST.grand), F(groupRows.map(r => A(r, 9)).join('+') || '0', fullPot, Z.m, ST.grand)]);
  g.row([T('Врач и кабинет работают одновременно, поэтому в отделении берётся самый недогруженный ресурс (узкое место), а не сумма всех.', ST.note)]);
  g.row([T('Выручка за час у врача — по факту (выручка ÷ занятые часы); у кабинетов и оборудования — из справочника.', ST.note)]);
  // тепловая карта по месяцам
  const h = new Grid(); h.cols = [34, ...months.map(() => 9)];
  intro(h, 'Загрузка по месяцам', periodText(months), 'Загрузка = занятые часы ÷ доступные часы. Пусто — часы за месяц не внесены.');
  h.row([T('Ресурс', ST.headL), ...months.map(m => T(mh(m), ST.head))]);
  cap.heat.forEach(x => h.row([T(x.r.name), ...x.cells.map(v => (v == null ? undefined : N(v, Z.p0, INP())))]));
  return [{ name: 'Мощность', grid: g }, { name: 'Загрузка по месяцам', grid: h }];
}

// ================= ВРАЧИ И ЗАРПЛАТА =================
export function sheetsDoctors(s, months, payMonth) {
  const rows = doctors(s, months).sort((a, b) => b.revenue - a.revenue), g = new Grid();
  g.cols = [26, 22, 15, 13, 11, 11, 11, 11, 11, 13, 12, 12, 12, 13, 12];
  intro(g, 'Врачи', periodText(months));
  g.row(['Врач', 'Отделение', 'Выручка', 'Доступно, ч', 'Занято, ч', 'Приёмов', 'Первичных', 'Неявок', 'Загрузка', 'Выручка за доступный час', 'Средний чек', 'Повторные', '% неявок', 'ФОТ (выплачено)', 'ФОТ, % выручки'].map((h, i) => T(h, i < 2 ? ST.headL : ST.head)));
  g.heights = { 4: 46 };
  const f0 = g.n, l0 = f0 + rows.length - 1, c = (r, k) => A(r, k);
  rows.forEach((x, i) => {
    const r = f0 + i;
    g.row([T(x.d.name), T(x.dep?.name || ''), N(x.revenue, Z.m, INP()), N(x.avail, Z.m, INP()), N(x.booked, Z.m, INP()), N(x.visits, Z.m, INP()), N(x.first, Z.m, INP()), N(x.noshow, Z.m, INP()),
      F(`IF(${c(r, 3)}=0,0,${c(r, 4)}/${c(r, 3)})`, x.util, Z.p0), F(`IF(${c(r, 3)}=0,0,${c(r, 2)}/${c(r, 3)})`, x.perHour), F(`IF(${c(r, 5)}=0,0,${c(r, 2)}/${c(r, 5)})`, x.check),
      F(`IF(${c(r, 5)}=0,0,(${c(r, 5)}-${c(r, 6)})/${c(r, 5)})`, x.repeat, Z.p0), F(`IF(${c(r, 5)}+${c(r, 7)}=0,0,${c(r, 7)}/(${c(r, 5)}+${c(r, 7)}))`, x.noshowRate, Z.p0),
      N(x.paid, Z.m, INP()), F(`IF(${c(r, 2)}=0,0,${c(r, 13)}/${c(r, 2)})`, x.payShare, Z.p0)]);
  });
  const t = r => ({ rev: sum(rows, x => x.revenue), av: sum(rows, x => x.avail), bk: sum(rows, x => x.booked), vs: sum(rows, x => x.visits), fs: sum(rows, x => x.first), ns: sum(rows, x => x.noshow), pd: sum(rows, x => x.paid) });
  const T0 = t(), r = g.n, S = k => F(`SUM(${A(f0, k)}:${A(l0, k)})`, [0, 0, T0.rev, T0.av, T0.bk, T0.vs, T0.fs, T0.ns][k] ?? T0.pd, Z.m, ST.grand);
  g.row([T('Всего', ST.grand), T('', ST.grand), S(2), S(3), S(4), S(5), S(6), S(7), F(`IF(${c(r, 3)}=0,0,${c(r, 4)}/${c(r, 3)})`, div(T0.bk, T0.av), Z.p0, ST.grand),
    F(`IF(${c(r, 3)}=0,0,${c(r, 2)}/${c(r, 3)})`, div(T0.rev, T0.av), Z.m, ST.grand), F(`IF(${c(r, 5)}=0,0,${c(r, 2)}/${c(r, 5)})`, div(T0.rev, T0.vs), Z.m, ST.grand),
    F(`IF(${c(r, 5)}=0,0,(${c(r, 5)}-${c(r, 6)})/${c(r, 5)})`, div(T0.vs - T0.fs, T0.vs), Z.p0, ST.grand), F(`IF(${c(r, 5)}+${c(r, 7)}=0,0,${c(r, 7)}/(${c(r, 5)}+${c(r, 7)}))`, div(T0.ns, T0.vs + T0.ns), Z.p0, ST.grand),
    S(13), F(`IF(${c(r, 2)}=0,0,${c(r, 13)}/${c(r, 2)})`, div(T0.pd, T0.rev), Z.p0, ST.grand)]);
  g.blank();
  g.row([T('Выручка врача — по дате оказания услуги, за вычетом отказов страховых. Кросс-выручка и тренд по месяцам — в программе.', ST.note)]);
  // зарплата
  const pr = payroll(s, payMonth), p = new Grid();
  p.cols = [26, 34, 15, 15, 11, 14, 17, 17, 14];
  intro(p, 'Расчёт зарплаты врачей', monLong(payMonth), 'Синие цифры — данные программы (их можно менять), чёрные — формулы. Формула расчёта зависит от схемы врача.');
  p.row(['Врач', 'Схема оплаты', 'Выручка', 'Материалы', '% врачу', 'Оклад', 'Расчёт по схеме', 'Внесено в учёт', 'Разница (внесено − расчёт)'].map((h, i) => T(h, i < 2 ? ST.headL : ST.head)));
  p.heights = { 4: 34 };
  const q0 = p.n;
  pr.forEach((x, i) => {
    const r = q0 + i, ty = x.d.pay?.type, pc = +x.d.pay?.pct || 0, sal = +x.d.pay?.salary || 0;
    const f = ty === 'salary' ? A(r, 5) : ty === 'mixed' ? `${A(r, 5)}+${A(r, 2)}*${A(r, 4)}` : ty === 'margin' ? `MAX(0,${A(r, 2)}-${A(r, 3)})*${A(r, 4)}` : `${A(r, 2)}*${A(r, 4)}`;
    p.row([T(x.d.name), T(x.how), N(x.revenue, Z.m, INP()), N(x.materials, Z.m, INP()), N(pc, Z.p0, INP()), N(sal, Z.m, INP()), F(f, x.calc), N(x.paid, Z.m, INP()), F(`${A(r, 7)}-${A(r, 6)}`, x.diff)]);
  });
  const qr = p.n, q1 = q0 + pr.length - 1;
  p.row([T('Всего', ST.grand), T('', ST.grand), F(`SUM(${A(q0, 2)}:${A(q1, 2)})`, sum(pr, x => x.revenue), Z.m, ST.grand), F(`SUM(${A(q0, 3)}:${A(q1, 3)})`, sum(pr, x => x.materials), Z.m, ST.grand), T('', ST.grand), T('', ST.grand),
    F(`SUM(${A(q0, 6)}:${A(q1, 6)})`, sum(pr, x => x.calc), Z.m, ST.grand), F(`SUM(${A(q0, 7)}:${A(q1, 7)})`, sum(pr, x => x.paid), Z.m, ST.grand), F(`SUM(${A(q0, 8)}:${A(q1, 8)})`, sum(pr, x => x.diff), Z.m, ST.grand)]);
  p.blank();
  ['Схемы: «процент» = выручка × %; «оклад» = оклад; «оклад + процент» = оклад + выручка × %;', '«процент от маржи» = (выручка − материалы) × % — врач заинтересован беречь расходники.'].forEach(x => p.row([T(x, ST.note)]));
  return [{ name: 'Врачи', grid: g }, { name: 'Зарплата врачей', grid: p }];
}

// ================= УСЛУГИ И СЕБЕСТОИМОСТЬ =================
export function sheetsServices(s, months) {
  const R = services(s, months), C = ctx(s), set = new Set(months), L = pnl(s, months);
  const docAvail = sum(s.activity.filter(a => set.has(a.month) && C.res[a.resource_id]?.kind === 'doctor'), a => a.avail);
  const fixed = L.fixed.total + L.amort.total, acq = +s.settings.acquiringPct || 0;
  const g = new Grid(); g.cols = [46, 20, 15, 13, 13, 9, 13, 13, 13, 14, 13, 10, 13, 12, 13, 8, 14];
  intro(g, 'Себестоимость и маржа услуг', periodText(months), 'Синие цифры — данные из программы (цену, нормы, часы можно менять), чёрные — формулы.');
  g.row([T('Постоянные расходы + амортизация за период', ST.label), N(fixed, Z.m, INP())]);                       // 4
  g.row([T('Доступные часы врачей за период', ST.label), N(docAvail, Z.m, INP())]);                                // 5
  g.row([T('Накладные на 1 час врача', ST.label), F('IF(B6=0,0,B5/B6)', div(fixed, docAvail), Z.m, ST.total), T('= постоянные расходы ÷ доступные часы врачей', ST.note)]); // 6 → B7
  g.row([T('Комиссия эквайринга', ST.label), N(acq, Z.p, INP())]);                                                 // 7 → B8
  g.blank();
  const oh = AA(6, 1), aq = AA(7, 1);
  g.row(['Услуга', 'Отделение', 'Длительность, мин', 'Цена', 'Материалы', '% врачу', 'Врачу', 'Эквайринг', 'Накладные', 'Себестоимость', 'Маржа', 'Маржа, %', 'Маржа за час', 'Продано, шт.', 'Выручка', 'ABC', 'Доля выручки'].map((h, i) => T(h, i < 2 ? ST.headL : ST.head)));
  g.heights = { 9: 34 };
  const first = g.n, last = first + R.rows.length - 1, tot = R.total;
  // нормы материалов — отдельный лист; «Материалы» в таблице = сумма по нему
  const norms = new Grid(); norms.cols = [36, 34, 12, 14, 14];
  intro(norms, 'Нормы расхода материалов', 'на одну услугу', 'Стоимость = количество × цена со склада. На эти строки ссылается лист «Услуги».');
  norms.row([T('Услуга', ST.headL), T('Материал', ST.headL), T('Количество', ST.head), T('Цена за ед.', ST.head), T('Стоимость', ST.head)]);
  const nf = norms.n;
  const nl = [];
  R.rows.forEach(r => (r.v.materials || []).forEach(m => nl.push({ svc: r.v.name, it: C.item[m.item_id], qty: +m.qty || 0 })));
  nl.forEach((x, i) => { const rr = nf + i; norms.row([T(x.svc), T(x.it?.name || '—'), N(x.qty, Z.h, INP()), N(+x.it?.price || 0, Z.m, INP()), F(`${A(rr, 2)}*${A(rr, 3)}`, x.qty * (+x.it?.price || 0))]); });
  const nlast = Math.max(nf, nf + nl.length - 1);
  R.rows.forEach((r, i) => {
    const rr = first + i, c = k => A(rr, k);
    g.row([T(r.v.name), T(r.dep?.name || ''), N(+r.v.duration || 0, Z.m, INP()), N(r.v.price, Z.m, INP()),
      F(`SUMIF('Нормы материалов'!$A$${nf + 1}:$A$${nlast + 1},${c(0)},'Нормы материалов'!$E$${nf + 1}:$E$${nlast + 1})`, r.mat), N(+r.v.doctor_pct || 0, Z.p0, INP()),
      F(`${c(3)}*${c(5)}`, r.docPay), F(`${c(3)}*${aq}`, r.acq), F(`${oh}*${c(2)}/60`, r.over), F(`${c(4)}+${c(6)}+${c(7)}+${c(8)}`, r.cost),
      F(`${c(3)}-${c(9)}`, r.margin, Z.m, ST.label), F(`IF(${c(3)}=0,0,${c(10)}/${c(3)})`, r.mPct, Z.p0), F(`IF(${c(2)}=0,0,${c(10)}/(${c(2)}/60))`, r.perHour),
      N(r.qty, Z.m, INP()), F(`${c(3)}*${c(13)}`, r.revenue), T(r.abc, { alignment: { horizontal: 'center' } }), F(`IF(SUM(${AA(first, 14)}:${AA(last, 14)})=0,0,${c(14)}/SUM(${AA(first, 14)}:${AA(last, 14)}))`, r.share, Z.p)]);
  });
  const tr = g.n;
  g.row([T('Всего по прайсу', ST.grand), ...Array(12).fill(T('', ST.grand)), F(`SUM(${A(first, 13)}:${A(last, 13)})`, sum(R.rows, r => r.qty), Z.m, ST.grand), F(`SUM(${A(first, 14)}:${A(last, 14)})`, tot, Z.m, ST.grand), T('', ST.grand), F(`SUM(${A(first, 16)}:${A(last, 16)})`, tot ? 1 : 0, Z.p, ST.grand)]);
  g.blank();
  ['Себестоимость = материалы по нормам + процент врачу + эквайринг + накладные за время услуги.', 'Маржа = цена − себестоимость. Маржа за час = маржа ÷ длительность в часах.', 'ABC: A — услуги, дающие 80% выручки, B — следующие 15%, C — остальные.'].forEach(x => g.row([T(x, ST.note)]));
  g.filter = `A${first}:Q${last + 1}`;
  return [{ name: 'Услуги', grid: g }, { name: 'Нормы материалов', grid: norms }];
}

// ================= МАРКЕТИНГ =================
export function sheetsMarketing(s, months) {
  const L = pnl(s, months), mr = div(L.margin.total, L.net.total), ac = avgCheck(s, months, L), M = marketing(s, months, mr, ac);
  const g = new Grid(); g.cols = [26, 14, 12, 12, 12, 12, 15, 13, 12, 12, 12, 14, 11, 11];
  intro(g, 'Маркетинг: каналы привлечения', periodText(months), 'Синие цифры — данные из программы (параметры можно менять), чёрные — формулы.');
  const st = s.settings;
  g.row([T('Доля маржи в выручке', ST.label), N(mr, Z.p, INP()), T('Маржинальная прибыль ÷ чистая выручка', ST.note)]);          // 4 → B5
  g.row([T('Средний чек', ST.label), N(ac, Z.m, INP()), T('Чистая выручка ÷ число приёмов врачей', ST.note)]);                // B6
  g.row([T('Визитов в год на пациента', ST.label), N(+st.visitsPerYear || 0, Z.h, INP())]);                                   // B7
  g.row([T('Лет пациент остаётся с клиникой', ST.label), N(+st.ltvYears || 0, Z.h, INP())]);                                   // B8
  g.row([T('Ценность пациента (LTV)', ST.label), F('B6*B7*B8*MAX(0,B5)', M.ltv, Z.m, ST.total), T('= средний чек × визитов в год × лет × доля маржи', ST.note)]); // B9
  g.blank();
  g.row(['Канал', 'Расход', 'Обращения', 'Записались', 'Пришли', 'Новые пациенты', 'Выручка с новых', 'Цена обращения', 'Из обращения в запись', 'Из записи в визит', 'Стоимость пациента (CAC)', 'Выручка на пациента', 'ROMI', 'LTV / CAC'].map((h, i) => T(h, i ? ST.head : ST.headL)));
  g.heights = { 10: 46 };
  const first = g.n, last = first + M.rows.length - 1, ltv = AA(8, 1), mrr = AA(4, 1);
  const calc = (r, x, st2) => {
    const c = k => A(r, k);
    return [F(`IF(${c(2)}=0,0,${c(1)}/${c(2)})`, x.cpl, Z.m, st2), F(`IF(${c(2)}=0,0,${c(3)}/${c(2)})`, x.c1, Z.p0, st2), F(`IF(${c(3)}=0,0,${c(4)}/${c(3)})`, x.c2, Z.p0, st2),
      F(`IF(${c(5)}=0,0,${c(1)}/${c(5)})`, x.cac, Z.m, st2), F(`IF(${c(5)}=0,0,${c(6)}/${c(5)})`, x.rpp, Z.m, st2),
      F(`IF(${c(1)}=0,"",(${c(6)}*${mrr}-${c(1)})/${c(1)})`, x.romi == null ? '' : x.romi, Z.p0, st2), F(`IF(OR(${c(1)}=0,${c(5)}=0),"",${ltv}/(${c(1)}/${c(5)}))`, x.ltvCac == null ? '' : x.ltvCac, Z.h, st2)];
  };
  M.rows.forEach((x, i) => { const r = first + i; g.row([T(x.ch.name), ...['spend', 'leads', 'bookings', 'visits', 'new_patients', 'revenue'].map(k => N(x[k], Z.m, INP())), ...calc(r, x)]); });
  const r = g.n, t = M.total;
  g.row([T('Все каналы', ST.grand), ...[1, 2, 3, 4, 5, 6].map(k => F(`SUM(${A(first, k)}:${A(last, k)})`, [0, t.spend, t.leads, t.bookings, t.visits, t.new_patients, t.revenue][k], Z.m, ST.grand)), ...calc(r, t, ST.grand)]);
  g.blank();
  ['Цена обращения = расход ÷ обращения. CAC = расход ÷ новые пациенты.', 'ROMI = (выручка с новых × доля маржи − расход) ÷ расход. LTV/CAC от 3 — канал окупается.'].forEach(x => g.row([T(x, ST.note)]));
  return [{ name: 'Маркетинг', grid: g }];
}

// ================= СКЛАД =================
export function sheetsStock(s) {
  const R = stock(s), g = new Grid(); g.cols = [34, 10, 13, 13, 16, 15, 20];
  intro(g, 'Склад: остатки', 'на ' + stamp());
  g.row(['Позиция', 'Ед.', 'Остаток', 'Минимум', 'Стоимость остатка', 'Хватит на, дней', 'Состояние'].map((h, i) => T(h, i ? ST.head : ST.headL)));
  const f0 = g.n, l0 = f0 + R.length - 1;
  R.forEach((x, i) => {
    const r = f0 + i, low = x.it.min && x.qty < x.it.min;
    g.row([T(x.it.name), T(x.it.unit), N(x.qty, Z.h, INP()), N(+x.it.min || 0, Z.h, INP()), N(x.value, Z.m, INP()), x.daysLeft == null ? undefined : N(Math.round(x.daysLeft), Z.m, INP()),
      F(`IF(${A(r, 2)}<=0,"нет в наличии",IF(AND(${A(r, 3)}>0,${A(r, 2)}<${A(r, 3)}),"ниже минимума","в норме"))`, x.qty <= 0 ? 'нет в наличии' : low ? 'ниже минимума' : 'в норме')]);
  });
  g.row([T('Стоимость остатков', ST.grand), T('', ST.grand), T('', ST.grand), T('', ST.grand), F(`SUM(${A(f0, 4)}:${A(l0, 4)})`, sum(R, x => x.value), Z.m, ST.grand), T('', ST.grand), T('', ST.grand)]);
  const b = new Grid(); b.cols = [34, 12, 12, 13, 13, 15, 18, 20];
  intro(b, 'Партии и сроки годности', 'на ' + stamp(), 'Списание идёт по правилу FEFO: сначала партии с ближайшим сроком. «Дней до конца срока» считается от сегодняшней даты.');
  b.row(['Позиция', 'Приход', 'Годен до', 'Осталось', 'Цена за ед.', 'Стоимость', 'Дней до конца срока', 'Состояние'].map((h, i) => T(h, i ? ST.head : ST.headL)));
  const bs = R.flatMap(x => x.live.map(l => ({ ...l, it: x.it }))).sort((a, c) => (a.expiry || '9999').localeCompare(c.expiry || '9999'));
  const b0 = b.n, t0 = serial(today());
  bs.forEach((x, i) => {
    const r = b0 + i, price = +x.price || +x.it.price || 0, days = x.expiry ? serial(x.expiry) - t0 : null;
    b.row([T(x.it.name), DT(x.date, ST.inp), DT(x.expiry, ST.inp), N(x.left, Z.h, INP()), N(price, Z.m, INP()), F(`${A(r, 3)}*${A(r, 4)}`, x.left * price),
      F(`IF(${A(r, 2)}="","",${A(r, 2)}-TODAY())`, days == null ? '' : days, Z.i), F(`IF(${A(r, 6)}="","срок не указан",IF(${A(r, 6)}<=0,"просрочено",IF(${A(r, 6)}<=60,"скоро истекает","в норме")))`, days == null ? 'срок не указан' : days <= 0 ? 'просрочено' : days <= 60 ? 'скоро истекает' : 'в норме')]);
  });
  b.filter = `A${b0}:H${b0 + bs.length}`;
  return [{ name: 'Остатки', grid: g }, { name: 'Партии', grid: b }];
}

// ================= ВСЁ В ОДИН ФАЙЛ =================
export function sheetsAll(s, months, payMonth, scope) {
  const list = s.ops.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  return [
    ...sheetsPnl(s, months), ...sheetsCash(s, months), ...sheetsBudget(s, scope), ...sheetsDebts(s), ...sheetsCapacity(s, months),
    ...sheetsDoctors(s, months, payMonth), ...sheetsServices(s, months), ...sheetsMarketing(s, months), ...sheetsStock(s), ...sheetsOps(s, list),
  ];
}
export const xlName = fname;
