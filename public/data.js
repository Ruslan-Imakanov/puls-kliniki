// Демо-данные клиники (выдуманные). Заменить loadData() на чтение из Supabase.
export const CONFIG = { currency: '₸', clinicName: 'Клиника — управленческий учёт' };

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

export async function loadData(){
  const rnd = mulberry32(42);
  const departments = [
    {id:1,name:'Терапия'},{id:2,name:'Хирургия'},{id:3,name:'Диагностика'},{id:4,name:'Стоматология'}];
  const doctors = [
    {id:1,name:'Иванова А.',department_id:1,base:9e5},{id:2,name:'Петров Б.',department_id:1,base:8e5},
    {id:3,name:'Сидоров В.',department_id:2,base:2.2e6},{id:4,name:'Ахметова Г.',department_id:2,base:1.8e6},
    {id:5,name:'Ким Д.',department_id:3,base:7e5},{id:6,name:'Новикова Е.',department_id:4,base:1.5e6},
    {id:7,name:'Омаров Ж.',department_id:4,base:1.3e6},{id:8,name:'Беляев З.',department_id:3,base:6e5}];
  const resources = [
    ...doctors.map(d=>({id:d.id,name:d.name,kind:'doctor',department_id:d.department_id,doctor_id:d.id})),
    {id:20,name:'Операционная',kind:'room',department_id:2,rate_per_hour:45000},
    {id:21,name:'МРТ',kind:'equipment',department_id:3,rate_per_hour:45000},
    {id:22,name:'УЗИ',kind:'equipment',department_id:3,rate_per_hour:18000},
    {id:23,name:'Стоматологическое кресло',kind:'room',department_id:4,rate_per_hour:40000}];
  const categories = [
    {id:1,name:'Выручка от услуг',grp:'revenue'},
    {id:2,name:'Зарплата врачей',grp:'opex'},{id:3,name:'Зарплата персонала',grp:'opex'},
    {id:4,name:'Аренда',grp:'opex'},{id:5,name:'Расходные материалы',grp:'opex'},
    {id:6,name:'Маркетинг',grp:'opex'},{id:7,name:'Коммунальные и прочее',grp:'opex'},
    {id:8,name:'Налоги',grp:'opex'},{id:9,name:'Оборудование',grp:'capex'},
    {id:10,name:'Погашение кредита',grp:'financing'}];
  const months = [];
  for(let i=0;i<12;i++){const d=new Date(2025,10+i,1);months.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-01');}
  const transactions = []; let tid=1;
  const add=(date,category_id,department_id,doctor_id,amount)=>transactions.push({id:tid++,date,category_id,department_id,doctor_id,amount:Math.round(amount)});
  months.forEach((m,i)=>{
    const growth = 1+i*0.025, season = [1,.9,.95,1.05,1.05,1,.9,.85,1.1,1.15,1.1,1][new Date(m).getMonth()];
    let rev=0;
    doctors.forEach(d=>{
      const v=d.base*growth*season*(0.9+rnd()*0.2); rev+=v;
      add(m.slice(0,8)+'28',1,d.department_id,d.id,v);
      add(m.slice(0,8)+'28',2,d.department_id,d.id,v*0.32);
    });
    add(m.slice(0,8)+'28',3,null,null,2.1e6);
    add(m.slice(0,8)+'01',4,null,null,1.2e6);
    add(m.slice(0,8)+'15',5,null,null,rev*0.11*(0.9+rnd()*0.2));
    add(m.slice(0,8)+'10',6,null,null,3.5e5+rnd()*2e5);
    add(m.slice(0,8)+'20',7,null,null,4e5+rnd()*1e5);
    add(m.slice(0,8)+'25',8,null,null,rev*0.07);
    add(m.slice(0,8)+'05',10,null,null,8e5);
    if(i===3) add(m.slice(0,8)+'12',9,3,null,9e6);
    if(i===9) add(m.slice(0,8)+'12',9,4,null,3.5e6);
  });
  const capacity = [];
  months.forEach((m,i)=>resources.forEach(r=>{
    const avail = r.kind==='doctor'?150:r.kind==='room'?200:220;
    const base = r.kind==='doctor'?0.72:r.id===21?0.55:r.id===20?0.48:0.7;
    const booked = Math.min(avail, avail*(base+i*0.006)*(0.92+rnd()*0.16));
    capacity.push({resource_id:r.id,month:m,available_hours:avail,booked_hours:Math.round(booked*10)/10});
  }));
  return {departments,doctors,resources,categories,transactions,capacity,months};
}
