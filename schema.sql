-- «Пульс клиники»: схема базы для Supabase (Postgres + Auth + RLS). Применена в проекте puls-kliniki.
-- Одна база на много клиник: у каждой строки есть clinic_id, доступ — только участникам этой клиники,
-- и проверяет его сама база (RLS), а не интерфейс. Персональных данных пациентов здесь нет — только суммы,
-- часы и количества.
--
-- id записей задаёт программа (уникальны внутри клиники), поэтому ключ — (clinic_id, id).
-- Поля совпадают с моделью программы (public/js/model.js, demo.js) — синхронизацию делает public/js/cloud.js.

create extension if not exists pgcrypto;

-- ---------- клиники, участники, приглашения ----------
create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  settings jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- owner — владелец (всё, включая команду); accountant — бухгалтер (всё, кроме команды и настроек клиники);
-- manager — главврач/управляющий (клинические данные; финансы только смотрит); viewer — только просмотр.
create table public.clinic_members (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner', 'accountant', 'manager', 'viewer')),
  email text,
  created_at timestamptz not null default now(),
  primary key (clinic_id, user_id)
);
create index on public.clinic_members (user_id);

create table public.invites (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null default 'viewer' check (role in ('owner', 'accountant', 'manager', 'viewer')),
  invited_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (clinic_id, email)
);

create or replace function public.member_role(c uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.clinic_members where clinic_id = c and user_id = auth.uid()
$$;
create or replace function public.is_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clinic_members where clinic_id = c and user_id = auth.uid())
$$;
create or replace function public.can_fin(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.member_role(c) in ('owner', 'accountant'), false)
$$;
create or replace function public.can_clin(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.member_role(c) in ('owner', 'accountant', 'manager'), false)
$$;

