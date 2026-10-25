// Разделы «Данные»: загрузка из Excel/CSV, справочники, настройки.
import { $, $$, esc, opt, money, moneyC, num, pct, today, ym, fmtDate, toast, openModal, parseNum, parseDate, parseCSV, toCSV, hash, norm, copyText } from './util.js';
import { store, hooks, commit, add, update, remove, usage, resetDemo, clearAll, exportJSON, importJSON, nid } from './store.js';
import { GROUPS, TAGS, RES_KINDS, CP_KINDS, PAY_SCHEMES } from './model.js';
import { PLAN_NAME, payLink, pageHead, seg, empty, pill, statusPill, rerender, go, months as periodMonths } from './ui.js';
import { loadXLSX, downloadXlsx, sheetsAll, xlName } from './export.js';
import { completeMonths } from './calc.js';
import { ROLES, myEmail, myRole, team, invite, revokeInvite, setRole, removeMember, signOut, switchClinic } from './cloud.js';

// ================= ЗАГРУЗКА =================
const F = (k, label, syn, req = false) => ({ k, label, syn, req });
const IMPORTS = {
  ops: {
    name: 'Операции', hint: 'Выписка банка, кассовая книга, выгрузка из 1С или своя таблица доходов и расходов.',
    fields: [
      F('date', 'Дата', ['дата', 'date', 'дата операции', 'дата оказания', 'дата документа', 'период'], true),
      F('amount', 'Сумма', ['сумма', 'amount', 'итого', 'сумма тг', 'сумма руб', 'сумма, тг', 'сумма, ₸']),
      F('income', 'Приход (отдельная колонка)', ['приход', 'поступление', 'поступления', 'доход', 'кредит счета']),
      F('expense', 'Расход (отдельная колонка)', ['расход', 'выплата', 'выплаты', 'списание', 'дебет счета']),
      F('type', 'Тип: доход или расход', ['тип', 'вид', 'вид операции', 'направление движения']),
      F('category', 'Статья', ['статья', 'категория', 'статья ддс', 'статья доходов и расходов', 'статья расходов'], true),
      F('paid', 'Дата оплаты', ['дата оплаты', 'дата платежа', 'оплачено']),
      F('status', 'Статус оплаты', ['статус', 'статус оплаты', 'оплата']),
      F('due', 'Срок оплаты', ['срок оплаты', 'оплатить до', 'срок']),
      F('account', 'Счёт / касса', ['счет', 'счёт', 'касса', 'кошелек', 'расчетный счет']),
      F('department', 'Отделение', ['отделение', 'подразделение', 'направление']),
      F('doctor', 'Врач', ['врач', 'специалист', 'исполнитель', 'доктор']),
      F('counterparty', 'Контрагент', ['контрагент', 'плательщик', 'получатель', 'поставщик', 'страховая']),
      F('doc', 'Документ', ['документ', 'номер документа', 'реестр', 'накладная', 'номер']),
      F('comment', 'Комментарий', ['комментарий', 'назначение платежа', 'назначение', 'описание', 'примечание']),
    ],
    example: [['Дата', 'Тип', 'Статья', 'Сумма', 'Дата оплаты', 'Отделение', 'Врач', 'Контрагент', 'Документ', 'Комментарий'],
      ['01.10.2026', 'расход', 'Аренда помещений', '1 500 000', '01.10.2026', '', '', 'Арендодатель', '', 'Аренда за октябрь'],
      ['31.10.2026', 'доход', 'ДМС (страховые компании)', '640 000', '', 'Терапия', 'Иванова А. С.', 'СК «Альфа-Мед»', 'Реестр 10/26', '']],
  },
  activity: {
    name: 'Часы и приёмы', hint: 'Отчёт МИС по расписанию: доступные и занятые часы, приёмы, неявки по каждому врачу и кабинету.',
    fields: [F('month', 'Месяц', ['месяц', 'период', 'дата', 'month'], true), F('resource', 'Врач / кабинет / аппарат', ['врач', 'ресурс', 'кабинет', 'специалист', 'оборудование', 'аппарат'], true),
      F('avail', 'Доступно часов', ['доступно', 'доступно часов', 'часы по графику', 'рабочих часов', 'график, ч']), F('booked', 'Занято часов', ['занято', 'занято часов', 'записано часов', 'отработано']),
      F('visits', 'Приёмов', ['приемов', 'приёмов', 'визитов', 'исследований', 'пациентов']), F('first', 'Первичных', ['первичных', 'первичные']),
      F('noshow', 'Неявок', ['неявки', 'неявок', 'не пришли']), F('cancel', 'Отмен', ['отмены', 'отмен']), F('referrals', 'Направил на сумму', ['направил', 'направления', 'кросс-выручка'])],
    example: [['Месяц', 'Врач', 'Доступно часов', 'Занято часов', 'Приёмов', 'Первичных', 'Неявок', 'Отмен'], ['10.2026', 'Иванова А. С.', '150', '118', '120', '52', '7', '5']],
  },
  marketing: {
    name: 'Маркетинг', hint: 'Отчёты рекламных кабинетов, CRM и коллтрекинга по каналам за месяц.',
    fields: [F('month', 'Месяц', ['месяц', 'период', 'дата'], true), F('channel', 'Канал', ['канал', 'источник', 'utm_source', 'площадка'], true), F('spend', 'Расход', ['расход', 'бюджет', 'затраты', 'стоимость']),
      F('leads', 'Обращения', ['обращения', 'лиды', 'заявки', 'звонки']), F('bookings', 'Записались', ['записи', 'записались', 'запись']), F('visits', 'Пришли', ['визиты', 'пришли', 'дошли']),
      F('new_patients', 'Новые пациенты', ['новые пациенты', 'новых', 'первичные']), F('revenue', 'Выручка', ['выручка', 'доход', 'оплаты'])],
    example: [['Месяц', 'Канал', 'Расход', 'Обращения', 'Записались', 'Пришли', 'Новые пациенты', 'Выручка'], ['10.2026', 'Instagram', '250 000', '110', '40', '33', '31', '980 000']],
  },
  sales: {
    name: 'Продажи услуг', hint: 'Отчёт МИС «Оказанные услуги» за месяц: услуга и количество.',
    fields: [F('month', 'Месяц', ['месяц', 'период', 'дата'], true), F('service', 'Услуга', ['услуга', 'наименование', 'наименование услуги', 'прайс'], true), F('qty', 'Количество', ['количество', 'кол-во', 'кол во', 'qty', 'оказано'], true), F('price', 'Цена', ['цена', 'стоимость', 'тариф'])],
    example: [['Месяц', 'Услуга', 'Количество', 'Цена'], ['10.2026', 'УЗИ брюшной полости', '180', '8 000']],
  },
  stock: {
    name: 'Склад', hint: 'Приходные накладные и списания материалов.',
    fields: [F('date', 'Дата', ['дата', 'дата документа'], true), F('item', 'Позиция', ['номенклатура', 'наименование', 'материал', 'товар', 'позиция'], true), F('qty', 'Количество', ['количество', 'кол-во', 'кол во'], true),
      F('kind', 'Движение (приход/расход/списание)', ['движение', 'тип', 'операция', 'вид']), F('unit', 'Единица', ['ед', 'ед. изм', 'единица', 'ед изм']), F('price', 'Цена', ['цена', 'цена за ед']), F('expiry', 'Годен до', ['годен до', 'срок годности', 'срок']), F('comment', 'Комментарий', ['комментарий', 'поставщик', 'примечание'])],
    example: [['Дата', 'Движение', 'Позиция', 'Количество', 'Ед.', 'Цена', 'Годен до'], ['03.10.2026', 'приход', 'Перчатки нитриловые', '1000', 'пара', '60', '01.10.2029']],
  },
};
const imp = { type: 'ops', rows: null, header: [], hRow: 0, map: {}, create: true, file: '', result: null };

