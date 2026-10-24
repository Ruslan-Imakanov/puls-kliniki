// Облачный режим: вход, выбор клиники, команда и синхронизация данных с базой Supabase.
// Программа по-прежнему работает с store.s в памяти. При каждом commit() сравниваем данные с последней
// сохранённой версией и отправляем в базу только разницу (по очереди, с повтором при обрыве связи).
// Доступ к данным проверяет сама база (RLS, см. ../schema.sql); здесь — только понятные подсказки.
import { $, esc, toast, prefGet, prefSet, today } from './util.js';
import { store, hooks } from './store.js';
import { emptyState, defaultSettings } from './model.js';
import { demoState } from './demo.js';

export const CLOUD = {
  url: 'https://zqptdixqcatezflrmzxu.supabase.co',
  key: 'sb_publishable_8iOTEULVQcvB83Yq-oqJYQ_89jp1W8N', // публичный ключ: защита данных — в RLS, а не в секретности ключа
};
const SB_SRC = ['js/vendor/supabase.js', 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js'];

// ---------- таблицы: какие поля уходят в базу ----------
const COLS = {
  accounts: ['name', 'opening'], categories: ['name', 'grp', 'tag'], counterparties: ['name', 'kind'],
  ops: ['type', 'date', 'paid', 'due', 'amount', 'rejected', 'category_id', 'account_id', 'to_account_id', 'department_id', 'doctor_id', 'counterparty_id', 'doc', 'comment', 'life', 'src', 'ikey'],
  budget: ['amount'],
  departments: ['name'], doctors: ['name', 'spec', 'department_id', 'pay', 'active'], resources: ['name', 'kind', 'department_id', 'doctor_id', 'rate', 'active'],
  channels: ['name'], items: ['name', 'unit', 'price', 'min'], services: ['name', 'department_id', 'price', 'duration', 'doctor_pct', 'materials'],
  activity: ['resource_id', 'month', 'avail', 'booked', 'visits', 'first', 'noshow', 'cancel', 'referrals'],
  sales: ['service_id', 'month', 'qty'], marketing: ['channel_id', 'month', 'spend', 'leads', 'bookings', 'visits', 'new_patients', 'revenue'],
  stock: ['item_id', 'date', 'kind', 'qty', 'price', 'expiry', 'comment', 'ikey'],
};
const KEY = { budget: ['category_id', 'month'] };
const keyCols = t => KEY[t] || ['id'];
const FIN = new Set(['accounts', 'categories', 'counterparties', 'ops', 'budget']);
const NUM0 = new Set(['opening', 'amount', 'rejected', 'price', 'min', 'rate', 'doctor_pct', 'avail', 'booked', 'visits', 'first', 'noshow', 'cancel', 'referrals', 'qty', 'spend', 'leads', 'bookings', 'new_patients', 'revenue']);
const IDS = new Set(['id', 'category_id', 'account_id', 'to_account_id', 'department_id', 'doctor_id', 'counterparty_id', 'resource_id', 'service_id', 'channel_id', 'item_id']);
const DATES = new Set(['date', 'paid', 'due', 'expiry']);
const TEXT_DEF = { name: '', grp: 'fixed', tag: '', unit: 'шт', month: '' };
const KIND_DEF = { counterparties: 'other', resources: 'doctor', stock: 'in' };
export const ROLES = { owner: 'Владелец', accountant: 'Бухгалтер', manager: 'Управляющий', viewer: 'Только просмотр' };

const numOr = (v, d) => { const n = Number(v); return v === '' || v == null || !isFinite(n) ? d : n; };
function norm(t, o) {
  const r = {};
  for (const k of keyCols(t)) r[k] = IDS.has(k) ? numOr(o[k], null) : String(o[k] ?? '');
  for (const k of COLS[t]) {
    const v = o[k];
    if (IDS.has(k)) r[k] = numOr(v, null);
    else if (NUM0.has(k)) r[k] = numOr(v, 0);
    else if (k === 'duration') r[k] = numOr(v, 30);
    else if (k === 'life') r[k] = numOr(v, null);
    else if (DATES.has(k)) r[k] = v ? String(v).slice(0, 10) : (k === 'date' ? today() : null);
    else if (k === 'active') r[k] = v !== false;
    else if (k === 'materials') r[k] = Array.isArray(v) ? v : [];
    else if (k === 'pay') r[k] = v && typeof v === 'object' ? v : null;
    else if (k === 'kind') r[k] = v ? String(v) : KIND_DEF[t];
    else if (k === 'type') r[k] = v ? String(v) : 'expense';
    else if (k in TEXT_DEF) r[k] = v == null ? TEXT_DEF[k] : String(v);
    else r[k] = v == null || v === '' ? null : String(v);
  }
  return r;
}
const keyOf = (t, r) => keyCols(t).map(k => r[k]).join('|');

// ---------- состояние ----------
const S = { sb: null, user: null, clinic: null, role: null, snap: {}, settingsJ: '', logT: '', queue: [], busy: false, fail: 0, loadedAt: 0, lastId: 0 };
export const cloudState = S;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadLib() {
  if (window.supabase?.createClient) return Promise.resolve(window.supabase);
  const tryLoad = i => new Promise((res, rej) => {
    if (i >= SB_SRC.length) return rej(new Error('Не удалось загрузить модуль входа. Проверьте интернет.'));
    const sc = document.createElement('script'); sc.src = SB_SRC[i];
    sc.onload = () => (window.supabase?.createClient ? res(window.supabase) : tryLoad(i + 1).then(res, rej));
    sc.onerror = () => { sc.remove(); tryLoad(i + 1).then(res, rej); };
    document.head.appendChild(sc);
  });
  return tryLoad(0);
}
async function client() {
  if (S.sb) return S.sb;
  const lib = await loadLib();
  S.sb = lib.createClient(CLOUD.url, CLOUD.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'pulse-auth' } });
  return S.sb;
}
const ok = ({ data, error }) => { if (error) throw error; return data; };
const denied = e => e && (e.code === '42501' || /row-level security|permission denied/i.test(e.message || ''));

