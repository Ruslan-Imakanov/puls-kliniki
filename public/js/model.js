// Модель данных: группы статей, справочники по умолчанию, пустое состояние.

// Группы статей: от группы зависит, куда операция попадает в ОПиУ и ДДС.
export const GROUPS = {
  revenue: { type: 'income', name: 'Выручка', pnl: true, cash: 'op' },
  other_income: { type: 'income', name: 'Прочие доходы', pnl: true, cash: 'op' },
  financing_in: { type: 'income', name: 'Кредиты и вложения', pnl: false, cash: 'fin' },
  revenue_adj: { type: 'expense', name: 'Возвраты и отказы', pnl: true, cash: 'op' },
  variable: { type: 'expense', name: 'Переменные расходы', pnl: true, cash: 'op' },
  fixed: { type: 'expense', name: 'Постоянные расходы', pnl: true, cash: 'op' },
  tax: { type: 'expense', name: 'Налоги на доход', pnl: true, cash: 'op' },
  capex: { type: 'expense', name: 'Оборудование и ремонт', pnl: false, cash: 'inv' },
  financing_out: { type: 'expense', name: 'Кредиты и выплаты собственникам', pnl: false, cash: 'fin' },
};
export const TAGS = {
  '': '—', doctor_pay: 'зарплата врачей', materials: 'материалы', acquiring: 'эквайринг',
  marketing: 'маркетинг', refund: 'возвраты', staff: 'персонал', rent: 'аренда',
};
export const PAY_SCHEMES = {
  percent: 'Процент от выручки', salary: 'Оклад', mixed: 'Оклад + процент', margin: 'Процент от маржи (выручка − материалы)',
};
export const RES_KINDS = { doctor: 'врач', room: 'кабинет', equipment: 'оборудование' };
export const CP_KINDS = { insurer: 'страховая (ДМС)', fund: 'фонд / госзаказ', supplier: 'поставщик', bank: 'банк', corporate: 'корпоративный клиент', other: 'другое' };

export function baseCategories() {
  const c = (id, name, grp, tag = '') => ({ id, name, grp, tag });
  return [
    c(1, 'Платные услуги (пациенты)', 'revenue'), c(2, 'ДМС (страховые компании)', 'revenue'),
    c(3, 'ОСМС / госзаказ', 'revenue'), c(4, 'Корпоративные договоры', 'revenue'),
    c(5, 'Продажа товаров', 'revenue'), c(6, 'Прочие доходы', 'other_income'),
    c(7, 'Кредиты и займы полученные', 'financing_in'), c(8, 'Вклад учредителя', 'financing_in'),
    c(20, 'Возвраты пациентам', 'revenue_adj', 'refund'),
    c(21, 'Зарплата врачей', 'variable', 'doctor_pay'), c(22, 'Расходные материалы и препараты', 'variable', 'materials'),
    c(23, 'Эквайринг и комиссии банка', 'variable', 'acquiring'), c(24, 'Лабораторные исследования (субподряд)', 'variable'),
    c(25, 'Оклады персонала', 'fixed', 'staff'), c(26, 'Налоги и взносы с ФОТ', 'fixed'),
    c(27, 'Аренда помещений', 'fixed', 'rent'), c(28, 'Коммунальные услуги', 'fixed'),
    c(29, 'Маркетинг и реклама', 'fixed', 'marketing'), c(30, 'Программы, связь, интернет', 'fixed'),
    c(31, 'Обслуживание и ремонт оборудования', 'fixed'), c(32, 'Мед. отходы, стирка, клининг', 'fixed'),
    c(33, 'Лицензии, обучение, сертификация', 'fixed'), c(34, 'Проценты по кредитам', 'fixed'),
    c(35, 'Прочие расходы', 'fixed'), c(36, 'Налог на доход', 'tax'),
    c(37, 'Покупка оборудования', 'capex'), c(38, 'Капитальный ремонт помещений', 'capex'),
    c(39, 'Погашение кредита', 'financing_out'), c(40, 'Выплаты собственникам', 'financing_out'),
  ];
}
export const defaultSettings = () => ({
  clinicName: 'Моя клиника', currency: '₸', targetUtil: 0.85, ltvYears: 2, visitsPerYear: 2.5,
  acquiringPct: 0.015, amortMonths: 60, marginFloor: 0.3, lowUtil: 0.6,
});

export function emptyState() {
  return {
    version: 1, settings: defaultSettings(),
    accounts: [{ id: 1, name: 'Касса', opening: 0 }, { id: 2, name: 'Расчётный счёт', opening: 0 }],
    departments: [], doctors: [], resources: [], categories: baseCategories(), counterparties: [],
    channels: [], services: [], items: [],
    ops: [], activity: [], budget: [], marketing: [], sales: [], stock: [], log: [], nextId: 1000,
  };
}

