-- Paisa OS — money-critical Postgres functions and scheduled jobs (PRD sections 7–9).
-- The TypeScript engine in src/lib/domain is the unit-tested reference; these
-- functions mirror it so server jobs and the client agree on every number.

-- ---------------------------------------------------------------- date helpers
create or replace function ist_today() returns date language sql stable as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

-- Date with `day` in the month of `d`; days past month end clamp to the last day.
create or replace function clamped_date(d date, day int) returns date language sql immutable as $$
  select (date_trunc('month', d)::date
          + (least(day, extract(day from (date_trunc('month', d) + interval '1 month - 1 day'))::int) - 1))
$$;

-- Billing cycle containing date d: it ends on the statement day (clamped).
create or replace function card_cycle_for(d date, statement_day int, out start_date date, out end_date date)
language plpgsql immutable as $$
declare this_end date := clamped_date(d, statement_day);
begin
  end_date := case when d <= this_end then this_end
                   else clamped_date((date_trunc('month', d) + interval '1 month')::date, statement_day) end;
  start_date := clamped_date((date_trunc('month', end_date) - interval '1 month')::date, statement_day) + 1;
end $$;

create or replace function card_due_date(c credit_cards, statement_date date) returns date language sql immutable as $$
  select case
    when c.due_mode = 'after_statement' then statement_date + coalesce(nullif(c.grace_days, 0), 20)
    when clamped_date(statement_date, c.due_day) > statement_date then clamped_date(statement_date, c.due_day)
    else clamped_date((date_trunc('month', statement_date) + interval '1 month')::date, c.due_day)
  end
$$;

-- Minimum due = max(pct% of total, ₹200) + EMIs due in full; never above total.
create or replace function minimum_due(total numeric, pct numeric default 5, emi_due numeric default 0)
returns numeric language sql immutable as $$
  select case when total <= 0 then 0
    else round(least(total,
      case when total - emi_due > 0 then greatest((total - emi_due) * pct / 100, 200) else 0 end + emi_due), 2)
  end
$$;

-- ---------------------------------------------------------------- assign_card_cycle()
-- On insert of a card expense, find or open the card_cycles row by occurred_at.
create or replace function assign_card_cycle() returns trigger language plpgsql security definer set search_path = public as $$
declare
  c credit_cards;
  r record;
  cyc_id uuid;
begin
  if new.type not in ('expense','refund') or new.account_id is null then return new; end if;
  select * into c from credit_cards where account_id = new.account_id;
  if not found then return new; end if;
  select * into r from card_cycle_for((new.occurred_at at time zone 'Asia/Kolkata')::date, c.statement_day);
  insert into card_cycles (user_id, card_id, start_date, end_date, status)
    values (new.user_id, c.account_id, r.start_date, r.end_date,
            case when r.end_date < ist_today() then 'closed' else 'open' end)
    on conflict (card_id, start_date) do nothing;
  select id into cyc_id from card_cycles where card_id = c.account_id and start_date = r.start_date;
  new.card_cycle_id := cyc_id;
  return new;
end $$;

create trigger transactions_assign_card_cycle
  before insert or update of occurred_at, account_id on transactions
  for each row execute function assign_card_cycle();

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger transactions_touch before update on transactions for each row execute function touch_updated_at();

-- ---------------------------------------------------------------- balances
create or replace function account_balance(p_account uuid, p_as_of date default null) returns numeric
language sql stable as $$
  with a as (select * from accounts where id = p_account),
  t as (
    select coalesce(sum(
      case
        when x.type = 'expense' and x.account_id = p_account then
          -coalesce((select sum((p->>'amount')::numeric) from jsonb_array_elements(x.payers) p where p->>'friend_id' is null),
                    case when x.paid_by_friend_id is null then x.amount else 0 end)
        when x.type in ('income','refund') and x.account_id = p_account then x.amount
        when x.type in ('transfer','card_payment') then
          (case when x.to_account_id = p_account then x.amount else 0 end) -
          (case when x.account_id = p_account then x.amount else 0 end)
        when x.type = 'adjustment' and x.account_id = p_account then coalesce(x.adjustment_sign, 1) * x.amount
        else 0 end), 0) as v
    from transactions x, a
    where (x.account_id = p_account or x.to_account_id = p_account)
      and x.deleted_at is null and not x.is_draft
      and (x.occurred_at at time zone 'Asia/Kolkata')::date >= a.opening_date
      and (p_as_of is null or (x.occurred_at at time zone 'Asia/Kolkata')::date <= p_as_of)
  ),
  s as (
    select coalesce(sum(case when direction = 'received' then amount else -amount end), 0) as v
    from settlements, a where account_id = p_account and date >= a.opening_date and (p_as_of is null or date <= p_as_of)
  )
  select a.opening_balance + t.v + s.v from a, t, s
