// SVG-графики. Рисуются по реальной ширине контейнера (подписи не мельчают на телефоне),
// перерисовываются при изменении размера. Подсказки — через атрибут data-tip.
import { esc, compact, monShort } from './util.js';

const specs = new Map();
let seq = 0;

// В разметке вида: chartSlot(spec) → <div data-chart>, после вставки в DOM — drawCharts()
export function chartSlot(spec, cls = '') {
  const id = 'ch' + (++seq);
  specs.set(id, spec);
  return `<div class="chart ${cls}" id="${id}" data-chart></div>`;
}
export function resetCharts() { specs.clear(); }
export function drawCharts(root = document) {
  root.querySelectorAll('[data-chart]').forEach(el => {
    const spec = specs.get(el.id);
    if (!spec) return;
    const w = Math.max(240, el.clientWidth || 600);
    el.innerHTML = spec.kind === 'line' ? lineSvg(spec, w) : columnsSvg(spec, w);
  });
}
let rt;
window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => drawCharts(), 150); });

function niceScale(lo, hi, n = 4) {
  if (hi === lo) { hi = lo + 1; }
  const raw = (hi - lo) / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  const min = Math.floor(lo / step) * step, max = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { min, max, ticks };
}
// Столбец с 4px скруглением на конце данных и прямым основанием
function barPath(x, y0, y1, w) {
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return '';
  const r = Math.min(4, w / 2, h);
  if (y1 < y0) return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
  return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
}
const tipAttr = lines => `data-tip="${esc(lines.join('\n'))}"`;
const legend = items => `<div class="legend">${items.map(i => `<span><i class="key ${i.kind || ''}" style="--c:${i.color}"></i>${esc(i.name)}</span>`).join('')}</div>`;