// ---------- id новых записей: уникальны между сотрудниками одной клиники ----------
function cloudNid() {
  const id = Math.max(S.lastId + 1, Date.now() * 1000 + Math.floor(Math.random() * 1000));
  S.lastId = id;
  return id;
}

// ---------- загрузка клиники ----------
async function fetchAll(t, cid) {
  const out = [], order = keyCols(t);
  for (let from = 0; ; from += 1000) {
    let q = S.sb.from(t).select('*').eq('clinic_id', cid);
    order.forEach(k => { q = q.order(k); });
    const rows = ok(await q.range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out.map(r => { const { clinic_id, ...o } = r; return o; });
}
function snapshot() {
  S.snap = {};
  for (const t of Object.keys(COLS)) {
    const m = new Map();
    (store.s[t] || []).forEach(o => { const r = norm(t, o); m.set(keyOf(t, r), JSON.stringify(r)); });
    S.snap[t] = m;
  }
  S.settingsJ = JSON.stringify(store.s.settings);
  S.logT = store.s.log.reduce((a, e) => (e.t > a ? e.t : a), '');
}
export async function loadClinic(cid) {
  const clinic = ok(await S.sb.from('clinics').select('*').eq('id', cid).single());
  const me = ok(await S.sb.from('clinic_members').select('role').eq('clinic_id', cid).eq('user_id', S.user.id).single());
  const tables = Object.keys(COLS);
  const [rows, log] = await Promise.all([
    Promise.all(tables.map(t => fetchAll(t, cid))),
    S.sb.from('audit_log').select('t, action, text, email').eq('clinic_id', cid).order('t', { ascending: false }).limit(300).then(ok),
  ]);
  const s = emptyState();
  tables.forEach((t, i) => { s[t] = rows[i]; });
  s.settings = { ...defaultSettings(), ...(clinic.settings || {}), clinicName: clinic.name };
  s.log = log.map(e => ({ t: e.t, action: e.action, text: e.email ? `${e.text || ''} · ${e.email}` : e.text }));
  s.nextId = 0;
  S.clinic = clinic; S.role = me.role; S.loadedAt = Date.now();
  store.s = s; store.mode = 'cloud';
  snapshot();
  return s;
}

// ---------- запись: разница с последней сохранённой версией ----------
const canWrite = t => (t === 'settings' ? S.role === 'owner' : FIN.has(t) ? ['owner', 'accountant'].includes(S.role) : S.role !== 'viewer');
const WHAT = { settings: 'настройки клиники', fin: 'финансовые данные', clin: 'данные клиники' };
function persist() {
  if (!S.clinic) return;
  const jobs = [], deniedSet = new Set();
  for (const t of Object.keys(COLS)) {
    const prev = S.snap[t], cur = new Map();
    (store.s[t] || []).forEach(o => { const r = norm(t, o); cur.set(keyOf(t, r), JSON.stringify(r)); });
    const ups = [], dels = [];
    cur.forEach((j, k) => { if (prev.get(k) !== j) ups.push(JSON.parse(j)); });
    prev.forEach((j, k) => { if (!cur.has(k)) dels.push(JSON.parse(j)); });
    if (!ups.length && !dels.length) continue;
    if (!canWrite(t)) { deniedSet.add(t); continue; }
    jobs.push({ t, ups, dels }); S.snap[t] = cur;
  }
  const setJ = JSON.stringify(store.s.settings);
  if (setJ !== S.settingsJ) {
    if (canWrite('settings')) { jobs.push({ settings: JSON.parse(setJ) }); S.settingsJ = setJ; } else deniedSet.add('settings');
  }
  const fresh = store.s.log.filter(e => e.t > S.logT && !e.remote);
  if (fresh.length && S.role !== 'viewer') { jobs.push({ log: fresh.map(e => ({ t: e.t, action: e.action, text: e.text })) }); S.logT = fresh.reduce((a, e) => (e.t > a ? e.t : a), S.logT); }
  if (deniedSet.size) {
    deniedSet.forEach(t => {
      if (t === 'settings') store.s.settings = JSON.parse(S.settingsJ);
      else store.s[t] = [...S.snap[t].values()].map(j => JSON.parse(j));
    });
    const kinds = [...new Set([...deniedSet].map(t => (t === 'settings' ? 'settings' : FIN.has(t) ? 'fin' : 'clin')))].map(k => WHAT[k]).join(' и ');
    toast(`Роль «${ROLES[S.role]}» не может менять ${kinds}. Изменение отменено.`, 'warn');
    setTimeout(() => hooks.changed?.(), 0); // поле ввода на экране тоже должно вернуться к сохранённому
  }
  if (jobs.length) { S.queue.push(...jobs); pump(); }
}
const chunks = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
async function run(job) {
  const cid = S.clinic.id;
  if (job.settings) {
    ok(await S.sb.from('clinics').update({ settings: job.settings, name: (job.settings.clinicName || S.clinic.name).slice(0, 200) }).eq('id', cid));
    return;
  }
  if (job.log) { ok(await S.sb.from('audit_log').insert(job.log.map(e => ({ clinic_id: cid, ...e })))); return; }
  const { t, ups, dels } = job;
  if (dels.length) {
    if (t === 'budget') {
      const byCat = {};
      dels.forEach(r => (byCat[r.category_id] ||= []).push(r.month));
      for (const [c, ms] of Object.entries(byCat)) ok(await S.sb.from(t).delete().eq('clinic_id', cid).eq('category_id', +c).in('month', ms));
    } else for (const part of chunks(dels.map(r => r.id), 200)) ok(await S.sb.from(t).delete().eq('clinic_id', cid).in('id', part));
  }
  for (const part of chunks(ups, 500)) {
    ok(await S.sb.from(t).upsert(part.map(r => ({ clinic_id: cid, ...r })), { onConflict: ['clinic_id', ...keyCols(t)].join(',') }));
    if (ups.length > 500) status(`Сохраняю… ${Math.min(ups.length, ups.indexOf(part[part.length - 1]) + 1)} из ${ups.length}`);
  }
}
async function pump() {
  if (S.busy) return;
  S.busy = true; status();
  while (S.queue.length) {
    try { await run(S.queue[0]); S.queue.shift(); S.fail = 0; status(); }
    catch (e) {
      console.error(e);
      if (denied(e)) { S.queue.shift(); toast('Нет прав на это изменение — показываю данные с сервера.', 'warn'); await reload(true); continue; }
      S.fail++; status(null, e);
      await sleep(Math.min(30000, 1000 * 2 ** S.fail));
    }
  }
  S.busy = false; status();
}
export const pending = () => S.queue.length > 0 || S.busy;
export async function flush(timeout = 20000) { const t0 = Date.now(); while (pending() && Date.now() - t0 < timeout) await sleep(150); return !pending(); }
async function reload(force) {
  if (!S.clinic || (!force && pending())) return;
  await loadClinic(S.clinic.id);
  hooks.changed?.();
}

function status(text, err) {
  const el = $('#syncState');
  if (!el) return;
  const n = S.queue.length;
  if (err) { el.className = 'sync err'; el.textContent = navigator.onLine ? 'Не сохранено — повторяю' : 'Нет интернета — сохраню позже'; el.title = err.message || ''; return; }
  if (text || S.busy || n) { el.className = 'sync busy'; el.textContent = text || 'Сохраняю…'; el.title = ''; return; }
  el.className = 'sync ok'; el.textContent = 'Сохранено'; el.title = 'Все изменения в базе';
}

// ---------- команда ----------
export async function team() {
  const cid = S.clinic.id;
  const [members, invites] = await Promise.all([
    S.sb.from('clinic_members').select('user_id, role, email, created_at').eq('clinic_id', cid).order('created_at').then(ok),
    S.role === 'owner' ? S.sb.from('invites').select('email, role, created_at').eq('clinic_id', cid).order('created_at').then(ok) : Promise.resolve([]),
  ]);
  return { members, invites, me: S.user.id, role: S.role };
}
export async function invite(email, role) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Проверьте почту');
  ok(await S.sb.from('invites').upsert({ clinic_id: S.clinic.id, email, role }, { onConflict: 'clinic_id,email' }));
}
export const revokeInvite = async email => ok(await S.sb.from('invites').delete().eq('clinic_id', S.clinic.id).eq('email', email));
export const setRole = async (uid, role) => ok(await S.sb.from('clinic_members').update({ role }).eq('clinic_id', S.clinic.id).eq('user_id', uid));
export const removeMember = async uid => ok(await S.sb.from('clinic_members').delete().eq('clinic_id', S.clinic.id).eq('user_id', uid));
export const myEmail = () => S.user?.email || '';
export const myRole = () => S.role;
export async function signOut() { await flush(); await S.sb.auth.signOut(); prefSet('clinic', null); location.href = 'app.html'; }
export function switchClinic() { prefSet('clinic', null); location.reload(); }

// ---------- экраны входа ----------
const LOGO = '<svg width="40" height="40" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0d7a6a"/><path d="M5 17h5l2.5-6 4 11 3-8 1.5 3H27" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const RU = {
  'Invalid login credentials': 'Неверная почта или пароль',
  'Email not confirmed': 'Почта не подтверждена — откройте письмо и нажмите ссылку',
  'User already registered': 'Эта почта уже зарегистрирована — войдите или восстановите пароль',
  'Password should be at least 6 characters': 'Пароль слишком короткий',
};
const ruErr = e => { const m = e?.message || String(e); for (const k in RU) if (m.includes(k)) return RU[k]; if (/rate limit|too many/i.test(m)) return 'Слишком много попыток — подождите минуту'; if (/fetch|network/i.test(m)) return 'Нет связи с сервером — проверьте интернет'; return m; };
const box = () => $('#auth');
function screen(html) {
  box().hidden = false;
  box().innerHTML = `<div class="auth-card"><a class="auth-brand" href="./">${LOGO}<b>Пульс клиники</b></a>${html}</div><p class="auth-foot"><a href="./">О программе</a> · <a href="privacy.html">Конфиденциальность</a> · <a href="app.html?demo">Демо без регистрации</a></p>`;
  box().querySelector('input')?.focus();
}
const field = (name, label, type = 'text', attrs = '') => `<label class="f">${label}<input name="${name}" type="${type}" ${attrs}></label>`;
function busy(form, on, label) {
  const b = form.querySelector('button[type=submit]');
  if (on) { b.dataset.l = b.textContent; b.textContent = label || 'Подождите…'; b.disabled = true; } else { b.textContent = b.dataset.l || b.textContent; b.disabled = false; }
}
const errOut = (form, msg) => { const p = form.querySelector('.form-err'); p.textContent = msg || ''; p.hidden = !msg; };
const redirect = () => location.origin + location.pathname.replace(/[^/]*$/, '') + 'app.html';

