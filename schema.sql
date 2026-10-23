-- Клиника: управленческий учёт. Выполнять в Supabase SQL Editor НОВОГО проекта.
-- Персональные данные пациентов здесь НЕ хранятся — только агрегаты (суммы, часы).

create table departments (
  id bigint generated always as identity primary key,
  name text not null unique
);

create table doctors (
  id bigint generated always as identity primary key,
  name text not null,
  department_id bigint references departments(id),
  active boolean not null default true
);

-- Ресурсы мощности: врач, кабинет, операционная, диагностическое оборудование
create table resources (
  id bigint generated always as identity primary key,
  name text not null,
  kind text not null check (kind in ('doctor','room','equipment')),
  department_id bigint references departments(id),
  doctor_id bigint references doctors(id),
  rate_per_hour numeric,          -- средняя выручка за час (для room/equipment задаёт клиника)
  active boolean not null default true
);

-- Статьи доходов и расходов. group:
--   revenue   — выручка
--   opex      — операционные расходы (идут в прибыль и в ДДС)
--   capex     — оборудование/ремонты (только в ДДС)
--   financing — кредиты, займы, дивиденды (только в ДДС)
create table categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  grp text not null check (grp in ('revenue','opex','capex','financing'))
);

create table transactions (
  id bigint generated always as identity primary key,
  date date not null,
  category_id bigint not null references categories(id),
  department_id bigint references departments(id),
  doctor_id bigint references doctors(id),
  amount numeric not null check (amount >= 0),
  comment text,
  source text,                    -- откуда пришло: 'manual','csv','1c','mis'
  created_at timestamptz not null default now()
);
create index on transactions (date);

-- Мощность за месяц: доступные и занятые часы по ресурсу
create table capacity (
  id bigint generated always as identity primary key,
  resource_id bigint not null references resources(id),
  month date not null,            -- первое число месяца
  available_hours numeric not null,
  booked_hours numeric not null,
  unique (resource_id, month)
);

-- Роли: owner видит всё, accountant вносит данные, viewer — только просмотр
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner','accountant','viewer'))
);

create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create function current_role_name() returns text language sql security definer stable set search_path = public as $$
  select role from profiles where user_id = auth.uid()
$$;

-- RLS: читают все авторизованные с профилем, пишут owner и accountant
do $$
declare t text;
begin
  foreach t in array array['departments','doctors','resources','categories','transactions','capacity'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "read" on %I for select to authenticated using (current_role_name() is not null)', t);
    execute format('create policy "write" on %I for all to authenticated using (current_role_name() in (''owner'',''accountant'')) with check (current_role_name() in (''owner'',''accountant''))', t);
  end loop;
end $$;

alter table profiles enable row level security;
create policy "own profile" on profiles for select to authenticated using (user_id = auth.uid() or current_role_name() = 'owner');
create policy "owner manages" on profiles for update to authenticated using (current_role_name() = 'owner');