$$;

-- ---------------------------------------------------------------- close_card_cycle()
-- Totals each finished cycle, sets total_due / min_due / due_date, opens the next one.
create or replace function close_card_cycle(p_card uuid) returns int language plpgsql security definer set search_path = public as $$
declare
  c credit_cards;
  cyc card_cycles;
  total numeric;
  closed int := 0;
  nxt record;
begin
  select * into c from credit_cards where account_id = p_card;
  if not found then return 0; end if;
  for cyc in select * from card_cycles where card_id = p_card and end_date < ist_today() and (status = 'open' or total_due is null) loop
    select coalesce(sum(case
        when type = 'expense' and emi_id is null then amount
        when type = 'refund' then -amount
        else 0 end), 0)
      into total
      from transactions
      where account_id = p_card and deleted_at is null and not is_draft
        and (occurred_at at time zone 'Asia/Kolkata')::date between cyc.start_date and cyc.end_date;
    update card_cycles set status = 'closed', total_due = total,
      min_due = minimum_due(total, c.min_due_pct), due_date = card_due_date(c, cyc.end_date)
      where id = cyc.id;
    if total > 0 then
      insert into notifications (user_id, id, kind, title, body, href)
        values (c.user_id, format('stmt-%s-%s', p_card, cyc.end_date), 'card',
                format('Statement ₹%s due %s', to_char(total, 'FM99,99,99,990'), to_char(card_due_date(c, cyc.end_date), 'DD Mon')),
                format('Minimum ₹%s.', to_char(minimum_due(total, c.min_due_pct), 'FM99,99,99,990')), '/cards/' || p_card)
        on conflict do nothing;
    end if;
    closed := closed + 1;
  end loop;
  select * into nxt from card_cycle_for(ist_today(), c.statement_day);
  insert into card_cycles (user_id, card_id, start_date, end_date) values (c.user_id, p_card, nxt.start_date, nxt.end_date)
    on conflict (card_id, start_date) do nothing;
  perform allocate_card_payments(p_card);
  return closed;
end $$;

-- Payment allocation: oldest unpaid statement first, then the open cycle.
create or replace function allocate_card_payments(p_card uuid) returns void language plpgsql security definer set search_path = public as $$
declare pool numeric; cyc card_cycles; take numeric;
begin
  select coalesce(sum(amount), 0) into pool from transactions
    where to_account_id = p_card and type in ('card_payment','transfer') and deleted_at is null and not is_draft;
  for cyc in select * from card_cycles where card_id = p_card and status = 'closed' order by start_date loop
    take := least(pool, greatest(coalesce(cyc.total_due, 0), 0));
    update card_cycles set amount_paid = take where id = cyc.id;
    pool := pool - take;
  end loop;
end $$;

-- ---------------------------------------------------------------- release_ipo_hold()
-- Releases the full hold (0 shares) or the unallotted part, and records the holding.
create or replace function release_ipo_hold(p_ipo uuid, p_shares int) returns void
language plpgsql security invoker as $$
declare
  a ipo_applications;
  applied int;
  invested numeric;
  demat uuid;
begin
  select * into a from ipo_applications where id = p_ipo for update;
  if not found then raise exception 'IPO % not found', p_ipo; end if;
  applied := a.lots * a.lot_size;
  invested := p_shares * coalesce(a.issue_price, a.bid_price);
  update ipo_applications set
    shares_allotted = p_shares,
    status = case when p_shares = 0 then 'not_allotted' when p_shares < applied then 'partial' else 'allotted' end,
    allotment_date = coalesce(allotment_date, ist_today()),
    refund_received = p_shares < applied
  where id = p_ipo;
  update holds set status = case when p_shares = 0 then 'released' else 'converted' end, released_at = now()
    where ipo_application_id = p_ipo and status = 'active';
  if p_shares > 0 then
    select id into demat from accounts where user_id = a.user_id and type = 'demat' and not archived order by created_at limit 1;
    if demat is not null then
      insert into transactions (user_id, type, amount, account_id, to_account_id, method, merchant, ipo_application_id)
        values (a.user_id, 'transfer', invested, a.account_id, demat, 'netbanking', a.company || ' IPO', p_ipo);
    end if;
    insert into holdings (user_id, name, kind, quantity, avg_cost, current_price, account_id, ipo_application_id, buy_date)
      values (a.user_id, a.company, 'stock', p_shares, coalesce(a.issue_price, a.bid_price), coalesce(a.issue_price, a.bid_price), demat, p_ipo, ist_today());
  end if;