function autoMap(fields, header) {
  const map = {}, used = new Set(), H = header.map(norm);
  fields.forEach(f => {
    let i = H.findIndex((h, j) => !used.has(j) && (h === norm(f.label) || f.syn.includes(h)));
    if (i < 0) i = H.findIndex((h, j) => !used.has(j) && h && f.syn.some(sy => h.includes(sy) && sy.length > 3));
    if (i > -1) { map[f.k] = i; used.add(i); }
  });
  return map;
}
function findHeaderRow(rows, fields) {
  const syn = new Set(fields.flatMap(f => [...f.syn, norm(f.label)]));
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const hits = rows[i].filter(c => syn.has(norm(c))).length;
    if (hits >= 2) return i;
  }
  return 0;
}
async function readFile(file) {
  if (/\.(xlsx|xlsm|xls|ods)$/i.test(file.name)) {
    const X = await loadXLSX();
    const wb = X.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }).filter(r => r.some(c => String(c).trim() !== ''));
  }
  let text = await file.text();
  if (text.includes(String.fromCharCode(0xFFFD))) { // не UTF-8 — пробуем Windows-1251 (частый формат выгрузок 1С)
    try { text = new TextDecoder('windows-1251').decode(await file.arrayBuffer()); } catch (e) { /* оставляем как есть */ }
  }
  return parseCSV(text.replace(/^﻿/, ''));
}
function setRows(rows, name) {
  const def = IMPORTS[imp.type];
  imp.rows = rows; imp.file = name; imp.result = null;
  imp.hRow = findHeaderRow(rows, def.fields);
  imp.header = rows[imp.hRow].map(String);
  imp.map = autoMap(def.fields, imp.header);
}

