// Расчёты дашборда. Чистые функции, без DOM — легко проверять.
export const monthKey = d => d.slice(0,7);
const sum = a => a.reduce((s,x)=>s+x,0);

export function monthly(data, months){
  const grp = Object.fromEntries(data.categories.map(c=>[c.id,c.grp]));
  return months.map(m=>{
    const key=monthKey(m), tx=data.transactions.filter(t=>monthKey(t.date)===key);
    const by=g=>sum(tx.filter(t=>grp[t.category_id]===g).map(t=>t.amount));
    const revenue=by('revenue'), opex=by('opex'), capex=by('capex'), financing=by('financing');
    return {month:m,revenue,opex,capex,financing,profit:revenue-opex,cashflow:revenue-opex-capex-financing};
  });
}

export function byDepartment(data, months){
  const keys=new Set(months.map(monthKey)), grp=Object.fromEntries(data.categories.map(c=>[c.id,c.grp]));
  return data.departments.map(d=>{
    const tx=data.transactions.filter(t=>t.department_id===d.id&&keys.has(monthKey(t.date)));
    const revenue=sum(tx.filter(t=>grp[t.category_id]==='revenue').map(t=>t.amount));
    const direct=sum(tx.filter(t=>grp[t.category_id]==='opex').map(t=>t.amount));
    return {id:d.id,name:d.name,revenue,directCost:direct,margin:revenue-direct};
  });
}

export function byDoctor(data, months){
  const keys=new Set(months.map(monthKey)), grp=Object.fromEntries(data.categories.map(c=>[c.id,c.grp]));
  return data.doctors.map(d=>{
    const rev=sum(data.transactions.filter(t=>t.doctor_id===d.id&&grp[t.category_id]==='revenue'&&keys.has(monthKey(t.date))).map(t=>t.amount));
    const cap=data.capacity.filter(c=>c.resource_id===d.id&&keys.has(monthKey(c.month)));
    const booked=sum(cap.map(c=>c.booked_hours)), avail=sum(cap.map(c=>c.available_hours));
    return {name:d.name,department_id:d.department_id,revenue:rev,booked,avail,utilization:avail?booked/avail:0,perHour:booked?rev/booked:0};
  });
}

// Мощность: загрузка и «недополученная выручка» = свободные часы × выручка за час.
export function capacityReport(data, months){
  const keys=new Set(months.map(monthKey)), docs=byDoctor(data,months), docById=Object.fromEntries(data.doctors.map((d,i)=>[d.id,docs[i]]));
  return data.resources.map(r=>{
    const cap=data.capacity.filter(c=>c.resource_id===r.id&&keys.has(monthKey(c.month)));
    const booked=sum(cap.map(c=>c.booked_hours)), avail=sum(cap.map(c=>c.available_hours));
    const rate = r.kind==='doctor' ? (docById[r.doctor_id]?.perHour||0) : (r.rate_per_hour||0);
    return {id:r.id,name:r.name,kind:r.kind,booked,avail,utilization:avail?booked/avail:0,rate,potential:(avail-booked)*rate};
  });
}

// Простой прогноз: линейная регрессия по последним n месяцам, на k месяцев вперёд.
export function forecast(values, n=6, k=3){
  const y=values.slice(-n), x=y.map((_,i)=>i), mx=sum(x)/y.length, my=sum(y)/y.length;
  const den=sum(x.map(v=>(v-mx)**2))||1, slope=sum(x.map((v,i)=>(v-mx)*(y[i]-my)))/den, b=my-slope*mx;
  return Array.from({length:k},(_,j)=>Math.max(0,b+slope*(y.length+j)));
}

export const MONTHS_RU=['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
export const monthLabel = m => MONTHS_RU[+m.slice(5,7)-1]+' '+m.slice(2,4);

// Потенциал отделения: врач и кабинет работают одновременно, поэтому суммировать их нельзя —
// берём максимум по ресурсам отделения (оценка сверху по самому недогруженному ресурсу).
export function departmentPotential(cap, data){
  const dep = Object.fromEntries(data.resources.map(r=>[r.id,r.department_id]));
  const best = {};
  cap.forEach(c=>{const d=dep[c.id]; best[d]=Math.max(best[d]||0,c.potential);});
  return Object.values(best).reduce((s,x)=>s+x,0);
}
