-- «Пульс клиники»: схема базы для Supabase (Postgres + Auth + RLS).
-- Одна база на много клиник: у каждой записи есть clinic_id, доступ — через членство в клинике.
-- Таблицы и поля совпадают с локальной моделью в public/js/model.js и store.js.
-- Персональные данные пациентов здесь НЕ хранятся — только суммы, часы и количества.

create extension if not exists pgcrypto;

-- ---------- клиники и роли ----------
create table clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  settings jsonb not null default '{}'::jsonb,   -- currency, targetUtil, ltvYears, ... (см. defaultSettings)
  created_at timestamptz not null default now()
);

-- owner — владелец (всё, включая роли); accountant — бухгалтер (финансы, импорт);
-- manager — главврач/управляющий (мощность, врачи, услуги, маркетинг, склад; видит финансы);
-- viewer — только просмотр.
create table clinic_members (
  clinic_id uuid not null references clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner','accountant','manager','viewer')),
  primary key (clinic_id, user_id)
);

create function member_role(c uuid) returns text language sql stable security definer set search_path = public as $$
  select role from clinic_members where clinic_id = c and user_id = auth.uid()
$$;
create function is_member(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from clinic_members where clinic_id = c and user_id = auth.uid())
$$;

-- Создатель клиники автоматически становится владельцем
create function add_owner() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into clinic_members(clinic_id, user_id, role) values (new.id, auth.uid(), 'owner') on conflict do nothing;
  return new;
end $$;
create trigger clinic_owner after insert on clinics for each row execute function add_owner();

-- ---------- справочники ----------
create table accounts (id bigserial primary key, clinic_id uuid not null references clinics(id) on delete cascade, name text not null, opening numeric not null default 0);
create table departments (id bigserial primary key, clinic_id uuid not null references clinics(id) on delete cascade, name text not null);
create table doctors (
  id bigserial primary key, clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null, spec text, department_id bigint references departments(id) on delete set null,
  pay jsonb not null default '{"type":"percent","pct":0.3}'::jsonb,  -- {type: percent|salary|mixed|margin, salary, pct}
  active boolean not null default true
);
create table resources (
  id bigserial primary key, clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null, kind text not null check (kind in ('doctor','room','equipment')),
  department_id bigint references departments(id) on delete set null, doctor_id bigint references doctors(id) on delete set null,
  rate numeric not null default 0,    -- средняя выручка за час (кабинет, оборудование)
  active boolean not null default true
);
-- grp: revenue | other_income | financing_in | revenue_adj | variable | fixed | tax | capex | financing_out
-- tag: doctor_pay | materials | acquiring | marketing | refund | staff | rent
create table categories (
  id bigserial primary key, clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null,
  grp text not null check (grp in ('revenue','other_income','financing_in','revenue_adj','variable','fixed','tax','capex','financing_out')),
  tag text not null default ''
);
create table counterparties (
  id bigserial primary key, clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null, kind text not null default 'other' check (kind in ('insurer','fund','supplier','bank','corporate','other'))
);
create table channels (id bigserial primary key, clinic_id uuid not null references clinics(id) on delete cascade, name text not null);
create table items (
  id bigserial primary key, clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null, unit text not null default 'шт', price numeric not null default 0, min numeric not null default 0
);
create table services (
  id bigserial primary key, clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null, department_id bigint references departments(id) on delete set null,
  price numeric not null default 0, duration int not null default 30, doctor_pct numeric not null default 0,
  materials jsonb not null default '[]'::jsonb   -- [{item_id, qty}] — нормы расхода на одну услугу
);

-- ---------- операции ----------
-- date — дата оказания услуги / начисления (ОПиУ); paid — дата движения денег (ДДС), null = долг.
create table ops (
  id bigserial primary key, clinic_id uuid not null references clinics(id) on delete cascade,
  type text not null check (type in ('income','expense','transfer')),
  date date not null, paid date, due date,
  amount numeric not null check (amount > 0),
  rejected numeric not null default 0,          -- отказ страховой по реестру
  category_id bigint references categories(id),
  account_id bigint references accounts(id), to_account_id bigint references accounts(id),
  department_id bigint references departments(id) on delete set null,
  doctor_id bigint references doctors(id) on delete set null,
  counterparty_id bigint references counterparties(id) on delete set null,
  doc text, comment text,
  life int,                                     -- срок службы оборудования, мес. (амортизация)
  src text not null default 'manual',           -- manual | import | payroll
  ikey text,                                    -- ключ защиты от повторной загрузки
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  check (type = 'transfer' or category_id is not null)
);
create index on ops (clinic_id, date);
create index on ops (clinic_id, paid);
create unique index on ops (clinic_id, ikey) where ikey is not null;