// Разбор строк в записи с проверками; ничего не меняет в данных
function prepare() {
  const s = store.s, def = IMPORTS[imp.type], body = imp.rows.slice(imp.hRow + 1);
  const val = (r, k) => (imp.map[k] != null ? r[imp.map[k]] : '');
  const findBy = (coll, name) => { const n = norm(name); return n ? s[coll].find(x => norm(x.name) === n) : null; };
  const missing = {};
  const need = (coll, name) => { const n = String(name ?? '').trim(); if (!n) return null; const f = findBy(coll, n); if (f) return f; (missing[coll] ||= new Set()).add(n); return { _new: n }; };
  const seen = {}, existing = new Set(s.ops.map(o => o.ikey).concat(s.stock.map(x => x.ikey)).filter(Boolean));
  const out = body.map((r, i) => {
    const e = [];
    const rec = { line: imp.hRow + i + 2 };
    if (imp.type === 'ops') {
      const date = parseDate(val(r, 'date'));
      if (!date) e.push('нет даты');
      let amount = parseNum(val(r, 'amount')), type = null;
      const inc = parseNum(val(r, 'income')), exp = parseNum(val(r, 'expense'));
      if (inc > 0) { amount = inc; type = 'income'; } else if (exp > 0) { amount = exp; type = 'expense'; }
      const t = norm(val(r, 'type'));
      if (!type && t) type = /расх|спис|выпл|оплата постав|expense/.test(t) ? 'expense' : /дох|прих|поступ|выруч|income/.test(t) ? 'income' : null;
      if (amount < 0) { amount = -amount; type = type || 'expense'; }
      if (!(amount > 0)) e.push('нет суммы');
      const cname = String(val(r, 'category') || '').trim();
      let cat = cname ? findBy('categories', cname) : null;
      if (!type && cat) type = GROUPS[cat.grp].type;
      if (!type) e.push('не понятно, доход это или расход — добавьте колонку «Тип»');
      if (!cname) e.push('нет статьи');
      else if (!cat) { (missing.categories ||= new Map()).set(cname, type); cat = { _new: cname }; }
      const st = norm(val(r, 'status'));
      let paid = imp.map.paid != null ? parseDate(val(r, 'paid')) : null;
      if (imp.map.paid == null) paid = /не|долг|ожид|нет|no/.test(st) ? null : date;
      else if (!paid && st && !/не|долг|нет/.test(st)) paid = date;
      Object.assign(rec, { date, amount, type, cat, paid, due: parseDate(val(r, 'due')), account: need('accounts', val(r, 'account')), department: need('departments', val(r, 'department')), doctor: need('doctors', val(r, 'doctor')), cp: need('counterparties', val(r, 'counterparty')), doc: String(val(r, 'doc') || '').trim(), comment: String(val(r, 'comment') || '').trim() });
      const base = 'ops:' + hash([date, amount, type, norm(cname), norm(rec.doc), norm(rec.comment), norm(val(r, 'doctor')), norm(val(r, 'counterparty'))].join('|'));
      seen[base] = (seen[base] || 0) + 1; rec.ikey = base + '#' + seen[base];
      if (existing.has(rec.ikey)) rec.dup = true;
    } else if (imp.type === 'stock') {
      const date = parseDate(val(r, 'date')); if (!date) e.push('нет даты');
      let qty = parseNum(val(r, 'qty')); const k = norm(val(r, 'kind'));
      let kind = /спис|брак|утил/.test(k) ? 'writeoff' : /расх|выдан|out/.test(k) ? 'out' : 'in';
      if (qty < 0) { qty = -qty; if (kind === 'in') kind = 'out'; }
      if (!(qty > 0)) e.push('нет количества');
      const iname = String(val(r, 'item') || '').trim(); if (!iname) e.push('нет позиции');
      const item = iname ? (findBy('items', iname) || { _new: iname }) : null;
      if (item?._new) (missing.items ||= new Set()).add(iname);
      Object.assign(rec, { date, qty, kind, item, unit: String(val(r, 'unit') || '').trim(), price: parseNum(val(r, 'price')) || 0, expiry: parseDate(val(r, 'expiry')), comment: String(val(r, 'comment') || '').trim() });
      const base = 'st:' + hash([date, qty, kind, norm(iname), rec.expiry].join('|'));
      seen[base] = (seen[base] || 0) + 1; rec.ikey = base + '#' + seen[base];
      if (existing.has(rec.ikey)) rec.dup = true;
    } else {
      const d = parseDate(val(r, 'month')), month = d ? ym(d) : null;
      if (!month) e.push('нет месяца');
      rec.month = month;
      const refKey = { activity: 'resource', marketing: 'channel', sales: 'service' }[imp.type];
      const coll = { activity: 'resources', marketing: 'channels', sales: 'services' }[imp.type];
      const rname = String(val(r, refKey) || '').trim();
      if (!rname) e.push('нет названия');
      rec.ref = rname ? (findBy(coll, rname) || { _new: rname }) : null;
      if (rec.ref?._new) (missing[coll] ||= new Set()).add(rname);
      def.fields.filter(f => !['month', refKey].includes(f.k)).forEach(f => { const v = parseNum(val(r, f.k)); rec[f.k] = isFinite(v) ? v : null; });
      if (imp.type === 'sales' && !(rec.qty >= 0)) e.push('нет количества');
    }
    rec.errors = e;
    return rec;
  });
  const missCount = Object.values(missing).reduce((a, m) => a + m.size, 0);
  return { recs: out, missing, missCount };
}
function doImport(P) {
  const s = store.s, made = {};
  const ensure = (coll, ref, extra = {}) => {
    if (!ref) return null;
    if (!ref._new) return ref.id;
    const ex = s[coll].find(x => norm(x.name) === norm(ref._new));
    if (ex) return ex.id;
    const o = add(coll, { name: ref._new, ...extra }); made[coll] = (made[coll] || 0) + 1;
    return o.id;
  };
  let n = 0, upd = 0, skip = 0;
  P.recs.forEach(r => {
    if (r.errors.length || r.dup) { skip++; return; }
    const unresolved = [r.cat, r.account, r.department, r.doctor, r.cp, r.item, r.ref].some(x => x?._new);
    if (unresolved && !imp.create) { skip++; return; }
    if (imp.type === 'ops') {
      const ctype = P.missing.categories?.get?.(r.cat._new) || r.type;
      const cat = ensure('categories', r.cat, { grp: ctype === 'income' ? 'revenue' : 'fixed', tag: '' });
      const dep = ensure('departments', r.department);
      add('ops', { type: r.type, category_id: cat, date: r.date, paid: r.paid, due: r.due, amount: r.amount, account_id: ensure('accounts', r.account, { opening: 0 }) || s.accounts[0]?.id, department_id: dep, doctor_id: ensure('doctors', r.doctor, { department_id: dep, active: true, pay: { type: 'percent', pct: 0.3 } }), counterparty_id: ensure('counterparties', r.cp, { kind: 'other' }), doc: r.doc, comment: r.comment, rejected: 0, src: 'import', ikey: r.ikey });
      n++;
    } else if (imp.type === 'stock') {
      const it = ensure('items', r.item, { unit: r.unit || 'шт', price: r.price || 0, min: 0 });
      add('stock', { date: r.date, item_id: it, kind: r.kind, qty: r.qty, price: r.price || s.items.find(i => i.id === it)?.price || 0, expiry: r.expiry, comment: r.comment, ikey: r.ikey });
      n++;
    } else {
      const coll = { activity: 'resources', marketing: 'channels', sales: 'services' }[imp.type];
      const refId = ensure(coll, r.ref, imp.type === 'activity' ? { kind: s.doctors.some(d => norm(d.name) === norm(r.ref._new)) ? 'doctor' : 'room', rate: 0, active: true, doctor_id: s.doctors.find(d => norm(d.name) === norm(r.ref._new))?.id || null } : imp.type === 'sales' ? { price: r.price || 0, duration: 30, doctor_pct: 0.3, materials: [], department_id: null } : {});
      const target = { activity: 'activity', marketing: 'marketing', sales: 'sales' }[imp.type];
      const refField = { activity: 'resource_id', marketing: 'channel_id', sales: 'service_id' }[imp.type];
      let ex = s[target].find(x => x[refField] === refId && x.month === r.month);
      const nums = Object.fromEntries(IMPORTS[imp.type].fields.filter(f => r[f.k] != null && !['price'].includes(f.k)).map(f => [f.k, r[f.k]]));
      if (ex) { Object.assign(ex, nums); upd++; } else { add(target, { month: r.month, [refField]: refId, ...nums }); n++; }
    }
  });
  const madeTxt = Object.entries(made).map(([k, v]) => `${{ categories: 'статей', departments: 'отделений', doctors: 'врачей', counterparties: 'контрагентов', accounts: 'счетов', items: 'позиций склада', resources: 'ресурсов', channels: 'каналов', services: 'услуг' }[k]}: ${v}`).join(', ');
  imp.result = { n, upd, skip, madeTxt };
  commit('Загрузка', `${IMPORTS[imp.type].name}: добавлено ${n}, обновлено ${upd}, пропущено ${skip}${madeTxt ? '; создано ' + madeTxt : ''}${imp.file ? ' (' + imp.file + ')' : ''}`);
}

