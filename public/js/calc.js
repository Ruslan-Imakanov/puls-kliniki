// Все расчёты. Чистые функции от состояния (store.s), без DOM.
//
// Ключевое правило учёта: у операции две даты.
//   date — дата оказания услуги / начисления расхода → ОПиУ (метод начисления)
//   paid — дата движения денег (null = ещё не оплачено, это долг) → ДДС (кассовый метод)
// Отказы страховой (rejected) уменьшают выручку в ОПиУ и сумму к получению.
import { GROUPS } from './model.js';
import { ym, monthsBetween, addMonths, curMonth, today, daysDiff, addDays, sum, div, isPartialMonth, monLong } from './util.js';

const ix = arr => Object.fromEntries(arr.map(x => [x.id, x]));
export function ctx(s) {
  return {
    cat: ix(s.categories), dep: ix(s.departments), doc: ix(s.doctors), res: ix(s.resources), acc: ix(s.accounts),
    cp: ix(s.counterparties), ch: ix(s.channels), svc: ix(s.services), item: ix(s.items),
  };
}
const mdiff = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
const line = (months, f) => { const o = { total: 0 }; months.forEach(m => { o[m] = f(m); o.total += o[m]; }); return o; };
const tagged = (C, o, tag) => C.cat[o.category_id]?.tag === tag;

// Месяцы, за которые есть данные (+ текущий)
export function spanMonths(s) {
  let lo = curMonth(), hi = curMonth();
  const see = m => { if (!m) return; if (m < lo) lo = m; if (m > hi) hi = m; };
  s.ops.forEach(o => { see(ym(o.date)); if (o.paid) see(ym(o.paid)); });
  s.activity.forEach(a => see(a.month)); s.marketing.forEach(a => see(a.month)); s.sales.forEach(a => see(a.month));
  return monthsBetween(lo, hi);
}
export const completeMonths = s => spanMonths(s).filter(m => m < curMonth());

// ---------------- ОПиУ ----------------
export function pnl(s, months) {
  const C = ctx(s), set = new Set(months), cell = {};
  const add = (k, m, v) => { (cell[k] ||= {})[m] = (cell[k][m] || 0) + v; };
  const amortMonths = s.settings.amortMonths || 60;
  for (const o of s.ops) {
    if (o.type === 'transfer') continue;
    const c = C.cat[o.category_id];
    if (!c) continue;
    const m = ym(o.date), g = GROUPS[c.grp];
    if (g?.pnl && set.has(m)) { add('c' + c.id, m, o.amount); add(c.grp, m, o.amount); }
    if (c.grp === 'revenue' && o.rejected && set.has(m)) { add('rejected', m, o.rejected); add('revenue_adj', m, o.rejected); }
    if (c.grp === 'capex') {
      const life = +o.life || amortMonths;
      for (const mm of months) { const k = mdiff(m, mm); if (k >= 0 && k < life) add('amort', mm, o.amount / life); }
    }
  }
  const g = (k, m) => cell[k]?.[m] || 0;
  const L = { months };
  L.revenue = line(months, m => g('revenue', m));
  L.adj = line(months, m => g('revenue_adj', m));
  L.net = line(months, m => L.revenue[m] - L.adj[m]);
  L.variable = line(months, m => g('variable', m));
  L.margin = line(months, m => L.net[m] - L.variable[m]);
  L.fixed = line(months, m => g('fixed', m));
  L.ebitda = line(months, m => L.margin[m] - L.fixed[m]);
  L.amort = line(months, m => g('amort', m));
  L.other = line(months, m => g('other_income', m));
  L.ebt = line(months, m => L.ebitda[m] - L.amort[m] + L.other[m]);
  L.tax = line(months, m => g('tax', m));
  L.profit = line(months, m => L.ebt[m] - L.tax[m]);
  L.rejected = line(months, m => g('rejected', m));
  L.cat = id => line(months, m => g('c' + id, m));
  return L;
}

