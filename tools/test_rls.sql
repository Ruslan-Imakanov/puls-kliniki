-- Проверка изоляции клиник и ролей. Запуск: вставить в SQL Editor Supabase и выполнить.
-- Всё в транзакции с откатом — в базе ничего не остаётся. В результате все строки должны быть ok = true.
begin;
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at) values
 ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000001','authenticated','authenticated','a@test.kz', now(), now(), now()),
 ('00000000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000002','authenticated','authenticated','b@test.kz', now(), now(), now()),
 ('00000000-0000-0000-0000-000000000000','cccccccc-0000-0000-0000-000000000003','authenticated','authenticated','c@test.kz', now(), now(), now()),
 ('00000000-0000-0000-0000-000000000000','dddddddd-0000-0000-0000-000000000004','authenticated','authenticated','d@test.kz', null, now(), now());
create temp table r(test text, ok boolean, detail text) on commit drop;
grant all on r to authenticated, anon;
create temp table ids(k text, v uuid) on commit drop; grant all on ids to authenticated, anon;

-- A: владелец клиники А
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","email":"a@test.kz","role":"authenticated"}', true);
insert into ids select 'A', public.create_clinic('Клиника А');
insert into public.ops (clinic_id, id, type, date, amount) select v, 1, 'income', '2026-10-01', 1000 from ids where k='A';
insert into public.invites (clinic_id, email, role) select v, 'c@test.kz', 'viewer' from ids where k='A';
insert into public.invites (clinic_id, email, role) select v, 'd@test.kz', 'accountant' from ids where k='A';
insert into r select 'A видит свою операцию', count(*) = 1, count(*)::text from public.ops;

-- B: владелец другой клиники
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","email":"b@test.kz","role":"authenticated"}', true);
insert into ids select 'B', public.create_clinic('Клиника Б');
insert into r select 'B не видит операции А', count(*) = 0, count(*)::text from public.ops;
insert into r select 'B видит только свою клинику', count(*) = 1, string_agg(name, ',') from public.clinics;
insert into r select 'B не видит команду А', count(*) = 1, count(*)::text from public.clinic_members;
insert into r select 'B не видит приглашения А', count(*) = 0, count(*)::text from public.invites;
do $$ begin
  begin insert into public.ops (clinic_id, id, type, date, amount) select v, 2, 'expense', '2026-10-01', 5 from ids where k='A';
    insert into r values ('B не может писать в клинику А', false, 'вставилось');
  exception when others then insert into r values ('B не может писать в клинику А', true, sqlstate); end;
end $$;
with u as (update public.ops set amount = 0 where true returning 1) insert into r select 'B не может менять операции А', count(*) = 0, count(*)::text from u;
with u as (delete from public.ops where true returning 1) insert into r select 'B не может удалять операции А', count(*) = 0, count(*)::text from u;
do $$ begin
  begin insert into public.clinic_members (clinic_id, user_id, role) select v, 'bbbbbbbb-0000-0000-0000-000000000002', 'owner' from ids where k='A';
    insert into r values ('B не может добавить себя в клинику А', false, 'вставилось');
  exception when others then insert into r values ('B не может добавить себя в клинику А', true, sqlstate); end;
end $$;

-- C: приглашён в А с ролью «просмотр»
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-0000-0000-000000000003","email":"c@test.kz","role":"authenticated"}', true);
insert into r select 'C до приглашения ничего не видит', count(*) = 0, count(*)::text from public.ops;
insert into r select 'C принял приглашение', public.accept_invites() = 1, 'ok';
insert into r select 'C (просмотр) видит операции А', count(*) = 1, count(*)::text from public.ops;
do $$ begin
  begin insert into public.ops (clinic_id, id, type, date, amount) select v, 3, 'expense', '2026-10-01', 5 from ids where k='A';
    insert into r values ('C (просмотр) не может добавлять', false, 'вставилось');
  exception when others then insert into r values ('C (просмотр) не может добавлять', true, sqlstate); end;
end $$;
with u as (update public.clinics set name = 'взлом' where true returning 1) insert into r select 'C не может менять клинику', count(*) = 0, count(*)::text from u;

-- D: приглашён, но почта не подтверждена
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-0000-0000-000000000004","email":"d@test.kz","role":"authenticated"}', true);
insert into r select 'D без подтверждения почты не принят', public.accept_invites() = 0, 'ok';
insert into r select 'D ничего не видит', count(*) = 0, count(*)::text from public.ops;

-- посетитель сайта без входа
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into r select 'Аноним не видит клиники', count(*) = 0, count(*)::text from public.clinics;
insert into public.leads (name, phone) values ('Тест', '+77001234567');
insert into r values ('Аноним может оставить заявку', true, 'ok');
do $$ begin
  begin perform 1 from public.leads; insert into r select 'Аноним не читает заявки', (select count(*) from public.leads) = 0, 'видно строк: ' || (select count(*) from public.leads);
  exception when others then insert into r values ('Аноним не читает заявки', true, sqlstate); end;
end $$;
do $$ begin
  begin perform private.is_member('00000000-0000-0000-0000-000000000000'); insert into r values ('Аноним не вызывает служебные функции', false, 'вызвал');
  exception when others then insert into r values ('Аноним не вызывает служебные функции', true, sqlstate); end;
end $$;
do $$ begin
  begin perform public.create_clinic('спам'); insert into r values ('Аноним не создаёт клиники', false, 'создал');
  exception when others then insert into r values ('Аноним не создаёт клиники', true, sqlstate); end;
end $$;
reset role;
select test, ok, detail from r;
rollback;
