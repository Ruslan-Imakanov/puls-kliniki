-- Проверка подписок: статусы, режим «только чтение», защита полей, права админ-панели.
-- Запуск: вставить в SQL Editor Supabase и выполнить. Всё в транзакции с откатом — в базе ничего не остаётся.
-- В результате все строки должны быть ok = true.
begin;
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at) values
 ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000001','authenticated','authenticated','a@test.kz', now(), now(), now()),
 ('00000000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000002','authenticated','authenticated','b@test.kz', now(), now(), now()),
 ('00000000-0000-0000-0000-000000000000','eeeeeeee-0000-0000-0000-000000000005','authenticated','authenticated','admin@test.kz', now(), now(), now());
insert into public.platform_admins (user_id) values ('eeeeeeee-0000-0000-0000-000000000005');
create temp table r(test text, ok boolean, detail text) on commit drop; grant all on r to authenticated, anon;
create temp table ids(k text, v uuid) on commit drop; grant all on ids to authenticated, anon;

-- A: владелец новой клиники — пробный период 30 дней
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","email":"a@test.kz","role":"authenticated"}', true);
insert into ids select 'A', public.create_clinic('Клиника А');
insert into r select 'Новая клиника: пробный период 30 дней', state = 'trial' and days_left = 30 and plan = 'trial', state || ' ' || days_left from public.subscription((select v from ids where k='A'));
insert into public.ops (clinic_id, id, type, date, amount) select v, 1, 'income', '2026-10-01', 1000 from ids where k='A';
insert into r select 'В пробный период можно вносить данные', count(*) = 1, count(*)::text from public.ops;
do $$ begin
  begin update public.clinics set paid_until = current_date + 3650, plan = 'network';
    insert into r values ('Владелец не может сам продлить подписку', false, 'обновилось');
  exception when others then insert into r values ('Владелец не может сам продлить подписку', true, sqlstate); end;
end $$;
do $$ begin
  begin perform * from public.admin_clinics(); insert into r values ('Владелец клиники не видит админ-панель', false, 'вызвал');
  exception when others then insert into r values ('Владелец клиники не видит админ-панель', true, sqlstate); end;
end $$;
do $$ begin
  begin perform count(*) from public.payments; insert into r values ('Платежи не читаются напрямую', false, 'прочитал');
  exception when others then insert into r values ('Платежи не читаются напрямую', true, sqlstate); end;
end $$;
insert into r select 'Владелец сервиса не определяется у обычного пользователя', public.is_platform_admin() = false, 'ok';

-- B: другая клиника не видит чужую подписку
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","email":"b@test.kz","role":"authenticated"}', true);
insert into ids select 'B', public.create_clinic('Клиника Б');
insert into r select 'Чужая подписка не видна', count(*) = 0, count(*)::text from public.subscription((select v from ids where k='A'));
do $$ begin
  begin perform public.admin_extend((select v from ids where k='A'), 12); insert into r values ('Чужой владелец не может продлить подписку А', false, 'продлил');
  exception when others then insert into r values ('Чужой владелец не может продлить подписку А', true, sqlstate); end;
end $$;

-- E: владелец сервиса
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000005","email":"admin@test.kz","role":"authenticated"}', true);
insert into r select 'Владелец сервиса определяется', public.is_platform_admin() = true, 'ok';
insert into r select 'Админ видит обе клиники', count(*) = 2, count(*)::text from public.admin_clinics();
select public.admin_set((select v from ids where k='A'), 'trial', current_date - 5);

-- A: просрочка 5 дней — льготный период, всё работает
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","email":"a@test.kz","role":"authenticated"}', true);
insert into r select 'Просрочка 5 дней: статус «льготный»', state = 'grace', state from public.subscription((select v from ids where k='A'));
insert into public.ops (clinic_id, id, type, date, amount) select v, 2, 'income', '2026-10-02', 1 from ids where k='A';
insert into r select 'В льготный период данные вносятся', count(*) = 2, count(*)::text from public.ops;

-- E: просрочка 11 дней
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000005","email":"admin@test.kz","role":"authenticated"}', true);
select public.admin_set((select v from ids where k='A'), 'trial', current_date - 11);

-- A: режим «только просмотр»
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","email":"a@test.kz","role":"authenticated"}', true);
insert into r select 'Просрочка 11 дней: статус «закончилась»', state = 'expired', state from public.subscription((select v from ids where k='A'));
insert into r select 'После просрочки данные видны', count(*) = 2, count(*)::text from public.ops;
do $$ begin
  begin insert into public.ops (clinic_id, id, type, date, amount) select v, 3, 'income', '2026-10-03', 1 from ids where k='A';
    insert into r values ('После просрочки нельзя добавлять', false, 'вставилось');
  exception when others then insert into r values ('После просрочки нельзя добавлять', true, sqlstate); end;
end $$;
with u as (update public.ops set amount = 0 where true returning 1) insert into r select 'После просрочки нельзя менять', count(*) = 0, count(*)::text from u;
with u as (delete from public.ops where true returning 1) insert into r select 'После просрочки нельзя удалять', count(*) = 0, count(*)::text from u;
with u as (update public.clinics set name = 'новое имя' where id = (select v from ids where k='A') returning 1) insert into r select 'После просрочки нельзя менять настройки клиники', count(*) = 0, count(*)::text from u;
do $$ begin
  begin insert into public.departments (clinic_id, id, name) select v, 1, 'Терапия' from ids where k='A';
    insert into r values ('После просрочки нельзя править справочники', false, 'вставилось');
  exception when others then insert into r values ('После просрочки нельзя править справочники', true, sqlstate); end;
end $$;

-- E: оплата пришла — продлить на месяц
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-0000-0000-000000000005","email":"admin@test.kz","role":"authenticated"}', true);
insert into r select 'Продление от сегодняшней даты на месяц', public.admin_extend((select v from ids where k='A'), 1, 49000, 'clinic', 'тест') = (current_date + interval '1 month')::date, 'ok';
insert into r select 'Платёж записан', count(*) = 1 and max(amount) = 49000, count(*)::text from public.admin_payments((select v from ids where k='A'));

-- A: снова всё работает
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","email":"a@test.kz","role":"authenticated"}', true);
insert into r select 'После оплаты статус «оплачено», тариф «Клиника»', state = 'active' and plan = 'clinic', state || ' ' || plan from public.subscription((select v from ids where k='A'));
insert into public.ops (clinic_id, id, type, date, amount) select v, 4, 'income', '2026-10-04', 1 from ids where k='A';
insert into r select 'После оплаты данные снова вносятся', count(*) = 3, count(*)::text from public.ops;

-- посетитель без входа
set local role anon;
do $$ begin
  begin perform * from public.admin_clinics(); insert into r values ('Аноним не вызывает админ-панель', false, 'вызвал');
  exception when others then insert into r values ('Аноним не вызывает админ-панель', true, sqlstate); end;
end $$;
do $$ begin
  begin perform * from public.subscription((select v from ids where k='A')); insert into r values ('Аноним не читает подписки', false, 'вызвал');
  exception when others then insert into r values ('Аноним не читает подписки', true, sqlstate); end;
end $$;
reset role;
select test, ok, detail from r;
rollback;
