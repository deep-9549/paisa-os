-- Paisa OS — daily habit loop.
-- day_logs: one row per day the user "closes" (reviews today's spends). Streaks,
-- no-spend days and the weekly review are derived from these rows plus
-- transactions. The id is the IST date, so it is unique per user like
-- net_worth_snapshots.

create table day_logs (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  date date not null,
  mood text,
  note text,
  spent numeric(14,2) not null default 0,
  allowance numeric(14,2) not null default 0,
  closed_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table day_logs enable row level security;
create policy "own rows" on day_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table day_logs';
  end if;
end $$;

-- Theme can now follow the OS.
alter table profiles drop constraint if exists profiles_theme_check;
alter table profiles add constraint profiles_theme_check check (theme in ('dark','light','system'));
alter table profiles alter column theme set default 'system';