function showLogin(msg) {
  screen(`<h1>Вход</h1>${msg ? `<p class="auth-note">${msg}</p>` : ''}
    <form id="fLogin" novalidate>${field('email', 'Почта', 'email', 'autocomplete="email" required')}${field('password', 'Пароль', 'password', 'autocomplete="current-password" required')}
    <p class="form-err" hidden></p><button type="submit" class="btn primary wide">Войти</button></form>
    <div class="auth-links"><button class="link" id="toReg">Зарегистрировать клинику</button><button class="link" id="toForgot">Забыли пароль?</button></div>`);
  $('#toReg').onclick = () => showRegister();
  $('#toForgot').onclick = () => showForgot();
  $('#fLogin').onsubmit = async e => {
    e.preventDefault(); const f = e.target, email = f.email.value.trim(), password = f.password.value;
    if (!email || !password) return errOut(f, 'Введите почту и пароль');
    busy(f, true, 'Вхожу…'); errOut(f, '');
    const { error } = await S.sb.auth.signInWithPassword({ email, password });
    busy(f, false);
    if (error) errOut(f, ruErr(error));
  };
}
function showRegister() {
  screen(`<h1>Регистрация</h1><p class="auth-note">Аккаунт для владельца или сотрудника клиники. Сотрудникам сначала нужно приглашение от владельца — регистрируйтесь на ту почту, на которую оно отправлено.</p>
    <form id="fReg" novalidate>${field('email', 'Рабочая почта', 'email', 'autocomplete="email" required')}${field('password', 'Пароль (не меньше 8 символов)', 'password', 'autocomplete="new-password" minlength="8" required')}
    <label class="check"><input type="checkbox" name="agree"> <span>Принимаю <a href="terms.html" target="_blank">условия</a> и <a href="privacy.html" target="_blank">политику конфиденциальности</a></span></label>
    <p class="form-err" hidden></p><button type="submit" class="btn primary wide">Создать аккаунт</button></form>
    <div class="auth-links"><button class="link" id="toLogin">У меня уже есть аккаунт</button></div>`);
  $('#toLogin').onclick = () => showLogin();
  $('#fReg').onsubmit = async e => {
    e.preventDefault(); const f = e.target, email = f.email.value.trim(), password = f.password.value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return errOut(f, 'Проверьте почту');
    if (password.length < 8) return errOut(f, 'Пароль — не меньше 8 символов');
    if (!f.agree.checked) return errOut(f, 'Нужно согласие с условиями');
    busy(f, true, 'Создаю…'); errOut(f, '');
    const { data, error } = await S.sb.auth.signUp({ email, password, options: { emailRedirectTo: redirect() } });
    busy(f, false);
    if (error) return errOut(f, ruErr(error));
    if (!data.session) screen(`<h1>Проверьте почту</h1><p class="auth-note">Мы отправили письмо на <b>${esc(email)}</b>. Откройте его и нажмите ссылку — после этого вы попадёте в программу.</p><p class="muted small">Письма нет 5 минут — проверьте «Спам» или <button class="link" id="again">отправьте ещё раз</button>.</p><div class="auth-links"><button class="link" id="toLogin">Ко входу</button></div>`);
    $('#toLogin') && ($('#toLogin').onclick = () => showLogin());
    $('#again') && ($('#again').onclick = async () => { const { error: er } = await S.sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirect() } }); toast(er ? ruErr(er) : 'Письмо отправлено ещё раз', er ? 'warn' : 'ok'); });
  };
}
function showForgot() {
  screen(`<h1>Восстановить пароль</h1><p class="auth-note">Пришлём ссылку для нового пароля.</p>
    <form id="fForgot" novalidate>${field('email', 'Почта', 'email', 'autocomplete="email" required')}<p class="form-err" hidden></p><button type="submit" class="btn primary wide">Отправить ссылку</button></form>
    <div class="auth-links"><button class="link" id="toLogin">Ко входу</button></div>`);
  $('#toLogin').onclick = () => showLogin();
  $('#fForgot').onsubmit = async e => {
    e.preventDefault(); const f = e.target, email = f.email.value.trim();
    busy(f, true); errOut(f, '');
    const { error } = await S.sb.auth.resetPasswordForEmail(email, { redirectTo: redirect() });
    busy(f, false);
    if (error) return errOut(f, ruErr(error));
    showLogin(`Если почта <b>${esc(email)}</b> зарегистрирована, на неё пришла ссылка для нового пароля.`);
  };
}
function showNewPassword(done) {
  screen(`<h1>Новый пароль</h1><form id="fNew" novalidate>${field('password', 'Новый пароль (не меньше 8 символов)', 'password', 'autocomplete="new-password" required')}<p class="form-err" hidden></p><button type="submit" class="btn primary wide">Сохранить</button></form>`);
  $('#fNew').onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    if (f.password.value.length < 8) return errOut(f, 'Пароль — не меньше 8 символов');
    busy(f, true);
    const { error } = await S.sb.auth.updateUser({ password: f.password.value });
    busy(f, false);
    if (error) return errOut(f, ruErr(error));
    toast('Пароль изменён'); done();
  };
}
async function chooseClinic(start) {
  screen('<p class="auth-note">Загружаю…</p>');
  try { await S.sb.rpc('accept_invites'); } catch (e) { /* приглашений нет */ }
  const mem = ok(await S.sb.from('clinic_members').select('clinic_id, role, clinics(name)').eq('user_id', S.user.id));
  const saved = prefGet('clinic', null);
  const pick = mem.find(m => m.clinic_id === saved) || (mem.length === 1 ? mem[0] : null);
  if (pick) return openClinic(pick.clinic_id, start);
  if (!mem.length) return showCreate(start);
  screen(`<h1>Выберите клинику</h1><div class="clinic-list">${mem.map(m => `<button class="clinic-btn" data-c="${m.clinic_id}"><b>${esc(m.clinics?.name || 'Клиника')}</b><span>${ROLES[m.role]}</span></button>`).join('')}</div>
    <div class="auth-links"><button class="link" id="newC">Создать ещё одну клинику</button><button class="link" id="out">Выйти</button></div>`);
  box().querySelectorAll('[data-c]').forEach(b => b.onclick = () => openClinic(b.dataset.c, start));
  $('#newC').onclick = () => showCreate(start);
  $('#out').onclick = () => signOut();
}
function showCreate(start) {
  screen(`<h1>Ваша клиника</h1><p class="auth-note">Вы вошли как <b>${esc(S.user.email)}</b>. Если вас пригласили в существующую клинику — попросите владельца отправить приглашение именно на эту почту и войдите снова.</p>
    <form id="fClinic" novalidate>${field('name', 'Название клиники', 'text', 'required maxlength="200" placeholder="например, Медицинский центр «Здоровье»"')}
    <fieldset class="choice"><legend>С чего начать</legend>
      <label><input type="radio" name="start" value="empty" checked> <span><b>Чистый учёт</b><small>Базовые статьи и счета уже созданы, остальное внесёте или загрузите из Excel</small></span></label>
      <label><input type="radio" name="start" value="demo"> <span><b>С демо-данными</b><small>Выдуманная клиника за 12 месяцев — посмотреть, как всё работает. Потом очистите в «Настройках»</small></span></label>
    </fieldset><p class="form-err" hidden></p><button type="submit" class="btn primary wide">Создать клинику</button></form>
    <div class="auth-links"><button class="link" id="out">Выйти</button></div>`);
  $('#out').onclick = () => signOut();
  $('#fClinic').onsubmit = async e => {
    e.preventDefault(); const f = e.target, name = f.name.value.trim();
    if (!name) return errOut(f, 'Введите название');
    busy(f, true, 'Создаю…'); errOut(f, '');
    try {
      const cid = ok(await S.sb.rpc('create_clinic', { p_name: name }));
      await loadClinic(cid);
      const s = f.start.value === 'demo' ? demoState() : emptyState();
      s.settings.clinicName = name; s.demo = false; s.log = [];
      store.s = { ...s, nextId: 0 };
      attach();
      store.s.log.unshift({ t: new Date().toISOString(), action: 'Клиника', text: f.start.value === 'demo' ? 'Создана клиника с демо-данными' : 'Создана клиника' });
      busy(f, true, 'Сохраняю данные…');
      persist();
      await flush(120000);
      prefSet('clinic', cid);
      boxHide(); start();
    } catch (er) { busy(f, false); errOut(f, ruErr(er)); }
  };
}
async function openClinic(cid, start) {
  screen('<p class="auth-note">Загружаю данные клиники…</p>');
  try { await loadClinic(cid); }
  catch (e) { console.error(e); prefSet('clinic', null); return showLogin('Не удалось открыть клинику: ' + esc(ruErr(e))); }
  prefSet('clinic', cid);
  attach();
  boxHide(); start();
}
function attach() { hooks.persist = persist; hooks.nid = cloudNid; hooks.role = () => S.role; hooks.roleName = () => ROLES[S.role] || ''; }
const boxHide = () => { box().hidden = true; box().innerHTML = ''; document.querySelector('.app').hidden = false; };

