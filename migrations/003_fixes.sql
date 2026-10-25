-- Исправления после проверки (выполнить после 002_billing.sql; повторный запуск безопасен).
-- 1) Дата подписки — по времени Казахстана (Asia/Almaty, UTC+5), а не по UTC сервера:
--    срок меняется в полночь по Астане, а не в 5 утра.
-- 2) Правила доступа вызывают auth.uid() один раз на запрос, а не на каждую строку (совет Supabase).
-- 3) Индекс для внешнего ключа clinics.created_by.

create or replace function private.today() returns date
language sql stable set search_path = public as $$
  select (now() at time zone 'Asia/Almaty')::date
$$;
revoke all on function private.today() from public, anon;
grant execute on function private.today() to authenticated;

alter table public.clinics alter column paid_until set default (private.today() + 30);

create or replace function private.sub_state(c uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when paid_until >= private.today() then case when plan = 'trial' then 'trial' else 'active' end
    when paid_until + 10 >= private.today() then 'grace'
    else 'expired' end
  from public.clinics where id = c
$$;

create or replace function public.subscription(p_clinic uuid)
returns table (state text, plan text, paid_until date, days_left integer)
language sql stable security definer set search_path = public as $$
  select private.sub_state(c.id), c.plan, c.paid_until, (c.paid_until - private.today())
  from public.clinics c where c.id = p_clinic and private.is_member(c.id)
$$;

create or replace function public.admin_clinics()
returns table (id uuid, name text, created_at timestamptz, plan text, paid_until date, days_left integer, state text,
               owner_email text, members integer, last_payment timestamptz, paid_total numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_platform_admin() then raise exception 'forbidden'; end if;
  return query
  select c.id, c.name, c.created_at, c.plan, c.paid_until, (c.paid_until - private.today()), private.sub_state(c.id),
    (select m.email from public.clinic_members m where m.clinic_id = c.id and m.role = 'owner' order by m.created_at limit 1),
    (select count(*)::integer from public.clinic_members m where m.clinic_id = c.id),
    (select max(p.created_at) from public.payments p where p.clinic_id = c.id),
    (select coalesce(sum(p.amount), 0) from public.payments p where p.clinic_id = c.id)
  from public.clinics c order by c.paid_until, c.created_at;
end $$;

create or replace function public.admin_extend(p_clinic uuid, p_months integer default 1, p_amount numeric default null,
  p_plan text default null, p_note text default null)
returns date language plpgsql security definer set search_path = public as $$
declare d date; pl text;
begin
  if not private.is_platform_admin() then raise exception 'forbidden'; end if;
  if p_months is null or p_months < 1 or p_months > 36 then raise exception 'bad months'; end if;
  if p_plan is not null and p_plan not in ('trial', 'start', 'clinic', 'network') then raise exception 'bad plan'; end if;
  if p_amount is not null and p_amount < 0 then raise exception 'bad amount'; end if;
  update public.clinics c
     set paid_until = (greatest(c.paid_until, private.today()) + make_interval(months => p_months))::date,
         plan = coalesce(p_plan, case when c.plan = 'trial' then 'start' else c.plan end)
   where c.id = p_clinic returning c.paid_until, c.plan into d, pl;
  if d is null then raise exception 'clinic not found'; end if;
  insert into public.payments (clinic_id, amount, months, plan, note, paid_until_after) values (p_clinic, p_amount, p_months, pl, left(p_note, 500), d);
  return d;
end $$;

-- 4) владелец не может удалить или понизить сам себя — иначе клиника остаётся без владельца
alter policy "owner removes, member leaves" on public.clinic_members
  using ((private.member_role(clinic_id) = 'owner' and user_id <> (select auth.uid())) or (user_id = (select auth.uid()) and role <> 'owner'));
alter policy "owner changes roles" on public.clinic_members
  using (private.member_role(clinic_id) = 'owner' and user_id <> (select auth.uid()))
  with check (private.member_role(clinic_id) = 'owner' and user_id <> (select auth.uid()));
alter policy "write log" on public.audit_log
  with check (private.is_member(clinic_id) and user_id = (select auth.uid()));

create index if not exists clinics_created_by_idx on public.clinics (created_by);

-- 5) заявки с сайта в админ-панели (раньше были видны только в панели Supabase)
create or replace function public.admin_leads()
returns table (id bigint, created_at timestamptz, name text, phone text, clinic text, city text, size text, message text, source text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not private.is_platform_admin() then raise exception 'forbidden'; end if;
  return query select l.id, l.created_at, l.name, l.phone, l.clinic, l.city, l.size, l.message, l.source
    from public.leads l order by l.created_at desc limit 300;
end $$;
revoke execute on function public.admin_leads() from public, anon;
grant execute on function public.admin_leads() to authenticated;
