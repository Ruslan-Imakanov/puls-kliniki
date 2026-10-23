// Оболочка: навигация, период, маршрутизация, общие элементы, форма операции.
import { $, $$, esc, opt, money, compactC, moneyC, pct, today, curMonth, addMonths, monthsBetween, monLong, monLabel, fmtDate, prefGet, prefSet, toast, openModal, arm, parseNum, formData, isPartialMonth } from './util.js';
import { store, commit, add, update, remove } from './store.js';
import { GROUPS } from './model.js';
import { spanMonths } from './calc.js';
import { drawCharts, resetCharts } from './charts.js';

// ---------- иконки (контурные, 20px) ----------
const P = {
  overview: 'M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 7h6V4h-6z',
  ops: 'M5 6h14M5 12h14M5 18h9',
  pnl: 'M4 19V9M10 19V5M16 19v-7M22 19H2',
  cash: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 10v4M18 10v4',
  budget: 'M12 3a9 9 0 1 0 9 9h-9zM15 3.5V9h5.5A6 6 0 0 0 15 3.5z',
  debts: 'M7 4h10l2 4v12H5V8zM5 8h14M9 13h6',
  capacity: 'M4 20a8 8 0 1 1 16 0M12 20l4-6M4 20h16',
  doctors: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0M12 15v4M10 17h4',
  services: 'M9 4h6v4l4 12H5L9 8zM8 14h8',
  marketing: 'M3 10v4h4l6 4V6L7 10zM17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11',
  stock: 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8',
  import: 'M12 3v12M7 10l5 5 5-5M4 19h16',
  refs: 'M5 4h11l3 3v13H5zM9 9h6M9 13h6M9 17h4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2L10 21h4l.6-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14',
  theme: 'M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z',
};
export const icon = (k, size = 20) => `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[k] || P.more}"/></svg>`;

export const SECTIONS = [
  { group: 'Финансы' },
  { id: 'overview', name: 'Обзор', desc: 'Главные цифры за период и то, что требует внимания.' },
  { id: 'ops', name: 'Операции', desc: 'Журнал доходов, расходов и переводов. Здесь вносятся и исправляются данные.' },
  { id: 'pnl', name: 'Прибыли и убытки', short: 'ОПиУ', desc: 'Заработала ли клиника: выручка по дате оказания услуги, расходы по дате начисления.' },
  { id: 'cash', name: 'Движение денег', short: 'ДДС', desc: 'Сколько денег пришло и ушло, остатки на счетах и прогноз кассового разрыва.' },
  { id: 'budget', name: 'План-факт', desc: 'Бюджет по статьям, отклонения и точка безубыточности.' },
  { id: 'debts', name: 'Долги', desc: 'Кто должен клинике (ДМС, фонд, рассрочки) и кому должна клиника.' },
  { group: 'Клиника' },
  { id: 'capacity', name: 'Мощность', desc: 'Загрузка врачей, кабинетов и оборудования, недополученная выручка, сценарии роста.' },
  { id: 'doctors', name: 'Врачи и зарплата', short: 'Врачи', desc: 'Показатели каждого врача и расчёт зарплаты по его схеме.' },
  { id: 'services', name: 'Услуги и себестоимость', short: 'Услуги', desc: 'Себестоимость и маржа каждой услуги, ABC-анализ по выручке.' },
  { id: 'marketing', name: 'Маркетинг', desc: 'Воронка по каналам: обращения, записи, визиты, стоимость пациента и окупаемость.' },
  { id: 'stock', name: 'Склад', desc: 'Остатки материалов, сроки годности, приход и списание по нормам услуг.' },
  { group: 'Данные' },
  { id: 'import', name: 'Загрузка из Excel', short: 'Загрузка', desc: 'Импорт из Excel и CSV: выгрузки 1С, МИС, банка и таблиц.' },
  { id: 'refs', name: 'Справочники', desc: 'Статьи, отделения, врачи, ресурсы, счета, контрагенты, каналы.' },
  { id: 'settings', name: 'Настройки', desc: 'Параметры расчётов, резервная копия, журнал изменений.' },
];
const MOBILE_MAIN = ['overview', 'ops', 'cash', 'capacity'];
const sect = id => SECTIONS.find(x => x.id === id);

