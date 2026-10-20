-- Paisa OS — trips. A trip is a tag with a budget and dates; while it's
-- active, quick-add tags spends with it. Foreign-currency trips store a rate
-- so amounts can be entered in the local currency. `separate_budget` keeps
-- trip spends out of the monthly budget (paid from savings or a goal).

create table trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  emoji text not null default '✈️',
  tag text not null,
  budget numeric(14,2) not null default 0,
  start_date date not null,
  end_date date not null,
  currency text,
  fx_rate numeric(14,4),
  separate_budget boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

alter table trips enable row level security;
create policy "own rows" on trips for all using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table trips';
  end if;
end $$;