// ---------------- ДДС ----------------
const cashAmt = o => (o.type === 'income' ? o.amount - (o.rejected || 0) : o.amount);
export function cashflow(s, months) {
  const C = ctx(s), first = months[0], last = months[months.length - 1], cell = {};
  const add = (k, m, v) => { (cell[k] ||= {})[m] = (cell[k][m] || 0) + v; };
  let opening = sum(s.accounts, a => a.opening);
  for (const o of s.ops) {
    if (!o.paid || o.type === 'transfer') continue;
    const c = C.cat[o.category_id];
    if (!c) continue;
    const m = ym(o.paid), sign = o.type === 'income' ? 1 : -1, amt = cashAmt(o);
    if (m < first) { opening += sign * amt; continue; }
    if (m > last) continue;
    const act = GROUPS[c.grp]?.cash || 'op';
    add('c' + c.id, m, amt); add(act + (sign > 0 ? '_in' : '_out'), m, amt);
  }
  const g = (k, m) => cell[k]?.[m] || 0;
  const F = { months, opening };
  ['op', 'inv', 'fin'].forEach(a => {
    F[a + '_in'] = line(months, m => g(a + '_in', m));
    F[a + '_out'] = line(months, m => g(a + '_out', m));
    F[a + '_net'] = line(months, m => F[a + '_in'][m] - F[a + '_out'][m]);
  });
  F.net = line(months, m => F.op_net[m] + F.inv_net[m] + F.fin_net[m]);
  F.open = {}; F.close = {};
  let bal = opening;
  months.forEach(m => { F.open[m] = bal; bal += F.net[m]; F.close[m] = bal; });
  F.cat = id => line(months, m => g('c' + id, m));
  return F;
}

export function balances(s, upto = today()) {
  return s.accounts.map(a => {
    let b = +a.opening || 0;
    for (const o of s.ops) {
      if (!o.paid || o.paid > upto) continue;
      if (o.type === 'transfer') { if (o.account_id === a.id) b -= o.amount; if (o.to_account_id === a.id) b += o.amount; }
      else if (o.account_id === a.id) b += o.type === 'income' ? cashAmt(o) : -o.amount;
    }
    return { ...a, balance: b };
  });
}

// ---------------- Долги ----------------
export const AGING = ['Срок не наступил', '1–30 дн.', '31–60 дн.', '61–90 дн.', 'Больше 90 дн.'];
const bucket = d => (d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4);
export function debts(s, asOf = today()) {
  const C = ctx(s), rec = [], pay = [];
  for (const o of s.ops) {
    if (o.paid || o.type === 'transfer') continue;
    const out = o.amount - (o.rejected || 0);
    if (out <= 0) continue;
    const due = o.due || o.date, overdue = daysDiff(due, asOf);
    (o.type === 'income' ? rec : pay).push({ op: o, out, due, overdue, b: bucket(overdue), cp: C.cp[o.counterparty_id], cat: C.cat[o.category_id] });
  }
  const aging = list => {
    const by = {};
    list.forEach(x => {
      const k = x.cp?.name || 'Без контрагента';
      const r = (by[k] ||= { name: k, kind: x.cp?.kind, b: [0, 0, 0, 0, 0], total: 0, n: 0 });
      r.b[x.b] += x.out; r.total += x.out; r.n++;
    });
    return Object.values(by).sort((a, b) => b.total - a.total);
  };
  const rev90 = sum(s.ops.filter(o => o.type === 'income' && C.cat[o.category_id]?.grp === 'revenue' && o.date <= asOf && o.date > addDays(asOf, -90)), o => o.amount - (o.rejected || 0));
  const recTotal = sum(rec, x => x.out);
  rec.sort((a, b) => b.overdue - a.overdue); pay.sort((a, b) => a.due.localeCompare(b.due));
  return {
    rec, pay, recAging: aging(rec), payAging: aging(pay), recTotal, payTotal: sum(pay, x => x.out),
    recOverdue: sum(rec.filter(x => x.overdue > 0), x => x.out), payOverdue: sum(pay.filter(x => x.overdue > 0), x => x.out),
    rec60: sum(rec.filter(x => x.overdue > 60), x => x.out),
    payWeek: sum(pay.filter(x => x.overdue > -7), x => x.out),
    dso: rev90 ? recTotal / (rev90 / 90) : 0,
  };
}

