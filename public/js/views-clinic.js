// Разделы «Клиника»: мощность, врачи и зарплата, услуги, маркетинг, склад.
import { $, $$, esc, opt, money, moneyC, compactC, num, pct, sum, div, today, ym, curMonth, addMonths, addDays, monthsBetween, monLong, monShort, monthEnd, fmtDate, isPartialMonth, toast, openModal, parseNum, formData } from './util.js';
import { store, commit, add, update, remove } from './store.js';
import { RES_KINDS, PAY_SCHEMES } from './model.js';
import { ctx, pnl, capacity, doctors, payroll, payCalc, services, marketing, stock, avgCheck, spanMonths } from './calc.js';
import { chartSlot, sparkline, meter, hbars, heatCell } from './charts.js';
import { pageHead, tile, tiles, pill, statusPill, seg, empty, monthPicker, go, rerender, colorFor } from './ui.js';
import { xlButton, noXl, bindXl, downloadXlsx, xlName, sheetsCapacity, sheetsDoctors, sheetsServices, sheetsMarketing, sheetsStock } from './export.js';

const fullM = ms => { const f = ms.filter(m => !isPartialMonth(m)); return f.length ? f : ms; };
const lastFull = () => addMonths(curMonth(), -1);
const allMonthsList = () => monthsBetween(spanMonths(store.s)[0], addMonths(curMonth(), 1));
const numIn = (attrs, v) => `<input class="cell-in" inputmode="decimal" ${attrs} value="${v ? esc(num(v, v % 1 ? 2 : 0)) : ''}" placeholder="—">`;

