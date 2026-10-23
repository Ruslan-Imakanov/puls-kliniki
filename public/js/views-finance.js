// Разделы «Финансы»: обзор, операции, ОПиУ, ДДС, план-факт, долги.
import { $, $$, esc, opt, money, moneyC, compactC, pct, sum, div, today, ym, curMonth, addMonths, monthsBetween, monLabel, monLong, monShort, fmtDate, isPartialMonth, toast, openModal, parseNum, formData, copyText, toCSV, debounce } from './util.js';
import { store, commit, add, update } from './store.js';
import { GROUPS } from './model.js';
import { ctx, pnl, cashflow, balances, debts, AGING, cashForecast, revenueForecast, planFact, breakEven, capacity, alerts, avgCheck, spanMonths } from './calc.js';
import { chartSlot, hbars, meter } from './charts.js';
import { pageHead, tile, tiles, pill, statusPill, seg, empty, monthPicker, openOpForm, go, rerender, colorFor, deltaPct, icon } from './ui.js';

const full = ms => { const f = ms.filter(m => !isPartialMonth(m)); return f.length ? f : ms; };
const mHead = m => `${monShort(m)} ${m.slice(2, 4)}${isPartialMonth(m) ? '<sup title="месяц ещё идёт">◐</sup>' : ''}`;
const cls = n => (n < 0 ? 'neg' : '');

// ================= ОБЗОР =================
export function viewOverview(el, months) {
  const s = store.s;
  if (!s.ops.length) {
    el.innerHTML = pageHead('overview') + `<div class="card">${empty('Пока нет данных', 'Внесите первую операцию или загрузите выгрузку из Excel — обзор заполнится автоматически.',
      `<button class="btn primary" data-go="import">Загрузить из Excel</button><button class="btn ghost" id="ovAdd">Добавить операцию</button>`)}</div>`;
    $('#ovAdd').onclick = () => openOpForm();
    return;
  }
  const L = pnl(s, months), prev = months.map(m => addMonths(m, -months.length)), Lp = pnl(s, prev);
  const bal = sum(balances(s), a => a.balance), d = debts(s), cap = capacity(s, full(months));
  const fc = revenueForecast(s, 3), al = alerts(s, months), ac = avgCheck(s, months, L);
  const expenses = months.map(m => L.variable[m] + L.fixed[m] + L.amort[m] + L.tax[m]);
  const rentab = div(L.profit.total, L.net.total);
  const C = ctx(s), set = new Set(months);
  const byDep = {}, byPayer = {};
  s.ops.forEach(o => {
    if (o.type !== 'income' || !set.has(ym(o.date)) || C.cat[o.category_id]?.grp !== 'revenue') return;
    const k = C.dep[o.department_id]?.name || 'Без отделения';
    byDep[k] = (byDep[k] || 0) + o.amount - (o.rejected || 0);
    const p = C.cat[o.category_id].name;
    byPayer[p] = (byPayer[p] || 0) + o.amount - (o.rejected || 0);
  });
  const bars = obj => { const tot = sum(Object.values(obj)); return Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, text: compactC(value) + ' · ' + pct(div(value, tot)), tip: `${label}: ${moneyC(value)}` })); };
  el.innerHTML = pageHead('overview') + tiles([
    tile('Чистая выручка', compactC(L.net.total), deltaPct(L.net.total, Lp.net.total), { go: 'pnl', tip: moneyC(L.net.total) }),
    tile('Чистая прибыль', `<span class="${cls(L.profit.total)}">${compactC(L.profit.total)}</span>`, `рентабельность ${pct(rentab)} · маржа ${pct(div(L.margin.total, L.net.total))}`, { go: 'pnl', tip: moneyC(L.profit.total) }),
    tile('Деньги на счетах', compactC(bal), 'на сегодня', { go: 'cash', tip: moneyC(bal) }),
    tile('Клинике должны', compactC(d.recTotal), d.recOverdue ? `<span class="neg">просрочено ${compactC(d.recOverdue)}</span>` : 'просрочки нет', { go: 'debts' }),
    tile('Загрузка врачей', pct(cap.utilDoctors), `до цели ${pct(cap.target)}: +${compactC(cap.potential)}`, { go: 'capacity' }),
    tile('Средний чек', moneyC(ac), `${money(cap.visits)} приёмов за период`, { go: 'doctors' }),
  ]) + `
  <div class="grid-main">
    <div class="col">
    <section class="card">
      <div class="card-head"><h2>Выручка, расходы и прибыль</h2><span class="muted small">* прогноз по тренду 6 месяцев</span></div>
      ${chartSlot({ label: 'Выручка, расходы и прибыль по месяцам', labels: months, series: [{ name: 'Чистая выручка', color: colorFor.revenue, values: months.map(m => L.net[m]) }, { name: 'Расходы', color: colorFor.expense, values: expenses }], line: { name: 'Чистая прибыль', color: colorFor.profit, values: months.map(m => (isPartialMonth(m) ? null : L.profit[m])) }, partial: isPartialMonth, forecast: fc.months.length && months[months.length - 1] >= addMonths(fc.months[0], -2) ? { labels: fc.months.filter(m => m > months[months.length - 1]), values: fc.values.filter((v, i) => fc.months[i] > months[months.length - 1]), name: 'Выручка', color: colorFor.revenue } : null, fmt: moneyC, tipTitle: m => monLong(m) + (isPartialMonth(m) ? ' — месяц ещё идёт' : ''), height: 260 })}
      <details class="table-view"><summary>Таблица по месяцам</summary><div class="tw"><table><thead><tr><th>Месяц</th><th class="num">Чистая выручка</th><th class="num">Расходы</th><th class="num">Чистая прибыль</th></tr></thead><tbody>
        ${months.map((m, i) => `<tr><td>${monLong(m)}</td><td class="num">${money(L.net[m])}</td><td class="num">${money(expenses[i])}</td><td class="num ${cls(L.profit[m])}">${money(L.profit[m])}</td></tr>`).join('')}
        ${fc.months.filter(m => m > months[months.length - 1]).map(m => `<tr class="muted"><td>${monLong(m)} — прогноз</td><td class="num">${money(fc.values[fc.months.indexOf(m)])}</td><td></td><td></td></tr>`).join('')}
      </tbody></table></div></details>
      ${months.some(isPartialMonth) ? '<p class="note">Бледный столбец — текущий месяц: он ещё идёт, зарплата и часть расходов будут начислены в конце месяца.</p>' : ''}
    </section>
    <div class="grid-2">
      <section class="card"><div class="card-head"><h2>Выручка по отделениям</h2></div>${hbars(bars(byDep), { color: 'var(--s1)' })}</section>
      <section class="card"><div class="card-head"><h2>Кто платит</h2></div>${hbars(bars(byPayer), { color: 'var(--s1)' })}
        <p class="note">ДМС и госзаказ платят с задержкой — следите за дебиторкой.</p></section>
    </div>
    </div>
    <section class="card attention">
      <div class="card-head"><h2>Требует внимания</h2><span class="count">${al.length}</span></div>
      ${al.length ? `<ul class="alerts">${al.map(a => `<li class="alert ${a.lvl}"><button type="button" data-go="${a.go}">
        ${statusPill(a.lvl, { crit: 'Срочно', serious: 'Важно', warn: 'Внимание' }[a.lvl])}
        <strong>${esc(a.title)}</strong>${a.val != null ? `<span class="alert-val">${a.valNote ? esc(a.valNote) + ' ' : ''}${compactC(a.val)}</span>` : ''}
        <span class="alert-text">${esc(a.text)}</span></button></li>`).join('')}</ul>` : `<p class="ok-note">${statusPill('good', 'Всё в порядке')} Критичных сигналов нет.</p>`}
    </section>
  </div>`;
}

