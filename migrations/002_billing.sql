-- Подписки: пробный период, оплачено до даты, режим «только чтение» при просрочке, админ-панель владельца сервиса.
-- Выполнить один раз в Supabase → SQL Editor (после schema.sql). Повторный запуск безопасен.
--
-- Состояния клиники (считает база по своей дате, подделать с клиента нельзя):
--   trial    — пробный период, paid_until ещё впереди
--   active   — оплачено, paid_until впереди
--   grace    — срок прошёл, но не больше 10 дней (как в оферте): всё работает, программа напоминает об оплате
--   expired  — больше 10 дней просрочки: данные видны и выгружаются, вносить новое нельзя
-- Менять plan и paid_until может только владелец сервиса (таблица platform_admins) через admin_* функции.

-- ---------- поля подписки ----------
alter table public.clinics
  add column if not exists plan text not null default 'trial' check (plan in ('trial', 'start', 'clinic', 'network')),
  add column if not exists paid_until date not null default (current_date + 30);

-- ---------- владельцы сервиса и журнал платежей (читать и писать только через функции ниже) ----------
create table if not exists public.platform_admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.platform_admins enable row level security;

create table if not exists public.payments (
  id bigserial primary key,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  amount numeric,
  months integer not null,
  plan text,
  note text,
  paid_until_after date not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists payments_clinic_idx on public.payments (clinic_id, created_at desc);
alter table public.payments enable row level security;
revoke all on public.platform_admins, public.payments from anon, authenticated;

insert into public.platform_admins (user_id)
  select id from auth.users where lower(email) in ('imakanovr@gmail.com', 'ruslanimakanov8@gmail.com')
  on conflict do nothing;

-- ---------- проверки в схеме private (из API не вызываются) ----------
create or replace function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

create or replace function private.sub_state(c uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when paid_until >= current_date then case when plan = 'trial' then 'trial' else 'active' end
    when paid_until + 10 >= current_date then 'grace'
    else 'expired' end
  from public.clinics where id = c
$$;

create or replace function private.sub_ok(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(private.sub_state(c) <> 'expired', false)
$$;

-- запись возможна, только пока подписка не просрочена больше чем на 10 дней
create or replace function private.can_fin(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(private.member_role(c) in ('owner', 'accountant'), false) and private.sub_ok(c)
$$;
create or replace function private.can_clin(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(private.member_role(c) in ('owner', 'accountant', 'manager'), false) and private.sub_ok(c)
$$;

alter policy "owner edits clinic" on public.clinics
  using (private.member_role(id) = 'owner' and private.sub_ok(id))
  with check (private.member_role(id) = 'owner' and private.sub_ok(id));

-- владелец клиники не может сам продлить подписку
create or replace function private.guard_billing() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.plan, new.paid_until) is distinct from (old.plan, old.paid_until) and not private.is_platform_admin() then
    raise exception 'billing fields are managed by the platform';
  end if;
  return new;
end $$;
create or replace trigger clinics_guard_billing before update on public.clinics
  for each row execute function private.guard_billing();

revoke all on function private.is_platform_admin(), private.sub_state(uuid), private.sub_ok(uuid), private.guard_billing() from public, anon;
grant execute on function private.is_platform_admin(), private.sub_state(uuid), private.sub_ok(uuid) to authenticated;

-- ---------- функции для программы ----------
-- Состояние подписки клиники (для участников клиники)
create or replace function public.subscription(p_clinic uuid)
returns table (state text, plan text, paid_until date, days_left integer)
language sql stable security definer set search_path = public as $$
  select private.sub_state(c.id), c.plan, c.paid_until, (c.paid_until - current_date)
  from public.clinics c where c.id = p_clinic and private.is_member(c.id)
$$;

-- Я владелец сервиса? (для админ-панели)
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select private.is_platform_admin()
$$;

-- ---------- функции админ-панели (только владелец сервиса) ----------
create or replace function public.admin_clinics()
returns table (id uuid, name text, created_at timestamptz, plan text, paid_until date, days_left integer, state text,
               owner_email text, members integer, last_payment timestamptz, paid_total numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_platform_admin() then raise exception 'forbidden'; end if;
  return query
  select c.id, c.name, c.created_at, c.plan, c.paid_until, (c.paid_until - current_date), private.sub_state(c.id),
    (select m.email from public.clinic_members m where m.clinic_id = c.id and m.role = 'owner' order by m.created_at limit 1),
    (select count(*)::integer from public.clinic_members m where m.clinic_id = c.id),
    (select max(p.created_at) from public.payments p where p.clinic_id = c.id),
    (select coalesce(sum(p.amount), 0) from public.payments p where p.clinic_id = c.id)
  from public.clinics c order by c.paid_until, c.created_at;
end $$;

-- Продлить: от текущей даты окончания (или от сегодня, если срок уже прошёл) на N месяцев
create or replace function public.admin_extend(p_clinic uuid, p_months integer default 1, p_amount numeric default null,
  p_plan text default null, p_note text default null)
returns date language plpgsql security definer set search_path = public as $$
declare d date; pl text;
begin
  if not private.is_platform_admin() then raise exception 'forbidden'; end if;
  if p_months is null or p_months < 1 or p_months > 36 then raise exception 'bad months'; end if;
  if p_plan is not null and p_plan not in ('trial', 'start', 'clinic', 'network') then raise exception 'bad plan'; end if;
  update public.clinics c
     set paid_until = (greatest(c.paid_until, current_date) + make_interval(months => p_months))::date,
         plan = coalesce(p_plan, case when c.plan = 'trial' then 'start' else c.plan end)
   where c.id = p_clinic returning c.paid_until, c.plan into d, pl;
  if d is null then raise exception 'clinic not found'; end if;
  insert into public.payments (clinic_id, amount, months, plan, note, paid_until_after) values (p_clinic, p_amount, p_months, pl, p_note, d);
  return d;
end $$;

-- Выставить тариф и дату вручную (например, подарить пробный период)
create or replace function public.admin_set(p_clinic uuid, p_plan text, p_paid_until date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_platform_admin() then raise exception 'forbidden'; end if;
  if p_plan not in ('trial', 'start', 'clinic', 'network') then raise exception 'bad plan'; end if;
  update public.clinics set plan = p_plan, paid_until = p_paid_until where id = p_clinic;
  if not found then raise exception 'clinic not found'; end if;
end $$;

create or replace function public.admin_payments(p_clinic uuid)
returns table (id bigint, created_at timestamptz, amount numeric, months integer, plan text, note text, paid_until_after date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_platform_admin() then raise exception 'forbidden'; end if;
  return query select p.id, p.created_at, p.amount, p.months, p.plan, p.note, p.paid_until_after
    from public.payments p where p.clinic_id = p_clinic order by p.created_at desc limit 100;
end $$;

revoke execute on function public.subscription(uuid), public.is_platform_admin(), public.admin_clinics(),
  public.admin_extend(uuid, integer, numeric, text, text), public.admin_set(uuid, text, date), public.admin_payments(uuid) from public, anon;
grant execute on function public.subscription(uuid), public.is_platform_admin(), public.admin_clinics(),
  public.admin_extend(uuid, integer, numeric, text, text), public.admin_set(uuid, text, date), public.admin_payments(uuid) to authenticated;
