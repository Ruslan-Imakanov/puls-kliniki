import {CONFIG, loadData} from './data.js';
import {monthly, byDepartment, byDoctor, capacityReport, forecast, monthLabel, departmentPotential} from './calc.js';

const cur = CONFIG.currency;
const fmt = n => Math.round(n).toLocaleString('ru-RU');
const mln = n => (n/1e6).toLocaleString('ru-RU',{maximumFractionDigits:1})+' млн';
const pct = n => Math.round(n*100)+'%';
const cls = n => n>=0?'pos':'neg';
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// Столбцы: выручка и расходы по месяцам + пунктир прогноза выручки
function barChart(rows, fc){
  const W=640,H=240,pl=40,pb=24,pt=10,n=rows.length+fc.length,bw=(W-pl)/n;
  const max=Math.max(...rows.map(r=>Math.max(r.revenue,r.opex+r.capex)),...fc)*1.1||1, y=v=>pt+(H-pt-pb)*(1-v/max);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Выручка и расходы по месяцам">`;
  for(let i=0;i<=4;i++){const v=max*i/4;s+=`<line x1="${pl}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"/><text x="${pl-4}" y="${y(v)+4}" text-anchor="end">${(v/1e6).toFixed(0)}</text>`;}
  rows.forEach((r,i)=>{const x=pl+i*bw+bw*.12,w=bw*.36;
    s+=`<rect x="${x}" y="${y(r.revenue)}" width="${w}" height="${H-pb-y(r.revenue)}" fill="var(--rev)" rx="2"/>`;
    s+=`<rect x="${x+w+1}" y="${y(r.opex+r.capex)}" width="${w}" height="${H-pb-y(r.opex+r.capex)}" fill="var(--exp)" rx="2"/>`;
    s+=`<text x="${pl+i*bw+bw/2}" y="${H-8}" text-anchor="middle">${monthLabel(r.month).split(' ')[0]}</text>`;});
  fc.forEach((v,j)=>{const i=rows.length+j,x=pl+i*bw+bw*.12,w=bw*.36;
    s+=`<rect x="${x}" y="${y(v)}" width="${w}" height="${H-pb-y(v)}" fill="none" stroke="var(--rev)" stroke-dasharray="4 3" rx="2"/>`;
    s+=`<text x="${pl+i*bw+bw/2}" y="${H-8}" text-anchor="middle">прогн.</text>`;});
  return s+'</svg><div class="legend"><span><b style="background:var(--rev)"></b>Выручка</span><span><b style="background:var(--exp)"></b>Расходы (опер. + оборудование)</span><span><b style="border:1px dashed var(--rev)"></b>Прогноз выручки</span></div>';
}

function utilColor(u){return u<.5?'var(--bad)':u<.7?'var(--warn)':'var(--ok)'}
const bar = u => `<div class="bar"><i style="width:${Math.min(100,u*100)}%;background:${utilColor(u)}"></i></div>`;