export function viewImport(el) {
  const def = IMPORTS[imp.type];
  let body = `<section class="card">
    <div class="card-head"><h2>1. Что загружаем</h2></div>
    <div class="type-cards">${Object.entries(IMPORTS).map(([k, d]) => `<label class="type-card${k === imp.type ? ' on' : ''}"><input type="radio" name="impType" value="${k}"${k === imp.type ? ' checked' : ''}><b>${esc(d.name)}</b><span>${esc(d.hint)}</span></label>`).join('')}</div>
  </section>
  <section class="card">
    <div class="card-head"><h2>2. Файл</h2><span class="muted small">Excel (.xlsx, .xls) или CSV. Первая строка с названиями колонок найдётся сама.</span></div>
    <div class="drop" id="drop"><input type="file" id="impFile" accept=".csv,.txt,.xlsx,.xls,.xlsm,.ods"><p><b>Перетащите файл сюда</b> или <label for="impFile" class="link">выберите на компьютере</label></p>${imp.file ? `<p class="muted">Загружен: ${esc(imp.file)} · ${imp.rows.length - imp.hRow - 1} строк</p>` : ''}</div>
    <details class="table-view"><summary>Или вставьте таблицу из Excel</summary><textarea id="impPaste" rows="5" placeholder="Скопируйте ячейки в Excel (Ctrl+C) и вставьте сюда (Ctrl+V)"></textarea><button class="btn ghost" id="impParse">Разобрать</button></details>
    <details class="table-view"><summary>Пример колонок для «${esc(def.name)}»</summary><pre class="tpl" id="tpl">${esc(toCSV(def.example))}</pre><button class="btn small ghost" id="tplCopy">Скопировать пример</button></details>
  </section>`;
  if (imp.rows) {
    const P = prepare();
    const ok = P.recs.filter(r => !r.errors.length && !r.dup).length, bad = P.recs.filter(r => r.errors.length).length, dup = P.recs.filter(r => r.dup).length;
    const missTxt = Object.entries(P.missing).map(([k, set]) => `<li><b>${{ categories: 'Статьи', departments: 'Отделения', doctors: 'Врачи', counterparties: 'Контрагенты', accounts: 'Счета', items: 'Позиции склада', resources: 'Ресурсы', channels: 'Каналы', services: 'Услуги' }[k]}:</b> ${[...(set.keys ? set.keys() : set)].slice(0, 12).map(esc).join(', ')}${(set.size || 0) > 12 ? ' …' : ''}</li>`).join('');
    const show = P.recs.slice(0, 40);
    const cols = def.fields.filter(f => imp.map[f.k] != null);
    body += `<section class="card">
      <div class="card-head"><h2>3. Сопоставление колонок</h2><span class="muted small">Подобрано автоматически — проверьте</span></div>
      <div class="map-grid">${def.fields.map(f => `<label class="f">${esc(f.label)}${f.req ? ' <span class="req">*</span>' : ''}<select data-map="${f.k}">${opt('', '— не загружать —', imp.map[f.k] ?? '')}${imp.header.map((h, i) => opt(i, h || `Колонка ${i + 1}`, imp.map[f.k] ?? '')).join('')}</select></label>`).join('')}</div>
    </section>
    <section class="card">
      <div class="card-head"><h2>4. Проверка</h2></div>
      <div class="sumbar"><span>${statusPill('good', 'готово к загрузке: ' + ok)}</span>${bad ? `<span>${statusPill('serious', 'с ошибками: ' + bad)}</span>` : ''}${dup ? `<span>${statusPill('warn', 'уже загружены раньше: ' + dup)}</span>` : ''}</div>
      ${P.missCount ? `<div class="miss"><p>В справочниках нет ${P.missCount} значений:</p><ul>${missTxt}</ul><label class="check"><input type="checkbox" id="impCreate"${imp.create ? ' checked' : ''}> Создать их автоматически (статьи доходов попадут в «Выручку», расходов — в «Постоянные»; поправьте потом в справочниках)</label></div>` : ''}
      <div class="tw"><table class="preview"><thead><tr><th>Строка</th><th>Статус</th>${cols.map(f => `<th>${esc(f.label)}</th>`).join('')}</tr></thead><tbody>
      ${show.map(r => { const raw = imp.rows[r.line - 1] || []; return `<tr class="${r.errors.length ? 'bad' : r.dup ? 'dup' : ''}"><td>${r.line}</td><td>${r.errors.length ? `<span class="neg">${esc(r.errors.join('; '))}</span>` : r.dup ? '<span class="muted">дубль</span>' : '✓'}</td>${cols.map(f => `<td>${esc(fmtCell(raw[imp.map[f.k]]))}</td>`).join('')}</tr>`; }).join('')}
      </tbody></table></div>${P.recs.length > show.length ? `<p class="muted small">Показаны первые ${show.length} из ${P.recs.length} строк.</p>` : ''}
      <div class="row-actions end"><button class="btn ghost" id="impReset">Выбрать другой файл</button><button class="btn primary" id="impGo"${ok ? '' : ' disabled'}>Загрузить ${ok} строк</button></div>
      ${imp.result ? `<p class="ok-note">${statusPill('good', 'Загружено')} добавлено ${imp.result.n}${imp.result.upd ? ', обновлено ' + imp.result.upd : ''}, пропущено ${imp.result.skip}${imp.result.madeTxt ? '. Создано в справочниках — ' + esc(imp.result.madeTxt) : ''}.</p>` : ''}
    </section>`;
  }
  el.innerHTML = pageHead('import') + body;
  $$('[name=impType]', el).forEach(r => r.onchange = () => { imp.type = r.value; if (imp.rows) { const rows = imp.rows; setRows(rows, imp.file); } rerender(); });
  const handle = async file => { try { setRows(await readFile(file), file.name); rerender(); } catch (e) { toast(e.message || 'Не удалось прочитать файл', 'warn'); } };
  $('#impFile').onchange = e => e.target.files[0] && handle(e.target.files[0]);
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer?.files?.[0]; if (f) handle(f); });
  $('#impParse').onclick = () => { const t = $('#impPaste').value; if (!t.trim()) return; setRows(parseCSV(t, t.includes('\t') ? '\t' : undefined), 'вставка из буфера'); rerender(); };
  $('#tplCopy').onclick = () => copyText($('#tpl').textContent);
  $$('[data-map]', el).forEach(sel => sel.onchange = () => { if (sel.value === '') delete imp.map[sel.dataset.map]; else imp.map[sel.dataset.map] = +sel.value; imp.result = null; rerender(); });
  $('#impCreate') && ($('#impCreate').onchange = e => { imp.create = e.target.checked; });
  $('#impReset') && ($('#impReset').onclick = () => { imp.rows = null; imp.file = ''; imp.result = null; rerender(); });
  $('#impGo') && ($('#impGo').onclick = () => { const P = prepare(); doImport(P); toast(`Загружено: ${imp.result.n + imp.result.upd}`); });
}
const fmtCell = v => (v instanceof Date ? fmtDate(v.toISOString().slice(0, 10)) : String(v ?? ''));