// ---------- запуск ----------
export async function cloudBoot(start) {
  document.querySelector('.app').hidden = true;
  try { await client(); } catch (e) { screen(`<h1>Нет связи</h1><p class="auth-note">${esc(e.message)}</p><button class="btn primary wide" onclick="location.reload()">Повторить</button>`); return; }
  let started = false;
  const go = () => { if (!started) { started = true; start(); } };
  const recovery = /type=recovery/.test(location.hash) || /type=recovery/.test(location.search);
  S.sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'PASSWORD_RECOVERY') { S.user = session?.user; showNewPassword(() => chooseClinic(go)); return; }
    if (ev === 'SIGNED_IN' && !S.user && session) { S.user = session.user; if (!recovery) setTimeout(() => chooseClinic(go)); }
    if (ev === 'SIGNED_OUT') { S.user = null; if (started) location.reload(); }
  });
  const { data } = await S.sb.auth.getSession();
  if (data.session && !S.user) { S.user = data.session.user; if (!recovery) chooseClinic(go); }
  else if (!data.session && !recovery) showLogin();
  // другие сотрудники могли что-то поменять — при возвращении на вкладку подтягиваем свежие данные
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && started && Date.now() - S.loadedAt > 60000) reload(false).catch(() => {}); });
  window.addEventListener('online', () => { if (S.queue.length) pump(); });
  window.addEventListener('beforeunload', e => { if (pending()) { e.preventDefault(); e.returnValue = ''; } });
}
