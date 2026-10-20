-- safe_to_spend(): until this cycle's salary is recorded, cap the month figure at
-- true cash minus unpaid commitments (mirrors src/lib/domain/safeToSpend.ts).
-- Without it, setting up mid-month counts an already-spent salary as still to come.

create or replace function safe_to_spend(cycle_start date, cycle_end date default null)
returns jsonb language plpgsql stable security invoker as $$
declare
  uid uuid := auth.uid();
  c_end date := coalesce(cycle_end, (cycle_start + interval '1 month - 1 day')::date);
  today date := ist_today();
  p profiles;
  income numeric; expected numeric := 0; fixed numeric := 0; variable numeric := 0;
  invest numeric; reserve numeric := 0; buffer numeric; spent numeric; spent_today numeric; holds_amt numeric;
  month numeric; days_left int; daily numeric; liquid numeric; cards numeric; capped boolean := false;
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

  select coalesce(sum(account_balance(id)), 0) into liquid from accounts where user_id = uid and not archived and type in ('savings','cash','wallet');
  select coalesce(sum(greatest(-account_balance(id), 0)), 0) into cards from accounts where user_id = uid and not archived and type = 'credit_card';

  month := income - fixed - invest - reserve - buffer - spent - holds_amt;
  if expected > 0 and liquid - cards - holds_amt - fixed < month then
    month := liquid - cards - holds_amt - fixed;
    capped := true;
  end if;
  days_left := greatest(1, c_end - today + 1);
  daily := round((month + spent_today - variable) / days_left, 2);

  return jsonb_build_object(
    'cycle_start', cycle_start, 'cycle_end', c_end, 'income', income, 'expected_salary', expected,
    'fixed_commitments', fixed, 'variable_upcoming', variable, 'investments', invest, 'goal_reserve', reserve,
    'buffer', buffer, 'spent', spent, 'spent_today', spent_today, 'holds', holds_amt, 'month', month, 'capped_by_cash', capped,
    'days_left', days_left, 'daily_allowance', greatest(daily, 0), 'today_left', greatest(daily - spent_today, 0),
    'true_cash', liquid - cards - holds_amt, 'card_outstanding', cards);
end $$;