// ================= МОЩНОСТЬ =================
const capV = { tab: 'analysis', month: null, res: null, add: 0, target: null };
export function viewCapacity(el, months) {
  const s = store.s;
  if (!s.resources.length) {
    el.innerHTML = pageHead('capacity') + `<div class="card">${empty('Нет ресурсов', 'Добавьте врачей, кабинеты и оборудование в справочниках — затем вносите доступные и занятые часы.', '<button class="btn primary" data-go="refs">Открыть справочники</button>')}</div>`;
    return;
  }
  const head = pageHead('capacity', capV.tab === 'input' ? '' : xlButton()) + `<section class="card toolbar">${seg('capTab', [['analysis', 'Анализ загрузки'], ['input', 'Ввод часов и приёмов']], capV.tab)}</section>`;
  if (capV.tab === 'input') return capInput(el, head);
  const cap = capacity(s, months), sl = s.settings;
  const lowU = sl.lowUtil ?? 0.6;
  const byDep = s.departments.map(d => ({ d, rows: cap.rows.filter(x => x.r.department_id === d.id), info: cap.deps.find(x => x.d.id === d.id) })).filter(x => x.rows.length);
  const orphan = cap.rows.filter(x => !s.departments.some(d => d.id === x.r.department_id));
  if (orphan.length) byDep.push({ d: { name: 'Без отделения' }, rows: orphan, info: null });
  const neck = cap.deps.length ? cap.deps.reduce((a, b) => (b.neck.util > a.neck.util ? b : a)) : null;
  // сценарий
  const resList = cap.rows.filter(x => x.avail > 0);
  if (!capV.res || !resList.some(x => x.r.id === capV.res)) capV.res = (resList.find(x => x.util < lowU) || resList[0])?.r.id;
  const sc = resList.find(x => x.r.id === capV.res);
  const n = months.length || 1, tgt = capV.target ?? sl.targetUtil;
  const L = pnl(s, months), mr = div(L.margin.total, L.net.total);
  let scen = '';
  if (sc) {
    const availM = sc.avail / n + (+capV.add || 0), bookedNow = sc.booked / n, bookedNew = Math.max(bookedNow, availM * tgt);
    const extraH = bookedNew - bookedNow, extraRev = extraH * sc.rate;
    scen = `<div class="scenario">
      <div class="form-grid">
        <label class="f">Ресурс<select id="scRes">${resList.map(x => opt(x.r.id, x.r.name, capV.res)).join('')}</select></label>
        <label class="f">Целевая загрузка, %<input id="scT" inputmode="numeric" value="${Math.round(tgt * 100)}"></label>
        <label class="f span2">Добавить часов в месяц <small>новая смена, продление работы, второй врач</small><input id="scAdd" inputmode="numeric" value="${capV.add || ''}" placeholder="0"></label>
      </div>
      <div class="kv-grid">
        <div><span>Сейчас занято в месяц</span><b>${num(bookedNow, 0)} ч из ${num(sc.avail / n, 0)} (${pct(sc.util)})</b></div>
        <div><span>Будет занято</span><b>${num(bookedNew, 0)} ч из ${num(availM, 0)}</b></div>
        <div><span>Выручка за час</span><b>${moneyC(sc.rate)}</b></div>
        <div><span>Дополнительная выручка в месяц</span><b class="pos">+${moneyC(extraRev)}</b></div>
        <div><span>Дополнительная маржинальная прибыль</span><b class="pos">+${moneyC(extraRev * mr)}</b></div>
        <div><span>В год</span><b>+${compactC(extraRev * 12)} выручки</b></div>
      </div>
      ${extraH <= 0 ? '<p class="note">Ресурс уже загружен выше цели — рост возможен только за счёт новых часов.</p>' : ''}
    </div>`;
  }
  el.innerHTML = head + tiles([
    tile('Загрузка врачей', pct(cap.utilDoctors), `цель ${pct(cap.target)}`, { tone: cap.utilDoctors < lowU ? 'bad' : '' }),
    tile('Кабинеты и оборудование', pct(cap.utilEquip), 'занятые часы / доступные'),
    tile('Потенциал до цели', '+' + compactC(cap.potential), `выручки за ${months.length} мес. при загрузке ${pct(cap.target)}`, { tip: 'По каждому отделению берётся самый недогруженный ресурс: врач и кабинет работают одновременно, их часы не суммируются.' }),
    tile('Потери от неявок', compactC(cap.noshowLoss), 'неявки × средний чек врача'),
    tile('Узкое место', neck ? esc(neck.neck.r.name) : '—', neck ? `${esc(neck.d.name)}: загрузка ${pct(neck.neck.util)}` : ''),
  ]) + `
  <section class="card">
    <div class="card-head"><h2>Загрузка по ресурсам</h2><span class="muted small">за ${months.length} мес.</span></div>
    <div class="tw"><table class="cap-table"><thead><tr><th>Ресурс</th><th class="num">Доступно, ч</th><th class="num">Занято, ч</th><th>Загрузка</th><th class="num">Приёмов</th><th class="num">Неявки</th><th class="num">Выручка за час</th><th class="num">Потенциал до цели</th><th class="num">Если 100%</th></tr></thead><tbody>
    ${byDep.map(g => `<tr class="group"><th scope="row" colspan="9">${esc(g.d.name)}${g.info ? ` <span class="muted small">· узкое место: ${esc(g.info.neck.r.name)} (${pct(g.info.neck.util)}) · потенциал отделения +${compactC(g.info.potential)}</span>` : ''}</th></tr>` +
      g.rows.map(x => `<tr><td>${esc(x.r.name)} ${pill(RES_KINDS[x.r.kind] || x.r.kind)}</td><td class="num">${num(x.avail)}</td><td class="num">${num(x.booked)}</td><td>${meter(x.util, cap.target, lowU)}</td>
        <td class="num">${num(x.visits)}</td><td class="num">${x.noshowRate > 0.1 ? statusPill('warn', pct(x.noshowRate)) : pct(x.noshowRate)}</td>
        <td class="num">${money(x.rate)}</td><td class="num">${x.potTarget ? '+' + money(x.potTarget) : '<span class="muted">·</span>'}</td><td class="num muted">${money(x.potFull)}</td></tr>`).join('')).join('')}
    </tbody></table></div>
    <p class="note">Загрузка считается от реально доступных часов (смены, график работы аппарата), а не от часов работы клиники. Выручка за час врача — факт; для кабинетов и оборудования ставка задаётся в справочнике «Ресурсы».</p>
  </section>
  <div class="grid-2">
    <section class="card"><div class="card-head"><h2>Сценарий «что если»</h2></div>${scen || '<p class="muted">Нет ресурсов с доступными часами.</p>'}</section>
    <section class="card"><div class="card-head"><h2>Загрузка по месяцам, %</h2><span class="muted small">темнее — выше</span></div>
      <div class="tw"><table class="heatmap"><thead><tr><th>Ресурс</th>${months.map(m => `<th>${monShort(m)}</th>`).join('')}</tr></thead><tbody>
      ${cap.heat.map(h => `<tr><th scope="row">${esc(h.r.name)}</th>${h.cells.map(heatCell).join('')}</tr>`).join('')}</tbody></table></div></section>
  </div>`;
  bindXl(el, () => downloadXlsx(xlName('Мощность', months), sheetsCapacity(s, months)));
  $$('[name=capTab]', el).forEach(r => r.onchange = () => { capV.tab = r.value; rerender(); });
  const upd = () => { capV.res = +$('#scRes').value; capV.target = Math.min(1, Math.max(0.05, (parseNum($('#scT').value) || 85) / 100)); capV.add = parseNum($('#scAdd').value) || 0; rerender(); };
  $('#scRes') && ['#scRes', '#scT', '#scAdd'].forEach(id => $(id).onchange = upd);
}
function capInput(el, head) {
  const s = store.s, list = allMonthsList();
  if (!capV.month || !list.includes(capV.month)) capV.month = lastFull();
  const m = capV.month;
  const rec = rid => s.activity.find(a => a.resource_id === rid && a.month === m);
  const F = [['avail', 'Доступно, ч'], ['booked', 'Занято, ч'], ['visits', 'Приёмов / исследований'], ['first', 'Из них первичных'], ['noshow', 'Неявки'], ['cancel', 'Отмены'], ['referrals', 'Направил на сумму']];
  el.innerHTML = head + `<section class="card">
    <div class="card-head"><h2>Часы и приёмы за ${monLong(m)}</h2><div class="row-actions"><label class="f-inline"><span>Месяц</span>${monthPicker('capM', m, list)}</label><button class="btn ghost" id="capCopy">Доступные часы как в прошлом месяце</button></div></div>
    <p class="muted small">Данные обычно берут из расписания МИС. Можно загрузить файлом в разделе <a href="#import" data-go="import">«Загрузка из Excel»</a>.</p>
    <div class="tw"><table class="input-grid"><thead><tr><th>Ресурс</th>${F.map(f => `<th class="num">${f[1]}</th>`).join('')}<th class="num">Загрузка</th></tr></thead><tbody>
    ${s.resources.filter(r => r.active !== false).map(r => { const a = rec(r.id) || {}; return `<tr data-r="${r.id}"><th scope="row">${esc(r.name)} <span class="muted small">${RES_KINDS[r.kind]}</span></th>
      ${F.map(([k]) => `<td class="num">${k === 'referrals' && r.kind !== 'doctor' ? '' : numIn(`data-k="${k}" aria-label="${esc(r.name)}: ${k}"`, a[k])}</td>`).join('')}<td class="num util">${a.avail ? pct(a.booked / a.avail) : '—'}</td></tr>`; }).join('')}
    </tbody></table></div></section>`;
  $$('[name=capTab]', el).forEach(r => r.onchange = () => { capV.tab = r.value; rerender(); });
  $('#capM').onchange = e => { capV.month = e.target.value; rerender(); };
  $$('input[data-k]', el).forEach(inp => inp.onchange = () => {
    const tr = inp.closest('tr'), rid = +tr.dataset.r, k = inp.dataset.k, v = parseNum(inp.value);
    let a = rec(rid);
    if (!a) a = add('activity', { resource_id: rid, month: m, avail: 0, booked: 0, visits: 0, first: 0, noshow: 0, cancel: 0, referrals: 0 });
    a[k] = v >= 0 ? v : 0;
    commit('Мощность', `${s.resources.find(r => r.id === rid)?.name}: ${k} = ${a[k]} за ${m}`, { silent: true });
    tr.querySelector('.util').textContent = a.avail ? pct(a.booked / a.avail) : '—';
    if (a.booked > a.avail && a.avail) toast('Занятых часов больше, чем доступных — проверьте цифры', 'warn');
  });
  $('#capCopy').onclick = () => {
    const pm = addMonths(m, -1); let n = 0;
    s.activity.filter(a => a.month === pm).forEach(p => { let a = rec(p.resource_id); if (!a) a = add('activity', { resource_id: p.resource_id, month: m, avail: 0, booked: 0, visits: 0, first: 0, noshow: 0, cancel: 0, referrals: 0 }); a.avail = p.avail; n++; });
    if (!n) { toast('В прошлом месяце нет данных', 'warn'); return; }
    commit('Мощность', `Доступные часы ${m} скопированы с ${pm}`); toast('Скопировано: ' + n);
  };
}

