// Общие хелперы: форматирование, даты, разбор чисел и CSV, всплывающие окна.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- числа и деньги ----------
const fmtCur = { c: '₸' };
export function setCurrency(c) { fmtCur.c = c || ''; }
export const cur = () => fmtCur.c;

export function num(n, d = 0) {
  const v = Number(n) || 0;
  return v.toLocaleString('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: d });
}
export const money = n => num(Math.round(Number(n) || 0));
export const moneyC = n => money(n) + (fmtCur.c ? ' ' + fmtCur.c : '');
export function compact(n) {
  const v = Number(n) || 0, a = Math.abs(v);
  if (a >= 1e9) return num(v / 1e9, 1) + ' млрд';
  if (a >= 1e6) return num(v / 1e6, a >= 1e8 ? 0 : 1) + ' млн';
  if (a >= 1e4) return num(v / 1e3, 0) + ' тыс';
  return num(v, 0);
}
export const compactC = n => compact(n) + (fmtCur.c ? ' ' + fmtCur.c : '');
export const pct = (x, d = 0) => (x == null || !isFinite(x)) ? '—' : num(x * 100, d) + '%';
export const signed = (n, f = money) => (n > 0 ? '+' : n < 0 ? '−' : '') + f(Math.abs(n));
export const div = (a, b) => (b ? a / b : 0);
export const sum = (arr, f = x => x) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);

// «1 234 567,89», «1,234.5», «−500» → число
export function parseNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  let s = String(v ?? '').trim().replace(/[\s  ']/g, '').replace(/[₸₽$€]|руб\.?|тг|kzt/gi, '').replace(/^−/, '-');
  if (!s) return NaN;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc > -1) s = s.replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}

// ---------- даты ----------
const pad = n => String(n).padStart(2, '0');
export const isoOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const today = () => isoOf(new Date());
export const ym = iso => String(iso || '').slice(0, 7);
export const curMonth = () => ym(today());
export function addMonths(m, n) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1);
}
export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return isoOf(new Date(y, m - 1, d + n));
}
export function monthsBetween(a, b) {
  const out = [];
  if (!a || !b || a > b) return out;
  for (let m = a; m <= b; m = addMonths(m, 1)) out.push(m);
  return out;
}
export const daysInMonth = m => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };
export const monthEnd = m => m + '-' + pad(daysInMonth(m));
export function daysDiff(a, b) { // b − a в днях
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
}
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MON_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const monShort = m => MON_SHORT[+m.slice(5, 7) - 1];
export const monLabel = m => MON_SHORT[+m.slice(5, 7) - 1] + ' ' + m.slice(2, 4);
export const monLong = m => MONTHS[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);
export const fmtDate = iso => iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(2, 4) : '';
export const isPartialMonth = m => m === curMonth() && +today().slice(8, 10) < daysInMonth(m);

// «31.12.2025», «31.12.25», «2025-12-31», серийная дата Excel → ISO
export function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return isoOf(v);
  if (typeof v === 'number' || /^\d{5}(\.\d+)?$/.test(String(v).trim())) {
    const n = Number(v);
    if (n > 20000 && n < 80000) return isoOf(new Date(Math.round((n - 25569) * 864e5) + new Date().getTimezoneOffset() * 6e4));
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + pad(m[2]) + '-' + pad(m[1]); }
  m = s.match(/^(\d{1,2})[./](\d{4})$/); // 10.2026 — месяц
  if (m) return m[2] + '-' + pad(m[1]) + '-01';
  m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return m[1] + '-' + pad(m[2]) + '-01';
  return null;
}

// ---------- CSV ----------
export function detectDelimiter(text) {
  const line = text.split(/\r?\n/).find(l => l.trim()) || '';
  const counts = [';', '\t', ','].map(d => [d, line.split(d).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 1 ? counts[0][0] : ';';
}
export function parseCSV(text, delim = detectDelimiter(text)) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); rows.push(row); row = []; f = '';
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}
export const toCSV = rows => rows.map(r => r.map(v => {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}).join(';')).join('\n');

export function hash(str) { // FNV-1a, для защиты от дублей при импорте
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

export const norm = s => String(s ?? '').trim().toLowerCase().replace(/ё/g, 'е').replace(/[«»"']/g, '').replace(/\s+/g, ' ');

// ---------- хранилище настроек интерфейса (не данных) ----------
export function prefGet(k, def) { try { const v = localStorage.getItem('clinicbi:pref:' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } }
export function prefSet(k, v) { try { localStorage.setItem('clinicbi:pref:' + k, JSON.stringify(v)); } catch (e) { /* приватный режим */ } }

// ---------- уведомления ----------
export function toast(msg, kind = 'ok') {
  const box = $('#toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3700);
}

// ---------- модальное окно ----------
// actions: [{label, kind:'primary'|'ghost'|'danger', confirm:true, onClick(dlg) → false чтобы не закрывать}]
export function openModal({ title, body, actions = [], wide = false, onOpen }) {
  const dlg = $('#modal');
  dlg.className = wide ? 'wide' : '';
  dlg.innerHTML = `<form method="dialog" class="modal-inner" novalidate>
    <header class="modal-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Закрыть">✕</button></header>
    <div class="modal-body">${body}</div>
    <footer class="modal-foot">${actions.map((a, i) =>
      `<button type="button" class="btn ${a.kind || 'ghost'}" data-act="${i}" ${a.confirm ? 'data-confirm' : ''}>${esc(a.label)}</button>`).join('')}</footer>
  </form>`;
  const close = () => { if (dlg.open) dlg.close(); };
  dlg.querySelector('[data-close]').onclick = close;
  dlg.querySelectorAll('[data-act]').forEach(b => {
    b.onclick = () => {
      if (b.hasAttribute('data-confirm') && !b.classList.contains('armed')) { arm(b); return; }
      const r = actions[+b.dataset.act].onClick?.(dlg);
      if (r !== false) close();
    };
  });
  dlg.querySelector('form').addEventListener('submit', e => e.preventDefault());
  if (!dlg.open) dlg.showModal();
  onOpen?.(dlg);
  const first = dlg.querySelector('.modal-body input:not([type=hidden]):not([type=checkbox]), .modal-body select, .modal-body textarea');
  if (first && matchMedia('(pointer:fine)').matches) first.focus();
  return close;
}

// Двухшаговое подтверждение без confirm(): первый клик «взводит» кнопку.
export function arm(btn) {
  const txt = btn.textContent;
  btn.classList.add('armed');
  btn.textContent = btn.dataset.confirmText || 'Точно? Нажмите ещё раз';
  setTimeout(() => { if (btn.isConnected) { btn.classList.remove('armed'); btn.textContent = txt; } }, 3500);
}

export async function copyText(text, fallbackEl) {
  try { await navigator.clipboard.writeText(text); toast('Скопировано'); return true; }
  catch (e) {
    if (fallbackEl) { fallbackEl.focus(); fallbackEl.select?.(); }
    toast('Не удалось скопировать автоматически — текст выделен, нажмите Ctrl+C', 'warn');
    return false;
  }
}

export const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// Значения полей формы по name → объект
export function formData(root) {
  const o = {};
  root.querySelectorAll('[name]').forEach(el => {
    if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else if (el.type === 'checkbox') o[el.name] = el.checked;
    else o[el.name] = el.value;
  });
  return o;
}

export const opt = (value, label, sel) => `<option value="${esc(value)}"${String(value) === String(sel ?? '') ? ' selected' : ''}>${esc(label)}</option>`;