function render(data, nMonths){
  const months = data.months.slice(-nMonths), rows = monthly(data, months), all = monthly(data, data.months);
  const t = k => rows.reduce((s,r)=>s+r[k],0), rev=t('revenue'), profit=t('profit'), cash=t('cashflow');
  const prev = monthly(data, data.months.slice(-2*nMonths,-nMonths)), prevRev = prev.reduce((s,r)=>s+r.revenue,0);
  const fc = forecast(all.map(r=>r.revenue), 6, 3);
  const deps = byDepartment(data, months), docs = byDoctor(data, months), cap = capacityReport(data, months);
  const potential = departmentPotential(cap, data);
  const depName = Object.fromEntries(data.departments.map(d=>[d.id,d.name]));
  const growth = prevRev ? rev/prevRev-1 : null;

  document.getElementById('app').innerHTML = `
  <section class="kpis">
    <div class="card kpi"><div class="l">Выручка</div><div class="v">${mln(rev)} ${cur}</div><div class="s">${growth==null?'':`${growth>=0?'+':''}${pct(growth)} к предыдущему периоду`}</div></div>
    <div class="card kpi"><div class="l">Операционные расходы</div><div class="v">${mln(t('opex'))} ${cur}</div><div class="s">${pct(t('opex')/rev)} от выручки</div></div>
    <div class="card kpi"><div class="l">Прибыль</div><div class="v ${cls(profit)}">${mln(profit)} ${cur}</div><div class="s">рентабельность ${pct(profit/rev)}</div></div>
    <div class="card kpi"><div class="l">ДДС (чистый поток)</div><div class="v ${cls(cash)}">${mln(cash)} ${cur}</div><div class="s">после оборудования и кредита</div></div>
    <div class="card kpi"><div class="l">Недополученная выручка</div><div class="v">${mln(potential)} ${cur}</div><div class="s">оценка по недогруженным ресурсам</div></div>
  </section>
  <section class="card"><h2>Выручка и расходы по месяцам</h2>${barChart(rows, fc)}
    <p class="note">Прогноз выручки на 3 месяца — линейный тренд по последним 6 месяцам, без сезонности.</p></section>
  <section class="card"><h2>Движение денег (ДДС) по месяцам</h2><div class="tw"><table>
    <thead><tr><th>Месяц</th><th>Выручка</th><th>Опер. расходы</th><th>Прибыль</th><th>Оборудование</th><th>Кредит</th><th>Чистый поток</th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td>${monthLabel(r.month)}</td><td>${fmt(r.revenue)}</td><td>${fmt(r.opex)}</td><td class="${cls(r.profit)}">${fmt(r.profit)}</td><td>${fmt(r.capex)}</td><td>${fmt(r.financing)}</td><td class="${cls(r.cashflow)}">${fmt(r.cashflow)}</td></tr>`).join('')}
    </tbody></table></div></section>
  <div class="grid2">
    <section class="card"><h2>Отделения</h2><div class="tw"><table><thead><tr><th>Отделение</th><th>Выручка</th><th>Прямые расходы</th><th>Маржа</th></tr></thead><tbody>
      ${deps.map(d=>`<tr><td>${esc(d.name)}</td><td>${fmt(d.revenue)}</td><td>${fmt(d.directCost)}</td><td class="${cls(d.margin)}">${fmt(d.margin)}</td></tr>`).join('')}
    </tbody></table></div><p class="note">Прямые расходы — зарплата врачей отделения. Общие расходы (аренда, персонал, налоги) не распределяются.</p></section>
    <section class="card"><h2>Врачи</h2><div class="tw"><table><thead><tr><th>Врач</th><th>Выручка</th><th>За час</th><th>Загрузка</th></tr></thead><tbody>
      ${docs.sort((a,b)=>b.revenue-a.revenue).map(d=>`<tr><td>${esc(d.name)}<br><small style="color:var(--dim)">${esc(depName[d.department_id]||'')}</small></td><td>${fmt(d.revenue)}</td><td>${fmt(d.perHour)}</td><td>${pct(d.utilization)}${bar(d.utilization)}</td></tr>`).join('')}
    </tbody></table></div></section>
  </div>
  <section class="card"><h2>Мощность клиники</h2><div class="tw"><table>
    <thead><tr><th>Ресурс</th><th>Тип</th><th>Занято / доступно, ч</th><th>Загрузка</th><th>Выручка за час</th><th>Недополучено</th></tr></thead><tbody>
    ${cap.sort((a,b)=>b.potential-a.potential).map(c=>`<tr><td>${esc(c.name)}</td><td>${{doctor:'врач',room:'кабинет',equipment:'оборудование'}[c.kind]}</td><td>${fmt(c.booked)} / ${fmt(c.avail)}</td><td>${pct(c.utilization)}${bar(c.utilization)}</td><td>${fmt(c.rate)}</td><td>${fmt(c.potential)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="note">Недополучено = свободные часы × выручка за час; в итоге по клинике берётся максимум по ресурсам отделения (врач и кабинет работают одновременно, не суммируются). Для оборудования и кабинетов ставка за час задаётся клиникой, для врачей считается по факту.
    Красный — загрузка ниже 50%, жёлтый — ниже 70%.</p></section>`;
}

const data = await loadData();
document.getElementById('title').firstChild.textContent = CONFIG.clinicName;
const sel = document.getElementById('period');
sel.onchange = () => render(data, +sel.value);
render(data, +sel.value);