-- Новая клиника: создатель становится владельцем
create or replace function public.create_clinic(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if (select count(*) from public.clinic_members where user_id = auth.uid() and role = 'owner') >= 20 then
    raise exception 'too many clinics';
  end if;
  insert into public.clinics (name) values (left(trim(p_name), 200)) returning id into cid;
  insert into public.clinic_members (clinic_id, user_id, role, email)
    values (cid, auth.uid(), 'owner', lower(auth.jwt() ->> 'email'));
  return cid;
end $$;

-- Принять приглашения на свою почту. Только для подтверждённой почты — иначе можно было бы
-- зарегистрироваться на чужой адрес и попасть в клинику.
create or replace function public.accept_invites() returns integer
language plpgsql security definer set search_path = public as $$
declare em text; n integer;
begin
  if auth.uid() is null then return 0; end if;
  select lower(email) into em from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if em is null then return 0; end if;
  insert into public.clinic_members (clinic_id, user_id, role, email)
    select clinic_id, auth.uid(), role, em from public.invites where email = em
    on conflict (clinic_id, user_id) do nothing;
  get diagnostics n = row_count;
  delete from public.invites where email = em;
  return n;
end $$;

revoke execute on function public.create_clinic(text), public.accept_invites() from public, anon;
grant execute on function public.create_clinic(text), public.accept_invites() to authenticated;

alter table public.clinics enable row level security;
create policy "members read clinic" on public.clinics for select to authenticated using (public.is_member(id));
create policy "owner edits clinic" on public.clinics for update to authenticated
  using (public.member_role(id) = 'owner') with check (public.member_role(id) = 'owner');

alter table public.clinic_members enable row level security;
create policy "members see team" on public.clinic_members for select to authenticated using (public.is_member(clinic_id));
create policy "owner adds" on public.clinic_members for insert to authenticated with check (public.member_role(clinic_id) = 'owner');
create policy "owner changes roles" on public.clinic_members for update to authenticated
  using (public.member_role(clinic_id) = 'owner') with check (public.member_role(clinic_id) = 'owner');
create policy "owner removes, member leaves" on public.clinic_members for delete to authenticated
  using (public.member_role(clinic_id) = 'owner' or (user_id = auth.uid() and role <> 'owner'));

alter table public.invites enable row level security;
create policy "owner manages invites" on public.invites for all to authenticated
  using (public.member_role(clinic_id) = 'owner') with check (public.member_role(clinic_id) = 'owner');

-- ---------- данные клиники ----------
create table public.accounts (clinic_id uuid not null references public.clinics(id) on delete cascade, id bigint not null,
  name text not null default '', opening numeric not null default 0, primary key (clinic_id, id));
create table public.categories (clinic_id uuid not null references public.clinics(id) on delete cascade, id bigint not null,
  name text not null default '', grp text not null default 'fixed', tag text not null default '', primary key (clinic_id, id));
create table public.counterparties (clinic_id uuid not null references public.clinics(id) on delete cascade, id bigint not null,
  name text not null default '', kind text not null default 'other', primary key (clinic_id, id));
create table public.ops (clinic_id uuid not null references public.clinics(id) on delete cascade, id bigint not null,
  type text not null, date date not null, paid date, due date, amount numeric not null default 0, rejected numeric not null default 0,
  category_id bigint, account_id bigint, to_account_id bigint, department_id bigint, doctor_id bigint, counterparty_id bigint,
  doc text, comment text, life numeric, src text, ikey text, primary key (clinic_id, id));
create index on public.ops (clinic_id, date);
create index on public.ops (clinic_id, paid);
create table public.budget (clinic_id uuid not null references public.clinics(id) on delete cascade,
  category_id bigint not null, month text not null, amount numeric not null default 0, primary key (clinic_id, category_id, month));

create table public.departments (clinic_id uuid not null references public.clinics(id) on delete cascade, id bigint not null,
  name text not null default '', primary key (clinic_id, id));
create table public.doctors (clinic_id uuid not null references public.clinics(id) on delete cascade, id bigint not null,
  name text not null default '', spec text, department_id bigint, pay jsonb, active boolean not null default true, primary key (clinic_id, id));
create table public.resources (clinic_id uuid not null references public.clinics(id) on delete cascade, id bigint not null,
  name text not null default '', kind text not null default 'doctor', department_id bigint, doctor_id bigint,
  rate numeric not null default 0, active boolean not null default true, primary key (clinic_id, id));
create table public.channels (clinic_id uuid not null references public.clinics(id) on delete cascade, id bigint not null,
  name text not null default '', primary key (clinic_id, id));
create table public.items (clinic_id uuid not null references public.clinics(id) on delete cascade, id bigint not null,
  name text not null default '', unit text not null default 'шт', price numeric not null default 0, min numeric not null default 0, primary key (clinic_id, id));
create table public.services (clinic_id uuid not null references public.clinics(id) on delete cascade, id bigint not null,
  name text not null default '', department_id bigint, price numeric not null default 0, duration numeric not null default 30,
  doctor_pct numeric not null default 0, materials jsonb not null default '[]'::jsonb, primary key (clinic_id, id));
create table public.activity (clinic_id uuid not null references public.clinics(id) on delete cascade, id bigint not null,
  resource_id bigint, month text not null, avail numeric not null default 0, booked numeric not null default 0, visits numeric not null default 0,
  first numeric not null default 0, noshow numeric not null default 0, cancel numeric not null default 0, referrals numeric not null default 0,
  primary key (clinic_id, id));
create table public.sales (clinic_id uuid not null references public.clinics(id) on delete cascade, id bigint not null,
  service_id bigint, month text not null, qty numeric not null default 0, primary key (clinic_id, id));
create table public.marketing (clinic_id uuid not null references public.clinics(id) on delete cascade, id bigint not null,
  channel_id bigint, month text not null, spend numeric not null default 0, leads numeric not null default 0, bookings numeric not null default 0,
  visits numeric not null default 0, new_patients numeric not null default 0, revenue numeric not null default 0, primary key (clinic_id, id));
create table public.stock (clinic_id uuid not null references public.clinics(id) on delete cascade, id bigint not null,
  item_id bigint, date date not null, kind text not null default 'in', qty numeric not null default 0, price numeric not null default 0,
  expiry date, comment text, ikey text, primary key (clinic_id, id));

create table public.audit_log (id bigserial primary key, clinic_id uuid not null references public.clinics(id) on delete cascade,
  t timestamptz not null default now(), user_id uuid default auth.uid(), email text default lower(auth.jwt() ->> 'email'),
  action text not null, text text);
create index on public.audit_log (clinic_id, t desc);

-- Финансы пишут владелец и бухгалтер; клинические данные — ещё и управляющий; читают все участники.
do $$
declare t text;
begin
  foreach t in array array['accounts', 'categories', 'counterparties', 'ops', 'budget'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "read" on public.%I for select to authenticated using (public.is_member(clinic_id))', t);
    execute format('create policy "insert" on public.%I for insert to authenticated with check (public.can_fin(clinic_id))', t);
    execute format('create policy "update" on public.%I for update to authenticated using (public.can_fin(clinic_id)) with check (public.can_fin(clinic_id))', t);
    execute format('create policy "delete" on public.%I for delete to authenticated using (public.can_fin(clinic_id))', t);
  end loop;
  foreach t in array array['departments', 'doctors', 'resources', 'channels', 'items', 'services', 'activity', 'sales', 'marketing', 'stock'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "read" on public.%I for select to authenticated using (public.is_member(clinic_id))', t);
    execute format('create policy "insert" on public.%I for insert to authenticated with check (public.can_clin(clinic_id))', t);
    execute format('create policy "update" on public.%I for update to authenticated using (public.can_clin(clinic_id)) with check (public.can_clin(clinic_id))', t);
    execute format('create policy "delete" on public.%I for delete to authenticated using (public.can_clin(clinic_id))', t);
  end loop;
end $$;

alter table public.audit_log enable row level security;
create policy "read log" on public.audit_log for select to authenticated using (public.is_member(clinic_id));
create policy "write log" on public.audit_log for insert to authenticated
  with check (public.is_member(clinic_id) and user_id = auth.uid());

-- ---------- заявки с лендинга ----------
-- Писать может кто угодно (форма на сайте), читать — только из панели Supabase.
create table public.leads (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 120),
  clinic text check (char_length(clinic) <= 200),
  phone text not null check (char_length(phone) between 5 and 40),
  city text check (char_length(city) <= 80),
  size text check (char_length(size) <= 40),
  message text check (char_length(message) <= 2000),
  source text check (char_length(source) <= 200)
);
alter table public.leads enable row level security;
create policy "anyone can send a lead" on public.leads for insert to anon, authenticated with check (true);
