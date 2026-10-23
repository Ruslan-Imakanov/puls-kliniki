// Режиссёрский слой ролика: встраивается в страницу программы и по времени t выставляет кадр.
// Всё вычисляется от t (никаких CSS-анимаций), поэтому кадры детерминированы и рендерятся покадрово.
// window.__vo.setup(timeline) — один раз; await window.__vo.seek(t) → { dirty } — на каждый кадр.
(() => {
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
  const S = { spot: null, spotFrom: null, spotT: -9, hlSel: null, scroll: null, cursor: null, card: null, cardT: -9, cardOff: -9, hover: null };

  function targetRect(sel, opts = {}) {
    const host = document.querySelector('dialog[open]') && sel.startsWith('dialog') ? document : document;
    const els = [...host.querySelectorAll(sel)].map(el => {
      if (opts.parent || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return el.closest('.f, .seg, label') || el;
      return el;
    }).filter(el => el.getClientRects().length && !el.closest('[hidden]'));
    if (!els.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    els.forEach(el => { const r = el.getBoundingClientRect(); x1 = Math.min(x1, r.left); y1 = Math.min(y1, r.top); x2 = Math.max(x2, r.right); y2 = Math.max(y2, r.bottom); });
    const pad = 8;
    return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 };
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
    if (a.scroll) {
      const el = q(a.scroll);
      if (el) {
        const r = el.getBoundingClientRect(), y0 = window.scrollY;
        const maxY = document.documentElement.scrollHeight - innerHeight;
        const y1 = Math.max(0, Math.min(maxY, y0 + r.top - 110));
        S.scroll = { y0, y1, t0: t, d: 0.9 };
      } else warn.push('scroll ' + a.scroll);
    }
    if (a.card) { S.card = a.card; S.cardT = t; $('vo-card').innerHTML = TL.cards[a.card] || ''; }
    if (a.off) { S.hlSel = null; if (S.card) { S.cardOff = t; } }
    if (a.hl) { S.hlSel = a.hl; S.hlOpts = { parent: a.parent }; S.spotT = t; S.spotFrom = S.spot; }
    if (a.hlAfter) { S.pendingHl = { sel: a.hlAfter, at: t + 0.6 }; }
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
    S.hlSel = null; S.spot = null; S.card = null; S.cardOff = -9; S.scroll = null; S.pendingHl = null; S.hover = null;
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
    // действия этой сцены, время которых наступило
    for (let k = 0; k < sc.acts.length; k++) {
      const key = i + ':' + k;
      if (!done.has(key) && t >= sc.acts[k].t) { done.add(key); await runAction(sc.acts[k], t); dirty = true; }
    }
    if (S.pendingHl && t >= S.pendingHl.at) { S.hlSel = S.pendingHl.sel; S.spotT = t; S.spotFrom = S.spot; S.pendingHl = null; dirty = true; }
    // прокрутка
    if (S.scroll) {
      const k = ease((t - S.scroll.t0) / S.scroll.d);
      window.scrollTo(0, Math.round(lerp(S.scroll.y0, S.scroll.y1, k)));
      if (k >= 1) S.scroll = null;
      dirty = true;
    }
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
    if (S.hlSel && !target) { if (!warn.includes('hl ' + S.hlSel)) warn.push('hl ' + S.hlSel); }
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
        const c = center(r), start = { x: c.x + 260, y: c.y + 180 };
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
    $('vo-chap').style.display = sc.kind === 'slide' ? 'none' : '';
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
    const sig = subText + '|' + i + '|' + pw + '|' + (S.hlSel || '') + '|' + Math.round(window.scrollY);
    if (sig !== lastSig) { lastSig = sig; dirty = true; }
    if (dirty) await raf2();
    return { dirty, warn: warn.splice(0) };
  }

  window.__vo = { setup: tl => { TL = tl; }, seek };
})();