// ================= ОПЕРАЦИИ =================
const opsF = { q: '', type: '', cat: '', dep: '', doc: '', acc: '', status: '', cp: '', limit: 100 };
export function viewOps(el, months, params) {
  const s = store.s, C = ctx(s);
  if (params && Object.keys(params).length) {
    Object.assign(opsF, { q: '', type: '', cat: '', dep: '', doc: '', acc: '', status: '', cp: '', limit: 100 });
    if (params.category_id) opsF.cat = String(params.category_id);
    if (params.status) opsF.status = params.status;
    if (params.doctor_id) opsF.doc = String(params.doctor_id);
    opsF.month = params.month || ''; opsF.by = params.by || '';
    for (const k in params) delete params[k];
  }
  const scope = opsF.month ? [opsF.month] : months, set = new Set(scope);
  const q = opsF.q.trim().toLowerCase();
  const list = s.ops.filter(o => {
    const inP = opsF.by === 'paid' ? (o.paid && set.has(ym(o.paid))) : (set.has(ym(o.date)) || (o.paid && set.has(ym(o.paid))));
    if (!inP) return false;
    if (opsF.type && o.type !== opsF.type) return false;
    if (opsF.cat && o.category_id !== +opsF.cat) return false;
    if (opsF.dep && o.department_id !== +opsF.dep) return false;
    if (opsF.doc && o.doctor_id !== +opsF.doc) return false;
    if (opsF.acc && o.account_id !== +opsF.acc && o.to_account_id !== +opsF.acc) return false;
    if (opsF.cp && o.counterparty_id !== +opsF.cp) return false;
    if (opsF.status === 'paid' && !o.paid) return false;
    if (opsF.status === 'debt' && o.paid) return false;
    if (q) {
      const hay = [o.comment, o.doc, C.cat[o.category_id]?.name, C.doc[o.doctor_id]?.name, C.cp[o.counterparty_id]?.name, C.dep[o.department_id]?.name, String(o.amount)].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const inc = sum(list.filter(o => o.type === 'income'), o => o.amount), exp = sum(list.filter(o => o.type === 'expense'), o => o.amount);
  const fsel = (k, label, options) => `<label class="f-inline"><span>${label}</span><select data-f="${k}">${opt('', 'Все', opsF[k])}${options}</select></label>`;
  const catOpts = Object.entries(GROUPS).map(([g, gg]) => { const cs = s.categories.filter(c => c.grp === g); return cs.length ? `<optgroup label="${esc(gg.name)}">${cs.map(c => opt(c.id, c.name, opsF.cat)).join('')}</optgroup>` : ''; }).join('');
  const shown = list.slice(0, opsF.limit);
  el.innerHTML = pageHead('ops', `<button class="btn ghost" id="opsCopy">Скопировать в Excel</button><button class="btn primary" id="opsAdd">${icon('plus', 16)}Добавить</button>`) + `
  <section class="card">
    <div class="filters">
      <label class="f-inline grow"><span>Поиск</span><input type="search" id="opsQ" value="${esc(opsF.q)}" placeholder="комментарий, документ, врач, сумма"></label>
      ${fsel('type', 'Тип', opt('income', 'Доходы', opsF.type) + opt('expense', 'Расходы', opsF.type) + opt('transfer', 'Переводы', opsF.type))}
      ${fsel('cat', 'Статья', catOpts)}
      ${fsel('dep', 'Отделение', s.departments.map(d => opt(d.id, d.name, opsF.dep)).join(''))}
      ${fsel('doc', 'Врач', s.doctors.map(d => opt(d.id, d.name, opsF.doc)).join(''))}
      ${fsel('cp', 'Контрагент', s.counterparties.map(d => opt(d.id, d.name, opsF.cp)).join(''))}
      ${fsel('acc', 'Счёт', s.accounts.map(d => opt(d.id, d.name, opsF.acc)).join(''))}
      ${fsel('status', 'Оплата', opt('paid', 'Оплачено', opsF.status) + opt('debt', 'Не оплачено', opsF.status))}
    </div>
    ${opsF.month ? `<p class="scope-note">Показан только ${monLong(opsF.month)}${opsF.by === 'paid' ? ' по дате оплаты' : ''}. <button class="link" id="opsAll">Показать весь период</button></p>` : ''}
    <div class="sumbar"><span>${list.length} операций</span><span class="pos">Доходы +${money(inc)}</span><span>Расходы −${money(exp)}</span><strong class="${cls(inc - exp)}">Итого ${money(inc - exp)}</strong></div>
    ${list.length ? `<div class="tw"><table class="ops-table click-rows"><thead><tr><th>Дата</th><th>Оплата</th><th>Статья</th><th>Отделение · врач</th><th>Контрагент · документ</th><th>Комментарий</th><th class="num">Сумма</th></tr></thead><tbody>
      ${shown.map(o => {
        const c = C.cat[o.category_id];
        const payTxt = o.type === 'transfer' ? `${esc(C.acc[o.account_id]?.name || '')} → ${esc(C.acc[o.to_account_id]?.name || '')}` :
          o.paid ? `${fmtDate(o.paid)}${o.paid !== o.date ? (o.paid < o.date ? ' <span class="pill info">предоплата</span>' : '') : ''} · ${esc(C.acc[o.account_id]?.name || '')}` :
          `<span class="pill ${o.due && o.due < today() ? 'crit' : 'warn'}">не оплачено${o.due ? ' · до ' + fmtDate(o.due) : ''}</span>`;
        return `<tr data-id="${o.id}" tabindex="0"><td>${fmtDate(o.date)}</td><td>${payTxt}</td><td>${o.type === 'transfer' ? 'Перевод' : esc(c?.name || '—')}</td>
          <td>${esc([C.dep[o.department_id]?.name, C.doc[o.doctor_id]?.name].filter(Boolean).join(' · ') || '—')}</td>
          <td>${esc([C.cp[o.counterparty_id]?.name, o.doc].filter(Boolean).join(' · ') || '—')}</td><td class="wrap">${esc(o.comment || '')}${o.rejected ? ` <span class="pill warn">отказ ${money(o.rejected)}</span>` : ''}</td>
          <td class="num ${o.type === 'income' ? 'pos' : o.type === 'transfer' ? 'muted' : ''}">${o.type === 'income' ? '+' : o.type === 'expense' ? '−' : ''}${money(o.amount)}</td></tr>`;
      }).join('')}</tbody></table></div>
      ${list.length > shown.length ? `<div class="more-row"><button class="btn ghost" id="opsMore">Показать ещё ${Math.min(100, list.length - shown.length)} из ${list.length - shown.length}</button></div>` : ''}`
      : empty('Ничего не найдено', s.ops.length ? 'Измените фильтры или период.' : 'Добавьте первую операцию или загрузите данные из Excel.', '<button class="btn primary" id="opsAdd2">Добавить операцию</button>')}
  </section>`;
  $('#opsAdd').onclick = () => openOpForm();
  $('#opsAdd2') && ($('#opsAdd2').onclick = () => openOpForm());
  $('#opsAll') && ($('#opsAll').onclick = () => { opsF.month = ''; opsF.by = ''; rerender(); });
  $('#opsMore') && ($('#opsMore').onclick = () => { opsF.limit += 100; rerender(); });
  $('#opsQ').oninput = debounce(e => { opsF.q = e.target.value; opsF.limit = 100; rerender(); setTimeout(() => { const i = $('#opsQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 300);
  $$('[data-f]', el).forEach(x => x.onchange = () => { opsF[x.dataset.f] = x.value; opsF.limit = 100; rerender(); });
  const open = tr => { const o = s.ops.find(x => x.id === +tr.dataset.id); if (o) openOpForm(o); };
  $$('tbody tr[data-id]', el).forEach(tr => { tr.onclick = () => open(tr); tr.onkeydown = e => { if (e.key === 'Enter') open(tr); }; });
  $('#opsCopy').onclick = () => copyText(toCSV([['Дата', 'Дата оплаты', 'Тип', 'Статья', 'Отделение', 'Врач', 'Контрагент', 'Документ', 'Счёт', 'Сумма', 'Отказ', 'Комментарий'],
    ...list.map(o => [fmtDate(o.date), fmtDate(o.paid), { income: 'доход', expense: 'расход', transfer: 'перевод' }[o.type], C.cat[o.category_id]?.name || '', C.dep[o.department_id]?.name || '', C.doc[o.doctor_id]?.name || '', C.cp[o.counterparty_id]?.name || '', o.doc || '', C.acc[o.account_id]?.name || '', String(o.amount).replace('.', ','), o.rejected || '', o.comment || ''])]));
}

// ================= ОПиУ =================
const pnlOpen = new Set();
export function viewPnl(el, months) {
  const s = store.s, L = pnl(s, months);
  if (!s.ops.length) { el.innerHTML = pageHead('pnl') + `<div class="card">${empty('Нет операций', 'Отчёт о прибылях и убытках строится из журнала операций.', '<button class="btn primary" data-go="ops">Перейти к операциям</button>')}</div>`; return; }
  const net = L.net.total;
  const cats = grp => s.categories.filter(c => c.grp === grp).map(c => ({ c, l: L.cat(c.id) })).filter(x => x.l.total || months.some(m => x.l[m]));
  const struct = [
    { k: 'revenue', label: 'Выручка', grp: 'revenue' },
    { k: 'adj', label: 'Возвраты и отказы страховых', grp: 'revenue_adj', minus: true, extra: L.rejected.total ? [{ label: 'Отказы страховых по реестрам', l: L.rejected }] : [] },
    { k: 'net', label: 'Чистая выручка', total: true },
    { k: 'variable', label: 'Переменные расходы', grp: 'variable', minus: true },
    { k: 'margin', label: 'Маржинальная прибыль', total: true },
    { k: 'fixed', label: 'Постоянные расходы', grp: 'fixed', minus: true },
    { k: 'ebitda', label: 'Операционная прибыль (EBITDA)', total: true },
    { k: 'amort', label: 'Амортизация оборудования', minus: true, hint: 'Покупка оборудования делится на срок службы' },
    { k: 'other', label: 'Прочие доходы', grp: 'other_income' },
    { k: 'tax', label: 'Налоги на доход', grp: 'tax', minus: true },
    { k: 'profit', label: 'Чистая прибыль', total: true, main: true },
  ];
  const cells = (l, catId, minus) => months.map(m => `<td class="num${catId ? ' drill' : ''}"${catId ? ` data-cat="${catId}" data-m="${m}"` : ''}>${l[m] ? (minus ? '−' : '') + money(l[m]) : '<span class="muted">·</span>'}</td>`).join('')
    + `<td class="num tot">${l.total ? (minus ? '−' : '') + money(l.total) : '·'}</td><td class="num muted">${net ? pct(l.total / net, 1) : ''}</td>`;
  let rows = '';
  struct.forEach(r => {
    const l = L[r.k];
    if (!r.total && !l.total && !(r.extra?.length) && !months.some(m => l[m])) return;
    const kids = r.grp ? cats(r.grp) : [];
    const canOpen = kids.length > 0 || r.extra?.length;
    const isOpen = pnlOpen.has(r.k);
    rows += `<tr class="${r.total ? 'total' : 'group'}${r.main ? ' grand' : ''}${canOpen ? ' toggle' : ''}" ${canOpen ? `data-tg="${r.k}" tabindex="0" aria-expanded="${isOpen}"` : ''}>
      <th scope="row">${canOpen ? `<span class="caret">${isOpen ? '▾' : '▸'}</span>` : ''}${esc(r.label)}${r.hint ? ` <span class="muted small" title="${esc(r.hint)}">ⓘ</span>` : ''}</th>
      ${months.map(m => `<td class="num ${r.total ? cls(l[m]) : ''}">${l[m] ? (r.minus ? '−' : '') + money(l[m]) : '<span class="muted">·</span>'}</td>`).join('')}
      <td class="num tot ${r.total ? cls(l.total) : ''}">${(r.minus && l.total ? '−' : '') + money(l.total)}</td><td class="num muted">${net ? pct(l.total / net, 1) : ''}</td></tr>`;
    if (isOpen) {
      kids.forEach(x => { rows += `<tr class="child"><th scope="row">${esc(x.c.name)}</th>${cells(x.l, x.c.id, r.minus)}</tr>`; });
      (r.extra || []).forEach(x => { rows += `<tr class="child"><th scope="row">${esc(x.label)}</th>${cells(x.l, null, true)}</tr>`; });
    }
  });
  const mr = div(L.margin.total, net);
  el.innerHTML = pageHead('pnl', `<button class="btn ghost" id="pnlAll">${pnlOpen.size ? 'Свернуть статьи' : 'Раскрыть все статьи'}</button>`) + tiles([
    tile('Чистая выручка', compactC(net), `за ${months.length} мес.`, { tip: moneyC(net) }),
    tile('Маржинальная прибыль', compactC(L.margin.total), `${pct(mr)} от выручки`, { tip: moneyC(L.margin.total) }),
    tile('EBITDA', `<span class="${cls(L.ebitda.total)}">${compactC(L.ebitda.total)}</span>`, `${pct(div(L.ebitda.total, net))} от выручки`),
    tile('Чистая прибыль', `<span class="${cls(L.profit.total)}">${compactC(L.profit.total)}</span>`, `рентабельность ${pct(div(L.profit.total, net))}`, { tip: moneyC(L.profit.total) }),
  ]) + `
  <section class="card">
    <div class="card-head"><h2>Отчёт о прибылях и убытках</h2><span class="muted small">Нажмите на строку, чтобы раскрыть статьи; на сумму — чтобы увидеть операции</span></div>
    <div class="tw sticky-first"><table class="report"><thead><tr><th>Статья</th>${months.map(m => `<th class="num">${mHead(m)}</th>`).join('')}<th class="num">Итого</th><th class="num">% выручки</th></tr></thead><tbody>${rows}</tbody></table></div>
  </section>
  <section class="card">
    <div class="card-head"><h2>Чистая прибыль по месяцам</h2></div>
    ${chartSlot({ label: 'Чистая прибыль по месяцам', labels: months, series: [{ name: 'Чистая прибыль', color: colorFor.profit, values: months.map(m => L.profit[m]) }], fmt: moneyC, tipTitle: m => monLong(m) + (isPartialMonth(m) ? ' — месяц ещё идёт' : ''), height: 200 })}
    <p class="note">Прибыль по начислению: выручка — в месяце оказания услуги, даже если страховая заплатит позже. Сколько денег реально пришло — в разделе <a href="#cash" data-go="cash">«Движение денег»</a>.</p>
  </section>`;
  $$('[data-tg]', el).forEach(tr => {
    const t = () => { const k = tr.dataset.tg; pnlOpen.has(k) ? pnlOpen.delete(k) : pnlOpen.add(k); rerender(); };
    tr.onclick = t; tr.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t(); } };
  });
  $$('td.drill', el).forEach(td => td.onclick = () => go('ops', { category_id: +td.dataset.cat, month: td.dataset.m }));
  $('#pnlAll').onclick = () => { if (pnlOpen.size) pnlOpen.clear(); else struct.forEach(r => pnlOpen.add(r.k)); rerender(); };
}

// ================= ДДС =================
const cashOpen = new Set(['op_in', 'op_out']);
export function viewCash(el, months) {
  const s = store.s, F = cashflow(s, months), fc = cashForecast(s, 3), bals = balances(s);
  const now = sum(bals, a => a.balance);
  const catsBy = (grps, type) => s.categories.filter(c => grps.includes(c.grp) && GROUPS[c.grp].type === type).map(c => ({ c, l: F.cat(c.id) })).filter(x => x.l.total);
  const sections = [
    { k: 'op_in', label: 'Поступления от операционной деятельности', l: F.op_in, kids: catsBy(['revenue', 'other_income'], 'income') },
    { k: 'op_out', label: 'Выплаты по операционной деятельности', l: F.op_out, kids: catsBy(['revenue_adj', 'variable', 'fixed', 'tax'], 'expense'), minus: true },
    { k: 'op_net', label: 'Операционный денежный поток', l: F.op_net, total: true },
    { k: 'inv_out', label: 'Инвестиции: оборудование и ремонт', l: F.inv_out, kids: catsBy(['capex'], 'expense'), minus: true },
    { k: 'fin_in', label: 'Получено: кредиты и вложения', l: F.fin_in, kids: catsBy(['financing_in'], 'income') },
    { k: 'fin_out', label: 'Выплачено: кредиты и собственникам', l: F.fin_out, kids: catsBy(['financing_out'], 'expense'), minus: true },
    { k: 'net', label: 'Чистый денежный поток', l: F.net, total: true },
  ];
  let rows = `<tr class="total"><th scope="row">Остаток на начало</th>${months.map(m => `<td class="num">${money(F.open[m])}</td>`).join('')}<td class="num tot">${money(F.opening)}</td></tr>`;
  sections.forEach(r => {
    if (!r.total && !r.l.total) return;
    const open = cashOpen.has(r.k), can = r.kids?.length;
    rows += `<tr class="${r.total ? 'total' : 'group'}${can ? ' toggle' : ''}" ${can ? `data-tg="${r.k}" tabindex="0" aria-expanded="${open}"` : ''}><th scope="row">${can ? `<span class="caret">${open ? '▾' : '▸'}</span>` : ''}${esc(r.label)}</th>
      ${months.map(m => `<td class="num ${r.total ? cls(r.l[m]) : ''}">${r.l[m] ? (r.minus ? '−' : '') + money(r.l[m]) : '<span class="muted">·</span>'}</td>`).join('')}<td class="num tot ${r.total ? cls(r.l.total) : ''}">${(r.minus && r.l.total ? '−' : '') + money(r.l.total)}</td></tr>`;
    if (open && can) r.kids.forEach(x => { rows += `<tr class="child"><th scope="row">${esc(x.c.name)}</th>${months.map(m => `<td class="num drill" data-cat="${x.c.id}" data-m="${m}">${x.l[m] ? (r.minus ? '−' : '') + money(x.l[m]) : '<span class="muted">·</span>'}</td>`).join('')}<td class="num tot">${money(x.l.total)}</td></tr>`; });
  });
  const lastM = months[months.length - 1];
  rows += `<tr class="total grand"><th scope="row">Остаток на конец</th>${months.map(m => `<td class="num ${cls(F.close[m])}">${money(F.close[m])}</td>`).join('')}<td class="num tot ${cls(F.close[lastM])}">${money(F.close[lastM])}</td></tr>`;
  const showFc = lastM >= curMonth() && fc.rows.length;
  const lineLabels = showFc ? [...months.filter(m => m < curMonth()), ...fc.rows.map(r => r.m)] : months;
  const actual = lineLabels.map(m => (months.includes(m) && m < curMonth() ? F.close[m] : null));
  const cmIdx = lineLabels.indexOf(curMonth());
  const fcVals = lineLabels.map((m, i) => { const r = fc.rows.find(x => x.m === m); if (r) return r.close; return i === cmIdx - 1 ? actual[i] : null; });
  el.innerHTML = pageHead('cash', `<button class="btn ghost" id="cashTr">Перевод между счетами</button>`) + tiles([
    tile('Остаток на начало периода', compactC(F.opening), monLong(months[0]), { tip: moneyC(F.opening) }),
    tile('Поступило', compactC(F.op_in.total + F.fin_in.total), `в т.ч. кредиты ${compactC(F.fin_in.total)}`),
    tile('Выплачено', compactC(F.op_out.total + F.inv_out.total + F.fin_out.total), `в т.ч. оборудование ${compactC(F.inv_out.total)}`),
    tile('Остаток на конец периода', `<span class="${cls(F.close[lastM])}">${compactC(F.close[lastM])}</span>`, monLong(lastM), { tip: moneyC(F.close[lastM]) }),
    tile('Деньги сейчас', compactC(now), bals.map(a => `${esc(a.name)}: ${compactC(a.balance)}`).join(' · ')),
  ]) + `
  <div class="grid-main">
    <section class="card">
      <div class="card-head"><h2>Остаток денег по месяцам</h2>${showFc ? '<span class="muted small">пунктир — прогноз</span>' : ''}</div>
      ${chartSlot({ kind: 'line', label: 'Остаток денег на конец месяца', labels: lineLabels, series: [{ name: 'Факт', color: 'var(--s1)', values: actual, area: true }, ...(showFc ? [{ name: 'Прогноз', color: 'var(--s1)', values: fcVals, from: 0 }] : [])], legendAlways: showFc, legend: showFc ? [{ name: 'Факт', color: 'var(--s1)', kind: 'line' }, { name: 'Прогноз', color: 'var(--s1)', kind: 'dash' }] : null, fmt: moneyC, tipTitle: m => monLong(m) + (fc.rows.some(r => r.m === m) ? ' — прогноз' : ''), height: 220 })}
    </section>
    <section class="card ${fc.gap ? 'attention' : ''}">
      <div class="card-head"><h2>Прогноз на 3 месяца</h2></div>
      ${fc.rows.length ? `${fc.gap ? `<p>${statusPill('crit', 'Кассовый разрыв')} в ${monLong(fc.gap.m)}: остаток ${moneyC(fc.gap.close)}.</p>` : `<p>${statusPill('good', 'Разрыва нет')} минимальный остаток ${moneyC(fc.min)}.</p>`}
      <div class="tw"><table><thead><tr><th>Месяц</th><th class="num">Придёт</th><th class="num">Уйдёт</th><th class="num">Остаток</th></tr></thead><tbody>
      <tr class="muted"><td>Сейчас</td><td></td><td></td><td class="num">${money(fc.start)}</td></tr>
      ${fc.rows.map(r => `<tr><td class="nowrap">${r.rest ? 'Остаток ' + monShort(r.m) : monLabel(r.m)} <span class="muted small">· ${r.src}</span></td><td class="num">+${money(r.inflow)}</td><td class="num">−${money(r.outflow)}</td><td class="num ${cls(r.close)}">${money(r.close)}</td></tr>`).join('')}
      </tbody></table></div><p class="note">Поступления — по тренду последних 6 месяцев, выплаты — средние за 3 месяца. Если для месяца есть бюджет, берётся он.</p>` : '<p class="muted">Для прогноза нужно хотя бы 2 полных месяца данных.</p>'}
    </section>
  </div>
  <section class="card">
    <div class="card-head"><h2>Движение денежных средств</h2><span class="muted small">по дате оплаты</span></div>
    <div class="tw sticky-first"><table class="report"><thead><tr><th>Статья</th>${months.map(m => `<th class="num">${mHead(m)}</th>`).join('')}<th class="num">Итого</th></tr></thead><tbody>${rows}</tbody></table></div>
  </section>`;
  $$('[data-tg]', el).forEach(tr => {
    const t = () => { const k = tr.dataset.tg; cashOpen.has(k) ? cashOpen.delete(k) : cashOpen.add(k); rerender(); };
    tr.onclick = t; tr.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t(); } };
  });
  $$('td.drill', el).forEach(td => td.onclick = () => go('ops', { category_id: +td.dataset.cat, month: td.dataset.m, by: 'paid' }));
  $('#cashTr').onclick = () => openOpForm(null, { type: 'transfer', account_id: s.accounts[0]?.id, to_account_id: s.accounts[1]?.id });
}

// ================= ПЛАН-ФАКТ =================
const bud = { month: null, mode: 'month' };
export function viewBudget(el, months) {
  const s = store.s, C = ctx(s);
  const list = monthsBetween(spanMonths(s)[0], addMonths(curMonth(), 3));
  if (!bud.month || !list.includes(bud.month)) bud.month = curMonth();
  const scope = bud.mode === 'month' ? [bud.month] : months;
  const pf = planFact(s, scope);
  const L = pnl(s, scope), be = breakEven(L, avgCheck(s, scope, L));
  const edit = bud.mode === 'month';
  const byCat = Object.fromEntries(pf.rows.map(r => [r.cat.id, r]));
  const groupsHtml = Object.entries(GROUPS).map(([g, gg]) => {
    const cs = s.categories.filter(c => c.grp === g);
    const rws = cs.map(c => byCat[c.id] || { cat: c, plan: 0, fact: 0, dev: 0, ratio: null, inc: gg.type === 'income' }).filter(r => edit || r.plan || r.fact);
    if (!rws.length) return '';
    const tp = sum(rws, r => r.plan), tf = sum(rws, r => r.fact);
    return `<tr class="group"><th scope="row">${esc(gg.name)}</th><td class="num">${money(tp)}</td><td class="num">${money(tf)}</td><td class="num">${money(tf - tp)}</td><td></td></tr>` +
      rws.map(r => {
        const ratio = r.plan ? r.fact / r.plan : null, inc = gg.type === 'income';
        const bad = r.plan ? (inc ? r.fact < r.plan * 0.95 : r.fact > r.plan * 1.05) : false;
        return `<tr class="child" data-cat="${r.cat.id}"><th scope="row">${esc(r.cat.name)}</th>
        <td class="num">${edit ? `<input class="cell-in" data-plan="${r.cat.id}" inputmode="decimal" value="${r.plan ? money(r.plan) : ''}" placeholder="—" aria-label="План: ${esc(r.cat.name)}">` : money(r.plan)}</td>
        <td class="num">${money(r.fact)}</td><td class="num dev ${bad ? 'neg' : ''}">${r.plan || r.fact ? (r.fact - r.plan > 0 ? '+' : '') + money(r.fact - r.plan) : ''}</td>
        <td class="ratio">${ratio == null ? '' : `<span class="ratio-bar ${bad ? 'bad' : 'ok'}"><i style="width:${Math.min(100, ratio * 100).toFixed(0)}%"></i></span><span>${pct(ratio)}</span>`}</td></tr>`;
      }).join('');
  }).join('');
  const hasPlan = s.budget.some(b => scope.includes(b.month));
  el.innerHTML = pageHead('budget', edit ? `<button class="btn ghost" id="bFact">План = факт прошлого месяца</button><button class="btn ghost" id="bCopy">Скопировать план прошлого месяца</button><button class="btn ghost danger" id="bClear" data-confirm>Очистить план месяца</button>` : '') + `
  <section class="card toolbar">
    ${seg('budMode', [['month', 'Один месяц'], ['period', 'Весь выбранный период']], bud.mode)}
    ${edit ? `<label class="f-inline"><span>Месяц</span>${monthPicker('budMonth', bud.month, list)}</label>` : `<span class="muted">${monLong(months[0])} — ${monLong(months[months.length - 1])}</span>`}
  </section>` + tiles([
    tile('Выручка: план / факт', `${compactC(pf.fact.revenue)}`, `план ${compactC(pf.plan.revenue)} · ${pf.plan.revenue ? pct(pf.fact.revenue / pf.plan.revenue) : '—'}`, { tone: pf.plan.revenue && pf.fact.revenue < pf.plan.revenue * 0.95 ? 'bad' : '' }),
    tile('Расходы: план / факт', `${compactC(pf.fact.expense)}`, `план ${compactC(pf.plan.expense)} · ${pf.plan.expense ? pct(pf.fact.expense / pf.plan.expense) : '—'}`, { tone: pf.plan.expense && pf.fact.expense > pf.plan.expense * 1.05 ? 'bad' : '' }),
    tile('Прибыль: план / факт', `<span class="${cls(pf.fact.profit)}">${compactC(pf.fact.profit)}</span>`, `план ${compactC(pf.plan.profit)}`),
    tile('Точка безубыточности', isFinite(be.be) ? compactC(be.be) : '—', 'выручка в месяц, чтобы выйти в ноль', { tip: 'Постоянные расходы и амортизация, делённые на долю маржинальной прибыли' }),
    tile('Запас прочности', pct(be.safety), isFinite(be.be) ? `≈ ${money(be.visits)} приёмов в месяц для нуля` : '', { tone: be.safety < 0.1 ? 'bad' : '' }),
  ]) + `
  <section class="card">
    <div class="card-head"><h2>${edit ? 'Бюджет на ' + monLong(bud.month) : 'План-факт за период'}</h2><span class="muted small">${edit ? 'Впишите план в ячейку — сохраняется сразу' : ''}</span></div>
    ${!hasPlan && !edit ? `<p class="muted">На этот период план не задан. Переключитесь на «Один месяц», чтобы заполнить бюджет.</p>` : ''}
    <div class="tw"><table class="report budget"><thead><tr><th>Статья</th><th class="num">План</th><th class="num">Факт</th><th class="num">Отклонение</th><th>Исполнение</th></tr></thead><tbody>${groupsHtml}</tbody></table></div>
    <p class="note">Факт — по дате начисления (как в ОПиУ). Отклонение подсвечено, если выручка ниже плана больше чем на 5% или расход выше плана больше чем на 5%.</p>
  </section>
  <section class="card">
    <div class="card-head"><h2>Безубыточность</h2><span class="muted small">в среднем за месяц выбранного периода</span></div>
    <div class="kv-grid">
      <div><span>Постоянные расходы + амортизация</span><b>${moneyC(be.fixedM)}</b></div>
      <div><span>Доля маржинальной прибыли</span><b>${pct(be.mr, 1)}</b></div>
      <div><span>Выручка для выхода в ноль</span><b>${isFinite(be.be) ? moneyC(be.be) : '—'}</b></div>
      <div><span>Фактическая выручка</span><b>${moneyC(be.netM)}</b></div>
      <div><span>Запас финансовой прочности</span><b class="${be.safety < 0 ? 'neg' : ''}">${pct(be.safety, 1)}</b></div>
      <div><span>Приёмов в месяц для выхода в ноль</span><b>${isFinite(be.be) ? money(be.visits) : '—'}</b></div>
    </div>
  </section>`;
  $$('[name=budMode]', el).forEach(r => r.onchange = () => { bud.mode = r.value; rerender(); });
  $('#budMonth') && ($('#budMonth').onchange = e => { bud.month = e.target.value; rerender(); });
  $$('[data-plan]', el).forEach(inp => inp.onchange = () => {
    const cid = +inp.dataset.plan, v = parseNum(inp.value);
    const i = s.budget.findIndex(b => b.month === bud.month && b.category_id === cid);
    if (!inp.value.trim() || !(v >= 0)) { if (i > -1) s.budget.splice(i, 1); }
    else if (i > -1) s.budget[i].amount = v; else s.budget.push({ month: bud.month, category_id: cid, amount: v });
    inp.value = v > 0 ? money(v) : '';
    commit('Бюджет', `План ${C.cat[cid]?.name} на ${bud.month}: ${v > 0 ? moneyC(v) : 'удалён'}`, { silent: true });
    const tr = inp.closest('tr'), r = planFact(s, [bud.month]).rows.find(x => x.cat.id === cid);
    if (r && tr) { tr.querySelector('.dev').textContent = (r.dev > 0 ? '+' : '') + money(r.dev); tr.querySelector('.dev').classList.toggle('neg', r.bad); }
  });
  const fill = (from, factMode) => {
    const pm = addMonths(bud.month, -1);
    let n = 0;
    if (factMode) {
      const pr = planFact(s, [pm]).rows;
      pr.forEach(r => { if (r.fact > 0 && !['capex', 'financing_in'].includes(r.cat.grp)) { setPlan(r.cat.id, Math.round(r.fact / 1000) * 1000); n++; } });
    } else s.budget.filter(b => b.month === pm).forEach(b => { setPlan(b.category_id, b.amount); n++; });
    if (!n) { toast(factMode ? 'В прошлом месяце нет фактических данных' : 'На прошлый месяц план не задан', 'warn'); return; }
    commit('Бюджет', `План на ${bud.month} заполнен ${factMode ? 'по факту' : 'по плану'} ${pm}`);
    toast('План заполнен: ' + n + ' статей');
  };
  const setPlan = (cid, v) => { const i = s.budget.findIndex(b => b.month === bud.month && b.category_id === cid); if (i > -1) s.budget[i].amount = v; else s.budget.push({ month: bud.month, category_id: cid, amount: v }); };
  $('#bFact') && ($('#bFact').onclick = () => fill(null, true));
  $('#bCopy') && ($('#bCopy').onclick = () => fill(null, false));
  $('#bClear') && ($('#bClear').addEventListener('click', e => { if (!e.currentTarget.classList.contains('armed')) return; s.budget = s.budget.filter(b => b.month !== bud.month); commit('Бюджет', 'План очищен: ' + bud.month); toast('План месяца очищен'); }));
}

// ================= ДОЛГИ =================
const dv = { tab: 'rec' };
export function viewDebts(el) {
  const s = store.s, d = debts(s), rec = dv.tab === 'rec';
  const list = rec ? d.rec : d.pay, aging = rec ? d.recAging : d.payAging;
  const agingHtml = aging.length ? `<div class="tw"><table class="aging"><thead><tr><th>${rec ? 'Кто должен' : 'Кому должны'}</th>${AGING.map(a => `<th class="num">${a}</th>`).join('')}<th class="num">Итого</th></tr></thead><tbody>
    ${aging.map(r => `<tr><th scope="row">${esc(r.name)} <span class="muted small">${r.n} док.</span></th>${r.b.map((v, i) => `<td class="num ${v && i >= 2 ? 'neg' : ''}">${v ? money(v) : '<span class="muted">·</span>'}</td>`).join('')}<td class="num tot">${money(r.total)}</td></tr>`).join('')}
    <tr class="total"><th scope="row">Всего</th>${AGING.map((_, i) => `<td class="num">${money(sum(aging, r => r.b[i]))}</td>`).join('')}<td class="num tot">${money(rec ? d.recTotal : d.payTotal)}</td></tr>
  </tbody></table></div>` : '';
  el.innerHTML = pageHead('debts') + `<section class="card toolbar">${seg('dTab', [['rec', 'Нам должны (дебиторка)'], ['pay', 'Мы должны (кредиторка)']], dv.tab)}</section>` +
    (rec ? tiles([
      tile('Клинике должны', compactC(d.recTotal), `${d.rec.length} документов`, { tip: moneyC(d.recTotal) }),
      tile('Просрочено', `<span class="${d.recOverdue ? 'neg' : ''}">${compactC(d.recOverdue)}</span>`, pct(div(d.recOverdue, d.recTotal)) + ' от долга'),
      tile('Старше 60 дней', `<span class="${d.rec60 ? 'neg' : ''}">${compactC(d.rec60)}</span>`, 'риск не получить'),
      tile('Оборачиваемость долга', Math.round(d.dso) + ' дн.', 'сколько дней выручки «висит» в долгах', { tip: 'Дебиторка / средняя дневная выручка за 90 дней. Ориентир — до 30–40 дней.' }),
    ]) : tiles([
      tile('Клиника должна', compactC(d.payTotal), `${d.pay.length} документов`, { tip: moneyC(d.payTotal) }),
      tile('Просрочено', `<span class="${d.payOverdue ? 'neg' : ''}">${compactC(d.payOverdue)}</span>`, 'нужно оплатить срочно'),
      tile('К оплате за 7 дней', compactC(d.payWeek), 'включая просроченное'),
    ])) + `
  ${aging.length ? `<section class="card"><div class="card-head"><h2>Старение долгов по ${rec ? 'плательщикам' : 'получателям'}</h2><span class="muted small">дней после срока оплаты</span></div>${agingHtml}</section>` : ''}
  <section class="card">
    <div class="card-head"><h2>${rec ? 'Неоплаченные счета и реестры' : 'Неоплаченные расходы'}</h2></div>
    ${list.length ? `<div class="tw"><table class="click-rows"><thead><tr><th>Дата</th><th>${rec ? 'Плательщик' : 'Получатель'}</th><th>Документ · статья</th><th>Срок</th><th>Статус</th><th class="num">${rec ? 'К получению' : 'К оплате'}</th><th></th></tr></thead><tbody>
      ${list.map(x => `<tr data-id="${x.op.id}"><td>${fmtDate(x.op.date)}</td><td>${esc(x.cp?.name || '—')}</td><td>${esc([x.op.doc, x.cat?.name].filter(Boolean).join(' · '))}${x.op.rejected ? ` <span class="pill warn">отказ ${money(x.op.rejected)}</span>` : ''}</td><td>${fmtDate(x.due)}</td>
        <td>${x.overdue > 0 ? statusPill(x.overdue > 60 ? 'crit' : 'serious', 'просрочка ' + x.overdue + ' дн.') : x.overdue > -7 ? statusPill('warn', 'через ' + (-x.overdue) + ' дн.') : '<span class="muted">в срок</span>'}</td>
        <td class="num"><b>${money(x.out)}</b></td>
        <td class="row-actions"><button class="btn small primary" data-pay="${x.op.id}">${rec ? 'Получили оплату' : 'Оплатили'}</button>${rec ? `<button class="btn small ghost" data-rej="${x.op.id}">Отказ</button>` : ''}<button class="btn small ghost" data-ed="${x.op.id}" aria-label="Открыть">✎</button></td></tr>`).join('')}
    </tbody></table></div>` : empty(rec ? 'Долгов перед клиникой нет' : 'Неоплаченных расходов нет', rec ? 'Счета ДМС, фонда и рассрочки появятся здесь, если внести доход со статусом «Не оплачено».' : 'Счета поставщиков с отсрочкой появятся здесь, если внести расход со статусом «Не оплачено».')}
    ${rec ? '<p class="note">Отказ страховой уменьшает выручку в ОПиУ и сумму долга. Частичная оплата делит документ на оплаченную и оставшуюся части.</p>' : ''}
  </section>`;
  $$('[name=dTab]', el).forEach(r => r.onchange = () => { dv.tab = r.value; rerender(); });
  const find = id => s.ops.find(o => o.id === +id);
  $$('[data-ed]', el).forEach(b => b.onclick = () => openOpForm(find(b.dataset.ed)));
  $$('[data-pay]', el).forEach(b => b.onclick = () => payDialog(find(b.dataset.pay)));
  $$('[data-rej]', el).forEach(b => b.onclick = () => rejectDialog(find(b.dataset.rej)));
}
function payDialog(o) {
  const s = store.s, out = o.amount - (o.rejected || 0);
  openModal({
    title: o.type === 'income' ? 'Поступила оплата' : 'Оплата расхода',
    body: `<p class="muted">${esc(s.counterparties.find(c => c.id === o.counterparty_id)?.name || '')} ${esc(o.doc || '')} · остаток ${moneyC(out)}</p>
      <div class="form-grid"><label class="f">Дата оплаты<input type="date" name="d" value="${today()}"></label>
      <label class="f">Счёт<select name="acc">${s.accounts.map(a => opt(a.id, a.name, o.account_id)).join('')}</select></label>
      <label class="f span2">Сумма оплаты <small>меньше остатка — частичная оплата</small><input name="amt" inputmode="decimal" value="${money(out)}"></label></div><p class="form-err" hidden></p>`,
    actions: [{ label: 'Отмена' }, {
      label: 'Сохранить', kind: 'primary', onClick: dlg => {
        const f = formData(dlg), amt = parseNum(f.amt), err = dlg.querySelector('.form-err');
        if (!(amt > 0) || amt > out + 0.01) { err.textContent = `Сумма должна быть от 1 до ${money(out)}.`; err.hidden = false; return false; }
        if (amt < out - 0.01) {
          add('ops', { ...o, id: undefined, amount: amt, rejected: 0, paid: f.d, account_id: +f.acc, comment: (o.comment ? o.comment + '; ' : '') + 'частичная оплата' });
          o.amount -= amt;
        } else { o.paid = f.d; o.account_id = +f.acc; }
        commit('Оплата', `${o.type === 'income' ? 'Получено' : 'Оплачено'} ${moneyC(amt)} · ${o.doc || ''}`);
        toast('Оплата отмечена');
      },
    }],
  });
}
function rejectDialog(o) {
  const out = o.amount - (o.rejected || 0);
  openModal({
    title: 'Отказ страховой в оплате',
    body: `<p class="muted">${esc(o.doc || '')} · к получению ${moneyC(out)}</p><div class="form-grid"><label class="f">Сумма отказа<input name="amt" inputmode="decimal"></label>
      <label class="f">Причина<input name="why" placeholder="например, нет гарантийного письма"></label></div><p class="form-err" hidden></p>`,
    actions: [{ label: 'Отмена' }, {
      label: 'Учесть отказ', kind: 'primary', onClick: dlg => {
        const f = formData(dlg), amt = parseNum(f.amt), err = dlg.querySelector('.form-err');
        if (!(amt > 0) || amt > out + 0.01) { err.textContent = `Сумма отказа — от 1 до ${money(out)}.`; err.hidden = false; return false; }
        o.rejected = (o.rejected || 0) + amt;
        if (f.why) o.comment = (o.comment ? o.comment + '; ' : '') + 'отказ: ' + f.why;
        commit('Отказ страховой', `${moneyC(amt)} по ${o.doc || 'документу'}`);
        toast('Отказ учтён: выручка уменьшена');
      },
    }],
  });
}