end $$;

-- ---------------------------------------------------------------- friend_balances
-- Net per friend (positive = they owe me) for single-payer bills; multi-payer
-- bills are netted in the client engine.
create or replace view friend_balances with (security_invoker = true) as
with bills as (
  select s.friend_id, s.user_id,
    case
      when t.paid_by_friend_id is null and t.payers is null then s.share                   -- I paid: their share is owed to me
      when t.paid_by_friend_id = s.friend_id then -coalesce(t.my_share, 0)                 -- they paid: I owe my share
      else 0 end as v
  from transaction_splits s join transactions t on t.id = s.transaction_id
  where s.friend_id is not null and t.deleted_at is null and not t.is_draft and t.type = 'expense'
),
paid_by_friend_not_in_split as (
  select t.paid_by_friend_id as friend_id, t.user_id, -coalesce(t.my_share, 0) as v
  from transactions t
  where t.paid_by_friend_id is not null and t.deleted_at is null and not t.is_draft
    and not exists (select 1 from transaction_splits s where s.transaction_id = t.id and s.friend_id = t.paid_by_friend_id)
),
sett as (
  select friend_id, user_id, case when direction = 'received' then -amount else amount end as v from settlements
)
select friend_id, user_id, sum(v)::numeric(14,2) as balance
from (select * from bills union all select * from paid_by_friend_not_in_split union all select * from sett) x
group by friend_id, user_id;

-- ---------------------------------------------------------------- safe_to_spend()
-- Month = income − fixed commitments − goal reserve − buffer − spent − IPO holds.
-- Today = (month − upcoming variable commitments) ÷ days left.
create or replace function safe_to_spend(cycle_start date, cycle_end date default null)
returns jsonb language plpgsql stable security invoker as $$
declare
  uid uuid := auth.uid();
  c_end date := coalesce(cycle_end, (cycle_start + interval '1 month - 1 day')::date);
  today date := ist_today();
  p profiles;
  income numeric; expected numeric := 0; fixed numeric := 0; variable numeric := 0;
  invest numeric; reserve numeric := 0; buffer numeric; spent numeric; spent_today numeric; holds_amt numeric;
  month numeric; days_left int; daily numeric; liquid numeric; cards numeric;
  r recurring_rules; occ date;