// ---------------- Прогноз ----------------
export function linTrend(values, k = 3) {
  const y = values.filter(v => isFinite(v));
  if (!y.length) return Array(k).fill(0);
  if (y.length === 1) return Array(k).fill(Math.max(0, y[0]));
  const n = y.length, mx = (n - 1) / 2, my = sum(y) / n;
  let num = 0, den = 0;
  y.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) ** 2; });
  const slope = den ? num / den : 0;
  return Array.from({ length: k }, (_, j) => Math.max(0, my + slope * (n + j - mx)));
}

export function revenueForecast(s, k = 3) {
  const hist = completeMonths(s).slice(-6);
  if (hist.length < 2) return { months: [], values: [] };
  const L = pnl(s, hist);
  const last = hist[hist.length - 1];
  return { months: Array.from({ length: k }, (_, j) => addMonths(last, j + 1)), values: linTrend(hist.map(m => L.net[m]), k) };
}

// Прогноз остатка денег: тренд поступлений, средние выплаты, план бюджета — если задан.
export function cashForecast(s, k = 3) {
  const C = ctx(s);
  const hist = completeMonths(s).slice(-6);
  const cm = curMonth();
  const start = sum(balances(s), a => a.balance);
  if (hist.length < 2) return { rows: [], start, min: start, gap: null };
  const F = cashflow(s, hist);
  const inTrend = linTrend(hist.map(m => F.op_in[m]), k + 1);
  const last3 = hist.slice(-3);
  const avgOut = sum(last3, m => F.op_out[m] + F.fin_out[m]) / last3.length;
  const curF = cashflow(s, [cm]);
  const rows = [];
  let bal = start;
  for (let j = 0; j <= k; j++) {
    const m = addMonths(cm, j);
    const plan = s.budget.filter(b => b.month === m);
    let inflow, outflow, src = 'тренд';
    if (plan.length) {
      inflow = sum(plan.filter(b => GROUPS[C.cat[b.category_id]?.grp]?.type === 'income'), b => b.amount);
      outflow = sum(plan.filter(b => GROUPS[C.cat[b.category_id]?.grp]?.type === 'expense'), b => b.amount);
      src = 'бюджет';
    } else { inflow = inTrend[j]; outflow = avgOut; }
    if (j === 0) { // текущий месяц: только то, что ещё не пришло и не ушло
      inflow = Math.max(0, inflow - curF.op_in[cm] - curF.fin_in[cm]);
      outflow = Math.max(0, outflow - curF.op_out[cm] - curF.inv_out[cm] - curF.fin_out[cm]);
    }
    bal += inflow - outflow;
    rows.push({ m, inflow, outflow, net: inflow - outflow, close: bal, src, rest: j === 0 });
  }
  const min = Math.min(start, ...rows.map(r => r.close));
  const gap = rows.find(r => r.close < 0) || null;
  return { rows, start, min, gap };
}

// ---------------- План-факт ----------------
export function planFact(s, months) {
  const C = ctx(s), set = new Set(months), by = {};
  const row = id => (by[id] ||= { cat: C.cat[id], plan: 0, fact: 0 });
  s.budget.forEach(b => { if (set.has(b.month) && C.cat[b.category_id]) row(b.category_id).plan += b.amount; });
  s.ops.forEach(o => { if (o.type !== 'transfer' && set.has(ym(o.date)) && C.cat[o.category_id]) row(o.category_id).fact += o.amount; });
  const rows = Object.values(by).map(r => {
    const inc = GROUPS[r.cat.grp]?.type === 'income';
    const ratio = r.plan ? r.fact / r.plan : null;
    const bad = r.plan ? (inc ? r.fact < r.plan * 0.95 : r.fact > r.plan * 1.05) : false;
    return { ...r, inc, dev: r.fact - r.plan, ratio, bad };
  });
  const pick = (grps, k) => sum(rows.filter(r => grps.includes(r.cat.grp)), r => r[k]);
  const pnlIn = ['revenue', 'other_income'], pnlOut = ['revenue_adj', 'variable', 'fixed', 'tax'];
  const tot = k => ({ revenue: pick(['revenue'], k), expense: pick(pnlOut, k), profit: pick(pnlIn, k) - pick(pnlOut, k) });
  return { rows, plan: tot('plan'), fact: tot('fact') };
}

