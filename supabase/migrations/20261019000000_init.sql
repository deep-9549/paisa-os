-- Paisa OS — initial schema (PRD section 8).
-- Every table carries user_id with the same RLS policy. Money is numeric(14,2)
-- rupees, never floats. Column names match src/lib/types.ts one-to-one so the
-- client syncs rows without mapping. The whole schema is created up front so
-- later phases need no breaking migrations.

create extension if not exists pgcrypto;

create type account_type as enum ('savings','cash','wallet','credit_card','demat','loan');
create type txn_type as enum ('expense','income','transfer','refund','card_payment','adjustment');
create type pay_method as enum ('upi','card','cash','netbanking','auto_debit','other');

-- ---------------------------------------------------------------- profiles
create table profiles (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  name text not null default 'Deep',
  salary numeric(14,2) not null default 0,
  cycle_history jsonb not null default '[{"effective_from":"2000-01-01","mode":"calendar","start_day":1}]',
  buffer_pct numeric(5,2) not null default 5,
  stcg_rate numeric(5,2) not null default 20,
  ltcg_rate numeric(5,2) not null default 12.5,
  card_cap numeric(14,2),
  default_account_id uuid,
  my_upi_id text,
  pin_hash text,
  webauthn_credential_id text,
  lock_minutes int not null default 5,
  theme text not null default 'dark' check (theme in ('dark','light')),
  privacy_mode boolean not null default false,
  onboarded boolean not null default false,
  notify_daily_nudge boolean not null default true,
  notify_weekly boolean not null default true,
  friend_reminder_days int not null default 14,
  family_pans text[] not null default '{}',
  email_digest boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------- accounts
create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  type account_type not null,
  opening_balance numeric(14,2) not null default 0,
  opening_date date not null default current_date,
  include_in_net_worth boolean not null default true,
  archived boolean not null default false,
  color text not null default '#6366f1',
  icon text not null default '🏦',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table upi_handles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  account_id uuid not null references accounts on delete cascade,
  handle text not null
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  parent_id uuid references categories on delete cascade,
  icon text not null default '🏷️',
  color text not null default '#94a3b8',
  kind text not null default 'expense' check (kind in ('expense','income'))
);

create table friends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  upi_id text,
  phone text,
  color text not null default '#f97316',
  archived boolean not null default false
);

create table friend_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  emoji text not null default '👥'
);

create table group_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  group_id uuid not null references friend_groups on delete cascade,
  friend_id uuid not null references friends on delete cascade
);

-- ---------------------------------------------------------------- cards
create table credit_cards (
  account_id uuid primary key references accounts on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  bank text not null default '',
  last4 char(4),
  credit_limit numeric(14,2) not null,
  statement_day smallint not null check (statement_day between 1 and 31),
  due_mode text not null default 'after_statement' check (due_mode in ('fixed','after_statement')),
  due_day smallint not null check (due_day between 1 and 31),
  grace_days smallint not null default 20,
  min_due_pct numeric(5,2) not null default 5,
  annual_fee numeric(10,2) not null default 0,
  fee_waiver_spend numeric(14,2),
  fee_anniversary date,
  reward_rules jsonb not null default '[]',
  points_redeemed numeric(14,2) not null default 0,
  points_expiry_months int not null default 0,
  is_rupay_upi boolean not null default false
);

create table card_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  card_id uuid not null references credit_cards(account_id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open','closed')),
  total_due numeric(14,2),
  min_due numeric(14,2),
  min_due_override numeric(14,2),
  due_date date,
  amount_paid numeric(14,2) not null default 0,
  unique (card_id, start_date)
);