begin
  select * into p from profiles where user_id = uid limit 1;

  select coalesce(sum(amount), 0) into income from transactions
    where user_id = uid and type = 'income' and deleted_at is null and not is_draft and not exclude_from_budget
      and (occurred_at at time zone 'Asia/Kolkata')::date between cycle_start and c_end;
  if not exists (select 1 from transactions where user_id = uid and type = 'income' and is_salary and deleted_at is null
                 and (occurred_at at time zone 'Asia/Kolkata')::date between cycle_start and c_end) then
    select coalesce((select amount from recurring_rules where user_id = uid and kind = 'salary' and active limit 1), p.salary, 0) into expected;
  end if;
  income := income + expected;

  -- Unposted monthly outflow rules due in the cycle (other frequencies are handled by the client engine).
  for r in select * from recurring_rules where user_id = uid and active and txn_type <> 'income' and frequency = 'monthly' loop
    occ := clamped_date(cycle_start, r.due_day);
    if occ < cycle_start then occ := clamped_date((cycle_start + interval '1 month')::date, r.due_day); end if;
    continue when occ > c_end or occ < r.start_date or (r.end_date is not null and occ > r.end_date);
    continue when exists (select 1 from transactions t where t.recurring_rule_id = r.id and t.deleted_at is null and not t.is_draft
                          and abs((t.occurred_at at time zone 'Asia/Kolkata')::date - occ) <= 15);
    if r.amount_min is not null and r.amount_max is not null then
      if occ >= today then
        variable := variable + coalesce((select avg(amount) from (select amount from transactions where recurring_rule_id = r.id
          and deleted_at is null and not is_draft order by occurred_at desc limit 3) x), (r.amount_min + r.amount_max) / 2);
      end if;
    else
      fixed := fixed + r.amount;
    end if;
  end loop;

  select greatest(coalesce(sum(case when ta.type in ('demat','loan') and (fa.type not in ('demat','loan')) then t.amount
                                     when fa.type in ('demat','loan') and (ta.type not in ('demat','loan')) then -t.amount else 0 end), 0), 0)
    into invest
    from transactions t join accounts fa on fa.id = t.account_id join accounts ta on ta.id = t.to_account_id
    where t.user_id = uid and t.type = 'transfer' and t.deleted_at is null and not t.is_draft
      and (t.occurred_at at time zone 'Asia/Kolkata')::date between cycle_start and c_end;

  select coalesce(sum(contributed), 0) into reserve from (
    select g.id, coalesce(sum(gc.amount), 0) as contributed from goals g
      left join goal_contributions gc on gc.goal_id = g.id and gc.date between cycle_start and c_end
      where g.user_id = uid and not g.archived group by g.id) x;

  buffer := round(income * coalesce(p.buffer_pct, 5) / 100, 2);

  select coalesce(sum(case when type = 'expense' then coalesce(my_share, amount) when type = 'refund' then -amount else 0 end), 0),
         coalesce(sum(case when (occurred_at at time zone 'Asia/Kolkata')::date = today then
                      case when type = 'expense' then coalesce(my_share, amount) when type = 'refund' then -amount else 0 end else 0 end), 0)
    into spent, spent_today
    from transactions where user_id = uid and deleted_at is null and not is_draft and not exclude_from_budget
      and (occurred_at at time zone 'Asia/Kolkata')::date between cycle_start and c_end;

  select coalesce(sum(amount), 0) into holds_amt from holds where user_id = uid and status = 'active';

  month := income - fixed - invest - reserve - buffer - spent - holds_amt;
  days_left := greatest(1, c_end - today + 1);
  daily := round((month + spent_today - variable) / days_left, 2);

  select coalesce(sum(account_balance(id)), 0) into liquid from accounts where user_id = uid and not archived and type in ('savings','cash','wallet');
  select coalesce(sum(greatest(-account_balance(id), 0)), 0) into cards from accounts where user_id = uid and not archived and type = 'credit_card';

  return jsonb_build_object(
    'cycle_start', cycle_start, 'cycle_end', c_end, 'income', income, 'expected_salary', expected,
    'fixed_commitments', fixed, 'variable_upcoming', variable, 'investments', invest, 'goal_reserve', reserve,
    'buffer', buffer, 'spent', spent, 'spent_today', spent_today, 'holds', holds_amt, 'month', month,
    'days_left', days_left, 'daily_allowance', greatest(daily, 0), 'today_left', greatest(daily - spent_today, 0),
    'true_cash', liquid - cards - holds_amt, 'card_outstanding', cards);
end $$;

-- ---------------------------------------------------------------- scheduled jobs
create or replace function log_job(p_user uuid, p_job text, p_result text) returns void language sql security definer set search_path = public as $$
  insert into job_runs (user_id, id, job, ran_at, result) values (p_user, p_job || ':' || ist_today(), p_job, now(), p_result)
  on conflict (user_id, id) do update set ran_at = excluded.ran_at, result = excluded.result;
$$;

-- post_recurring (06:00 IST): post due monthly rules or create confirm-drafts.
create or replace function job_post_recurring() returns void language plpgsql security definer set search_path = public as $$
declare r recurring_rules; occ date; n int;
begin
  for r in select * from recurring_rules where active and frequency = 'monthly' loop
    occ := clamped_date(ist_today(), r.due_day);
    continue when occ > ist_today() or occ < r.start_date or (r.end_date is not null and occ > r.end_date);
    continue when exists (select 1 from transactions t where t.recurring_rule_id = r.id
                          and abs((t.occurred_at at time zone 'Asia/Kolkata')::date - occ) <= 15);
    insert into transactions (user_id, type, amount, occurred_at, account_id, to_account_id, method, category_id, merchant,
                              recurring_rule_id, is_salary, is_draft, note, tags)
    select r.user_id, (case r.txn_type when 'transfer' then 'transfer' when 'income' then 'income' else 'expense' end)::txn_type,
           r.amount, (occ + time '09:00') at time zone 'Asia/Kolkata',
           coalesce(r.account_id, (select id from accounts where user_id = r.user_id and type = 'savings' and not archived order by is_default desc, created_at limit 1)),
           r.to_account_id, r.method, r.category_id, coalesce(r.landlord, r.name), r.id, r.kind = 'salary', not r.auto_post,
           case when r.auto_post then null else 'Confirm amount' end, r.tags
    where coalesce(r.account_id, (select id from accounts where user_id = r.user_id and type = 'savings' limit 1)) is not null;
    get diagnostics n = row_count;
    if n > 0 then
      insert into notifications (user_id, id, kind, title, body, href) values (r.user_id,
        format('rec-%s-%s-%s', case when r.auto_post then 'posted' else 'confirm' end, r.id, occ), 'recurring',
        case when r.auto_post then r.name || ' auto-posted' else 'Confirm ' || r.name end,
        format('₹%s on %s.', to_char(r.amount, 'FM99,99,99,990'), to_char(occ, 'DD Mon')),
        case when r.auto_post then '/plan/recurring' else '/activity?drafts=1' end) on conflict do nothing;
    end if;
  end loop;
  -- Soft-deleted transactions are purged after 30 days.
  delete from transactions where deleted_at < now() - interval '30 days';
