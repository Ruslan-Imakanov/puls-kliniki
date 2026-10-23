// Хранилище данных. Сейчас — браузер (localStorage), позже тот же интерфейс
// будет читать и писать Supabase (см. ../schema.sql — таблицы называются так же).
import { today } from './util.js';
import { demoState } from './demo.js';
import { GROUPS, emptyState, defaultSettings } from './model.js';

const KEY = 'clinicbi:data:v1';
export const store = { s: null, mode: 'demo', saveOk: true };
const listeners = [];
export const onChange = fn => listeners.push(fn);

const COLLS = ['accounts', 'departments', 'doctors', 'resources', 'categories', 'counterparties', 'channels', 'services', 'items', 'ops', 'activity', 'budget', 'marketing', 'sales', 'stock', 'log'];
function migrate(s) {
  const e = emptyState();
  COLLS.forEach(k => { if (!Array.isArray(s[k])) s[k] = e[k]; });
  s.settings = { ...defaultSettings(), ...(s.settings || {}) };
  if (!s.nextId) s.nextId = 1000 + COLLS.reduce((m, k) => Math.max(m, ...s[k].map(x => +x.id || 0)), 0);
  return s;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { store.s = migrate(JSON.parse(raw)); store.mode = store.s.demo ? 'demo' : 'local'; return store.mode; }
  } catch (e) { /* повреждённые данные или запрет хранилища — стартуем с демо */ }
  store.s = demoState(); store.mode = 'demo'; save();
  return 'demo';
}
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store.s)); store.saveOk = true; }
  catch (e) { store.saveOk = false; }
  return store.saveOk;
}

export const nid = () => store.s.nextId++;
export function log(action, text) {
  store.s.log.unshift({ t: new Date().toISOString(), action, text });
  if (store.s.log.length > 400) store.s.log.length = 400;
}
// Любое изменение данных проходит через commit: журнал, сохранение, перерисовка.
export function commit(action, text, { silent = false } = {}) {
  if (text) log(action, text);
  save();
  if (!silent) listeners.forEach(fn => fn());
}

export const idx = coll => Object.fromEntries(store.s[coll].map(x => [x.id, x]));
export const byId = (coll, id) => store.s[coll].find(x => x.id === +id || x.id === id);
export const catType = c => GROUPS[c?.grp]?.type;

export function add(coll, obj) { const o = { ...obj, id: obj.id ?? nid() }; store.s[coll].push(o); return o; }
export function update(coll, id, patch) { const o = byId(coll, id); if (o) Object.assign(o, patch); return o; }
export function remove(coll, id) { const i = store.s[coll].findIndex(x => x.id === +id || x.id === id); if (i > -1) store.s[coll].splice(i, 1); }

// Сколько раз справочник используется — чтобы не удалить то, на что ссылаются операции.
export function usage(coll, id) {
  const s = store.s; id = +id;
  const f = {
    categories: () => s.ops.filter(o => o.category_id === id).length + s.budget.filter(b => b.category_id === id).length,
    departments: () => s.ops.filter(o => o.department_id === id).length + s.doctors.filter(d => d.department_id === id).length + s.resources.filter(r => r.department_id === id).length,
    doctors: () => s.ops.filter(o => o.doctor_id === id).length + s.resources.filter(r => r.doctor_id === id).length,
    resources: () => s.activity.filter(a => a.resource_id === id).length,
    accounts: () => s.ops.filter(o => o.account_id === id || o.to_account_id === id).length,
    counterparties: () => s.ops.filter(o => o.counterparty_id === id).length,
    channels: () => s.marketing.filter(m => m.channel_id === id).length,
    services: () => s.sales.filter(x => x.service_id === id).length,
    items: () => s.stock.filter(x => x.item_id === id).length + s.services.filter(v => (v.materials || []).some(m => m.item_id === id)).length,
  }[coll];
  return f ? f() : 0;
}

export function resetDemo() { store.s = demoState(); store.mode = 'demo'; commit('Данные', 'Загружены демо-данные'); }
export function clearAll() {
  const st = store.s.settings;
  store.s = emptyState(); store.s.settings = { ...st }; store.mode = 'local';
  commit('Данные', 'Все данные очищены, начат чистый учёт');
}
export const exportJSON = () => JSON.stringify({ ...store.s, exported: today() }, null, 1);
export function importJSON(text) {
  const s = JSON.parse(text);
  if (!s || !Array.isArray(s.ops) || !Array.isArray(s.categories)) throw new Error('Это не резервная копия программы: нет операций или статей.');
  store.s = migrate(s); store.mode = s.demo ? 'demo' : 'local';
  commit('Данные', 'Восстановлено из резервной копии');
}