-- ---------------------------------------------------------------- planning
create table recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  kind text not null default 'bill' check (kind in ('rent','bill','subscription','salary','sip','emi','income','other')),
  txn_type text not null default 'expense' check (txn_type in ('expense','income','transfer')),
  amount numeric(14,2) not null,
  amount_min numeric(14,2),
  amount_max numeric(14,2),
  frequency text not null default 'monthly' check (frequency in ('monthly','quarterly','yearly','weekly','custom')),
  interval_days int,
  due_day smallint not null default 1 check (due_day between 1 and 31),
  start_date date not null default current_date,
  end_date date,
  account_id uuid references accounts on delete set null,
  to_account_id uuid references accounts on delete set null,
  method pay_method not null default 'upi',
  category_id uuid references categories on delete set null,
  auto_post boolean not null default false,
  active boolean not null default true,
  landlord text,
  landlord_pan text,
  property_address text,
  escalation_pct numeric(5,2) not null default 0,
  deposit numeric(14,2) not null default 0,
  last_used_note text,
  tags text[] not null default '{}'
);

create table ipo_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  company text not null,
  category text not null default 'retail' check (category in ('retail','shni','employee','shareholder')),
  applicant text not null default 'self',
  lots int not null check (lots > 0),
  lot_size int not null check (lot_size > 0),
  price_band_low numeric(10,2),
  price_band_high numeric(10,2),
  bid_price numeric(10,2) not null,
  issue_price numeric(10,2),
  amount_blocked numeric(14,2) generated always as (lots * lot_size * bid_price) stored,
  account_id uuid not null references accounts,
  applied_date date not null default current_date,
  mandate_date date,
  allotment_date date,
  listing_date date,
  status text not null default 'blocked'
    check (status in ('applied','blocked','allotted','not_allotted','partial','listed','sold','holding')),
  shares_allotted int not null default 0,
  listing_price numeric(10,2),
  sell_price numeric(10,2),
  shares_sold int not null default 0,
  sold_date date,
  realised_pnl numeric(14,2),
  refund_received boolean not null default false
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  kind text not null default 'goal' check (kind in ('goal','emergency','sinking')),
  target numeric(14,2) not null,
  target_date date,
  account_id uuid references accounts on delete set null,
  emoji text not null default '🎯',
  roundup_to int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- transactions
create table card_emis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  card_id uuid not null references credit_cards(account_id) on delete cascade,
  transaction_id uuid not null,
  principal numeric(14,2) not null,
  tenure_months int not null,
  annual_rate numeric(6,2) not null,
  processing_fee numeric(10,2) not null default 0,
  gst_pct numeric(5,2) not null default 18,
  start_date date not null,
  active boolean not null default true
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  type txn_type not null,
  amount numeric(14,2) not null check (amount > 0),
  occurred_at timestamptz not null default now(),
  account_id uuid references accounts,              -- null only when a friend paid
  to_account_id uuid references accounts,           -- transfers / card payments
  method pay_method not null,
  category_id uuid references categories on delete set null,
  merchant text,
  note text,
  tags text[] not null default '{}',
  card_cycle_id uuid references card_cycles on delete set null, -- set by trigger for card spends
  my_share numeric(14,2),                           -- null = full amount is mine
  paid_by_friend_id uuid references friends,        -- friend paid, I owe my_share
  payers jsonb,                                     -- several people paid: [{friend_id, amount}]
  group_id uuid references friend_groups on delete set null,
  split_mode text check (split_mode in ('equal','exact','percent','shares','itemised')),
  recurring_rule_id uuid references recurring_rules on delete set null,
  refund_of uuid references transactions on delete set null,
  emi_id uuid references card_emis on delete set null,
  ipo_application_id uuid references ipo_applications on delete set null,
  goal_id uuid references goals on delete set null,
  adjustment_sign smallint check (adjustment_sign in (-1, 1)),
  is_salary boolean not null default false,
  is_draft boolean not null default false,
  exclude_from_budget boolean not null default false,
  receipt_path text,
  location text,
  deleted_at timestamptz,                           -- soft delete, purged after 30 days
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (account_id is not null or paid_by_friend_id is not null or payers is not null)
);
create index on transactions (user_id, occurred_at desc);
create index on transactions (user_id, category_id, occurred_at);
create index on transactions (user_id, account_id, occurred_at);
create index on transactions (user_id, recurring_rule_id);