export function breakEven(L, avgCheck) {
  const n = L.months.length || 1;
  const fixedM = (L.fixed.total + L.amort.total) / n, netM = L.net.total / n;
  const mr = div(L.margin.total, L.net.total);
  const be = mr > 0 ? fixedM / mr : Infinity;
  return { fixedM, netM, mr, be, safety: netM ? (netM - be) / netM : 0, visits: avgCheck ? be / avgCheck : 0 };
}

// ---------------- Мощность ----------------
function revenueByDoctor(s, C, set) {
  const r = {};
  s.ops.forEach(o => {
    if (!o.doctor_id || o.type === 'transfer' || !set.has(ym(o.date))) return;
    const g = C.cat[o.category_id]?.grp;
    if (g === 'revenue') r[o.doctor_id] = (r[o.doctor_id] || 0) + o.amount - (o.rejected || 0);
    if (g === 'revenue_adj') r[o.doctor_id] = (r[o.doctor_id] || 0) - o.amount;
  });
  return r;
}
function actAgg(s, set) {
  const a = {};
  s.activity.forEach(x => {
    if (!set.has(x.month)) return;
    const r = (a[x.resource_id] ||= { avail: 0, booked: 0, visits: 0, first: 0, noshow: 0, cancel: 0, referrals: 0 });
    for (const k in r) r[k] += +x[k] || 0;
  });
  return a;
}
export function capacity(s, months) {
  const C = ctx(s), set = new Set(months), target = s.settings.targetUtil || 0.85;
  const rev = revenueByDoctor(s, C, set), act = actAgg(s, set);
  const rows = s.resources.filter(r => r.active !== false).map(r => {
    const a = act[r.id] || { avail: 0, booked: 0, visits: 0, first: 0, noshow: 0, cancel: 0, referrals: 0 };
    const util = div(a.booked, a.avail);
    const rate = r.kind === 'doctor' ? div(rev[r.doctor_id] || 0, a.booked) : (+r.rate || 0);
    const check = r.kind === 'doctor' ? div(rev[r.doctor_id] || 0, a.visits) : div(rate * a.booked, a.visits);
    return {
      r, ...a, util, rate, check,
      potTarget: Math.max(0, a.avail * target - a.booked) * rate,
      potFull: Math.max(0, a.avail - a.booked) * rate,
      noshowRate: div(a.noshow, a.visits + a.noshow),
      noshowLoss: a.noshow * check,
      dep: C.dep[r.department_id],
    };
  });
  const deps = s.departments.map(d => {
    const rs = rows.filter(x => x.r.department_id === d.id && x.avail > 0);
    if (!rs.length) return null;
    const top = rs.reduce((a, b) => (b.potTarget > a.potTarget ? b : a));
    const neck = rs.reduce((a, b) => (b.util > a.util ? b : a));
    return { d, potential: top.potTarget, top, neck, util: div(sum(rs, x => x.booked), sum(rs, x => x.avail)) };
  }).filter(Boolean);
  const heat = rows.map(x => ({
    r: x.r, cells: months.map(m => {
      const a = s.activity.find(y => y.resource_id === x.r.id && y.month === m);
      return a && a.avail ? a.booked / a.avail : null;
    }),
  }));
  const docRows = rows.filter(x => x.r.kind === 'doctor');
  const equip = rows.filter(x => x.r.kind !== 'doctor');
  return {
    rows, deps, heat, target,
    potential: sum(deps, d => d.potential),
    noshowLoss: sum(docRows, x => x.noshowLoss),
    utilDoctors: div(sum(docRows, x => x.booked), sum(docRows, x => x.avail)),
    utilEquip: div(sum(equip, x => x.booked), sum(equip, x => x.avail)),
    visits: sum(docRows, x => x.visits),
  };
}