// ---------- период ----------
export const period = { from: null, to: null };
export function initPeriod() {
  const p = prefGet('period', null), span = spanMonths(store.s);
  const def = { from: addMonths(curMonth(), -11), to: curMonth() };
  Object.assign(period, p && p.from && p.to && p.from <= p.to ? p : def);
  if (!span.includes(period.from) && period.from < span[0]) period.from = span[0];
}
export const months = () => monthsBetween(period.from, period.to);
function periodOptions() {
  const span = spanMonths(store.s);
  const lo = span[0] < addMonths(curMonth(), -11) ? span[0] : addMonths(curMonth(), -11);
  const hi = addMonths(span[span.length - 1] > curMonth() ? span[span.length - 1] : curMonth(), 3);
  return monthsBetween(lo, hi);
}
function presetRange(k) {
  const cm = curMonth(), pm = addMonths(cm, -1);
  return {
    m: [cm, cm], pm: [pm, pm], q: [addMonths(pm, -2), pm], h: [addMonths(cm, -5), cm], y: [addMonths(cm, -11), cm], cy: [cm.slice(0, 4) + '-01', cm],
  }[k];
}
function renderPeriod() {
  const opts = periodOptions();
  const sel = (id, v) => `<select id="${id}" aria-label="${id === 'pFrom' ? 'С месяца' : 'По месяц'}">${opts.map(m => opt(m, monLabel(m), v)).join('')}</select>`;
  const active = Object.entries({ m: 'Месяц', pm: 'Прошлый', q: 'Квартал', h: '6 мес', y: '12 мес', cy: 'С начала года' })
    .map(([k, l]) => { const [a, b] = presetRange(k); return `<button type="button" class="chip${a === period.from && b === period.to ? ' on' : ''}" data-preset="${k}">${l}</button>`; }).join('');
  $('#period').innerHTML = `<div class="period-sel">${sel('pFrom', period.from)}<span>—</span>${sel('pTo', period.to)}</div><div class="chips">${active}</div>`;
  const apply = () => {
    let f = $('#pFrom').value, t = $('#pTo').value;
    if (f > t) [f, t] = [t, f];
    period.from = f; period.to = t; prefSet('period', period); render();
  };
  $('#pFrom').onchange = apply; $('#pTo').onchange = apply;
  $$('[data-preset]').forEach(b => b.onclick = () => { const [a, c] = presetRange(b.dataset.preset); period.from = a; period.to = c; prefSet('period', period); render(); });
}

