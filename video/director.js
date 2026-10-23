// Режиссёрский слой ролика: встраивается в страницу программы и по времени t выставляет кадр.
// Всё вычисляется от t (никаких CSS-анимаций), поэтому кадры детерминированы и рендерятся покадрово.
// window.__vo.setup(timeline) — один раз; await window.__vo.seek(t) → { dirty } — на каждый кадр.
(() => {
  // Безопасная зона кадра: ниже — субтитры и плашка раздела, туда ничего важного не ставим
  const SAFE_BOTTOM = 128, SAFE_Y = innerHeight - SAFE_BOTTOM;
  const css = `
  #vo-root{position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-family:"Golos Text",system-ui,sans-serif;color:#fff}
  #vo-spot{position:fixed;border-radius:12px;box-shadow:0 0 0 3px #5fd0bb,0 0 0 9px rgba(95,208,187,.22),0 0 0 4000px rgba(5,16,14,.5);opacity:0}
  #vo-sub{position:fixed;left:50%;bottom:34px;transform:translateX(-50%);max-width:960px;width:max-content;padding:11px 20px 12px;border-radius:12px;
    background:rgba(8,22,19,.88);font-size:22px;line-height:1.38;font-weight:500;text-align:center;text-wrap:balance;box-shadow:0 8px 28px rgba(0,0,0,.3)}
  #vo-sub:empty{display:none}
  #vo-chap{position:fixed;left:22px;bottom:30px;display:flex;align-items:center;gap:10px;padding:8px 14px 8px 10px;border-radius:999px;background:rgba(8,22,19,.88);font-size:14px;font-weight:600;letter-spacing:.01em}
  #vo-chap i{width:8px;height:8px;border-radius:50%;background:#5fd0bb;display:block}
  #vo-chap:empty{display:none}
  #vo-prog{position:fixed;left:0;bottom:0;height:4px;background:#5fd0bb}
  #vo-cursor{position:fixed;left:0;top:0;width:28px;height:28px;opacity:0;filter:drop-shadow(0 3px 6px rgba(0,0,0,.35))}
  #vo-ripple{position:fixed;width:56px;height:56px;border-radius:50%;border:3px solid #5fd0bb;opacity:0}
  #vo-card{position:fixed;right:40px;top:96px;width:520px;padding:24px 26px;border-radius:18px;background:#0f2b27;color:#e9f3f1;box-shadow:0 24px 60px rgba(0,0,0,.4);opacity:0}
  #vo-card h3{margin:0 0 14px;font:600 15px/1.2 "Golos Text",system-ui;letter-spacing:.08em;text-transform:uppercase;color:#5fd0bb}
  #vo-card .vc-f{font:600 23px/1.4 "Golos Text",system-ui;margin:0 0 12px}
  #vo-card .vc-f b{color:#5fd0bb;font-weight:600}
  #vo-card .vc-ex{margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12);font-size:17px;line-height:1.5;color:#b9d2cc}
  #vo-card .vc-ex b{color:#fff}
  #vo-slide{position:fixed;inset:0;background:#0d2420;opacity:0;overflow:hidden}
  #vo-fade{position:fixed;inset:0;background:#0b1f1c;opacity:0}
  .vs{position:absolute;inset:0;padding:84px 110px;display:flex;flex-direction:column;justify-content:center;color:#e9f3f1}
  .vs .eyebrow{font:600 16px/1 "Golos Text";letter-spacing:.14em;text-transform:uppercase;color:#5fd0bb;margin-bottom:22px}
  .vs h1{font:600 54px/1.12 "Unbounded","Golos Text",sans-serif;margin:0 0 26px;letter-spacing:-.01em;color:#fff;max-width:1000px}
  .vs h2{font:600 36px/1.2 "Unbounded","Golos Text",sans-serif;margin:0 0 30px;color:#fff;max-width:1100px}
  .vs p.lead{font-size:24px;line-height:1.5;color:#b9d2cc;max-width:900px;margin:0}
  .vs .row{display:flex;gap:22px;align-items:stretch}
  .vs .box{flex:1;border-radius:18px;background:#14352f;padding:24px 26px;border:1px solid rgba(95,208,187,.18)}
  .vs .box h4{margin:0 0 10px;font:600 21px/1.25 "Golos Text";color:#fff}
  .vs .box p{margin:0;font-size:18px;line-height:1.5;color:#b9d2cc}
  .vs .box.accent{background:#5fd0bb;color:#06201b;border-color:#5fd0bb}
  .vs .box.accent h4,.vs .box.accent p{color:#06201b}
  .vs .q{font:500 27px/1.35 "Golos Text";color:#fff;margin:0 0 14px;display:flex;gap:16px;align-items:baseline}
  .vs .q span{color:#5fd0bb;font-weight:700}
  .vs table{border-collapse:separate;border-spacing:0 10px;font-size:22px;width:100%;max-width:1180px}
  .vs td,.vs th{padding:16px 22px;text-align:left;border:0;vertical-align:middle}
  .vs thead th{position:static;background:transparent}
  .vs th{font:600 15px "Golos Text";letter-spacing:.1em;text-transform:uppercase;color:#7fa69e;padding-bottom:4px}
  .vs tbody td{background:#14352f}
  .vs tbody td:first-child{border-radius:12px 0 0 12px;font-weight:600;color:#fff}
  .vs tbody td:last-child{border-radius:0 12px 12px 0}
  .vs .yes{color:#5fd0bb;font-weight:700}
  .vs .no{color:#6b8a83}
  .vs .tl{position:relative;height:300px;margin-top:10px;max-width:1220px}
  .vs .tl .axis{position:absolute;left:0;right:0;top:150px;height:4px;background:#2b4f48;border-radius:2px}
  .vs .tl .mon{position:absolute;top:168px;font:600 18px "Golos Text";color:#7fa69e;transform:translateX(-50%)}
  .vs .tl .ev{position:absolute;transform:translateX(-50%);width:300px;text-align:center}
  .vs .tl .ev .dot{width:22px;height:22px;border-radius:50%;background:#5fd0bb;margin:0 auto;box-shadow:0 0 0 6px rgba(95,208,187,.2)}
  .vs .tl .ev .lbl{font-size:19px;line-height:1.4;color:#e9f3f1}
  .vs .tl .ev .lbl b{display:block;font-size:24px;color:#fff}
  .vs .tl .band{position:absolute;top:139px;height:26px;border-radius:13px;background:repeating-linear-gradient(135deg,rgba(250,178,25,.55) 0 10px,rgba(250,178,25,.25) 10px 20px)}
  .vs .tl .bandlbl{position:absolute;top:96px;transform:translateX(-50%);font:600 19px "Golos Text";color:#fab219;white-space:nowrap}
  .vs .vp{display:inline-block;padding:7px 16px;border-radius:999px;background:#14352f;border:1px solid rgba(95,208,187,.3);font-size:18px;margin:0 10px 10px 0;color:#e9f3f1}
  .vs .logo{display:flex;align-items:center;gap:22px;margin-bottom:34px}
  .vs .logo svg rect{fill:#5fd0bb}.vs .logo svg path{fill:none;stroke:#0d2420;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
  .vs .logo b{font:600 30px "Unbounded";color:#fff}
  .vs .pulse{position:absolute;left:0;right:0;bottom:120px;height:160px;opacity:.5}
  .vs .pulse path{fill:none;stroke:#5fd0bb;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
  /* в ролике окно стоит над субтитрами, а у страницы есть запас прокрутки, чтобы низ можно было поднять в кадр */
  dialog#modal{margin:14px auto auto!important;max-height:${SAFE_Y - 22}px!important}
  dialog#modal .modal-inner{max-height:${SAFE_Y - 24}px!important}
  .main{padding-bottom:${SAFE_BOTTOM + 40}px}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'vo-root';
  root.innerHTML = `<div id="vo-spot"></div><div id="vo-slide"></div><div id="vo-card"></div>
    <svg id="vo-cursor" viewBox="0 0 28 28"><path d="M4 2 L4 22 L9.5 16.8 L13.4 25.5 L17 24 L13.2 15.6 L21 15.2 Z" fill="#fff" stroke="#0b1f1c" stroke-width="1.6" stroke-linejoin="round"/></svg>
    <div id="vo-ripple"></div><div id="vo-chap"></div><div id="vo-sub"></div><div id="vo-prog"></div><div id="vo-fade"></div>`;
  document.body.appendChild(root);
  const $ = id => root.querySelector('#' + id);
  const ease = x => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const lerp = (a, b, k) => a + (b - a) * k;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  let TL = null, cur = { scene: -1 }, done = new Set(), lastSig = '', warn = [];
  const S = { spot: null, spotFrom: null, spotT: -9, hlSel: null, scrolls: [], lastFrame: -9, card: null, cardT: -9, cardOff: -9, hover: null };
  const framed = new Set();

  function targetEls(sel, opts = {}) {
    return [...document.querySelectorAll(sel)].map(el => {
      if (opts.parent || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return el.closest('.f, .seg, label') || el;
      return el;
    }).filter(el => el.getClientRects().length && !el.closest('[hidden]'));
  }
  const ovf = v => v !== 'visible';
  // Прямоугольник элемента, обрезанный контейнерами с overflow (кроме stop и выше) — то, что реально видно
  function clipRect(el, stop) {
    const b = el.getBoundingClientRect(), r = { x1: b.left, y1: b.top, x2: b.right, y2: b.bottom };
    for (let p = el.parentElement; p && p !== stop && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (!ovf(cs.overflowX) && !ovf(cs.overflowY)) continue;
      const q = p.getBoundingClientRect();
      if (ovf(cs.overflowX)) { r.x1 = Math.max(r.x1, q.left); r.x2 = Math.min(r.x2, q.right); }
      if (ovf(cs.overflowY)) { r.y1 = Math.max(r.y1, q.top); r.y2 = Math.min(r.y2, q.bottom); }
    }
    return r;
  }
  function union(rs) {
    const u = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
    rs.forEach(r => { u.x1 = Math.min(u.x1, r.x1); u.y1 = Math.min(u.y1, r.y1); u.x2 = Math.max(u.x2, r.x2); u.y2 = Math.max(u.y2, r.y2); });
    return u;
  }
  function targetRect(sel, opts = {}) {
    const els = targetEls(sel, opts);
    if (!els.length) return null;
    const u = union(els.map(el => clipRect(el)));
    // рамка не выходит за кадр: не заходит под липкую шапку и под субтитры; длинное обрезаем по последней целой строке
    u.x1 = Math.max(u.x1, 6); u.x2 = Math.min(u.x2, innerWidth - 6);
    if (els.every(pinned)) { u.y1 = Math.max(u.y1, 6); u.y2 = Math.min(u.y2, innerHeight - 6); }
    else {
      const sc = scroller(els[0], 'y'), band = safeBand(sc, u), lim = band.b + 4;
      u.y1 = Math.max(u.y1, band.t - 4);
      if (u.y2 > lim) {
        const rows = els.flatMap(el => [el, ...el.querySelectorAll('tr, li, .tile, .f')]).map(e => e.getBoundingClientRect().bottom).filter(b => b <= lim && b > u.y1 + 30);
        u.y2 = rows.length ? Math.max(...rows) : lim;
      }
    }
    if (u.x2 <= u.x1 || u.y2 <= u.y1) return null;
    const pad = 8;
    return { x: u.x1 - pad, y: u.y1 - pad, w: u.x2 - u.x1 + pad * 2, h: u.y2 - u.y1 + pad * 2 };
  }
  // Контейнер, который прокручивается по оси (null — окно)
  function scroller(el, axis) {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p), o = axis === 'y' ? cs.overflowY : cs.overflowX;
      if (cs.position === 'sticky' || cs.position === 'fixed') continue; // боковую панель не листаем
      if (/(auto|scroll)/.test(o) && (axis === 'y' ? p.scrollHeight > p.clientHeight + 1 : p.scrollWidth > p.clientWidth + 1)) return p;
    }
    return null;
  }
  function overflowParent(el) {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (ovf(cs.overflowX) || ovf(cs.overflowY)) return p; }
    return null;
  }
  // Липкая шапка, боковая панель, окно поверх страницы — прокрутка их контейнера их не двигает
  function pinned(el) {
    const sc = scroller(el, 'y');
    for (let p = el; p && p !== sc && p !== document.body; p = p.parentElement) {
      const ps = getComputedStyle(p).position;
      if (ps === 'fixed' || (ps === 'sticky' && overflowParent(p) === sc)) return true;
    }
    return false;
  }
  function safeBand(sc, r) {
    if (sc) { const q = sc.getBoundingClientRect(); return { t: Math.max(q.top, 0) + 6, b: Math.min(q.bottom, SAFE_Y) - 6 }; }
    let t = 8;
    const top = !document.querySelector('dialog[open]') && document.querySelector('.top');
    if (top) { const q = top.getBoundingClientRect(); if (r.x2 > q.left && r.x1 < q.right) t = q.bottom + 10; }
    return { t, b: SAFE_Y - 8 };
  }
  // Куда прокрутить, чтобы must целиком оказался в безопасной зоне (prefer — выровнять верх этого элемента)
  function planY(sel, opts, preferSel) {
    const els = targetEls(sel, opts);
    if (!els.length || els.every(pinned)) return null;
    const sc = scroller(els[0], 'y');
    const r = union(els.map(el => clipRect(el, sc)));
    const band = safeBand(sc, r), H = band.b - band.t, h = r.y2 - r.y1;
    const cur = sc ? sc.scrollTop : scrollY;
    const max = sc ? sc.scrollHeight - sc.clientHeight : document.documentElement.scrollHeight - innerHeight;
    let dy = 0;
    const pe = preferSel && targetEls(preferSel)[0];
    if (pe && scroller(pe, 'y') === sc) dy = pe.getBoundingClientRect().top - band.t - 4;
    const m = Math.max(0, Math.min(48, (H - h) / 2));
    if (h > H) dy = r.y1 - band.t - 4;
    else if (r.y1 - dy < band.t) dy = r.y1 - band.t - m;
    else if (r.y2 - dy > band.b) dy = r.y2 - band.b + m;
    const to = Math.round(Math.max(0, Math.min(max, cur + dy)));
    return Math.abs(to - cur) > 3 ? { el: sc, axis: 'y', from: cur, to } : null;
  }
  // По горизонтали — только внутри широких таблиц: показать нужные столбцы
  function planX(sel, opts) {
    const els = targetEls(sel, opts);
    if (!els.length) return null;
    const sc = scroller(els[0], 'x');
    if (!sc) return null;
    const q = sc.getBoundingClientRect(), r = union(els.map(el => clipRect(el, sc)));
    const stick = sc.querySelector('.sticky-first tr > :first-child');
    const sw = stick && !els.some(el => el.contains(stick) || el === stick) ? stick.getBoundingClientRect().width : 0;
    const left = q.left + sw, w = r.x2 - r.x1;
    let dx = 0;
    if (w > q.right - left) dx = -sc.scrollLeft;
    else if (r.x2 > q.right - 8) dx = r.x2 - q.right + 32;
    else if (r.x1 < left + 8) dx = r.x1 - left - 32;
    const to = Math.round(Math.max(0, Math.min(sc.scrollWidth - sc.clientWidth, sc.scrollLeft + dx)));
    return Math.abs(to - sc.scrollLeft) > 3 ? { el: sc, axis: 'x', from: sc.scrollLeft, to } : null;
  }
  function frame(sel, opts, t, preferSel) {
    if (window.__vo.noCamera || !sel) return;
    const moves = [planX(sel, opts), planY(sel, opts, preferSel)].filter(Boolean);
    moves.forEach(mv => {
      S.scrolls = S.scrolls.filter(o => !(o.el === mv.el && o.axis === mv.axis));
      S.scrolls.push({ ...mv, t0: t, d: Math.min(1.1, 0.55 + Math.abs(mv.to - mv.from) / 1800) });
    });
    S.lastFrame = t;
  }
  function applyScrolls(t) {
    if (!S.scrolls.length) return false;
    S.scrolls = S.scrolls.filter(o => {
      const k = ease((t - o.t0) / o.d), v = Math.round(lerp(o.from, o.to, k));
      if (o.axis === 'y') { if (o.el) o.el.scrollTop = v; else window.scrollTo(scrollX, v); }
      else o.el.scrollLeft = v;
      return k < 1;
    });
    return true;
  }
  // Для проверки кадра: какая доля подсветки видна в безопасной зоне
  function probe() {
    const out = { sel: S.hlSel, settled: !S.scrolls.length };
    const cu = $('vo-cursor');
    if (+cu.style.opacity > 0.9) { const m = cu.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/); if (m) out.cursor = { x: +m[1] + 4, y: +m[2] + 2 }; }
    if (!S.hlSel) return out;
    const els = targetEls(S.hlSel, S.hlOpts);
    if (!els.length) { out.missing = true; return out; }
    const raw = union(els.map(el => { const b = el.getBoundingClientRect(); return { x1: b.left, y1: b.top, x2: b.right, y2: b.bottom }; }));
    const sx = scroller(els[0], 'x'), wide = sx && raw.x2 - raw.x1 > sx.clientWidth;
    const vis = union(els.map(el => clipRect(el)));
    const band = pinned(els[0]) ? { t: 0, b: innerHeight - 8 } : safeBand(null, raw), dlg = document.querySelector('dialog[open] .modal-body');
    const bt = dlg && els[0].closest('dialog') ? Math.max(band.t, dlg.getBoundingClientRect().top) : band.t;
    const vy = Math.max(0, Math.min(vis.y2, band.b + 8) - Math.max(vis.y1, pinned(els[0]) ? 0 : bt - 10));
    const mb = dlg && els[0].closest('dialog') && dlg.getBoundingClientRect();
    out.modal = mb ? { sh: dlg.scrollHeight, ch: dlg.clientHeight, top: Math.round(mb.top), bottom: Math.round(mb.bottom), st: dlg.scrollTop } : null;
    const vx = Math.max(0, Math.min(vis.x2, innerWidth) - Math.max(vis.x1, 0));
    out.h = Math.round(raw.y2 - raw.y1); out.y1 = Math.round(raw.y1); out.y2 = Math.round(raw.y2); out.bandT = Math.round(bt); out.bandB = Math.round(band.b);
    out.fy = (raw.y2 - raw.y1) ? vy / (raw.y2 - raw.y1) : 1;
    out.fx = wide ? 1 : (raw.x2 - raw.x1) ? vx / (raw.x2 - raw.x1) : 1;
    out.tall = out.h > band.b - bt + 12 && Math.abs(Math.max(raw.y1, bt) - bt) > 40;
    out.clipped = out.h > band.b - bt + 12;
    const card = $('vo-card');
    if (+card.style.opacity > 0.5) {
      const c = card.getBoundingClientRect();
      const ix = Math.max(0, Math.min(c.right, vis.x2) - Math.max(c.left, vis.x1)), iy = Math.max(0, Math.min(c.bottom, vis.y2) - Math.max(c.top, vis.y1));
      out.underCard = ix * iy / Math.max(1, (vis.x2 - vis.x1) * (vis.y2 - vis.y1));
    }
    return out;
  }
  const center = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  function fire(el, type, x, y) { el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerType: 'mouse' })); }

  async function runAction(a, t) {
    const q = s => document.querySelector(s);
    if (a.close) { document.querySelector('dialog[open]')?.close(); }
    if (a.tab) { const r = q(`input[name="${a.tab[0]}"][value="${a.tab[1]}"]`); if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); await sleep(80); } else warn.push('tab ' + a.tab); }
    if (a.radio) { const r = q(`dialog input[name="${a.radio[0]}"][value="${a.radio[1]}"]`); if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); await sleep(30); } else warn.push('radio ' + a.radio); }
    if (a.select) { const s = q(`dialog select[name="${a.select[0]}"]`); if (s) { s.value = a.select[1]; s.dispatchEvent(new Event('change', { bubbles: true })); await sleep(30); } else warn.push('select ' + a.select); }
    if (a.set) { const s = q(a.set[0]); if (s) { s.value = a.set[1]; s.dispatchEvent(new Event('change', { bubbles: true })); await sleep(120); } else warn.push('set ' + a.set[0]); }
    if (a.file) {
      const inp = q('#impFile');
      if (inp) { const dt = new DataTransfer(); dt.items.add(new File([TL.files[a.file]], 'выписка_октябрь.csv', { type: 'text/csv' })); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); await sleep(250); }
      else warn.push('file input');
    }
    if (a.click) {
      const el = q(a.click);
      if (el) { el.click(); await sleep(120); } else warn.push('click ' + a.click);
    }
    if (a.hover) { const r = targetRect(a.hover); const el = q(a.hover); if (r && el) { const c = center(r); fire(el, 'pointermove', c.x, c.y); S.hover = { sel: a.hover }; } else warn.push('hover ' + a.hover); }
    if (a.unhover) { document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 2, clientY: 2 })); fire(document.body, 'pointermove', 2, 2); S.hover = null; }
    if (a.off) { S.hlSel = null; if (S.card) { S.cardOff = t; } }
    if (a.card) { S.card = a.card; S.cardT = t; S.cardOff = -9; $('vo-card').innerHTML = TL.cards[a.card] || ''; }
    if (a.hl) { S.hlSel = a.hl; S.hlOpts = { parent: a.parent }; S.spotT = t; S.spotFrom = S.spot; }
    if (a.hl || a.scroll) frame(a.hl || a.scroll, { parent: a.parent }, t, a.scroll);
    if (a.hlAfter) { S.hlSel = null; S.pendingHl = { sel: a.hlAfter, at: t + 0.6 }; }
  }

  function cursorFor(scene, t) {
    // Курсор появляется за 0.8 с до click/hover, подъезжает к цели и «нажимает»
    for (const a of scene.acts) {
      if (!(a.click || a.hover)) continue;
      const t0 = a.t - 0.8, t1 = a.t + (a.hover ? 2.2 : 0.9);
      if (t >= t0 && t <= t1) return { a, k: (t - t0) / 0.8, after: t - a.t };
    }
    return null;
  }

  async function enterScene(i, t) {
    const sc = TL.scenes[i];
    cur = { scene: i };
    S.hlSel = null; S.spot = null; S.card = null; S.cardOff = -9; S.scrolls = []; S.pendingHl = null; S.hover = null;
    $('vo-card').style.opacity = 0;
    $('vo-slide').innerHTML = sc.kind === 'slide' ? TL.slides[sc.slide] || '' : '';
    if (sc.kind === 'app') {
      const prev = TL.scenes[i - 1];
      if (!prev || prev.view !== sc.view || prev.kind !== 'app' || sc.reset) {
        document.querySelector('dialog[open]')?.close();
        if (location.hash.slice(1) !== sc.view) { location.hash = sc.view; await sleep(160); }
        window.scrollTo(0, 0); await sleep(60);
      }
    }
  }

  async function seek(t) {
    let dirty = false;
    // какая сцена
    let i = TL.scenes.findIndex(s => t >= s.start && t < s.end);
    if (i < 0) i = TL.scenes.length - 1;
    const sc = TL.scenes[i];
    if (cur.scene !== i) { await enterScene(i, t); dirty = true; }
    // камера заранее: к кнопке — до появления курсора, к подсветке — чуть раньше рамки
    const DOM = ['tab', 'radio', 'select', 'set', 'file', 'click', 'close'];
    for (let k = 0; k < sc.acts.length; k++) {
      const a = sc.acts[k], key = i + ':' + k;
      if (done.has(key) || framed.has(key)) continue;
      const cur = a.click || a.hover;
      if (cur && t >= a.t - 1.7) { framed.add(key); frame(cur, {}, t); dirty = true; }
      else if (!cur && (a.hl || a.scroll) && t >= a.t - 0.6) {
        framed.add(key);
        const before = sc.acts.slice(0, k).some((b, j) => !done.has(i + ':' + j) && DOM.some(x => b[x]));
        if (!before && !DOM.some(x => a[x])) { frame(a.hl || a.scroll, { parent: a.parent }, t, a.scroll); dirty = true; }
      }
    }
    // действия этой сцены, время которых наступило
    for (let k = 0; k < sc.acts.length; k++) {
      const key = i + ':' + k;
      if (!done.has(key) && t >= sc.acts[k].t) { done.add(key); await runAction(sc.acts[k], t); dirty = true; }
    }
    if (S.pendingHl && t >= S.pendingHl.at) { S.hlSel = S.pendingHl.sel; S.hlOpts = {}; S.spotT = t; S.spotFrom = S.spot; S.pendingHl = null; frame(S.hlSel, {}, t); dirty = true; }
    // страж: если подсветка уехала из кадра (раскрылась таблица, перестроился экран) — догнать её
    if (S.hlSel && !S.scrolls.length && t - S.lastFrame > 0.4) frame(S.hlSel, S.hlOpts, t);
    if (applyScrolls(t)) dirty = true;
    // слайд
    const slide = $('vo-slide');
    if (sc.kind === 'slide') {
      slide.style.opacity = 1;
      slide.querySelectorAll('[data-s]').forEach(el => {
        const at = sc.sents[Math.min(+el.dataset.s, sc.sents.length - 1)]?.t ?? sc.start;
        const k = ease((t - at - (+el.dataset.d || 0)) / 0.6);
        el.style.opacity = k; el.style.transform = `translateY(${(1 - k) * 18}px)`;
        if (k > 0 && k < 1) dirty = true;
      });
      slide.querySelectorAll('[data-draw]').forEach(el => {
        const len = +el.dataset.len || 1200, k = ease((t - sc.start - 0.2) / 2.4);
        el.style.strokeDasharray = len; el.style.strokeDashoffset = len * (1 - k);
        if (k < 1) dirty = true;
      });
      slide.querySelectorAll('[data-w]').forEach(el => {
        const at = sc.sents[+el.dataset.s]?.t ?? sc.start, k = ease((t - at) / 0.9);
        el.style.width = (k * +el.dataset.w) + 'px';
        if (k > 0 && k < 1) dirty = true;
      });
    } else slide.style.opacity = 0;
    // подсветка
    const spot = $('vo-spot');
    let target = S.hlSel ? targetRect(S.hlSel, S.hlOpts) : null;
    if (S.hlSel && !target && !targetEls(S.hlSel, S.hlOpts).length) { if (!warn.includes('hl ' + S.hlSel)) warn.push('hl ' + S.hlSel); }
    if (target) {
      const k = ease((t - S.spotT) / 0.5);
      const from = S.spotFrom || { ...target, x: target.x + target.w * 0.04, y: target.y + target.h * 0.04, w: target.w * 0.92, h: target.h * 0.92 };
      const r = k >= 1 ? target : { x: lerp(from.x, target.x, k), y: lerp(from.y, target.y, k), w: lerp(from.w, target.w, k), h: lerp(from.h, target.h, k) };
      Object.assign(spot.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', opacity: S.spotFrom ? 1 : k });
      S.spot = r;
      if (k < 1) dirty = true;
    } else {
      if (S.spot) { S.spot = null; S.spotFrom = null; dirty = true; }
      spot.style.opacity = 0;
    }
    // карточка с формулой
    const card = $('vo-card');
    if (S.card) {
      const kin = ease((t - S.cardT) / 0.6), kout = S.cardOff > S.cardT ? ease((t - S.cardOff) / 0.4) : 0;
      const o = kin * (1 - kout);
      card.style.opacity = o; card.style.transform = `translateX(${(1 - kin) * 40}px)`;
      if ((kin > 0 && kin < 1) || (kout > 0 && kout < 1)) dirty = true;
      if (kout >= 1) S.card = null;
    } else card.style.opacity = 0;
    // курсор
    const cu = $('vo-cursor'), rp = $('vo-ripple'), cf = cursorFor(sc, t);
    if (cf) {
      const sel = cf.a.click || cf.a.hover;
      const r = targetRect(sel) || S.lastCursorRect;
      if (r) {
        S.lastCursorRect = r;
        const c = center(r), start = { x: c.x + (c.x > innerWidth / 2 ? -260 : 260), y: c.y + (c.y > SAFE_Y / 2 ? -180 : 180) };
        const k = ease(Math.min(1, cf.k));
        const x = lerp(start.x, c.x, k), y = lerp(start.y, c.y, k);
        const fadeOut = cf.after > (cf.a.hover ? 1.8 : 0.5) ? ease((cf.after - (cf.a.hover ? 1.8 : 0.5)) / 0.4) : 0;
        cu.style.opacity = Math.min(1, cf.k * 3) * (1 - fadeOut);
        cu.style.transform = `translate(${x - 4}px, ${y - 2}px)`;
        if (cf.after >= 0 && cf.after < 0.45 && cf.a.click) {
          const p = cf.after / 0.45;
          rp.style.opacity = 1 - p; rp.style.transform = `translate(${c.x - 28}px, ${c.y - 28}px) scale(${0.4 + p})`;
        } else rp.style.opacity = 0;
        dirty = true;
      }
    } else { cu.style.opacity = 0; rp.style.opacity = 0; }
    // субтитр
    const sub = TL.subs.find(s => t >= s.t0 && t < s.t1);
    const subText = sub ? sub.text : '';
    $('vo-sub').textContent = subText;
    $('vo-chap').innerHTML = sc.chapter ? `<i></i>${sc.chapter}` : '';
    const chap = $('vo-chap');
    chap.style.display = sc.kind === 'slide' ? 'none' : '';
    if (S.spot && chap.textContent) { const c = chap.getBoundingClientRect(), r = S.spot; if (r.x < c.right && r.x + r.w > c.left && r.y + r.h > c.top - 6) chap.style.display = 'none'; }
    const pw = Math.round(innerWidth * t / TL.total);
    $('vo-prog').style.width = pw + 'px';
    // затемнение между разделами
    const fade = $('vo-fade');
    let fo = 0;
    if (sc.dipIn) fo = Math.max(fo, 1 - ease((t - sc.start) / 0.35));
    const nx = TL.scenes[i + 1];
    if (nx && nx.dipIn) fo = Math.max(fo, ease((t - (sc.end - 0.35)) / 0.35));
    fade.style.opacity = fo;
    if (fo > 0 && fo < 1) dirty = true;
    // слой должен быть внутри открытого <dialog>, иначе окно перекроет подсветку
    const host = document.querySelector('dialog[open]') || document.body;
    if (root.parentNode !== host) { host.appendChild(root); dirty = true; }
    const sig = subText + '|' + i + '|' + pw + '|' + (S.hlSel || '') + '|' + Math.round(window.scrollY) + '|' + (document.querySelector('dialog[open] .modal-body')?.scrollTop || 0);
    if (sig !== lastSig) { lastSig = sig; dirty = true; }
    if (dirty) await raf2();
    return { dirty, warn: warn.splice(0) };
  }

  window.__vo = { setup: tl => { TL = tl; }, seek, probe: () => ({ ...probe(), scene: TL.scenes[cur.scene]?.id, card: !!S.card }) };
})();