// ================= СПРАВОЧНИКИ =================
const REFS = {
  categories: { name: 'Статьи', note: 'Группа статьи определяет, куда сумма попадёт в ОПиУ и ДДС. Отметка нужна для расчётов: «зарплата врачей» — для зарплаты, «материалы» — для маржи врача.', blank: () => ({ name: 'Новая статья', grp: 'fixed', tag: '' }),
    cols: [['name', 'Название', 'text'], ['grp', 'Группа', 'select', () => Object.entries(GROUPS).map(([k, g]) => [k, `${g.type === 'income' ? 'Доход' : 'Расход'}: ${g.name}`])], ['tag', 'Отметка', 'select', () => Object.entries(TAGS)]] },
  departments: { name: 'Отделения', blank: () => ({ name: 'Новое отделение' }), cols: [['name', 'Название', 'text']] },
  doctors: { name: 'Врачи', note: 'Для каждого врача автоматически создаётся ресурс в «Мощности». Схема оплаты меняется в разделе «Врачи и зарплата».', blank: () => ({ name: 'Новый врач', spec: '', department_id: store.s.departments[0]?.id || null, active: true, pay: { type: 'percent', pct: 0.3 } }),
    cols: [['name', 'ФИО', 'text'], ['spec', 'Специальность', 'text'], ['department_id', 'Отделение', 'ref', 'departments'], ['pay', 'Схема оплаты', 'pay'], ['active', 'Работает', 'bool']] },
  resources: { name: 'Ресурсы', note: 'Всё, у чего есть часы работы: врачи, кабинеты, операционная, аппараты. Для кабинетов и оборудования укажите среднюю выручку за час — по ней считается потенциал.', blank: () => ({ name: 'Новый кабинет', kind: 'room', department_id: store.s.departments[0]?.id || null, doctor_id: null, rate: 0, active: true }),
    cols: [['name', 'Название', 'text'], ['kind', 'Тип', 'select', () => Object.entries(RES_KINDS)], ['department_id', 'Отделение', 'ref', 'departments'], ['doctor_id', 'Врач', 'ref', 'doctors'], ['rate', 'Выручка за час', 'num'], ['active', 'Работает', 'bool']] },
  accounts: { name: 'Счета и кассы', note: 'Остаток на начало — сколько денег было на счёте до первой операции в программе.', blank: () => ({ name: 'Новый счёт', opening: 0 }), cols: [['name', 'Название', 'text'], ['opening', 'Остаток на начало', 'num']] },
  counterparties: { name: 'Контрагенты', blank: () => ({ name: 'Новый контрагент', kind: 'other' }), cols: [['name', 'Название', 'text'], ['kind', 'Тип', 'select', () => Object.entries(CP_KINDS)]] },
  channels: { name: 'Каналы рекламы', blank: () => ({ name: 'Новый канал' }), cols: [['name', 'Название', 'text']] },
  items: { name: 'Номенклатура склада', note: 'Цена используется в себестоимости услуг. Минимальный остаток — порог для напоминания о закупке.', blank: () => ({ name: 'Новый материал', unit: 'шт', price: 0, min: 0 }),
    cols: [['name', 'Название', 'text'], ['unit', 'Ед. изм.', 'text'], ['price', 'Цена', 'num'], ['min', 'Мин. остаток', 'num']] },
};
const refV = { tab: 'categories' };
export function viewRefs(el) {
  const s = store.s, R = REFS[refV.tab], list = s[refV.tab];
  const cell = (o, [k, , type, src]) => {
    const v = o[k];
    if (type === 'text') return `<input class="cell-in left" data-k="${k}" value="${esc(v ?? '')}">`;
    if (type === 'num') return `<input class="cell-in" data-k="${k}" data-num inputmode="decimal" value="${v ? esc(money(v)) : ''}" placeholder="0">`;
    if (type === 'bool') return `<input type="checkbox" data-k="${k}" data-bool${v !== false ? ' checked' : ''} aria-label="Работает">`;
    if (type === 'select') return `<select data-k="${k}">${src().map(([a, b]) => opt(a, b, v ?? '')).join('')}</select>`;
    if (type === 'ref') return `<select data-k="${k}" data-ref>${opt('', '—', v)}${s[src].map(x => opt(x.id, x.name, v)).join('')}</select>`;
    if (type === 'pay') return `<span class="muted small">${esc(PAY_SCHEMES[v?.type] || '—')}${v?.pct ? ' · ' + pct(v.pct) : ''}${v?.salary ? ' · ' + money(v.salary) : ''}</span>`;
    return '';
  };
  el.innerHTML = pageHead('refs') + `<section class="card toolbar"><div class="tabs-scroll">${seg('refTab', Object.entries(REFS).map(([k, r]) => [k, `${r.name} · ${s[k].length}`]), refV.tab)}</div></section>
  <section class="card">
    <div class="card-head"><h2>${esc(R.name)}</h2><button class="btn primary" id="refAdd">+ Добавить</button></div>
    ${R.note ? `<p class="muted small">${esc(R.note)}</p>` : ''}
    ${list.length ? `<div class="tw"><table class="ref-table"><thead><tr>${R.cols.map(c => `<th>${esc(c[1])}</th>`).join('')}<th class="num">Используется</th><th></th></tr></thead><tbody>
    ${(refV.tab === 'categories' ? [...list].sort((a, b) => Object.keys(GROUPS).indexOf(a.grp) - Object.keys(GROUPS).indexOf(b.grp)) : list).map(o => `<tr data-id="${o.id}">${R.cols.map(c => `<td>${cell(o, c)}</td>`).join('')}<td class="num muted">${usage(refV.tab, o.id) || ''}</td>
      <td><button class="btn small ghost danger" data-del data-confirm data-confirm-text="Удалить?" aria-label="Удалить">✕</button></td></tr>`).join('')}
    </tbody></table></div>` : empty('Пока пусто', 'Добавьте первую запись кнопкой «Добавить».')}
  </section>`;
  $$('[name=refTab]', el).forEach(r => r.onchange = () => { refV.tab = r.value; rerender(); });
  $('#refAdd').onclick = () => {
    const o = add(refV.tab, R.blank());
    if (refV.tab === 'doctors') add('resources', { name: o.name, kind: 'doctor', department_id: o.department_id, doctor_id: o.id, rate: 0, active: true });
    commit('Справочники', `${R.name}: добавлено «${o.name}»`);
    setTimeout(() => { const inp = $(`tr[data-id="${o.id}"] input`); inp?.focus(); inp?.select(); }, 30);
  };
  $$('tr[data-id]', el).forEach(tr => {
    const o = list.find(x => x.id === +tr.dataset.id);
    tr.querySelectorAll('[data-k]').forEach(inp => inp.onchange = () => {
      const k = inp.dataset.k;
      let v = inp.hasAttribute('data-bool') ? inp.checked : inp.hasAttribute('data-num') ? (parseNum(inp.value) || 0) : inp.hasAttribute('data-ref') ? (+inp.value || null) : inp.value;
      if (k === 'name' && !String(v).trim()) { inp.value = o.name; toast('Название не может быть пустым', 'warn'); return; }
      if (k === 'name' && store.s[refV.tab].some(x => x !== o && norm(x.name) === norm(v))) toast('Такое название уже есть — при загрузке из Excel записи могут перепутаться', 'warn');
      const old = o[k]; o[k] = v;
      if (refV.tab === 'doctors' && k === 'name') store.s.resources.filter(r => r.doctor_id === o.id && r.name === old).forEach(r => (r.name = v));
      if (inp.hasAttribute('data-num')) inp.value = v ? money(v) : '';
      commit('Справочники', `${R.name}: «${o.name}» — ${k}`, { silent: true });
    });
    tr.querySelector('[data-del]').addEventListener('click', e => {
      if (!e.currentTarget.classList.contains('armed')) return;
      const u = usage(refV.tab, o.id);
      if (u) { toast(`Нельзя удалить: используется в ${u} записях.${'active' in o ? ' Снимите отметку «Работает».' : ' Сначала перенесите записи.'}`, 'warn'); return; }
      if (refV.tab === 'categories' && store.s.categories.length <= 1) return;
      remove(refV.tab, o.id); commit('Справочники', `${R.name}: удалено «${o.name}»`); toast('Удалено');
    });
  });
}