// ---------- маршрутизация ----------
const views = {};
export const registerViews = map => Object.assign(views, map);
export const viewState = { id: 'overview', params: {} };
export function go(id, params = {}) {
  viewState.params = params;
  if (location.hash.slice(1) === id) render();
  else location.hash = id;
}
export function render() {
  const id = sect(location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
  if (id !== viewState.id) { viewState.id = id; if (!viewState.keep) window.scrollTo(0, 0); }
  viewState.keep = false;
  const s = sect(id);
  document.title = s.name + ' · ' + (store.s.settings.clinicName || 'Клиника');
  $$('[data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === id));
  $$('.bnav [data-nav]').forEach(b => b.classList.toggle('on', b.dataset.nav === id || (b.dataset.nav === 'more' && !MOBILE_MAIN.includes(id))));
  $('#pageTitle').textContent = s.name;
  $('#modeBadge').innerHTML = store.mode === 'demo' ? '<span class="pill warn">Демо-данные</span>' : '';
  const noPeriod = ['import', 'refs', 'settings', 'stock'].includes(id);
  $('#period').hidden = noPeriod;
  if (!noPeriod) renderPeriod();
  resetCharts();
  const el = $('#view');
  try { views[id](el, months(), viewState.params); }
  catch (e) { console.error(e); el.innerHTML = `<div class="card empty"><h2>Раздел не открылся</h2><p>${esc(e.message)}</p><p class="muted">Попробуйте другой период или восстановите данные в «Настройках».</p></div>`; }
  drawCharts(el);
  if (!store.saveOk) toast('Браузер не даёт сохранить данные (приватный режим?). Изменения пропадут после закрытия вкладки.', 'warn');
}
export function rerender() { viewState.keep = true; render(); }

// ---------- оболочка ----------
export function buildShell() {
  const nav = SECTIONS.map(x => x.group ? `<div class="nav-group">${x.group}</div>` :
    `<button type="button" class="nav-btn" data-nav="${x.id}">${icon(x.id)}<span>${x.name}</span></button>`).join('');
  $('#sideNav').innerHTML = nav;
  $('#bnav').innerHTML = MOBILE_MAIN.map(id => `<button type="button" data-nav="${id}">${icon(id)}<span>${sect(id).short || sect(id).name}</span></button>`).join('')
    + `<button type="button" data-nav="more">${icon('more')}<span>Ещё</span></button>`;
  $('#moreSheet').innerHTML = `<div class="sheet-inner">${SECTIONS.map(x => x.group ? `<div class="nav-group">${x.group}</div>` : `<button type="button" class="nav-btn" data-nav="${x.id}">${icon(x.id)}<span>${x.name}</span></button>`).join('')}</div>`;
  document.addEventListener('click', e => {
    const nb = e.target.closest('[data-nav]');
    if (nb) {
      if (nb.dataset.nav === 'more') { $('#moreSheet').hidden = !$('#moreSheet').hidden; return; }
      $('#moreSheet').hidden = true; viewState.params = {}; location.hash = nb.dataset.nav; return;
    }
    if (!e.target.closest('#moreSheet') && !$('#moreSheet').hidden) $('#moreSheet').hidden = true;
    const g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); go(g.dataset.go, g.dataset.params ? JSON.parse(g.dataset.params) : {}); }
    const c = e.target.closest('button[data-confirm]:not([data-act])');
    if (c && !c.classList.contains('armed')) { e.stopImmediatePropagation(); e.preventDefault(); arm(c); }
  }, true);
  $('#addOp').onclick = () => openOpForm();
  $('#fab').onclick = () => openOpForm();
  $('#themeBtn').onclick = cycleTheme;
  applyTheme(prefGet('theme', 'system'));
  window.addEventListener('hashchange', render);
  document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'n' || e.key.toLowerCase() === 'т') {
      const t = e.target;
      if (t.closest('input,select,textarea,[contenteditable]') || $('#modal').open || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault(); openOpForm();
    }
  });
  initTips();
}
function applyTheme(t) {
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  const lbl = { system: 'Тема: как в системе', light: 'Тема: светлая', dark: 'Тема: тёмная' }[t];
  $('#themeBtn').title = lbl; $('#themeBtn').setAttribute('aria-label', lbl);
  $('#themeLbl').textContent = { system: 'Авто', light: 'Светлая', dark: 'Тёмная' }[t];
}
function cycleTheme() {
  const order = ['system', 'light', 'dark'];
  const t = order[(order.indexOf(prefGet('theme', 'system')) + 1) % 3];
  prefSet('theme', t); applyTheme(t); drawCharts();
}

// ---------- подсказки ----------
function initTips() {
  const tip = $('#tip');
  let cur = null;
  const show = (el, x, y) => {
    tip.textContent = el.dataset.tip; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > innerHeight - 8) top = y - r.height - 14;
    tip.style.left = Math.max(8, left) + 'px'; tip.style.top = Math.max(8, top) + 'px';
  };
  document.addEventListener('pointermove', e => {
    const el = e.target.closest?.('[data-tip]');
    if (!el) { if (cur) { tip.hidden = true; cur?.classList.remove('hover'); cur = null; } return; }
    if (cur !== el) { cur?.classList.remove('hover'); cur = el; el.classList.add('hover'); }
    show(el, e.clientX, e.clientY);
  });
  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    const el = e.target.closest?.('[data-tip]');
    if (el) { show(el, e.clientX, e.clientY); clearTimeout(tip._t); tip._t = setTimeout(() => (tip.hidden = true), 2500); }
  });
  document.addEventListener('scroll', () => { tip.hidden = true; }, true);
}