// ---------------- Врачи и зарплата ----------------
export function payCalc(doc, rev, materials) {
  const p = doc.pay || {}, pc = +p.pct || 0, sal = +p.salary || 0;
  switch (p.type) {
    case 'salary': return { amount: sal, how: 'оклад' };
    case 'mixed': return { amount: sal + rev * pc, how: `оклад + ${Math.round(pc * 100)}% выручки` };
    case 'margin': return { amount: Math.max(0, rev - materials) * pc, how: `${Math.round(pc * 100)}% от (выручка − материалы)` };
    default: return { amount: rev * pc, how: `${Math.round(pc * 100)}% выручки` };
  }
}
export function doctors(s, months, trendMonths = months) {
  const C = ctx(s), set = new Set(months), rev = revenueByDoctor(s, C, set), act = actAgg(s, set);
  const tset = new Set(trendMonths);
  return s.doctors.map(d => {
    const res = s.resources.find(r => r.doctor_id === d.id);
    const a = (res && act[res.id]) || { avail: 0, booked: 0, visits: 0, first: 0, noshow: 0, cancel: 0, referrals: 0 };
    let materials = 0, paid = 0;
    const trend = Object.fromEntries(trendMonths.map(m => [m, 0]));
    s.ops.forEach(o => {
      if (o.doctor_id !== d.id || o.type === 'transfer') return;
      const m = ym(o.date);
      if (set.has(m)) { if (tagged(C, o, 'materials')) materials += o.amount; if (tagged(C, o, 'doctor_pay')) paid += o.amount; }
      if (tset.has(m) && C.cat[o.category_id]?.grp === 'revenue') trend[m] += o.amount - (o.rejected || 0);
    });
    const r = rev[d.id] || 0;
    return {
      d, dep: C.dep[d.department_id], revenue: r, materials, paid, ...a,
      util: div(a.booked, a.avail), check: div(r, a.visits), repeat: div(a.visits - a.first, a.visits),
      perHour: div(r, a.avail), noshowRate: div(a.noshow, a.visits + a.noshow),
      payShare: div(paid, r), trend: trendMonths.map(m => trend[m]),
    };
  });
}
export function payroll(s, month) {
  return doctors(s, [month]).filter(x => x.d.active !== false).map(x => {
    const c = payCalc(x.d, x.revenue, x.materials);
    return { ...x, calc: c.amount, how: c.how, diff: x.paid - c.amount };
  });
}

// ---------------- Услуги и себестоимость ----------------
export function services(s, months) {
  const C = ctx(s), set = new Set(months);
  const L = pnl(s, months);
  const docAvail = sum(s.activity.filter(a => set.has(a.month) && C.res[a.resource_id]?.kind === 'doctor'), a => a.avail);
  const overheadHr = div(L.fixed.total + L.amort.total, docAvail);
  const acq = +s.settings.acquiringPct || 0, floor = s.settings.marginFloor ?? 0.3;
  const qty = {};
  s.sales.forEach(x => { if (set.has(x.month)) qty[x.service_id] = (qty[x.service_id] || 0) + (+x.qty || 0); });
  const rows = s.services.map(v => {
    const mat = sum(v.materials || [], m => (+C.item[m.item_id]?.price || 0) * (+m.qty || 0));
    const docPay = v.price * (+v.doctor_pct || 0), acqC = v.price * acq, over = overheadHr * (+v.duration || 0) / 60;
    const cost = mat + docPay + acqC + over, margin = v.price - cost;
    const q = qty[v.id] || 0;
    return {
      v, dep: C.dep[v.department_id], mat, docPay, acq: acqC, over, cost, margin, mPct: div(margin, v.price),
      perHour: div(margin, (+v.duration || 0) / 60), qty: q, revenue: q * v.price,
      contrib: q * (v.price - mat - docPay - acqC), low: div(margin, v.price) < floor,
    };
  });
  const total = sum(rows, r => r.revenue);
  let acc = 0;
  [...rows].sort((a, b) => b.revenue - a.revenue).forEach(r => {
    const share = div(r.revenue, total);
    r.abc = !r.revenue ? '—' : acc < 0.8 ? 'A' : acc < 0.95 ? 'B' : 'C';
    acc += share; r.share = share;
  });
  return { rows, overheadHr, total, avgMargin: div(sum(rows, r => r.margin * r.qty), sum(rows, r => r.revenue)) };
}