-- ---------- клиника: часы, продажи, маркетинг, склад, бюджет ----------
create table activity (
  id bigserial primary key, clinic_id uuid not null references clinics(id) on delete cascade,
  resource_id bigint not null references resources(id) on delete cascade, month text not null check (month ~ '^\d{4}-\d{2}$'),
  avail numeric not null default 0, booked numeric not null default 0, visits numeric not null default 0, first numeric not null default 0,
  noshow numeric not null default 0, cancel numeric not null default 0, referrals numeric not null default 0,
  unique (resource_id, month)
);
create table sales (
  id bigserial primary key, clinic_id uuid not null references clinics(id) on delete cascade,
  service_id bigint not null references services(id) on delete cascade, month text not null check (month ~ '^\d{4}-\d{2}$'),
  qty numeric not null default 0, unique (service_id, month)
);
create table marketing (
  id bigserial primary key, clinic_id uuid not null references clinics(id) on delete cascade,
  channel_id bigint not null references channels(id) on delete cascade, month text not null check (month ~ '^\d{4}-\d{2}$'),
  spend numeric not null default 0, leads numeric not null default 0, bookings numeric not null default 0, visits numeric not null default 0,
  new_patients numeric not null default 0, revenue numeric not null default 0, unique (channel_id, month)
);
create table stock (
  id bigserial primary key, clinic_id uuid not null references clinics(id) on delete cascade,
  item_id bigint not null references items(id) on delete cascade, date date not null,
  kind text not null check (kind in ('in','out','writeoff')), qty numeric not null check (qty > 0),
  price numeric not null default 0, expiry date, comment text, ikey text
);
create table budget (
  clinic_id uuid not null references clinics(id) on delete cascade,
  category_id bigint not null references categories(id) on delete cascade, month text not null check (month ~ '^\d{4}-\d{2}$'),
  amount numeric not null default 0, primary key (category_id, month)
);
create table audit_log (
  id bigserial primary key, clinic_id uuid not null references clinics(id) on delete cascade,
  t timestamptz not null default now(), user_id uuid default auth.uid(), action text not null, text text
);

-- ---------- RLS ----------
alter table clinics enable row level security;
create policy "members read clinic" on clinics for select to authenticated using (is_member(id));
create policy "anyone creates clinic" on clinics for insert to authenticated with check (true);
create policy "owner edits clinic" on clinics for update to authenticated using (member_role(id) = 'owner');

alter table clinic_members enable row level security;
create policy "members see team" on clinic_members for select to authenticated using (is_member(clinic_id));
create policy "owner manages team" on clinic_members for all to authenticated using (member_role(clinic_id) = 'owner') with check (member_role(clinic_id) = 'owner');

-- Финансы пишут владелец и бухгалтер; клинические данные — ещё и управляющий; читают все участники.
do $$
declare t text;
begin
  foreach t in array array['accounts','categories','counterparties','ops','budget'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "read" on %I for select to authenticated using (is_member(clinic_id))', t);
    execute format($p$create policy "write" on %I for all to authenticated using (member_role(clinic_id) in ('owner','accountant')) with check (member_role(clinic_id) in ('owner','accountant'))$p$, t);
  end loop;
  foreach t in array array['departments','doctors','resources','channels','items','services','activity','sales','marketing','stock'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "read" on %I for select to authenticated using (is_member(clinic_id))', t);
    execute format($p$create policy "write" on %I for all to authenticated using (member_role(clinic_id) in ('owner','accountant','manager')) with check (member_role(clinic_id) in ('owner','accountant','manager'))$p$, t);
  end loop;
end $$;

alter table audit_log enable row level security;
create policy "read log" on audit_log for select to authenticated using (is_member(clinic_id));
create policy "write log" on audit_log for insert to authenticated with check (is_member(clinic_id));