// ---------- общие элементы ----------
export function pageHead(id, actions = '') {
  const s = sect(id);
  return `<div class="page-head"><p class="page-desc">${esc(s.desc)}</p>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
}
export function tile(label, value, sub = '', { tone = '', go: target, tip } = {}) {
  const tag = target ? 'button type="button"' : 'div';
  return `<${tag} class="tile ${tone}"${target ? ` data-go="${target}"` : ''}${tip ? ` data-tip="${esc(tip)}"` : ''}>
    <span class="tile-label">${esc(label)}</span><span class="tile-value">${value}</span>${sub ? `<span class="tile-sub">${sub}</span>` : ''}</${target ? 'button' : 'div'}>`;
}
export const tiles = arr => `<section class="tiles">${arr.join('')}</section>`;
export const pill = (t, k = '') => `<span class="pill ${k}">${esc(t)}</span>`;
export const statusPill = (lvl, t) => `<span class="status ${lvl}"><i aria-hidden="true">${{ good: '✓', warn: '!', serious: '!', crit: '‼' }[lvl] || '•'}</i>${esc(t)}</span>`;
export const seg = (name, options, value, cls = '') => `<div class="seg ${cls}" role="radiogroup">${options.map(([v, l]) =>
  `<label><input type="radio" name="${name}" value="${esc(v)}"${String(v) === String(value) ? ' checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>`;
export const empty = (title, text, actions = '') => `<div class="empty-state"><h3>${esc(title)}</h3><p>${esc(text)}</p>${actions ? `<div class="row-actions">${actions}</div>` : ''}</div>`;
export const monthPicker = (id, value, list) => `<select id="${id}" class="month-pick" aria-label="Месяц">${list.map(m => opt(m, monLong(m) + (isPartialMonth(m) ? ' (идёт)' : ''), value)).join('')}</select>`;
export const amountCell = (n, type) => `<td class="num ${type === 'income' ? 'pos' : type === 'expense' ? '' : 'muted'}">${type === 'expense' ? '−' : type === 'income' ? '+' : ''}${money(n)}</td>`;
export const deltaPct = (cur, prev, goodUp = true) => {
  if (!prev) return '';
  const d = cur / prev - 1, good = goodUp ? d >= 0 : d <= 0;
  return `<span class="delta ${good ? 'good' : 'bad'}">${d >= 0 ? '▲' : '▼'} ${pct(Math.abs(d))}</span> <span class="muted">к прошлому периоду</span>`;
};
export const colorFor = { revenue: 'var(--s1)', expense: 'var(--s2)', profit: 'var(--s3)' };

// ---------- форма операции ----------
function catOptions(type, sel) {
  return Object.entries(GROUPS).filter(([, g]) => g.type === type).map(([k, g]) => {
    const cs = store.s.categories.filter(c => c.grp === k);
    return cs.length ? `<optgroup label="${esc(g.name)}">${cs.map(c => opt(c.id, c.name, sel)).join('')}</optgroup>` : '';
  }).join('');
}
const refOptions = (coll, sel, emptyLabel = '—') => opt('', emptyLabel, sel) + store.s[coll].filter(x => x.active !== false || x.id === +sel).map(x => opt(x.id, x.name + (x.spec ? ' · ' + x.spec : ''), sel)).join('');

export function openOpForm(o = null, preset = {}) {
  const s = store.s, isNew = !o;
  const v = o ? { ...o } : { type: 'income', date: today(), paid: today(), account_id: s.accounts[0]?.id, amount: '', ...preset };
  if (isNew && !v.category_id && v.type !== 'transfer') v.category_id = s.categories.find(c => GROUPS[c.grp].type === v.type)?.id;
  const isPaid = !!v.paid;
  const body = `
    ${seg('type', [['income', 'Доход'], ['expense', 'Расход'], ['transfer', 'Перевод между счетами']], v.type, 'wide')}
    <div class="form-grid">
      <label class="f">Сумма, ${esc(s.settings.currency)}<input name="amount" inputmode="decimal" value="${v.amount === '' ? '' : esc(String(v.amount).replace('.', ','))}" placeholder="0" autocomplete="off"></label>
      <label class="f nt">Статья<select name="category_id">${catOptions(v.type === 'transfer' ? 'income' : v.type, v.category_id)}</select></label>
      <label class="f"><span class="lbl-date">${v.type === 'transfer' ? 'Дата перевода' : 'Дата оказания услуги / начисления'}</span><input type="date" name="date" value="${esc(v.date)}"></label>
      <div class="f nt span2">${seg('paidState', [['paid', 'Оплачено'], ['debt', 'Не оплачено — это долг']], isPaid ? 'paid' : 'debt')}</div>
      <label class="f pay-yes nt">Дата оплаты <small>если отличается: предоплата, отсрочка</small><input type="date" name="paid" value="${esc(v.paid || v.date)}"></label>
      <label class="f pay-yes"><span class="lbl-acc">Счёт</span><select name="account_id">${s.accounts.map(a => opt(a.id, a.name, v.account_id)).join('')}</select></label>
      <label class="f tr-only">На счёт<select name="to_account_id">${s.accounts.map(a => opt(a.id, a.name, v.to_account_id || s.accounts[1]?.id)).join('')}</select></label>
      <label class="f pay-no nt">Срок оплаты<input type="date" name="due" value="${esc(v.due || '')}"></label>
      <label class="f nt">Отделение<select name="department_id">${refOptions('departments', v.department_id, 'Общее на клинику')}</select></label>
      <label class="f nt">Врач<select name="doctor_id">${refOptions('doctors', v.doctor_id)}</select></label>
      <label class="f nt">Контрагент<select name="counterparty_id">${refOptions('counterparties', v.counterparty_id)}</select></label>
      <label class="f nt">Документ <small>реестр, счёт, накладная</small><input name="doc" value="${esc(v.doc || '')}" autocomplete="off"></label>
      <label class="f capex-only">Срок службы, мес. <small>для амортизации</small><input name="life" inputmode="numeric" value="${esc(v.life || s.settings.amortMonths || 60)}"></label>
      ${!isNew && v.type === 'income' && v.rejected ? `<label class="f">Отказ страховой<input name="rejected" inputmode="decimal" value="${esc(v.rejected)}"></label>` : ''}
      <label class="f span2">Комментарий<input name="comment" value="${esc(v.comment || '')}" autocomplete="off"></label>
    </div>
    <p class="form-err" role="alert" hidden></p>`;
  const sync = dlg => {
    const t = dlg.querySelector('[name=type]:checked').value;
    const st = dlg.querySelector('[name=paidState]:checked')?.value;
    const cat = s.categories.find(c => c.id === +dlg.querySelector('[name=category_id]').value);
    // поле видно, только если подходят все его условия
    dlg.querySelectorAll('.form-grid > *').forEach(x => {
      const c = x.classList;
      x.hidden = (c.contains('nt') && t === 'transfer') || (c.contains('tr-only') && t !== 'transfer')
        || (c.contains('pay-yes') && t !== 'transfer' && st !== 'paid') || (c.contains('pay-no') && (t === 'transfer' || st !== 'debt'))
        || (c.contains('capex-only') && (t === 'transfer' || cat?.grp !== 'capex'));
    });
    dlg.querySelector('.lbl-acc').textContent = t === 'transfer' ? 'Со счёта' : 'Счёт';
    dlg.querySelector('.lbl-date').textContent = t === 'transfer' ? 'Дата перевода' : t === 'income' ? 'Дата оказания услуги' : 'Дата начисления расхода';
  };
  const save = (dlg, again) => {
    const f = formData(dlg), err = dlg.querySelector('.form-err');
    const amount = parseNum(f.amount);
    const fail = m => { err.textContent = m; err.hidden = false; return false; };
    if (!(amount > 0)) return fail('Укажите сумму больше нуля.');
    if (!f.date) return fail('Укажите дату.');
    const t = f.type;
    const rec = {
      type: t, amount: Math.round(amount * 100) / 100, date: f.date, comment: f.comment.trim(),
      category_id: t === 'transfer' ? null : +f.category_id,
      account_id: +f.account_id || null,
      to_account_id: t === 'transfer' ? +f.to_account_id : null,
      paid: t === 'transfer' ? f.date : f.paidState === 'paid' ? (f.paid || f.date) : null,
      due: t !== 'transfer' && f.paidState === 'debt' ? (f.due || null) : null,
      department_id: t === 'transfer' ? null : (+f.department_id || null),
      doctor_id: t === 'transfer' ? null : (+f.doctor_id || null),
      counterparty_id: t === 'transfer' ? null : (+f.counterparty_id || null),
      doc: t === 'transfer' ? '' : f.doc.trim(),
      life: null, rejected: f.rejected != null ? parseNum(f.rejected) || 0 : (o?.rejected || 0),
    };
    if (t === 'transfer' && rec.account_id === rec.to_account_id) return fail('Выберите разные счета для перевода.');
    if (t !== 'transfer' && !rec.category_id) return fail('Выберите статью.');
    const cat = s.categories.find(c => c.id === rec.category_id);
    if (cat?.grp === 'capex') rec.life = +f.life || s.settings.amortMonths || 60;
    if (rec.doctor_id && !rec.department_id) rec.department_id = s.doctors.find(d => d.id === rec.doctor_id)?.department_id || null;
    const label = `${t === 'income' ? 'Доход' : t === 'expense' ? 'Расход' : 'Перевод'} ${moneyC(rec.amount)} от ${fmtDate(rec.date)}${cat ? ' · ' + cat.name : ''}`;
    if (isNew) { add('ops', { ...rec, src: 'manual' }); commit('Операция добавлена', label); }
    else { update('ops', o.id, rec); commit('Операция изменена', label); }
    toast(isNew ? 'Операция добавлена' : 'Изменения сохранены');
    if (again) { setTimeout(() => openOpForm(null, { type: t, category_id: rec.category_id, date: rec.date, paid: rec.paid, account_id: rec.account_id, department_id: rec.department_id }), 30); }
  };
  const actions = [
    ...(!isNew ? [{ label: 'Удалить', kind: 'danger left', confirm: true, onClick: () => { remove('ops', o.id); commit('Операция удалена', `${moneyC(o.amount)} от ${fmtDate(o.date)}`); toast('Операция удалена'); } },
      { label: 'Копия', kind: 'ghost', onClick: () => { setTimeout(() => openOpForm(null, { ...o, id: undefined, date: today(), paid: o.paid ? today() : null }), 30); } }] : []),
    ...(isNew ? [{ label: 'Сохранить и ещё', kind: 'ghost', onClick: dlg => save(dlg, true) }] : []),
    { label: isNew ? 'Добавить' : 'Сохранить', kind: 'primary', onClick: dlg => save(dlg) },
  ];
  openModal({
    title: isNew ? 'Новая операция' : 'Операция', body, actions, onOpen: dlg => {
      sync(dlg);
      dlg.querySelectorAll('[name=type]').forEach(r => r.onchange = () => {
        const t = dlg.querySelector('[name=type]:checked').value;
        dlg.querySelector('[name=category_id]').innerHTML = catOptions(t === 'transfer' ? 'income' : t);
        sync(dlg);
      });
      dlg.querySelectorAll('[name=paidState]').forEach(r => r.onchange = () => sync(dlg));
      dlg.querySelector('[name=category_id]').onchange = () => sync(dlg);
      dlg.querySelector('[name=date]').onchange = e => { const p = dlg.querySelector('[name=paid]'); if (!o) p.value = e.target.value; };
      dlg.querySelector('[name=doctor_id]').onchange = e => {
        const d = s.doctors.find(x => x.id === +e.target.value), dep = dlg.querySelector('[name=department_id]');
        if (d?.department_id && !dep.value) dep.value = d.department_id;
      };
      dlg.querySelector('[name=amount]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); dlg.querySelector('[data-act]:last-child').click(); } });
    },
  });
}