// ---------------- Маркетинг ----------------
export function marketing(s, months, marginRatio, avgCheck) {
  const C = ctx(s), set = new Set(months), by = {};
  s.marketing.forEach(x => {
    if (!set.has(x.month)) return;
    const r = (by[x.channel_id] ||= { ch: C.ch[x.channel_id] || { name: 'Канал удалён' }, spend: 0, leads: 0, bookings: 0, visits: 0, new_patients: 0, revenue: 0 });
    for (const k of ['spend', 'leads', 'bookings', 'visits', 'new_patients', 'revenue']) r[k] += +x[k] || 0;
  });
  const ltv = avgCheck * (+s.settings.visitsPerYear || 0) * (+s.settings.ltvYears || 0) * Math.max(0, marginRatio);
  const enrich = r => ({
    ...r, cpl: div(r.spend, r.leads), c1: div(r.bookings, r.leads), c2: div(r.visits, r.bookings),
    cac: div(r.spend, r.new_patients), rpp: div(r.revenue, r.new_patients),
    romi: r.spend ? (r.revenue * marginRatio - r.spend) / r.spend : null, ltvCac: r.spend ? div(ltv, div(r.spend, r.new_patients)) : null,
  });
  const rows = Object.values(by).map(enrich).sort((a, b) => b.new_patients - a.new_patients);
  const t = { ch: { name: 'Все каналы' }, spend: 0, leads: 0, bookings: 0, visits: 0, new_patients: 0, revenue: 0 };
  rows.forEach(r => { for (const k of ['spend', 'leads', 'bookings', 'visits', 'new_patients', 'revenue']) t[k] += r[k]; });
  return { rows, total: enrich(t), ltv };
}

// ---------------- Склад (партии, FEFO: сначала то, что раньше истекает) ----------------
export function stock(s, asOf = today()) {
  const C = ctx(s), set3 = new Set([addMonths(curMonth(), -3), addMonths(curMonth(), -2), addMonths(curMonth(), -1)]);
  return s.items.map(it => {
    const mv = s.stock.filter(x => x.item_id === it.id).sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'in' ? -1 : 1));
    const batches = [];
    let shortage = 0, used3 = 0;
    for (const x of mv) {
      if (x.kind === 'in') { batches.push({ ...x, left: +x.qty }); continue; }
      if (set3.has(ym(x.date))) used3 += +x.qty;
      let need = +x.qty;
      const pool = batches.filter(b => b.left > 0 && b.date <= x.date).sort((a, b) => {
        const ea = a.expiry && a.expiry <= x.date ? 1 : 0, eb = b.expiry && b.expiry <= x.date ? 1 : 0;
        return ea - eb || (a.expiry || '9999').localeCompare(b.expiry || '9999');
      });
      for (const b of pool) { const t = Math.min(b.left, need); b.left -= t; need -= t; if (need <= 0) break; }
      shortage += need;
    }
    const live = batches.filter(b => b.left > 1e-9).map(b => ({ ...b, days: b.expiry ? daysDiff(asOf, b.expiry) : null }));
    const qty = sum(live, b => b.left) - shortage;
    const value = sum(live, b => b.left * (+b.price || +it.price || 0));
    const daily = used3 / 90;
    const expired = sum(live.filter(b => b.days != null && b.days <= 0), b => b.left);
    const soon = sum(live.filter(b => b.days != null && b.days > 0 && b.days <= 60), b => b.left);
    const status = qty <= 0 ? 'none' : (it.min && qty < it.min) ? 'low' : 'ok';
    return { it, qty, value, live, expired, soon, status, daysLeft: daily ? qty / daily : null, shortage };
  });
}

// ---------------- Средний чек клиники ----------------
export function avgCheck(s, months, L = pnl(s, months)) {
  const set = new Set(months), C = ctx(s);
  const visits = sum(s.activity.filter(a => set.has(a.month) && C.res[a.resource_id]?.kind === 'doctor'), a => a.visits);
  return div(L.net.total, visits);
}