end $$;

create or replace function job_close_card_cycles() returns void language plpgsql security definer set search_path = public as $$
declare c credit_cards; n int;
begin
  for c in select * from credit_cards loop
    n := close_card_cycle(c.account_id);
    perform log_job(c.user_id, 'close_card_cycles', format('closed %s', n));
  end loop;
end $$;

-- reminders (09:00 and 21:00 IST): card dues 5/2/0 days, bills due, IPO events, daily nudge.
create or replace function job_reminders() returns void language plpgsql security definer set search_path = public as $$
declare cyc record; r recurring_rules; a ipo_applications; occ date; d int; p profiles;
begin
  for cyc in select cc.*, acc.name as card_name from card_cycles cc join accounts acc on acc.id = cc.card_id
             where cc.status = 'closed' and cc.total_due > cc.amount_paid and cc.due_date is not null loop
    d := cyc.due_date - ist_today();
    if d in (5, 2, 0) then
      insert into notifications (user_id, id, kind, title, body, href) values (cyc.user_id,
        format('due-%s-%s-%s', cyc.card_id, cyc.due_date, d), 'card',
        case when d = 0 then cyc.card_name || ' bill due today' else format('%s bill due in %s days', cyc.card_name, d) end,
        format('₹%s due · minimum ₹%s.', to_char(cyc.total_due - cyc.amount_paid, 'FM99,99,99,990'), to_char(coalesce(cyc.min_due_override, cyc.min_due), 'FM99,99,99,990')),
        '/cards/' || cyc.card_id) on conflict do nothing;
    end if;
  end loop;

  for r in select * from recurring_rules where active and txn_type <> 'income' and frequency = 'monthly' loop
    occ := clamped_date(ist_today(), r.due_day);
    continue when occ < ist_today() or occ > ist_today() + 2;
    continue when exists (select 1 from transactions t where t.recurring_rule_id = r.id and t.deleted_at is null
                          and abs((t.occurred_at at time zone 'Asia/Kolkata')::date - occ) <= 15);
    insert into notifications (user_id, id, kind, title, body, href) values (r.user_id, format('bill-%s-%s-%s', r.id, occ, occ - ist_today()), 'bill',
      case occ - ist_today() when 0 then r.name || ' due today' when 1 then r.name || ' due tomorrow' else r.name || ' due in 2 days' end,
      format('₹%s · %s.', to_char(r.amount, 'FM99,99,99,990'), to_char(occ, 'DD Mon')), '/plan/recurring') on conflict do nothing;
  end loop;

  for a in select * from ipo_applications where status in ('applied','blocked','allotted','partial','holding') loop
    if a.status in ('applied','blocked') and a.allotment_date = ist_today() + 1 then
      insert into notifications (user_id, id, kind, title, body, href) values (a.user_id, format('ipo-allot-%s-%s', a.id, a.allotment_date), 'ipo',
        a.company || ': allotment out tomorrow', 'Check allotment status and update the app.', '/invest') on conflict do nothing;
    end if;
    if a.status in ('applied','blocked') and a.mandate_date = ist_today() then
      insert into notifications (user_id, id, kind, title, body, href) values (a.user_id, format('ipo-mandate-%s', a.id), 'ipo',
        a.company || ': UPI mandate expires today', 'Approve the mandate in your UPI app if you haven''t.', '/invest') on conflict do nothing;
    end if;
    if a.status in ('allotted','partial','holding') and a.listing_date = ist_today() then
      insert into notifications (user_id, id, kind, title, body, href) values (a.user_id, format('ipo-list-%s', a.id), 'ipo',
        a.company || ' lists today 10 AM', 'Record the listing price and any sale.', '/invest') on conflict do nothing;
    end if;
  end loop;

  if extract(hour from now() at time zone 'Asia/Kolkata') >= 21 then
    for p in select * from profiles where notify_daily_nudge and onboarded loop
      if not exists (select 1 from transactions where user_id = p.user_id and type = 'expense' and deleted_at is null
                     and (occurred_at at time zone 'Asia/Kolkata')::date = ist_today()) then
        insert into notifications (user_id, id, kind, title, body, href) values (p.user_id, 'nudge-' || ist_today(), 'nudge',
          'Log today''s spends?', 'Takes 5 seconds with quick-add.', '/?add=1') on conflict do nothing;
      end if;
    end loop;
  end if;
