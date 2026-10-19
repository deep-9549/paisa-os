-- RLS: a user can only ever see and write their own rows.
-- Runs on plain Postgres (CI) with auth_stub.sql; also valid under `supabase test db`.
begin;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'a@x'), ('00000000-0000-0000-0000-00000000000b', 'b@x');
grant usage on schema public, auth to authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public, auth to authenticated;

insert into accounts (user_id, name, type) values ('00000000-0000-0000-0000-00000000000a', 'A bank', 'savings');
insert into accounts (user_id, name, type) values ('00000000-0000-0000-0000-00000000000b', 'B bank', 'savings');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);

do $$
declare n int;
begin
  select count(*) into n from accounts;
  if n <> 1 then raise exception 'RLS read leak: user A sees % accounts', n; end if;
  if exists (select 1 from accounts where name = 'B bank') then raise exception 'RLS read leak: B visible to A'; end if;

  begin
    insert into accounts (user_id, name, type) values ('00000000-0000-0000-0000-00000000000b', 'forged', 'cash');
    raise exception 'RLS write leak: A inserted a row for B';
  exception when insufficient_privilege then null; -- expected: violates row-level security
  end;

  update accounts set name = 'hacked' where name = 'B bank';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS update leak'; end if;

  delete from accounts where name = 'B bank';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS delete leak'; end if;

  -- Default user_id comes from auth.uid().
  insert into friends (name) values ('Rahul');
  if (select user_id from friends where name = 'Rahul') <> '00000000-0000-0000-0000-00000000000a' then
    raise exception 'user_id default not set from auth.uid()';
  end if;
  raise notice 'RLS tests passed';
end $$;
rollback;