// spec: {labels:[YYYY-MM], series:[{name,color,values}], line:{name,color,values}, forecast:{labels,values,name,color}, fmt, height}
function columnsSvg(spec, W) {
  const { labels, series = [], line, forecast, fmt = v => compact(v) } = spec;
  const H = spec.height || 240, padL = 48, padR = 10, padT = 12, padB = 26;
  const fl = forecast?.labels || [];
  const all = [...series.flatMap(s => s.values), ...(line?.values || []).filter(v => v != null), ...(forecast?.values || []), 0];
  const sc = niceScale(Math.min(...all), Math.max(...all));
  const n = labels.length + fl.length, pw = W - padL - padR, band = pw / Math.max(1, n);
  const k = series.length || 1;
  const bw = Math.max(3, Math.min(24, (band * 0.72 - (k - 1) * 2) / k));
  const y = v => padT + (H - padT - padB) * (1 - (v - sc.min) / (sc.max - sc.min || 1));
  const y0 = y(0);
  let g = '';
  sc.ticks.forEach(t => {
    g += `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="${t === 0 ? 'axis' : 'grid'}"/>`;
    g += `<text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end" class="tick">${esc(compact(t))}</text>`;
  });
  const every = Math.ceil(n / Math.max(1, Math.floor(pw / 46)));
  const groupW = k * bw + (k - 1) * 2;
  labels.forEach((m, i) => {
    const cx = padL + band * i + band / 2, x0 = cx - groupW / 2;
    const dim = spec.partial?.(m) ? ' fill-opacity=".45"' : '';
    series.forEach((s, j) => { const v = s.values[i] || 0; g += `<path d="${barPath(x0 + j * (bw + 2), y0, y(v), bw)}" fill="${s.color}"${dim}/>`; });
    if (i % every === 0) g += `<text x="${cx}" y="${H - 8}" text-anchor="middle" class="tick">${esc(monShort(m))}</text>`;
    const tip = [spec.tipTitle ? spec.tipTitle(m) : m, ...series.map(s => `${s.name}: ${fmt(s.values[i] || 0)}`), ...(line && line.values[i] != null ? [`${line.name}: ${fmt(line.values[i])}`] : [])];
    g += `<rect x="${padL + band * i}" y="${padT}" width="${band}" height="${H - padT - padB}" class="hit" ${tipAttr(tip)}/>`;
  });
  fl.forEach((m, j) => {
    const i = labels.length + j, cx = padL + band * i + band / 2, v = forecast.values[j];
    g += `<path d="${barPath(cx - bw / 2, y0, y(v), bw)}" fill="${forecast.color}" fill-opacity=".28"/>`;
    g += `<text x="${cx}" y="${H - 8}" text-anchor="middle" class="tick">${esc(monShort(m))}*</text>`;
    g += `<rect x="${padL + band * i}" y="${padT}" width="${band}" height="${H - padT - padB}" class="hit" ${tipAttr([m + ' — прогноз', `${forecast.name}: ${fmt(v)}`])}/>`;
  });
  if (line) {
    const pts = labels.map((m, i) => [padL + band * i + band / 2, line.values[i] == null ? null : y(line.values[i])]).filter(p => p[1] != null);
    g += `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('')}" fill="none" stroke="${line.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const lp = pts[pts.length - 1];
    if (lp) g += `<circle cx="${lp[0]}" cy="${lp[1]}" r="4" fill="${line.color}" class="ring"/>`;
  }
  const leg = [...series.map(s => ({ name: s.name, color: s.color })), ...(line ? [{ name: line.name, color: line.color, kind: 'line' }] : []), ...(forecast ? [{ name: forecast.name + ' (прогноз)', color: forecast.color, kind: 'wash' }] : [])];
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(spec.label || 'График')}">${g}</svg>${leg.length > 1 ? legend(leg) : ''}`;
}

// spec: {labels, series:[{name,color,values, from?:index с которого линия пунктирная}], fmt, height}
function lineSvg(spec, W) {
  const { labels, series, fmt = v => compact(v) } = spec;
  const H = spec.height || 220, padL = 48, padR = 12, padT = 12, padB = 26;
  const all = [...series.flatMap(s => s.values.filter(v => v != null)), 0];
  const sc = niceScale(Math.min(...all), Math.max(...all));
  const n = labels.length, pw = W - padL - padR, step = n > 1 ? pw / (n - 1) : 0;
  const x = i => padL + step * i, y = v => padT + (H - padT - padB) * (1 - (v - sc.min) / (sc.max - sc.min || 1));
  let g = '';
  sc.ticks.forEach(t => {
    g += `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="${t === 0 ? 'axis' : 'grid'}"/>`;
    g += `<text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end" class="tick">${esc(compact(t))}</text>`;
  });
  const every = Math.ceil(n / Math.max(1, Math.floor(pw / 46)));
  labels.forEach((m, i) => { if (i % every === 0 || i === n - 1) g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="tick">${esc(monShort(m))}${spec.mark?.(m) || ''}</text>`; });
  series.forEach(s => {
    const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)]));
    const solid = pts.filter((p, i) => p && (s.from == null || i <= s.from));
    const dash = s.from != null ? pts.filter((p, i) => p && i >= s.from) : [];
    const d = arr => arr.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
    if (solid.length > 1 && s.area) g += `<path d="${d(solid)}L${solid[solid.length - 1][0]},${y(Math.max(sc.min, 0))}L${solid[0][0]},${y(Math.max(sc.min, 0))}Z" fill="${s.color}" fill-opacity=".1"/>`;
    if (solid.length > 1) g += `<path d="${d(solid)}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (dash.length > 1) g += `<path d="${d(dash)}" fill="none" stroke="${s.color}" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round"/>`;
    const lp = [...pts].reverse().find(Boolean);
    if (lp) g += `<circle cx="${lp[0]}" cy="${lp[1]}" r="4" fill="${s.color}" class="ring"/>`;
  });
  labels.forEach((m, i) => {
    const tip = [spec.tipTitle ? spec.tipTitle(m, i) : m, ...series.filter(s => s.values[i] != null).map(s => `${s.name}: ${fmt(s.values[i])}`)];
    g += `<rect x="${x(i) - (step || pw) / 2}" y="${padT}" width="${step || pw}" height="${H - padT - padB}" class="hit" ${tipAttr(tip)}/>`;
  });
  const leg = series.length > 1 || spec.legendAlways ? legend(spec.legend || series.map(s => ({ name: s.name, color: s.color, kind: 'line' }))) : '';
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(spec.label || 'График')}">${g}</svg>${leg}`;
}

// Маленькая линия тренда в строке таблицы (без осей), конец выделен точкой
export function sparkline(values, color = 'var(--s1)', w = 84, h = 22) {
  const v = values.map(x => +x || 0);
  if (v.length < 2) return '';
  const lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
  const pts = v.map((x, i) => [2 + (w - 6) * i / (v.length - 1), 3 + (h - 6) * (1 - (x - lo) / r)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
  const lp = pts[pts.length - 1];
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="${lp[0]}" cy="${lp[1]}" r="2.5" fill="${color}"/></svg>`;
}

// Полоса-индикатор загрузки: цвет — состояние, рядом всегда число
export function meter(u, target = 0.85, low = 0.6) {
  if (u == null || !isFinite(u)) return '<span class="muted">—</span>';
  const st = u < low ? 'serious' : u < target - 0.1 ? 'warn' : 'good';
  return `<span class="meter ${st}" title="Цель ${Math.round(target * 100)}%"><span class="meter-track"><i style="width:${Math.min(100, u * 100).toFixed(1)}%"></i><b style="left:${Math.min(100, target * 100)}%"></b></span><span class="meter-val">${Math.round(u * 100)}%</span></span>`;
}

// Горизонтальные полосы (структура, воронка)
export function hbars(items, { fmt = v => compact(v), color = 'var(--s1)', max } = {}) {
  const m = max ?? Math.max(1, ...items.map(i => Math.abs(i.value)));
  return `<div class="hbars">${items.map(i => `<div class="hbar" ${i.tip ? tipAttr([i.tip]) : ''}>
    <span class="hbar-label">${esc(i.label)}</span>
    <span class="hbar-track"><i style="width:${Math.max(0.5, Math.abs(i.value) / m * 100).toFixed(1)}%;background:${i.color || color}"></i></span>
    <span class="hbar-val">${esc(i.text ?? fmt(i.value))}</span></div>`).join('')}</div>`;
}

// Ячейка тепловой карты загрузки: одна гамма (синяя), чем темнее — тем выше загрузка
export function heatCell(u) {
  if (u == null) return '<td class="heat empty">—</td>';
  const p = Math.round(Math.max(0, Math.min(1, u)) * 100);
  return `<td class="heat${p >= 62 ? ' dark' : ''}" style="--p:${Math.round(8 + p * 0.82)}%" data-tip="${p}%">${p}</td>`;
}