// Карточка подписки (в облачном режиме): тариф, срок и кнопка «Оплатить» в WhatsApp
const SUB_STATE = { trial: ['Пробный период', 'info'], active: ['Оплачено', 'info'], grace: ['Нужна оплата', 'warn'], expired: ['Только просмотр', 'crit'] };
function subCard(sub, clinic) {
  const [label, kind] = SUB_STATE[sub.state] || ['', ''];
  const ask = payLink(`Здравствуйте! Хочу оплатить подписку «Пульс клиники» для клиники «${clinic}».`);
  return `<section class="card"><div class="card-head"><h2>Подписка</h2><span class="pill ${kind}">${label}</span></div>
    <div class="kv-grid">
      <div><span>Тариф</span><b>${esc(PLAN_NAME[sub.plan] || sub.plan)}</b></div>
      <div><span>Оплачено до</span><b>${fmtDate(sub.paid_until)}</b></div>
      <div><span>${sub.days_left >= 0 ? 'Осталось' : 'Просрочено'}</span><b>${Math.abs(sub.days_left)} дн.</b></div>
    </div>
    <p class="note">Оплата по счёту: напишите нам, пришлём счёт и акт. После поступления денег доступ продлевается в тот же день. Если срок закончился, у вас есть 10 дней, затем клиника переходит в режим «только просмотр»: данные сохраняются, их можно смотреть и выгружать в Excel.</p>
    <div class="row-actions"><a class="btn primary" href="${ask}" target="_blank" rel="noopener">Оплатить или продлить в WhatsApp</a></div>
  </section>`;
}