alter table card_emis add constraint card_emis_transaction_fk foreign key (transaction_id) references transactions on delete cascade deferrable initially deferred;

create table transaction_splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  transaction_id uuid not null references transactions on delete cascade,
  friend_id uuid references friends,               -- null = me
  share numeric(14,2) not null
);
create index on transaction_splits (user_id, transaction_id);

create table holds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  account_id uuid not null references accounts,
  amount numeric(14,2) not null,
  reason text not null,                            -- 'ipo'
  ipo_application_id uuid references ipo_applications on delete cascade,
  status text not null default 'active' check (status in ('active','released','converted')),
  created_at timestamptz not null default now(),
  released_at timestamptz
);

create table holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  symbol text,
  kind text not null default 'stock' check (kind in ('stock','mf','etf','other')),
  quantity numeric(18,4) not null default 0,
  avg_cost numeric(14,4) not null default 0,
  current_price numeric(14,4) not null default 0,
  account_id uuid references accounts on delete set null,
  ipo_application_id uuid references ipo_applications on delete set null,
  buy_date date,
  as_of date not null default current_date
);

create table settlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  friend_id uuid not null references friends on delete cascade,
  direction text not null check (direction in ('received','paid')),
  amount numeric(14,2) not null check (amount > 0),
  date date not null default current_date,
  account_id uuid references accounts on delete set null,
  note text
);

create table goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  goal_id uuid not null references goals on delete cascade,
  amount numeric(14,2) not null,
  date date not null default current_date,
  source text not null default 'manual' check (source in ('manual','roundup','leftover','auto'))
);

create table budget_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  category_id uuid not null references categories on delete cascade,
  amount numeric(14,2) not null,
  rollover boolean not null default false
);

create table rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  match text not null,
  category_id uuid references categories on delete set null,
  method pay_method,
  account_id uuid references accounts on delete set null
);

create table merchant_memory (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,                                -- normalised merchant key
  merchant text not null,
  category_id uuid references categories on delete set null,
  method pay_method,
  account_id uuid references accounts on delete set null,
  uses int not null default 1,
  primary key (user_id, id)
);

create table templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  label text not null,
  text text not null,
  emoji text not null default '⭐'
);

create table net_worth_snapshots (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,                                -- the date
  date date not null,
  value numeric(16,2) not null,
  primary key (user_id, id)
);

create table notifications (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,                                -- deterministic key so jobs never duplicate
  kind text not null,
  title text not null,
  body text not null default '',
  href text,
  created_at timestamptz not null default now(),
  read boolean not null default false,
  pushed boolean not null default false,
  primary key (user_id, id)
);

create table push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  entity text not null,
  entity_id uuid not null,
  action text not null check (action in ('create','update','delete','restore')),
  before jsonb,
  at timestamptz not null default now()
);

create table job_runs (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,                                -- job:date
  job text not null,
  ran_at timestamptz not null default now(),
  result text,
  primary key (user_id, id)
);

-- ---------------------------------------------------------------- RLS: the same policy on every table
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','accounts','upi_handles','categories','friends','friend_groups','group_members','credit_cards',
    'card_cycles','recurring_rules','ipo_applications','goals','card_emis','transactions','transaction_splits',
    'holds','holdings','settlements','goal_contributions','budget_lines','rules','merchant_memory','templates',
    'net_worth_snapshots','notifications','push_subscriptions','audit_log','job_runs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "own rows" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Realtime: phone and desktop stay in sync.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table profiles, accounts, upi_handles, categories, friends,
      friend_groups, group_members, credit_cards, card_cycles, recurring_rules, ipo_applications, goals, card_emis,
      transactions, transaction_splits, holds, holdings, settlements, goal_contributions, budget_lines, rules,
      merchant_memory, templates, net_worth_snapshots, notifications';
  end if;
end $$;

-- Private receipts bucket (signed URLs only).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false) on conflict do nothing;
    create policy "own receipts" on storage.objects for all
      using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