// ================= ВРАЧИ И ЗАРПЛАТА =================
const docV = { month: null };
export function viewDoctors(el, months) {
  const s = store.s;
  if (!s.doctors.length) { el.innerHTML = pageHead('doctors') + `<div class="card">${empty('Нет врачей', 'Добавьте врачей в справочниках и укажите схему оплаты.', '<button class="btn primary" data-go="refs">Открыть справочники</button>')}</div>`; return; }
  const tEnd = months[months.length - 1] < curMonth() ? months[months.length - 1] : lastFull();
  const trendM = monthsBetween(addMonths(tEnd, -11), tEnd); // только полные месяцы — иначе тренд «падает» в конце
  const rows = doctors(s, months, trendM).sort((a, b) => b.revenue - a.revenue);
  const T = { revenue: sum(rows, r => r.revenue), visits: sum(rows, r => r.visits), first: sum(rows, r => r.first), noshow: sum(rows, r => r.noshow), paid: sum(rows, r => r.paid) };
  const list = allMonthsList();
  if (!docV.month || !list.includes(docV.month)) docV.month = lastFull();
  const pr = payroll(s, docV.month);
  const target = s.settings.targetUtil, lowU = s.settings.lowUtil ?? 0.6;
  el.innerHTML = pageHead('doctors', xlButton()) + tiles([
    tile('Выручка врачей', compactC(T.revenue), `${rows.length} врачей`, { tip: moneyC(T.revenue) }),
    tile('Средний чек', moneyC(div(T.revenue, T.visits)), `${money(T.visits)} приёмов`),
    tile('Повторные визиты', pct(div(T.visits - T.first, T.visits)), 'доля повторных приёмов'),
    tile('Неявки', pct(div(T.noshow, T.visits + T.noshow)), `${money(T.noshow)} пациентов не пришли`, { tone: div(T.noshow, T.visits + T.noshow) > 0.08 ? 'bad' : '' }),
    tile('ФОТ врачей', pct(div(T.paid, T.revenue)), `от выручки · ${compactC(T.paid)}`, { tip: 'Ориентир рынка — 18–35% в зависимости от направления' }),
  ]) + `
  <section class="card">
    <div class="card-head"><h2>Показатели врачей</h2><span class="muted small">за ${months.length} мес. · линия — выручка за 12 мес.</span></div>
    <div class="tw"><table class="click-rows"><thead><tr><th>Врач</th><th class="num">Выручка</th><th>Тренд</th><th class="num">Выручка за час</th><th>Загрузка</th><th class="num">Приёмов</th><th class="num">Средний чек</th><th class="num">Повторные</th><th class="num">Неявки</th><th class="num">Направил на</th><th class="num">Зарплата, % выручки</th></tr></thead><tbody>
    ${rows.map(r => `<tr data-doc="${r.d.id}" tabindex="0"><td><b class="nowrap">${esc(r.d.name)}</b><br><span class="muted small">${esc([r.d.spec, r.dep?.name].filter(Boolean).join(' · '))}</span></td>
      <td class="num">${money(r.revenue)}</td><td>${sparkline(r.trend, 'var(--s1)')}</td><td class="num">${money(r.perHour)}</td><td>${meter(r.util, target, lowU)}</td><td class="num">${num(r.visits)}</td>
      <td class="num">${money(r.check)}</td><td class="num">${pct(r.repeat)}</td><td class="num">${r.noshowRate > 0.1 ? statusPill('warn', pct(r.noshowRate)) : pct(r.noshowRate)}</td>
      <td class="num">${r.referrals ? money(r.referrals) : '<span class="muted">·</span>'}</td><td class="num">${pct(r.payShare)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="note">«Выручка за час» — на доступный час врача. «Направил на» — кросс-выручка: диагностика и процедуры, назначенные врачом в других кабинетах. Нажмите на врача, чтобы открыть его операции.</p>
  </section>
  <section class="card">
    <div class="card-head"><h2>Расчёт зарплаты врачей</h2><div class="row-actions"><label class="f-inline"><span>Месяц</span>${monthPicker('payM', docV.month, list)}</label><button class="btn primary" id="payGen">Начислить зарплату за месяц</button></div></div>
    <div class="tw"><table><thead><tr><th>Врач</th><th>Схема оплаты</th><th class="num">Выручка</th><th class="num">Материалы</th><th class="num">По схеме</th><th class="num">Внесено в учёт</th><th class="num">Разница</th><th></th></tr></thead><tbody>
    ${pr.map(r => `<tr><td>${esc(r.d.name)}</td><td>${esc(r.how)}</td><td class="num">${money(r.revenue)}</td><td class="num">${money(r.materials)}</td><td class="num"><b>${money(r.calc)}</b></td>
      <td class="num">${r.paid ? money(r.paid) : '<span class="muted">не внесено</span>'}</td><td class="num ${Math.abs(r.diff) > Math.max(5000, r.calc * 0.02) && r.paid ? 'neg' : 'muted'}">${r.paid ? (r.diff > 0 ? '+' : '') + money(r.diff) : ''}</td>
      <td><button class="btn small ghost" data-scheme="${r.d.id}">Схема</button></td></tr>`).join('')}
    <tr class="total"><th scope="row" colspan="4">Итого</th><td class="num">${money(sum(pr, r => r.calc))}</td><td class="num">${money(sum(pr, r => r.paid))}</td><td></td><td></td></tr>
    </tbody></table></div>
    <p class="note">«Начислить» создаёт неоплаченные расходы «Зарплата врачей» на последний день месяца для тех, у кого зарплата ещё не внесена. Оплату потом отметьте в разделе «Долги».</p>
  </section>`;
  $$('tr[data-doc]', el).forEach(tr => { const f = () => go('ops', { doctor_id: +tr.dataset.doc }); tr.onclick = f; tr.onkeydown = e => { if (e.key === 'Enter') f(); }; });
  bindXl(el, () => downloadXlsx(xlName('Врачи и зарплата', months), sheetsDoctors(s, months, docV.month)));
  $('#payM').onchange = e => { docV.month = e.target.value; rerender(); };
  $$('[data-scheme]', el).forEach(b => b.onclick = () => schemeDialog(s.doctors.find(d => d.id === +b.dataset.scheme)));
  $('#payGen').onclick = () => {
    const cat = s.categories.find(c => c.tag === 'doctor_pay');
    if (!cat) { toast('Нет статьи с отметкой «зарплата врачей» — добавьте её в справочниках', 'warn'); return; }
    const d = monthEnd(docV.month);
    const todo = pr.filter(r => !r.paid && r.calc > 0);
    if (!todo.length) { toast('Зарплата за этот месяц уже внесена у всех врачей'); return; }
    todo.forEach(r => add('ops', { type: 'expense', category_id: cat.id, date: d, paid: null, due: addDays(d, 5), amount: Math.round(r.calc), department_id: r.d.department_id, doctor_id: r.d.id, account_id: s.accounts[s.accounts.length - 1]?.id, comment: `Зарплата за ${monLong(docV.month)} (${r.how})`, src: 'payroll', rejected: 0 }));
    commit('Зарплата', `Начислено ${todo.length} врачам за ${docV.month}: ${moneyC(sum(todo, r => r.calc))}`);
    toast(`Начислено ${todo.length} врачам`);
  };
}
function schemeDialog(d) {
  const p = d.pay || { type: 'percent', pct: 0.3 };
  openModal({
    title: 'Схема оплаты: ' + d.name,
    body: `<div class="form-grid"><label class="f span2">Схема<select name="type">${Object.entries(PAY_SCHEMES).map(([k, l]) => opt(k, l, p.type)).join('')}</select></label>
      <label class="f">Оклад в месяц<input name="salary" inputmode="decimal" value="${p.salary ? money(p.salary) : ''}"></label>
      <label class="f">Процент<input name="pct" inputmode="decimal" value="${p.pct ? num(p.pct * 100, 1) : ''}"></label></div>
      <p class="note">«Процент от маржи» стимулирует беречь материалы: процент берётся от выручки минус расходные материалы врача.</p>`,
    actions: [{ label: 'Отмена' }, { label: 'Сохранить', kind: 'primary', onClick: dlg => {
      const f = formData(dlg);
      d.pay = { type: f.type, salary: parseNum(f.salary) || 0, pct: (parseNum(f.pct) || 0) / 100 };
      commit('Врачи', `Схема оплаты ${d.name}: ${PAY_SCHEMES[f.type]}`); toast('Схема сохранена');
    } }],
  });
}

// ================= УСЛУГИ =================
const svcV = { tab: 'cost', month: null, sort: 'mPct' };
export function viewServices(el, months) {
  const s = store.s;
  const head = pageHead('services', `${s.services.length && svcV.tab !== 'sales' ? xlButton() : ''}<button class="btn primary" id="svcAdd">Добавить услугу</button>`) + `<section class="card toolbar">${seg('svcTab', [['cost', 'Себестоимость и маржа'], ['sales', 'Объёмы продаж']], svcV.tab)}</section>`;
  if (!s.services.length) { el.innerHTML = head + `<div class="card">${empty('Прайс пуст', 'Добавьте услуги с ценой, длительностью, процентом врача и нормами материалов — программа посчитает себестоимость.')}</div>`; bindSvc(el); return; }
  if (svcV.tab === 'sales') return svcSales(el, head);
  const R = services(s, fullM(months));
  const floor = s.settings.marginFloor ?? 0.3;
  const rows = [...R.rows].sort((a, b) => svcV.sort === 'revenue' ? b.revenue - a.revenue : a.mPct - b.mPct);
  const low = R.rows.filter(r => r.low);
  const aShare = sum(R.rows.filter(r => r.abc === 'A'), r => r.share);
  el.innerHTML = head + tiles([
    tile('Средняя маржа', pct(R.avgMargin), 'с учётом объёмов продаж'),
    tile(`Маржа ниже ${pct(floor)}`, String(low.length), low.length ? 'услуг — пересмотреть цену или нормы' : 'таких услуг нет', { tone: low.length ? 'bad' : '' }),
    tile('Накладные на час врача', moneyC(R.overheadHr), 'постоянные расходы / доступные часы', { tip: 'Аренда, оклады персонала, коммуналка и прочее, делённые на все доступные часы врачей' }),
    tile('Выручка по прайсу', compactC(R.total), `${R.rows.filter(r => r.abc === 'A').length} услуг группы A дают ${pct(aShare)}`),
  ]) + `
  <section class="card">
    <div class="card-head"><h2>Себестоимость услуг</h2><div class="row-actions">${seg('svcSort', [['mPct', 'Сначала низкая маржа'], ['revenue', 'Сначала по выручке']], svcV.sort)}</div></div>
    <div class="tw"><table class="click-rows"><thead><tr><th>Услуга</th><th>ABC</th><th class="num">Цена</th><th class="num">Материалы</th><th class="num">Врачу</th><th class="num">Эквайринг</th><th class="num">Накладные</th><th class="num">Себестоимость</th><th class="num">Маржа</th><th class="num">Маржа, %</th><th class="num">За час</th><th class="num">Продано</th><th class="num">Выручка</th></tr></thead><tbody>
    ${rows.map(r => `<tr data-svc="${r.v.id}" tabindex="0"><td><b>${esc(r.v.name)}</b><br><span class="muted small">${esc(r.dep?.name || '')} · ${r.v.duration} мин</span></td><td>${r.abc === '—' ? '<span class="muted">—</span>' : pill(r.abc, r.abc === 'A' ? 'info' : '')}</td>
      <td class="num">${money(r.v.price)}</td><td class="num">${money(r.mat)}</td><td class="num">${money(r.docPay)}</td><td class="num">${money(r.acq)}</td><td class="num">${money(r.over)}</td><td class="num">${money(r.cost)}</td>
      <td class="num ${r.margin < 0 ? 'neg' : ''}"><b>${money(r.margin)}</b></td><td class="num">${r.low ? statusPill(r.mPct < 0.1 ? 'crit' : 'warn', pct(r.mPct)) : pct(r.mPct)}</td><td class="num">${money(r.perHour)}</td><td class="num">${num(r.qty)}</td><td class="num">${money(r.revenue)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="note">Себестоимость = материалы по нормам (цены со склада) + процент врача + эквайринг ${pct(s.settings.acquiringPct, 1)} + накладные за время услуги. ABC: A — услуги, дающие 80% выручки, B — следующие 15%, C — остальные. Нажмите на услугу, чтобы изменить цену, нормы материалов или процент врача.</p>
  </section>`;
  bindSvc(el);
  bindXl(el, () => downloadXlsx(xlName('Услуги и себестоимость', fullM(months)), sheetsServices(s, fullM(months))));
  $$('[name=svcSort]', el).forEach(r => r.onchange = () => { svcV.sort = r.value; rerender(); });
  $$('tr[data-svc]', el).forEach(tr => { const f = () => serviceDialog(s.services.find(v => v.id === +tr.dataset.svc)); tr.onclick = f; tr.onkeydown = e => { if (e.key === 'Enter') f(); }; });
}
function bindSvc(el) {
  $$('[name=svcTab]', el).forEach(r => r.onchange = () => { svcV.tab = r.value; rerender(); });
  $('#svcAdd') && ($('#svcAdd').onclick = () => serviceDialog(null));
}
function svcSales(el, head) {
  const s = store.s, list = allMonthsList();
  if (!svcV.month || !list.includes(svcV.month)) svcV.month = lastFull();
  const m = svcV.month, rec = id => s.sales.find(x => x.service_id === id && x.month === m);
  el.innerHTML = head + `<section class="card"><div class="card-head"><h2>Продано услуг за ${monLong(m)}</h2><label class="f-inline"><span>Месяц</span>${monthPicker('slM', m, list)}</label></div>
    <p class="muted small">Количество обычно берут из отчёта МИС «Оказанные услуги». По этим цифрам считаются ABC-анализ и списание материалов по нормам.</p>
    <div class="tw"><table class="input-grid"><thead><tr><th>Услуга</th><th class="num">Цена</th><th class="num">Количество</th><th class="num">Выручка</th></tr></thead><tbody>
    ${s.services.map(v => `<tr data-v="${v.id}"><th scope="row">${esc(v.name)}</th><td class="num">${money(v.price)}</td><td class="num">${numIn(`data-q aria-label="${esc(v.name)}: количество"`, rec(v.id)?.qty)}</td><td class="num rv">${money((rec(v.id)?.qty || 0) * v.price)}</td></tr>`).join('')}
    </tbody></table></div></section>`;
  bindSvc(el);
  $('#slM').onchange = e => { svcV.month = e.target.value; rerender(); };
  $$('input[data-q]', el).forEach(inp => inp.onchange = () => {
    const tr = inp.closest('tr'), id = +tr.dataset.v, v = Math.max(0, parseNum(inp.value) || 0);
    let r = rec(id);
    if (!r) r = add('sales', { month: m, service_id: id, qty: 0 });
    r.qty = v;
    const svc = s.services.find(x => x.id === id);
    tr.querySelector('.rv').textContent = money(v * svc.price);
    commit('Продажи услуг', `${svc.name}: ${v} за ${m}`, { silent: true });
  });
}
function serviceDialog(v) {
  const s = store.s, isNew = !v;
  const cur = v ? JSON.parse(JSON.stringify(v)) : { name: '', department_id: s.departments[0]?.id || null, price: 0, duration: 30, doctor_pct: 0.3, materials: [] };
  const matRow = (m = {}) => `<div class="mat-row"><select data-mi aria-label="Материал">${opt('', 'Материал…', m.item_id)}${s.items.map(i => opt(i.id, `${i.name} (${money(i.price)} за ${i.unit})`, m.item_id)).join('')}</select>
    <input data-mq inputmode="decimal" value="${m.qty ? esc(String(m.qty).replace('.', ',')) : ''}" placeholder="кол-во" aria-label="Количество"><button type="button" class="icon-btn" data-mdel aria-label="Убрать">✕</button></div>`;
  openModal({
    title: isNew ? 'Новая услуга' : cur.name, wide: true,
    body: `<div class="form-grid">
      <label class="f span2">Название<input name="name" value="${esc(cur.name)}"></label>
      <label class="f">Отделение<select name="department_id">${opt('', '—', cur.department_id)}${s.departments.map(d => opt(d.id, d.name, cur.department_id)).join('')}</select></label>
      <label class="f">Цена, ${esc(s.settings.currency)}<input name="price" inputmode="decimal" value="${cur.price ? money(cur.price) : ''}"></label>
      <label class="f">Длительность, мин<input name="duration" inputmode="numeric" value="${cur.duration || ''}"></label>
      <label class="f">Процент врачу<input name="pct" inputmode="decimal" value="${num((cur.doctor_pct || 0) * 100, 1)}"></label>
    </div>
    <h3 class="sub">Нормы расхода материалов на одну услугу</h3>
    <div id="mats">${(cur.materials || []).map(matRow).join('')}</div>
    <button type="button" class="btn small ghost" id="matAdd">+ Материал</button>
    <div class="kv-grid live" id="svcCalc"></div><p class="form-err" hidden></p>`,
    actions: [
      ...(!isNew ? [{ label: 'Удалить услугу', kind: 'danger left', confirm: true, onClick: () => { remove('services', v.id); s.sales = s.sales.filter(x => x.service_id !== v.id); commit('Услуги', 'Удалена услуга ' + v.name); toast('Услуга удалена'); } }] : []),
      { label: 'Отмена' },
      { label: isNew ? 'Добавить' : 'Сохранить', kind: 'primary', onClick: dlg => {
        const f = formData(dlg), err = dlg.querySelector('.form-err');
        const rec = { name: f.name.trim(), department_id: +f.department_id || null, price: parseNum(f.price) || 0, duration: parseNum(f.duration) || 0, doctor_pct: (parseNum(f.pct) || 0) / 100, materials: readMats(dlg) };
        if (!rec.name) { err.textContent = 'Укажите название.'; err.hidden = false; return false; }
        if (!(rec.price > 0)) { err.textContent = 'Укажите цену.'; err.hidden = false; return false; }
        if (isNew) add('services', rec); else update('services', v.id, rec);
        commit('Услуги', (isNew ? 'Добавлена услуга ' : 'Изменена услуга ') + rec.name); toast('Сохранено');
      } },
    ],
    onOpen: dlg => {
      const calc = () => {
        const f = formData(dlg), price = parseNum(f.price) || 0, mats = readMats(dlg);
        const R = services({ ...s, services: [{ id: -1, price, duration: parseNum(f.duration) || 0, doctor_pct: (parseNum(f.pct) || 0) / 100, materials: mats }] }, fullM(monthsBetween(addMonths(curMonth(), -3), addMonths(curMonth(), -1)))).rows[0];
        dlg.querySelector('#svcCalc').innerHTML = `<div><span>Материалы</span><b>${moneyC(R.mat)}</b></div><div><span>Врачу</span><b>${moneyC(R.docPay)}</b></div><div><span>Накладные</span><b>${moneyC(R.over)}</b></div><div><span>Маржа</span><b class="${R.margin < 0 ? 'neg' : ''}">${moneyC(R.margin)} · ${pct(R.mPct)}</b></div>`;
      };
      dlg.querySelector('#matAdd').onclick = () => { dlg.querySelector('#mats').insertAdjacentHTML('beforeend', matRow()); calc(); };
      dlg.addEventListener('click', e => { if (e.target.closest('[data-mdel]')) { e.target.closest('.mat-row').remove(); calc(); } });
      dlg.addEventListener('input', calc); dlg.addEventListener('change', calc);
      calc();
    },
  });
}
const readMats = dlg => [...dlg.querySelectorAll('.mat-row')].map(r => ({ item_id: +r.querySelector('[data-mi]').value, qty: parseNum(r.querySelector('[data-mq]').value) || 0 })).filter(m => m.item_id && m.qty > 0);

// ================= МАРКЕТИНГ =================
const mkV = { tab: 'analysis', month: null };
export function viewMarketing(el, months) {
  const s = store.s;
  const head = pageHead('marketing', mkV.tab === 'input' ? '' : xlButton()) + `<section class="card toolbar">${seg('mkTab', [['analysis', 'Анализ каналов'], ['input', 'Ввод данных по месяцу']], mkV.tab)}</section>`;
  if (mkV.tab === 'input') return mkInput(el, head);
  const L = pnl(s, months), mr = div(L.margin.total, L.net.total), ac = avgCheck(s, months, L);
  const M = marketing(s, months, mr, ac), t = M.total;
  if (!M.rows.length) { el.innerHTML = noXl(head) + `<div class="card">${empty('Нет данных по рекламе', 'Внесите по каждому каналу расход, обращения, записи, визиты и новых пациентов — программа посчитает стоимость пациента и окупаемость.', '<button class="btn primary" id="mkGo">Внести данные</button>')}</div>`; $('#mkGo').onclick = () => { mkV.tab = 'input'; rerender(); }; bindMk(el); return; }
  const ltvCac = t.cac ? M.ltv / t.cac : null;
  const funnel = [['Обращения', t.leads], ['Записались', t.bookings], ['Пришли', t.visits], ['Новые пациенты', t.new_patients]];
  const byM = months.map(m => { const xs = s.marketing.filter(x => x.month === m); return { spend: sum(xs, x => x.spend), rev: sum(xs, x => x.revenue) }; });
  el.innerHTML = head + tiles([
    tile('Расходы на рекламу', compactC(t.spend), `${pct(div(t.spend, L.net.total), 1)} от выручки`),
    tile('Новых пациентов', money(t.new_patients), `из ${money(t.leads)} обращений · ${pct(div(t.new_patients, t.leads))}`),
    tile('Стоимость пациента (CAC)', moneyC(t.cac), `обращение — ${moneyC(t.cpl)}`),
    tile('Ценность пациента (LTV)', moneyC(M.ltv), `визитов в год: ${num(s.settings.visitsPerYear, 1)} · лет с клиникой: ${num(s.settings.ltvYears, 1)}`, { tip: 'Средний чек × визитов в год × лет с клиникой × доля маржинальной прибыли. Параметры — в «Настройках».' }),
    tile('LTV / CAC', ltvCac ? num(ltvCac, 1) : '—', ltvCac ? (ltvCac >= 3 ? 'привлечение окупается' : ltvCac >= 1 ? 'на грани окупаемости' : 'привлечение убыточно') : '', { tone: ltvCac != null && ltvCac < 1 ? 'bad' : '' }),
    tile('ROMI', t.romi != null ? pct(t.romi) : '—', 'маржа с первых визитов − расходы, к расходам'),
  ]) + `
  <div class="grid-2">
    <section class="card"><div class="card-head"><h2>Воронка за период</h2></div>
      ${hbars(funnel.map(([l, v], i) => ({ label: l, value: v, text: `${money(v)}${i ? ' · ' + pct(div(v, funnel[i - 1][1])) : ''}`, color: ['var(--s1)', '#3987e5cc', '#5598e7', '#86b6ef'][i] })))}
      <p class="note">Процент — конверсия из предыдущего шага. Слабое место между «обращением» и «записью» — работа администраторов и колл-центра.</p></section>
    <section class="card"><div class="card-head"><h2>Расходы и выручка с новых пациентов</h2></div>
      ${chartSlot({ label: 'Расходы на рекламу и выручка с новых пациентов', labels: months, series: [{ name: 'Расходы на рекламу', color: colorFor.expense, values: byM.map(x => x.spend) }, { name: 'Выручка с новых пациентов', color: colorFor.revenue, values: byM.map(x => x.rev) }], fmt: moneyC, tipTitle: monLong, height: 220 })}</section>
  </div>
  <section class="card">
    <div class="card-head"><h2>Каналы привлечения</h2></div>
    <div class="tw"><table><thead><tr><th>Канал</th><th class="num">Расход</th><th class="num">Обращения</th><th class="num">Цена обращения</th><th class="num">Запись</th><th class="num">Дошли</th><th class="num">Новые пациенты</th><th class="num">CAC</th><th class="num">Выручка</th><th class="num">ROMI</th><th class="num">LTV / CAC</th></tr></thead><tbody>
    ${[...M.rows, t].map((r, i) => `<tr class="${i === M.rows.length ? 'total' : ''}"><td>${esc(r.ch.name)}</td><td class="num">${money(r.spend)}</td><td class="num">${money(r.leads)}</td><td class="num">${r.spend ? money(r.cpl) : '—'}</td><td class="num">${pct(r.c1)}</td><td class="num">${pct(r.c2)}</td>
      <td class="num">${money(r.new_patients)}</td><td class="num">${r.spend ? money(r.cac) : '—'}</td><td class="num">${money(r.revenue)}</td>
      <td class="num">${r.romi == null ? '—' : r.romi < 0 ? statusPill('serious', pct(r.romi)) : pct(r.romi)}</td><td class="num">${r.ltvCac == null ? '—' : r.ltvCac < 1 ? statusPill('serious', num(r.ltvCac, 1)) : num(r.ltvCac, 1)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="note">ROMI здесь считается только по первым визитам — с учётом повторных визитов канал окупается лучше, это показывает LTV / CAC. Ориентир LTV / CAC — от 3.</p>
  </section>`;
  bindMk(el);
  bindXl(el, () => downloadXlsx(xlName('Маркетинг', months), sheetsMarketing(s, months)));
}
const bindMk = el => $$('[name=mkTab]', el).forEach(r => r.onchange = () => { mkV.tab = r.value; rerender(); });
function mkInput(el, head) {
  const s = store.s, list = allMonthsList();
  if (!mkV.month || !list.includes(mkV.month)) mkV.month = lastFull();
  const m = mkV.month, rec = id => s.marketing.find(x => x.channel_id === id && x.month === m);
  const F = [['spend', 'Расход'], ['leads', 'Обращения'], ['bookings', 'Записались'], ['visits', 'Пришли'], ['new_patients', 'Новые пациенты'], ['revenue', 'Выручка с них']];
  el.innerHTML = head + `<section class="card"><div class="card-head"><h2>Маркетинг за ${monLong(m)}</h2><label class="f-inline"><span>Месяц</span>${monthPicker('mkM', m, list)}</label></div>
    ${s.channels.length ? `<div class="tw"><table class="input-grid"><thead><tr><th>Канал</th>${F.map(f => `<th class="num">${f[1]}</th>`).join('')}</tr></thead><tbody>
    ${s.channels.map(c => { const r = rec(c.id) || {}; return `<tr data-c="${c.id}"><th scope="row">${esc(c.name)}</th>${F.map(([k]) => `<td class="num">${numIn(`data-k="${k}" aria-label="${esc(c.name)}: ${k}"`, r[k])}</td>`).join('')}</tr>`; }).join('')}
    </tbody></table></div>` : empty('Нет каналов', 'Добавьте каналы привлечения в справочниках.', '<button class="btn primary" data-go="refs">Справочники</button>')}
    <p class="note">Расход по каналу — из рекламных кабинетов. Обращения и записи — из CRM или коллтрекинга, визиты и выручку — из МИС.</p></section>`;
  bindMk(el);
  $('#mkM').onchange = e => { mkV.month = e.target.value; rerender(); };
  $$('input[data-k]', el).forEach(inp => inp.onchange = () => {
    const cid = +inp.closest('tr').dataset.c, k = inp.dataset.k, v = Math.max(0, parseNum(inp.value) || 0);
    let r = rec(cid);
    if (!r) r = add('marketing', { month: m, channel_id: cid, spend: 0, leads: 0, bookings: 0, visits: 0, new_patients: 0, revenue: 0 });
    r[k] = v;
    commit('Маркетинг', `${s.channels.find(c => c.id === cid)?.name}: ${k} = ${v} за ${m}`, { silent: true });
  });
}

// ================= СКЛАД =================
const stV = { tab: 'stock', item: '' };
export function viewStock(el) {
  const s = store.s;
  const head = pageHead('stock', `${s.items.length ? xlButton() : ''}<button class="btn ghost" id="stNorm">Списать по нормам услуг</button><button class="btn ghost" id="stOut">Расход / списание</button><button class="btn primary" id="stIn">Приход</button>`)
    + `<section class="card toolbar">${seg('stTab', [['stock', 'Остатки'], ['batches', 'Партии и сроки годности'], ['moves', 'Движения']], stV.tab)}</section>`;
  if (!s.items.length) { el.innerHTML = head + `<div class="card">${empty('Номенклатура пуста', 'Добавьте материалы и препараты в справочнике «Номенклатура» — затем вносите приходы и списания.', '<button class="btn primary" data-go="refs">Открыть справочники</button>')}</div>`; bindSt(el); return; }
  const R = stock(s), C = ctx(s);
  const t = tiles([
    tile('Стоимость остатков', compactC(sum(R, x => x.value)), `${R.length} позиций`),
    tile('Ниже минимума', String(R.filter(x => x.status !== 'ok' && x.it.min).length), 'нужно закупить', { tone: R.some(x => x.status !== 'ok' && x.it.min) ? 'bad' : '' }),
    tile('Истекает за 60 дней', String(R.filter(x => x.soon > 0).length), 'позиций — использовать первыми'),
    tile('Просрочено', String(R.filter(x => x.expired > 0).length), 'позиций — списать и утилизировать', { tone: R.some(x => x.expired > 0) ? 'bad' : '' }),
  ]);
  let body = '';
  if (stV.tab === 'stock') {
    body = `<section class="card"><div class="tw"><table><thead><tr><th>Позиция</th><th class="num">Остаток</th><th class="num">Минимум</th><th class="num">Хватит на</th><th class="num">Стоимость</th><th>Состояние</th></tr></thead><tbody>
      ${R.sort((a, b) => ({ none: 0, low: 1, ok: 2 }[a.status] - { none: 0, low: 1, ok: 2 }[b.status]) || a.it.name.localeCompare(b.it.name)).map(x => `<tr><td>${esc(x.it.name)}</td><td class="num">${num(x.qty, x.qty % 1 ? 2 : 0)} ${esc(x.it.unit)}</td><td class="num">${x.it.min ? num(x.it.min) : '—'}</td>
        <td class="num">${x.daysLeft == null ? '—' : Math.round(x.daysLeft) + ' дн.'}</td><td class="num">${money(x.value)}</td>
        <td>${x.status === 'none' ? statusPill('crit', 'нет в наличии') : x.status === 'low' ? statusPill('warn', 'ниже минимума') : statusPill('good', 'в норме')}${x.expired ? ' ' + statusPill('crit', 'есть просрочка') : x.soon ? ' ' + statusPill('warn', 'срок истекает') : ''}</td></tr>`).join('')}
      </tbody></table></div><p class="note">«Хватит на» — по среднему расходу за последние 3 месяца. Списание идёт по правилу FEFO: сначала партии, у которых раньше истекает срок.</p></section>`;
  } else if (stV.tab === 'batches') {
    const bs = R.flatMap(x => x.live.map(b => ({ ...b, it: x.it }))).sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999'));
    body = `<section class="card"><div class="tw"><table><thead><tr><th>Позиция</th><th>Приход</th><th>Годен до</th><th class="num">Осталось</th><th class="num">Стоимость</th><th>Срок</th></tr></thead><tbody>
      ${bs.map(b => `<tr><td>${esc(b.it.name)}</td><td>${fmtDate(b.date)}</td><td>${fmtDate(b.expiry) || '—'}</td><td class="num">${num(b.left, b.left % 1 ? 2 : 0)} ${esc(b.it.unit)}</td><td class="num">${money(b.left * (b.price || b.it.price || 0))}</td>
        <td>${b.days == null ? '<span class="muted">не указан</span>' : b.days <= 0 ? statusPill('crit', 'просрочено ' + (-b.days) + ' дн.') : b.days <= 60 ? statusPill('warn', 'осталось ' + b.days + ' дн.') : `<span class="muted">${b.days} дн.</span>`}</td></tr>`).join('')}
      </tbody></table></div></section>`;
  } else {
    const mv = s.stock.filter(x => !stV.item || x.item_id === +stV.item).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 300);
    body = `<section class="card"><div class="filters"><label class="f-inline"><span>Позиция</span><select id="stItem">${opt('', 'Все', stV.item)}${s.items.map(i => opt(i.id, i.name, stV.item)).join('')}</select></label></div>
      <div class="tw"><table><thead><tr><th>Дата</th><th>Позиция</th><th>Движение</th><th class="num">Количество</th><th>Годен до</th><th>Комментарий</th><th></th></tr></thead><tbody>
      ${mv.map(x => `<tr><td>${fmtDate(x.date)}</td><td>${esc(C.item[x.item_id]?.name || '—')}</td><td>${{ in: pill('приход', 'info'), out: pill('расход'), writeoff: pill('списание', 'warn') }[x.kind]}</td>
        <td class="num">${x.kind === 'in' ? '+' : '−'}${num(x.qty, x.qty % 1 ? 2 : 0)} ${esc(C.item[x.item_id]?.unit || '')}</td><td>${fmtDate(x.expiry)}</td><td>${esc(x.comment || '')}</td>
        <td><button class="btn small ghost danger" data-del="${x.id}" data-confirm data-confirm-text="Удалить?">✕</button></td></tr>`).join('')}
      </tbody></table></div></section>`;
  }
  el.innerHTML = head + t + body;
  bindSt(el);
  bindXl(el, () => downloadXlsx(xlName('Склад'), sheetsStock(s)));
  $('#stItem') && ($('#stItem').onchange = e => { stV.item = e.target.value; rerender(); });
  $$('[data-del]', el).forEach(b => b.addEventListener('click', () => { if (!b.classList.contains('armed')) return; remove('stock', +b.dataset.del); commit('Склад', 'Удалено движение'); }));
}
function bindSt(el) {
  $$('[name=stTab]', el).forEach(r => r.onchange = () => { stV.tab = r.value; rerender(); });
  $('#stIn') && ($('#stIn').onclick = () => moveDialog('in'));
  $('#stOut') && ($('#stOut').onclick = () => moveDialog('out'));
  $('#stNorm') && ($('#stNorm').onclick = normDialog);
}
function moveDialog(kind) {
  const s = store.s;
  if (!s.items.length) { toast('Сначала добавьте номенклатуру в справочниках', 'warn'); return; }
  openModal({
    title: kind === 'in' ? 'Приход на склад' : 'Расход или списание',
    body: `<div class="form-grid">
      ${kind === 'in' ? '' : `<div class="f span2">${seg('kind', [['out', 'Расход на пациентов'], ['writeoff', 'Списание (брак, просрочка)']], 'out')}</div>`}
      <label class="f span2">Позиция<select name="item">${s.items.map(i => opt(i.id, `${i.name}, ${i.unit}`)).join('')}</select></label>
      <label class="f">Дата<input type="date" name="date" value="${today()}"></label>
      <label class="f">Количество<input name="qty" inputmode="decimal"></label>
      ${kind === 'in' ? `<label class="f">Цена за единицу<input name="price" inputmode="decimal"></label><label class="f">Годен до<input type="date" name="expiry"></label>` : ''}
      <label class="f span2">Комментарий<input name="comment" placeholder="${kind === 'in' ? 'поставщик, накладная' : 'причина'}"></label></div><p class="form-err" hidden></p>`,
    onOpen: dlg => { const sel = dlg.querySelector('[name=item]'), pr = dlg.querySelector('[name=price]'); const f = () => { if (pr && !pr.value) pr.value = money(s.items.find(i => i.id === +sel.value)?.price || 0); }; sel.onchange = () => { if (pr) pr.value = ''; f(); }; f(); },
    actions: [{ label: 'Отмена' }, { label: 'Сохранить', kind: 'primary', onClick: dlg => {
      const f = formData(dlg), qty = parseNum(f.qty), err = dlg.querySelector('.form-err');
      if (!(qty > 0)) { err.textContent = 'Укажите количество.'; err.hidden = false; return false; }
      const it = s.items.find(i => i.id === +f.item);
      add('stock', { date: f.date || today(), item_id: it.id, kind: kind === 'in' ? 'in' : f.kind, qty, price: kind === 'in' ? (parseNum(f.price) || it.price) : it.price, expiry: f.expiry || null, comment: f.comment });
      if (kind === 'in' && parseNum(f.price) > 0) it.price = parseNum(f.price);
      commit('Склад', `${kind === 'in' ? 'Приход' : 'Расход'}: ${it.name} ${qty} ${it.unit}`); toast('Сохранено');
    } }],
  });
}
function normDialog() {
  const s = store.s, list = monthsBetween(spanMonths(s)[0], curMonth());
  openModal({
    title: 'Списание материалов по нормам услуг',
    body: `<p>Программа возьмёт количество оказанных услуг за месяц (раздел «Услуги» → «Объёмы продаж») и нормы материалов в каждой услуге и создаст списания. Повторный запуск за тот же месяц заменит прежние списания по нормам.</p>
      <label class="f">Месяц${monthPicker('nM', addMonths(curMonth(), -1), list)}</label>`,
    actions: [{ label: 'Отмена' }, { label: 'Списать', kind: 'primary', onClick: dlg => {
      const m = dlg.querySelector('#nM').value, use = {};
      s.sales.filter(x => x.month === m).forEach(x => { const v = s.services.find(q => q.id === x.service_id); (v?.materials || []).forEach(mt => { use[mt.item_id] = (use[mt.item_id] || 0) + mt.qty * x.qty; }); });
      const ids = Object.keys(use);
      if (!ids.length) { toast('За этот месяц нет продаж услуг с нормами материалов', 'warn'); return; }
      s.stock = s.stock.filter(x => !(x.ikey && x.ikey.startsWith('norm:' + m + ':')));
      const d = m === curMonth() ? today() : monthEnd(m);
      ids.forEach(id => add('stock', { date: d, item_id: +id, kind: 'out', qty: Math.round(use[id] * 100) / 100, price: s.items.find(i => i.id === +id)?.price || 0, comment: 'Списание по нормам услуг', ikey: `norm:${m}:${id}` }));
      commit('Склад', `Списание по нормам за ${m}: ${ids.length} позиций`); toast('Списано позиций: ' + ids.length);
    } }],
  });
}