// ================= НАСТРОЙКИ =================
export function viewSettings(el) {
  const s = store.s, st = s.settings;
  const P = [['clinicName', 'Название клиники', 'text'], ['currency', 'Валюта (знак)', 'text', 'Выберите из списка или впишите свою'],
    ['targetUtil', 'Целевая загрузка, %', 'pct', 'От неё считается потенциал выручки'], ['lowUtil', 'Низкая загрузка, %', 'pct', 'Ниже — сигнал на обзоре'],
    ['marginFloor', 'Минимальная маржа услуги, %', 'pct', 'Ниже — услуга подсвечивается'], ['acquiringPct', 'Комиссия эквайринга, %', 'pct', 'Для себестоимости услуг'],
    ['amortMonths', 'Срок службы оборудования по умолчанию, мес.', 'num', 'Для амортизации в ОПиУ'], ['visitsPerYear', 'Визитов пациента в год', 'num', 'Для LTV'], ['ltvYears', 'Лет пациент с клиникой', 'num', 'Для LTV']];
  const sizeKb = Math.round(JSON.stringify(s).length / 1024);
  const cloud = store.mode === 'cloud', canWipe = !cloud || myRole() === 'owner';
  el.innerHTML = pageHead('settings') + `
  <section class="card"><div class="card-head"><h2>Параметры расчётов</h2></div>
    <datalist id="curList">${[['₸', 'тенге'], ['сўм', 'узбекский сум'], ['$', 'доллар'], ['€', 'евро'], ['₽', 'рубль'], ['сом', 'киргизский сом'], ['₼', 'манат'], ['֏', 'драм'], ['₾', 'лари'], ['Br', 'белорусский рубль'], ['£', 'фунт'], ['AED', 'дирхам ОАЭ']].map(([c, n]) => `<option value="${c}">${n}</option>`).join('')}</datalist>
    <div class="form-grid three">${P.map(([k, l, t, hint]) => `<label class="f">${esc(l)}${hint ? ` <small>${esc(hint)}</small>` : ''}<input data-set="${k}" data-t="${t}" ${k === 'currency' ? 'list="curList" placeholder="выберите или впишите"' : ''} ${t !== 'text' ? 'inputmode="decimal"' : ''} value="${esc(t === 'pct' ? num((st[k] || 0) * 100, 1) : st[k] ?? '')}"></label>`).join('')}</div></section>
  ${cloud && hooks.sub?.() ? subCard(hooks.sub(), st.clinicName) : ''}
  ${cloud ? `<section class="card"><div class="card-head"><h2>Команда и доступ</h2><span class="muted small">вы: ${esc(myEmail())} · ${esc(ROLES[myRole()] || '')}</span></div>
    <div id="teamBox"><p class="muted">Загружаю…</p></div>
    <div class="row-actions"><button class="btn ghost" id="swClinic">Сменить клинику</button><button class="btn ghost" id="signOut">Выйти</button></div>
  </section>` : ''}
  <section class="card"><div class="card-head"><h2>Данные</h2></div>
    <div class="kv-grid">
      <div><span>Режим</span><b>${store.mode === 'demo' ? 'демо-данные (выдуманные)' : 'рабочие данные'}</b></div>
      <div><span>Хранятся</span><b>${cloud ? 'в защищённой базе (Supabase, Франкфурт)' : 'в этом браузере'}</b></div>
      <div><span>Операций</span><b>${money(s.ops.length)}</b></div>
      <div><span>Объём</span><b>${sizeKb} КБ</b></div>
    </div>
    <p class="note">${cloud ? 'Данные клиники хранятся в базе и доступны только участникам вашей команды — по ролям. Резервную копию можно скачать в любой момент.'
      : 'Сейчас данные лежат только в этом браузере на этом устройстве. Регулярно сохраняйте резервную копию. Чтобы работать командой и с любого устройства — <a href="app.html">войдите или зарегистрируйте клинику</a>.'}</p>
    <div class="row-actions">
      <button class="btn primary" id="xlAll">Скачать всё в Excel</button>
      <button class="btn ghost" id="bkShow">Резервная копия</button>
      ${canWipe ? `<label class="btn ghost" for="bkFile">Восстановить из файла</label><input type="file" id="bkFile" accept=".json,application/json" hidden>
      <button class="btn ghost" id="bkPaste">Восстановить из текста</button>
      <button class="btn ghost" id="demo" data-confirm data-confirm-text="Заменить всё демо-данными?">Загрузить демо-данные</button>
      <button class="btn danger" id="wipe" data-confirm data-confirm-text="Удалить все данные? Нажмите ещё раз">Начать с чистого листа</button>` : ''}
    </div>
    <div id="bkBox"></div>
  </section>
  <section class="card"><div class="card-head"><h2>Журнал изменений</h2><span class="muted small">последние ${Math.min(100, s.log.length)} из ${s.log.length}</span></div>
    ${s.log.length ? `<div class="tw"><table><thead><tr><th>Когда</th><th>Действие</th><th>Что изменилось</th></tr></thead><tbody>${s.log.slice(0, 100).map(l => `<tr><td class="nowrap">${fmtDate(l.t.slice(0, 10))} ${l.t.slice(11, 16)}</td><td>${esc(l.action)}</td><td class="wrap">${esc(l.text)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Изменений пока нет.</p>'}
    ${cloud ? '' : '<p class="note">В облачном режиме в журнале видно, кто из сотрудников внёс изменение.</p>'}
  </section>`;
  $$('[data-set]', el).forEach(inp => inp.onchange = () => {
    const k = inp.dataset.set, t = inp.dataset.t;
    let v = t === 'text' ? inp.value.trim() : parseNum(inp.value);
    if (t !== 'text' && !isFinite(v)) { toast('Введите число', 'warn'); return; }
    if (t === 'pct') v = v / 100;
    st[k] = v;
    commit('Настройки', `${k} = ${inp.value}`, { silent: k !== 'clinicName' && k !== 'currency' });
  });
  $('#xlAll').onclick = async e => {
    const b = e.currentTarget, ms = periodMonths(), full = completeMonths(s), pm = full[full.length - 1] || ms[ms.length - 1];
    b.disabled = true;
    try { await downloadXlsx(xlName('все отчёты', ms), sheetsAll(s, ms, pm, [pm])); } finally { b.disabled = false; }
  };
  $('#bkShow').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportJSON()], { type: 'application/json' }));
    a.download = `Пульс клиники — резервная копия ${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Резервная копия сохранена файлом');
  };
  if (canWipe) {
    $('#bkPaste').onclick = () => {
      $('#bkBox').innerHTML = `<textarea id="bkIn" rows="6" placeholder="Вставьте текст резервной копии"></textarea><button class="btn small primary" id="bkRestore">Восстановить</button>`;
      $('#bkRestore').onclick = () => restore($('#bkIn').value);
    };
    $('#bkFile').onchange = async e => { const f = e.target.files[0]; if (f) restore(await f.text()); };
    $('#demo').addEventListener('click', e => { if (e.currentTarget.classList.contains('armed')) { resetDemo(); toast('Загружены демо-данные'); } });
    $('#wipe').addEventListener('click', e => { if (e.currentTarget.classList.contains('armed')) { clearAll(); toast('Данные очищены. Начните со справочников или загрузки из Excel.'); go('refs'); } });
  }
  if (cloud) {
    $('#swClinic').onclick = () => switchClinic();
    $('#signOut').onclick = () => signOut();
    renderTeam();
  }
}
// ---------- команда (облачный режим) ----------
async function renderTeam() {
  const box = $('#teamBox');
  if (!box) return;
  let T;
  try { T = await team(); } catch (e) { box.innerHTML = `<p class="form-err">Не удалось загрузить команду: ${esc(e.message)}</p>`; return; }
  const owner = T.role === 'owner';
  const roleSel = (uid, r) => `<select data-role="${uid}">${Object.entries(ROLES).map(([k, l]) => opt(k, l, r)).join('')}</select>`;
  box.innerHTML = `<div class="tw"><table class="team"><thead><tr><th>Почта</th><th>Роль</th><th>В команде с</th><th></th></tr></thead><tbody>
    ${T.members.map(m => `<tr><td>${esc(m.email || '—')}${m.user_id === T.me ? ' <span class="pill info">вы</span>' : ''}</td>
      <td>${owner && m.user_id !== T.me ? roleSel(m.user_id, m.role) : esc(ROLES[m.role])}</td><td>${fmtDate(m.created_at.slice(0, 10))}</td>
      <td class="row-actions">${owner && m.user_id !== T.me ? `<button class="btn small ghost danger" data-rm="${m.user_id}" data-confirm data-confirm-text="Убрать из команды?">Убрать</button>` : ''}</td></tr>`).join('')}
    ${T.invites.map(i => `<tr class="muted"><td>${esc(i.email)} <span class="pill warn">приглашён</span></td><td>${esc(ROLES[i.role])}</td><td>${fmtDate(i.created_at.slice(0, 10))}</td><td class="row-actions"><button class="btn small ghost" data-revoke="${esc(i.email)}">Отозвать</button></td></tr>`).join('')}
  </tbody></table></div>
  ${owner ? `<form class="invite-row" id="invForm" novalidate><label class="f-inline grow"><span>Пригласить по почте</span><input type="email" name="email" placeholder="buh@clinic.kz" required></label>
    <label class="f-inline"><span>Роль</span><select name="role">${['accountant', 'manager', 'viewer', 'owner'].map(k => opt(k, ROLES[k], 'accountant')).join('')}</select></label>
    <button class="btn primary" type="submit">Пригласить</button></form>
  <p class="note">Сотрудник регистрируется на эту почту по ссылке <b>${esc(location.origin + location.pathname)}</b> и подтверждает её — клиника появится у него автоматически. Роли: <b>владелец</b> — всё, включая команду; <b>бухгалтер</b> — все данные, кроме команды и настроек; <b>управляющий</b> — врачи, часы, услуги, маркетинг, склад, финансы только просмотр; <b>просмотр</b> — только смотреть.</p>` : ''}`;
  $$('[data-role]', box).forEach(sel => sel.onchange = async () => { try { await setRole(sel.dataset.role, sel.value); toast('Роль изменена'); } catch (e) { toast(e.message, 'warn'); } renderTeam(); });
  $$('[data-rm]', box).forEach(b => b.addEventListener('click', async () => { if (!b.classList.contains('armed')) return; try { await removeMember(b.dataset.rm); toast('Сотрудник убран из команды'); } catch (e) { toast(e.message, 'warn'); } renderTeam(); }));
  $$('[data-revoke]', box).forEach(b => b.onclick = async () => { try { await revokeInvite(b.dataset.revoke); } catch (e) { toast(e.message, 'warn'); } renderTeam(); });
  const f = $('#invForm');
  f && (f.onsubmit = async e => {
    e.preventDefault();
    try { await invite(f.email.value, f.role.value); toast('Приглашение создано — сообщите сотруднику адрес программы'); renderTeam(); }
    catch (er) { toast(er.message, 'warn'); }
  });
}
function restore(text) {
  try { importJSON(text); toast('Данные восстановлены'); } catch (e) { toast('Не получилось: ' + (e.message || 'файл повреждён'), 'warn'); }
}