end $$;

-- budget_pace (20:00 IST): warnings at 80% / 100% of a category (calendar-month approximation server-side).
create or replace function job_budget_pace() returns void language plpgsql security definer set search_path = public as $$
declare b record; spent numeric; m_start date := date_trunc('month', ist_today())::date;
begin
  for b in select bl.*, c.name from budget_lines bl join categories c on c.id = bl.category_id loop
    select coalesce(sum(case when t.type = 'expense' then coalesce(t.my_share, t.amount) when t.type = 'refund' then -t.amount else 0 end), 0)
      into spent from transactions t left join categories c on c.id = t.category_id
      where t.user_id = b.user_id and t.deleted_at is null and not t.is_draft and not t.exclude_from_budget
        and (t.category_id = b.category_id or c.parent_id = b.category_id)
        and (t.occurred_at at time zone 'Asia/Kolkata')::date >= m_start;
    if b.amount > 0 and spent >= b.amount then
      insert into notifications (user_id, id, kind, title, body, href) values (b.user_id, format('pace100-%s-%s', b.id, m_start), 'budget',
        b.name || ' budget used up', format('₹%s of ₹%s.', to_char(spent, 'FM99,99,99,990'), to_char(b.amount, 'FM99,99,99,990')), '/plan') on conflict do nothing;
    elsif b.amount > 0 and spent >= b.amount * 0.8 then
      insert into notifications (user_id, id, kind, title, body, href) values (b.user_id, format('pace80-%s-%s', b.id, m_start), 'budget',
        format('%s at %s%%', b.name, round(spent * 100 / b.amount)), format('₹%s left.', to_char(b.amount - spent, 'FM99,99,99,990')), '/plan') on conflict do nothing;
    end if;
  end loop;
end $$;

-- snapshot_net_worth (23:55 IST): accounts + holdings + receivables − card dues − loans.
create or replace function job_snapshot_net_worth() returns void language plpgsql security definer set search_path = public as $$
declare u uuid; v numeric;
begin
  for u in select distinct user_id from accounts loop
    select coalesce(sum(case when type in ('credit_card','loan') then least(account_balance(id), 0) else account_balance(id) end), 0)
      into v from accounts where user_id = u and include_in_net_worth and type <> 'demat';
    v := v + coalesce((select sum(quantity * current_price) from holdings where user_id = u), 0)
           + coalesce((select sum(balance) from friend_balances where user_id = u), 0);
    insert into net_worth_snapshots (user_id, id, date, value) values (u, ist_today()::text, ist_today(), v)
      on conflict (user_id, id) do update set value = excluded.value;
    perform log_job(u, 'snapshot_net_worth', v::text);
  end loop;
end $$;

-- Schedules (pg_cron runs in UTC; IST = UTC + 5:30).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('post_recurring',     '30 0 * * *',  'select job_post_recurring()');     -- 06:00 IST
    perform cron.schedule('close_card_cycles',  '45 18 * * *', 'select job_close_card_cycles()');  -- 00:15 IST
    perform cron.schedule('reminders_morning',  '30 3 * * *',  'select job_reminders()');          -- 09:00 IST
    perform cron.schedule('reminders_evening',  '30 15 * * *', 'select job_reminders()');          -- 21:00 IST
    perform cron.schedule('budget_pace',        '30 14 * * *', 'select job_budget_pace()');        -- 20:00 IST
    perform cron.schedule('snapshot_net_worth', '25 18 * * *', 'select job_snapshot_net_worth()'); -- 23:55 IST
  end if;
end $$;
