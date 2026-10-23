// Демо-данные: многопрофильная клиника, 12 месяцев до сегодняшнего дня.
// Цифры выдуманные, но согласованы между модулями (выручка ↔ часы ↔ продажи ↔ склад).
import { emptyState } from './model.js';
import { today, curMonth, addMonths, addDays, monthEnd, daysInMonth } from './util.js';

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function demoState() {
  const rnd = mulberry32(20261023);
  const R = (a, b) => a + (b - a) * rnd();
  const round = (v, step = 100) => Math.round(v / step) * step;
  const s = emptyState();
  s.demo = true;
  s.settings.clinicName = 'Клиника «Пример»';
  const T = today(), CM = curMonth(), dayNow = +T.slice(8, 10);
  const months = [];
  for (let i = 11; i >= 0; i--) months.push(addMonths(CM, -i));
  let nextId = 100;
  const nid = () => nextId++;
  const day = (m, d) => m + '-' + String(Math.min(d, daysInMonth(m))).padStart(2, '0');
  const frac = m => (m === CM ? dayNow / daysInMonth(m) : 1);

  s.accounts = [{ id: 1, name: 'Касса', opening: 450000 }, { id: 2, name: 'Расчётный счёт', opening: 6200000 }];
  s.departments = [{ id: 1, name: 'Терапия' }, { id: 2, name: 'Хирургия' }, { id: 3, name: 'Диагностика' }, { id: 4, name: 'Стоматология' }];
  const docSpec = [
    // id, имя, специальность, отделение, база выручки/мес, схема оплаты, загрузка, приёмов в час, доля первичных, неявки
    [1, 'Иванова А. С.', 'терапевт', 1, 1.05e6, { type: 'mixed', salary: 150000, pct: 0.2 }, 0.78, 1.0, 0.45, 0.06],
    [2, 'Петров Б. К.', 'терапевт', 1, 0.9e6, { type: 'percent', pct: 0.35 }, 0.72, 1.0, 0.40, 0.07],
    [3, 'Сидоров В. М.', 'хирург', 2, 2.6e6, { type: 'margin', pct: 0.35 }, 0.74, 0.3, 0.55, 0.04],
    [4, 'Ахметова Г. Р.', 'хирург', 2, 2.0e6, { type: 'margin', pct: 0.35 }, 0.70, 0.3, 0.50, 0.05],
    [5, 'Ким Д. А.', 'врач МРТ', 3, 4.0e6, { type: 'salary', salary: 700000 }, 0.80, 1.4, 0.70, 0.05],
    [6, 'Беляев З. Н.', 'врач УЗИ', 3, 1.6e6, { type: 'percent', pct: 0.30 }, 0.82, 2.2, 0.60, 0.06],
    [7, 'Новикова Е. П.', 'стоматолог', 4, 1.8e6, { type: 'percent', pct: 0.40 }, 0.76, 1.0, 0.35, 0.07],
    [8, 'Омаров Ж. Т.', 'стоматолог', 4, 1.5e6, { type: 'percent', pct: 0.40 }, 0.66, 1.0, 0.40, 0.13],
  ];
  s.doctors = docSpec.map(d => ({ id: d[0], name: d[1], spec: d[2], department_id: d[3], pay: d[5], active: true }));
  s.resources = [
    ...docSpec.map(d => ({ id: 10 + d[0], name: d[1], kind: 'doctor', department_id: d[3], doctor_id: d[0], rate: 0, active: true })),
    { id: 21, name: 'Операционная', kind: 'room', department_id: 2, rate: 42000, active: true },
    { id: 22, name: 'МРТ 1,5 Тл', kind: 'equipment', department_id: 3, rate: 32000, active: true },
    { id: 23, name: 'УЗИ-аппарат', kind: 'equipment', department_id: 3, rate: 11000, active: true },
    { id: 24, name: 'Стоматологическое кресло №1', kind: 'room', department_id: 4, rate: 15000, active: true },
    { id: 25, name: 'Стоматологическое кресло №2', kind: 'room', department_id: 4, rate: 15000, active: true },
    { id: 26, name: 'Процедурный кабинет', kind: 'room', department_id: 1, rate: 9000, active: true },
  ];
  s.counterparties = [
    { id: 51, name: 'СК «Альфа-Мед»', kind: 'insurer' }, { id: 52, name: 'СК «Гарант Здоровье»', kind: 'insurer' },
    { id: 53, name: 'Фонд мед. страхования (ОСМС)', kind: 'fund' }, { id: 54, name: 'ТОО «МедСнаб»', kind: 'supplier' },
    { id: 55, name: 'ТОО «Фарм-Опт»', kind: 'supplier' }, { id: 56, name: 'ТОО «Лаборатория-Сервис»', kind: 'supplier' },
    { id: 57, name: 'ТОО «МедТехника»', kind: 'supplier' }, { id: 58, name: 'Банк (кредит)', kind: 'bank' },
    { id: 59, name: 'Арендодатель', kind: 'other' },
  ];
  s.channels = [
    { id: 61, name: 'Instagram' }, { id: 62, name: '2GIS' }, { id: 63, name: 'Google Реклама' },
    { id: 64, name: 'Сайт и SEO' }, { id: 65, name: 'Рекомендации пациентов' },
  ];
  s.items = [
    { id: 301, name: 'Перчатки нитриловые', unit: 'пара', price: 60, min: 800, shelf: 36 },
    { id: 302, name: 'Бахилы', unit: 'пара', price: 15, min: 500, shelf: 60 },
    { id: 303, name: 'Гель для УЗИ', unit: 'л', price: 1800, min: 5, shelf: 24 },
    { id: 304, name: 'Контраст (гадолиний)', unit: 'флакон', price: 12000, min: 15, shelf: 18 },
    { id: 305, name: 'Набор лапароскопический', unit: 'набор', price: 85000, min: 4, shelf: 36 },
    { id: 306, name: 'Сетка хирургическая', unit: 'шт', price: 45000, min: 3, shelf: 60 },
    { id: 307, name: 'Пломбировочный материал', unit: 'порция', price: 4000, min: 40, shelf: 12 },
    { id: 308, name: 'Анестетик', unit: 'карпула', price: 900, min: 100, shelf: 24 },
    { id: 309, name: 'Имплант дентальный', unit: 'шт', price: 110000, min: 3, shelf: 60 },
    { id: 310, name: 'Шприц 5 мл', unit: 'шт', price: 45, min: 300, shelf: 60 },
  ];
  const svc = (id, name, dep, price, duration, doctor_pct, materials, qty) => ({ id, name, department_id: dep, price, duration, doctor_pct, materials: materials.map(([item_id, q]) => ({ item_id, qty: q })), _qty: qty });
  s.services = [
    svc(401, 'Приём терапевта, первичный', 1, 9000, 30, 0.3, [[301, 1], [302, 1]], 120),
    svc(402, 'Приём терапевта, повторный', 1, 6000, 20, 0.3, [[301, 1]], 110),
    svc(403, 'ФГДС (гастроскопия)', 1, 22000, 30, 0.3, [[301, 2], [310, 1]], 35),
    svc(404, 'Консультация хирурга', 2, 10000, 30, 0.3, [[301, 1]], 60),
    svc(405, 'Лапароскопическая холецистэктомия', 2, 450000, 120, 0.3, [[305, 1], [301, 4], [310, 4]], 6),
    svc(406, 'Грыжесечение с сеткой', 2, 320000, 90, 0.3, [[306, 1], [301, 4], [310, 3]], 5),
    svc(407, 'МРТ головного мозга', 3, 28000, 40, 0.1, [], 120),
    svc(408, 'МРТ с контрастом', 3, 45000, 50, 0.1, [[304, 1], [310, 1]], 45),
    svc(409, 'УЗИ брюшной полости', 3, 8000, 20, 0.3, [[303, 0.05], [301, 1]], 180),
    svc(410, 'УЗИ щитовидной железы', 3, 6000, 15, 0.3, [[303, 0.03], [301, 1]], 120),
    svc(411, 'Лечение кариеса', 4, 30000, 60, 0.4, [[307, 2], [308, 1], [301, 1]], 70),
    svc(412, 'Профессиональная гигиена', 4, 18000, 50, 0.4, [[301, 1]], 40),
    svc(413, 'Удаление зуба', 4, 15000, 30, 0.4, [[308, 2], [301, 1]], 25),
    svc(414, 'Имплантация (1 имплант)', 4, 280000, 90, 0.4, [[309, 1], [308, 3], [301, 2]], 4),
  ];

  const ops = s.ops;
  const op = o => {
    if (o.date > T && !o.future) return null;
    delete o.future;
    if (o.paid && o.paid > T) o.paid = null;
    const full = { id: nid(), type: 'expense', account_id: 2, department_id: null, doctor_id: null, counterparty_id: null, due: null, doc: '', comment: '', rejected: 0, ...o };
    full.amount = round(full.amount);
    full.rejected = round(full.rejected || 0);
    if (full.amount <= 0) return null;
    ops.push(full);
    return full;
  };
  const season = m => [1.05, 0.93, 1.0, 1.06, 1.04, 0.98, 0.86, 0.84, 1.05, 1.1, 1.08, 1.0][+m.slice(5, 7) - 1];

  // Кредит на оборудование в первом месяце
  op({ type: 'income', category_id: 7, date: day(months[0], 3), paid: day(months[0], 3), amount: 10e6, counterparty_id: 58, comment: 'Кредит на оборудование, 36 мес.' });
  let loan = 10e6;
  const docRevenue = {}; // [doctorId][month] = выручка (начисление)
  const cashRev = {};

  months.forEach((m, mi) => {
    const f = frac(m), g = 1 + mi * 0.018, se = season(m);
    // ---------- выручка по врачам ----------
    docSpec.forEach(([id, , , dep, base]) => {
      const total = base * g * se * R(0.92, 1.08) * f;
      (docRevenue[id] ||= {})[m] = total;
      const therapist = dep === 1, hasDms = dep !== 3 || id === 5;
      const shareFund = therapist ? 0.15 : 0, shareDms = hasDms ? (therapist ? 0.15 : 0.14) : 0.06;
      const patients = total * (1 - shareFund - shareDms);
      // пациенты: безнал раз в неделю, наличные одной суммой за месяц
      const chunks = [1, 8, 15, 22, 29].filter(d => d <= daysInMonth(m));
      chunks.forEach((d, ci) => {
        const end = ci + 1 < chunks.length ? chunks[ci + 1] - 1 : daysInMonth(m);
        const dt = day(m, end);
        const part = patients * 0.75 * ((end - d + 1) / daysInMonth(m)) / f;
        if (dt <= T) op({ type: 'income', category_id: 1, date: dt, paid: dt, amount: part, department_id: dep, doctor_id: id, comment: 'Оплаты пациентов (карта, переводы)' });
        else if (m === CM && d <= dayNow) op({ type: 'income', category_id: 1, date: T, paid: T, amount: part * (dayNow - d + 1) / (end - d + 1), department_id: dep, doctor_id: id, comment: 'Оплаты пациентов (карта, переводы)' });
      });
      const cashDate = m === CM ? T : monthEnd(m);
      op({ type: 'income', category_id: 1, date: cashDate, paid: cashDate, account_id: 1, amount: patients * 0.25, department_id: dep, doctor_id: id, comment: 'Наличные пациентов' });
      cashRev[m] = (cashRev[m] || 0) + patients * 0.25;
      // ДМС — реестр в конце месяца, оплата через 35–55 дней, часть отказов
      [[51, 0.6], [52, 0.4]].forEach(([cp, sh]) => {
        const amt = total * shareDms * sh;
        const dt = monthEnd(m);
        op({ type: 'income', category_id: 2, date: dt, due: addDays(dt, 30), paid: addDays(dt, Math.round(R(35, 58))), amount: amt, rejected: rnd() < 0.35 ? amt * R(0.01, 0.05) : 0, department_id: dep, doctor_id: id, counterparty_id: cp, doc: 'Реестр ' + m.slice(5, 7) + '/' + m.slice(2, 4) });
      });
      if (shareFund) {
        const dt = monthEnd(m);
        op({ type: 'income', category_id: 3, date: dt, due: addDays(dt, 30), paid: addDays(dt, Math.round(R(75, 125))), amount: total * shareFund, department_id: dep, doctor_id: id, counterparty_id: 53, doc: 'Акт ОСМС ' + m.slice(5, 7) + '/' + m.slice(2, 4) });
      }
      // материалы — по факту расхода, оплата поставщику через 10–25 дней
      const matRate = { 1: 0.04, 2: 0.16, 3: 0.06, 4: 0.14 }[dep];
      const matDate = day(m, 15);
      const mat = op({ category_id: 22, date: matDate, due: addDays(matDate, 20), paid: addDays(matDate, Math.round(R(10, 25))), amount: total * matRate, department_id: dep, doctor_id: id, counterparty_id: dep === 2 || dep === 4 ? 54 : 55, doc: 'Накладная ' + (1000 + mi * 10 + id) });
      if (mat && mi === 10 && id === 3) { mat.paid = null; } // просроченный долг поставщику
      // зарплата врачей по схеме
      const p = docSpec.find(d => d[0] === id)[5];
      const matAmt = mat ? mat.amount : 0;
      const calc = p.type === 'salary' ? p.salary : p.type === 'mixed' ? p.salary + total * p.pct : p.type === 'margin' ? (total - matAmt) * p.pct : total * p.pct;
      const pd = monthEnd(m);
      op({ category_id: 21, date: pd, due: addDays(pd, 5), paid: addDays(pd, 5), amount: calc * R(0.985, 1.015), department_id: dep, doctor_id: id, comment: 'Зарплата за ' + m });
    });
    const monthRev = docSpec.reduce((a, d) => a + docRevenue[d[0]][m], 0);
    // ---------- прочие расходы ----------
    op({ category_id: 27, date: day(m, 1), paid: day(m, 1), amount: 1.5e6, counterparty_id: 59, comment: 'Аренда 620 м²' });
    op({ category_id: 30, date: day(m, 3), paid: day(m, 3), amount: 160000, comment: 'МИС, телефония, интернет' });
    op({ category_id: 28, date: day(m, 10), paid: day(m, 15), amount: [1, 2, 12, 11, 3].includes(+m.slice(5, 7)) ? R(480000, 540000) : R(360000, 420000) });
    op({ category_id: 31, date: day(m, 12), paid: day(m, 12), amount: 250000, department_id: 3, counterparty_id: 57, comment: 'Сервисный контракт МРТ' });
    op({ category_id: 32, date: day(m, 18), paid: day(m, 18), amount: 180000 });
    op({ category_id: 24, date: day(m, 20), due: addDays(day(m, 20), 10), paid: addDays(day(m, 20), 10), amount: R(250000, 340000) * f, counterparty_id: 56 });
    op({ category_id: 23, date: day(m, 20), paid: day(m, 20), amount: monthRev * 0.6 * 0.015 });
    op({ category_id: 25, date: day(m, 28), paid: day(m, 28), amount: 2.3e6, comment: 'Администраторы, медсёстры, младший персонал' });
    op({ category_id: 26, date: day(m, 28), paid: day(m, 28), amount: 2.3e6 * 0.11 + monthRev * 0.035 });
    op({ category_id: 35, date: day(m, 14), paid: day(m, 14), amount: R(80000, 160000) });
    if (mi % 4 === 2) op({ category_id: 33, date: day(m, 9), paid: day(m, 9), amount: 300000, comment: 'Курсы повышения квалификации' });
    if (mi > 0) {
      op({ category_id: 34, date: day(m, 7), paid: day(m, 7), amount: loan * 0.15 / 12, counterparty_id: 58 });
      op({ category_id: 39, date: day(m, 7), paid: day(m, 7), amount: 300000, counterparty_id: 58 });
      if (day(m, 7) <= T) loan -= 300000;
      const prev = months[mi - 1];
      const prevRev = docSpec.reduce((a, d) => a + docRevenue[d[0]][prev], 0);
      op({ category_id: 36, date: day(m, 25), paid: day(m, 25), amount: prevRev * 0.03, comment: 'Налог за ' + prev });
    }
    if (mi === 3) op({ category_id: 37, date: day(m, 12), paid: day(m, 12), amount: 9e6, life: 60, department_id: 3, counterparty_id: 57, comment: 'УЗИ-аппарат экспертного класса' });
    if (mi === 9) op({ category_id: 37, date: day(m, 6), paid: day(m, 6), amount: 3.5e6, life: 60, department_id: 4, counterparty_id: 57, comment: 'Стоматологическая установка' });
    if (mi === 6) op({ category_id: 40, date: day(m, 10), paid: day(m, 10), amount: 1e6, comment: 'Выплата учредителю' });
    for (let k = 0; k < (rnd() < 0.5 ? 1 : 2); k++) {
      const d = docSpec[Math.floor(rnd() * docSpec.length)];
      const dt = day(m, Math.round(R(3, 27)));
      op({ category_id: 20, date: dt, paid: dt, amount: R(40000, 120000), department_id: d[3], doctor_id: d[0], comment: 'Возврат за неоказанную услугу' });
    }
    // инкассация: наличные из кассы на расчётный счёт
    const inc = day(m, 28);
    if (inc <= T) op({ type: 'transfer', category_id: null, date: inc, paid: inc, account_id: 1, to_account_id: 2, amount: cashRev[m] * 0.97, comment: 'Инкассация' });

    // ---------- маркетинг ----------
    const mk = [[61, R(220000, 280000), R(1800, 2600), R(0.32, 0.4), R(25000, 38000)], [62, 90000, R(1000, 1400), R(0.5, 0.6), R(28000, 40000)],
      [63, R(150000, 200000), R(2600, 3400), R(0.45, 0.55), R(45000, 60000)], [64, 120000, R(1300, 1700), R(0.5, 0.6), R(30000, 42000)], [65, 0, 0, R(0.65, 0.75), R(35000, 50000)]];
    mk.forEach(([ch, spend, cpl, conv, check]) => {
      const leads = ch === 65 ? R(40, 60) * f : (spend * f) / cpl;
      const bookings = leads * conv, visits = bookings * R(0.76, 0.88), np = visits * R(0.9, 1);
      s.marketing.push({ id: nid(), month: m, channel_id: ch, spend: round(spend * f), leads: Math.round(leads), bookings: Math.round(bookings), visits: Math.round(visits), new_patients: Math.round(np), revenue: round(np * check) });
      if (spend) op({ category_id: 29, date: day(m, 5), paid: day(m, 5), amount: spend * f, comment: s.channels.find(c => c.id === ch).name });
    });

    // ---------- часы и приёмы ----------
    docSpec.forEach(([id, , , dep, , , util, vph, first, ns]) => {
      const avail = (dep === 2 ? 120 : 150) * f;
      const booked = Math.min(avail, avail * util * (0.94 + rnd() * 0.12) * (se > 1 ? 1.03 : 0.97));
      const visits = booked * vph;
      s.activity.push({ id: nid(), resource_id: 10 + id, month: m, avail: Math.round(avail), booked: Math.round(booked), visits: Math.round(visits), first: Math.round(visits * first), noshow: Math.round(visits * ns * R(0.85, 1.15)), cancel: Math.round(visits * R(0.03, 0.07)), referrals: round(dep === 1 ? R(300000, 550000) * f : dep === 2 ? R(100000, 200000) * f : 0, 1000) });
    });
    [[21, 176, 0.5, 0.5], [22, 260, 0.55 + mi * 0.004, 1.4], [23, 220, 0.72, 2.5], [24, 200, 0.7, 1], [25, 200, 0.62, 1], [26, 180, 0.58, 3]].forEach(([rid, av, u, vph]) => {
      const avail = av * f, booked = avail * u * (0.94 + rnd() * 0.12);
      s.activity.push({ id: nid(), resource_id: rid, month: m, avail: Math.round(avail), booked: Math.round(booked), visits: Math.round(booked * vph), first: 0, noshow: Math.round(booked * vph * R(0.03, 0.08)), cancel: Math.round(booked * vph * 0.04), referrals: 0 });
    });

    // ---------- продажи услуг (объёмы из МИС) ----------
    s.services.forEach(v => s.sales.push({ id: nid(), month: m, service_id: v.id, qty: Math.round(v._qty * R(0.9, 1.1) * f * (0.95 + mi * 0.01)) }));
  });

  // Предоплаты: деньги пришли сейчас, услуга — в следующем месяце (в ДДС сейчас, в ОПиУ потом)
  const nm = addMonths(CM, 1);
  op({ type: 'income', category_id: 1, date: day(nm, 5), future: true, paid: addDays(T, -3), amount: 360000, department_id: 1, doctor_id: 1, comment: 'Предоплата: годовая программа «Check-up»' });
  op({ type: 'income', category_id: 1, date: day(nm, 12), future: true, paid: addDays(T, -8), amount: 280000, department_id: 4, doctor_id: 7, comment: 'Депозит пациента под имплантацию' });

  // ---------- склад: приходы с партиями и сроками, списания по нормам ----------
  const itemById = Object.fromEntries(s.items.map(i => [i.id, i]));
  const useByMonth = {};
  s.sales.forEach(x => {
    const v = s.services.find(q => q.id === x.service_id);
    v.materials.forEach(mt => { ((useByMonth[x.month] ||= {})[mt.item_id] = (useByMonth[x.month]?.[mt.item_id] || 0) + mt.qty * x.qty); });
  });
  s.items.forEach(it => {
    const avg = months.reduce((a, m) => a + (useByMonth[m]?.[it.id] || 0), 0) / 12;
    const d0 = months[0] + '-01';
    s.stock.push({ id: nid(), date: d0, item_id: it.id, kind: 'in', qty: Math.ceil(avg * 1.5), price: it.price, expiry: it.id === 303 ? addDays(T, -12) : addMonths(ym10(d0), it.shelf) + '-01', comment: 'Остаток на начало учёта' });
    months.forEach((m, mi) => {
      const skip = (it.id === 304 && mi >= 10) || (it.id === 309 && mi === 11);
      if (!skip) {
        const d = m + '-03';
        const short = it.id === 308 && mi === 10; // поставщик привёз короткий срок
        if (d <= T) s.stock.push({ id: nid(), date: d, item_id: it.id, kind: 'in', qty: short ? 400 : Math.ceil((useByMonth[m]?.[it.id] || 0) * 1.05), price: it.price, expiry: short ? addDays(T, 20) : addMonths(m, it.shelf) + '-01', comment: short ? 'Поставка (короткий срок годности)' : 'Поставка' });
      }
      const u = useByMonth[m]?.[it.id];
      const od = m === CM ? T : monthEnd(m);
      if (u) s.stock.push({ id: nid(), date: od, item_id: it.id, kind: 'out', qty: Math.round(u * 100) / 100, price: it.price, comment: 'Списание по нормам услуг', ikey: 'norm:' + m + ':' + it.id });
    });
  });
  function ym10(d) { return d.slice(0, 7); }
  // сезонная вакцина: остаток с истёкшим сроком
  s.items.push({ id: 311, name: 'Вакцина гриппозная', unit: 'доза', price: 3500, min: 0 });
  s.stock.push({ id: nid(), date: months[0] + '-10', item_id: 311, kind: 'in', qty: 40, price: 3500, expiry: addDays(T, -12), comment: 'Поставка к сезону' });
  s.stock.push({ id: nid(), date: months[2] + '-20', item_id: 311, kind: 'out', qty: 25, price: 3500, comment: 'Вакцинация' });

  // ---------- бюджет: план на последние 6 месяцев и следующий ----------
  const full = months.filter(m => m !== CM);
  const avgByCat = {};
  ops.forEach(o => { if (o.type !== 'transfer' && full.includes(o.date.slice(0, 7))) avgByCat[o.category_id] = (avgByCat[o.category_id] || 0) + o.amount / full.length; });
  [...months.slice(6), nm].forEach(m => {
    Object.entries(avgByCat).forEach(([cid, v]) => {
      cid = +cid;
      if ([7, 37, 38, 40].includes(cid)) return;
      const k = cid <= 6 ? R(1.0, 1.08) : R(0.93, 1.04);
      s.budget.push({ month: m, category_id: cid, amount: round(v * k * season(m), 10000) });
    });
  });

  s.services.forEach(v => delete v._qty);
  s.items.forEach(i => delete i.shelf);
  s.nextId = nextId;
  s.log = [{ t: new Date().toISOString(), action: 'Данные', text: 'Загружены демо-данные' }];
  return s;
}