// ---------------- Сигналы «требует внимания» ----------------
export function alerts(s, months) {
  const out = [], C = ctx(s), set = s.settings;
  const cf = cashForecast(s, 3);
  if (cf.gap) out.push({ lvl: 'crit', go: 'cash', title: `Кассовый разрыв в ${monLong(cf.gap.m)}`, val: cf.gap.close, text: 'По прогнозу денег не хватит. Перенесите платежи или ускорьте оплату долгов.' });
  const dbt = debts(s);
  if (dbt.rec60 > 0) out.push({ lvl: 'serious', go: 'debts', title: 'Долги старше 60 дней', val: dbt.rec60, text: 'Страховые и фонд задерживают оплату — нужна сверка реестров.' });
  else if (dbt.recOverdue > 0) out.push({ lvl: 'warn', go: 'debts', title: 'Просроченная дебиторка', val: dbt.recOverdue, text: 'Есть неоплаченные счета с прошедшим сроком.' });
  const payOver = dbt.pay.filter(x => x.overdue > 0);
  if (payOver.length) out.push({ lvl: 'serious', go: 'debts', title: `Просрочена оплата поставщикам (${payOver.length})`, val: sum(payOver, x => x.out), text: 'Риск штрафов и остановки поставок.' });
  const soon = dbt.pay.filter(x => x.overdue <= 0 && x.overdue > -7);
  if (soon.length) out.push({ lvl: 'warn', go: 'debts', title: `Оплатить в ближайшие 7 дней (${soon.length})`, val: sum(soon, x => x.out), text: 'Счета поставщиков и зарплата со сроком на этой неделе.' });
  const last = months.filter(m => !isPartialMonth(m));
  const capM = last.length ? last.slice(-3) : months;
  const cap = capacity(s, capM);
  const low = cap.rows.filter(x => x.avail > 0 && x.util < (set.lowUtil ?? 0.6)).sort((a, b) => a.util - b.util);
  if (low.length) out.push({ lvl: 'warn', go: 'capacity', title: 'Низкая загрузка: ' + low.slice(0, 3).map(x => `${x.r.name} ${Math.round(x.util * 100)}%`).join(', '), val: sum(low, x => x.potTarget), valNote: 'потенциал', text: 'Свободные часы, которые можно заполнить записью и маркетингом.' });
  const ns = cap.rows.filter(x => x.r.kind === 'doctor' && x.noshowRate > 0.1);
  if (ns.length) out.push({ lvl: 'warn', go: 'doctors', title: 'Много неявок: ' + ns.map(x => `${x.r.name} ${Math.round(x.noshowRate * 100)}%`).join(', '), val: sum(ns, x => x.noshowLoss), valNote: 'потери', text: 'Помогают напоминания за сутки и предоплата.' });
  const sv = services(s, capM).rows.filter(r => r.low && r.qty > 0);
  if (sv.length) out.push({ lvl: 'warn', go: 'services', title: `Услуги с маржой ниже ${Math.round((set.marginFloor ?? 0.3) * 100)}%: ${sv.length}`, text: sv.slice(0, 3).map(r => `${r.v.name} (${Math.round(r.mPct * 100)}%)`).join(', ') + '. Пересмотрите цену, нормы материалов или процент врачу.' });
  const pm = last.length ? [last[last.length - 1]] : [];
  if (pm.length) {
    const pf = planFact(s, pm);
    const over = pf.rows.filter(r => r.bad && r.plan > 0 && Math.abs(r.dev) > 50000);
    if (over.length) out.push({ lvl: 'warn', go: 'budget', title: `Отклонения от плана за ${monLong(pm[0])}: ${over.length}`, text: over.slice(0, 3).map(r => r.cat.name).join(', ') + '.' });
  }
  const st = stock(s);
  const exp = st.filter(x => x.expired > 0), low2 = st.filter(x => x.status !== 'ok' && x.it.min > 0), soonE = st.filter(x => x.soon > 0);
  if (exp.length) out.push({ lvl: 'serious', go: 'stock', title: 'Просроченные материалы на складе: ' + exp.map(x => x.it.name).join(', '), text: 'Списать и утилизировать, иначе риск штрафа при проверке.' });
  if (low2.length) out.push({ lvl: 'warn', go: 'stock', title: 'Заканчивается: ' + low2.map(x => x.it.name).join(', '), text: 'Остаток ниже минимального — нужна закупка.' });
  if (soonE.length) out.push({ lvl: 'warn', go: 'stock', title: 'Срок годности истекает в 60 дней: ' + soonE.map(x => x.it.name).join(', '), text: 'Используйте эти партии в первую очередь.' });
  const order = { crit: 0, serious: 1, warn: 2 };
  return out.sort((a, b) => order[a.lvl] - order[b.lvl]);
}
