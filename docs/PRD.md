# Paisa OS — Personal Finance App PRD

Oct 19, 2026 · @Deep · v1.0

## 1. Overview

Paisa OS is a single-user, mobile-first web app (PWA) that tells Deep one number at any moment: **how much he can still safely spend this month**, after counting UPI spends, credit card spends, rent, IPO money locked in bids, money friends owe him, and savings goals.

### Problem

- UPI spends leave the bank account instantly, but credit card spends only hit the account weeks later at bill payment. Most budget apps either double-count card spends or ignore them until the bill, so the "money left" figure is always wrong.
- IPO applications block money via ASBA/UPI mandate for days, then either refund it or turn it into shares. Bank balance swings without real spending.
- Fixed obligations (rent, subscriptions, EMIs) must come out first, regardless of anything else.
- Shared outings with friends create a running tab of who owes whom that lives only in memory or chat.

### Goals

1. One trustworthy **Safe-to-Spend** figure for today, this week and the rest of the month, combining UPI + card + committed outflows.
2. Logging a spend in **under 5 seconds** (quick-add, templates, share-sheet, SMS parsing).
3. Full lifecycle tracking for credit cards (statement cycle, unbilled, due date, rewards) and IPOs (apply → block → allot/refund → list → sell → P&L).
4. A friends ledger with net balances per person, split bills and settle-up via UPI deep links.
5. Insights that change behaviour: forecasts, anomaly alerts, category trends, savings rate, net worth.

### Non-goals (v1)

- Multi-user households or sharing the app with others (friends never log in; they are contacts in Deep's ledger).
- Direct bank account aggregation via Account Aggregator APIs (kept as a later option).
- Placing IPO bids or trades from inside the app.
- Tax filing; the app only exports data for it.

### Success metrics

| Metric | Target |
| --- | --- |
| Transactions logged vs actual (monthly reconciliation) | ≥ 95% |
| Median time to add a transaction | ≤ 5 s |
| Safe-to-Spend error vs month-end actual | ≤ ₹500 |
| Days per month the app is opened | ≥ 25 |
| Months where spend stays within budget | trend up quarter over quarter |
| Friends ledger: unsettled balance older than 30 days | ₹0 |

## 2. User and jobs-to-be-done

The only user is Deep: a salaried employee in India paid monthly into one bank account, spending via UPI and one (later more) credit card, paying fixed rent, applying to IPOs, and going out regularly with a friend group where who-pays rotates.

| # | When I… | I want to… | So that… |
| --- | --- | --- | --- |
| J1 | open the app any day | see Safe-to-Spend for today and the month | I know instantly if I can afford something |
| J2 | pay via UPI or card | log it in seconds, with category and payment method | nothing slips through |
| J3 | get my card statement | see billed vs unbilled, due date, minimum due, and pay it | I never pay interest or a late fee |
| J4 | salary is credited | have rent, bills, SIPs and goals reserved first | I spend only what is truly free |
| J5 | apply to an IPO | track blocked money, allotment, refund, listing gain | my balance makes sense and I know my IPO P&L |
| J6 | go out with friends | record who paid and how to split | everyone's net balance is clear and settled |
| J7 | end the month | see where money went, savings rate, net worth change | I improve next month |
| J8 | plan something big (trip, gadget) | set a goal and auto-save toward it | I buy it without breaking the budget |
| J9 | it's tax season | export categorized data, IPO capital gains, rent paid | filing is painless |

### Assumptions

- Currency INR only; Indian number format (₹1,23,456).
- Salary arrives once a month; the budget month start day is fully configurable (any day 1–31, or calendar month), since salary day differs between employers.
- Default timezone Asia/Kolkata.

## 3. Core concept: the Safe-to-Spend engine

The app budgets on **spend date, not settlement date**: a ₹1,200 card swipe reduces this month's budget the moment it happens, even though the bank pays the card next month. Card bill payments are then treated as a *transfer*, never as a second expense.

### Money model

- **Account**: bank, cash, wallet, credit card, investment (demat), or "friend" (a receivable/payable). Every rupee lives in one.
- **Transaction**: expense, income, transfer, refund, or adjustment, always tied to an account and a payment method (UPI, card, cash, netbanking, auto-debit).
- **Commitment**: money already promised for this cycle but not yet paid (rent, bills, SIPs, card dues from last cycle, goal contributions).
- **Hold**: money temporarily locked (IPO bid blocks). Not spent, not available.
- **Receivable / Payable**: friends' balances. Shown separately; optionally counted.

### The formula

```latex
\text{SafeToSpend}_{month} = \text{Income}_{cycle} - \text{Commitments}_{fixed} - \text{GoalReserve} - \text{Buffer} - \text{Spent}_{UPI+Card+Cash} - \text{IPOHolds}_{active}
```

```latex
\text{SafeToSpend}_{today} = \frac{\text{SafeToSpend}_{month} - \text{UpcomingVariableCommitments}}{\text{DaysLeftInCycle}}
```

- **Spent** includes UPI, cash and every card swipe (billed or unbilled) in the current cycle; card bill payments are excluded.
- **Buffer** is a user-set safety cushion (default 5% of income).
- **IPO holds** reduce Safe-to-Spend while active and are released automatically on refund.
- **Friend receivables** are always excluded: money friends owe you shows on its own card and adds to Safe-to-Spend only when a settlement is actually received.

### Three numbers on the home screen

1. **Today you can spend**: daily allowance, rolls over unused amounts.
2. **Left this month**: Safe-to-Spend for the cycle.
3. **Real bank balance after card dues**: bank balance minus all outstanding card amounts (billed + unbilled). This is the "true cash" view that stops card spends from feeling free.

## 4. Feature modules

Twelve modules, each tagged P0 (MVP), P1 (v1.1) or P2 (later). Priorities feed the roadmap in section 11.

### 4.1 Accounts and payment methods (P0)

- Account types: savings, salary, cash, wallet (Paytm/Amazon Pay), credit card, demat, loan, friend.
- UPI handles linked to a bank account (e.g. `deep@boi` → Bank of India Savings) so a UPI spend debits the right account.
- RuPay credit card on UPI is a first-class case: a UPI spend can be paid from the bank (debits Bank of India now) or from the RuPay card (adds to the card bill). Quick-add asks "Bank or RuPay?" once per merchant and remembers the answer; keyword \`rupay\` or \`card\` forces the card.
- Opening balance, current balance, archive, colour + icon, "exclude from net worth" flag.
- Monthly **balance reconciliation**: enter actual balance; app shows the gap and offers an adjustment entry.

### 4.2 Transactions (P0)

- Types: expense, income, transfer, refund, card bill payment, adjustment.
- Fields: amount, date-time, account, payment method, category + sub-category, merchant, note, tags, attachments (receipt photo), location (optional), split flag, recurring link, "exclude from budget" flag.
- **Quick-add bar** with natural language: `450 swiggy card` or `1200 dinner upi split rahul amit` → parsed into amount, category, method, split.
- **Merchant memory**: typing "Swiggy" auto-fills category Food › Delivery and last-used method.
- Templates / favourites for frequent spends (metro, chai, fuel).
- Refunds linked to the original transaction; partial refunds supported.
- Bulk edit, duplicate detection (same amount + merchant within 10 minutes), full-text search, filters by any field, undo for 10 seconds after delete.

### 4.3 Credit card management (P0)

- Card setup: bank, last 4 digits, limit, statement day, due day (or "N days after statement"), annual fee + waiver threshold, reward rate rules.
- Auto-computed **billing cycles**: each swipe lands in the open cycle by date; on statement day the cycle closes into a **statement** with total due, minimum due (5% default, editable) and due date.
- Live card view: unbilled amount, last statement due, available limit, utilisation % (alert above 30%).
- Pay bill flow: records a transfer bank → card; partial payments tracked; statement marked paid / partly paid / overdue.
- **EMI conversions**: convert a swipe into EMI (tenure, rate, processing fee); each month's EMI + interest + GST becomes a scheduled card charge.
- Rewards tracker: points earned per rule (e.g. 5% on Swiggy, 1% elsewhere), points balance, expiry.
- Annual-fee waiver progress: "₹38,000 more spend to waive ₹999 fee by 14 Mar".
- Statement reconciliation: paste/upload PDF statement (P1) → match lines to logged swipes → highlight missing ones.

### 4.4 Budgets (P0)

- Budget month setting: choose calendar month or a custom start day (1–31, e.g. the 25th to the 24th). Days past a month's end fall back to its last day. Option to start the cycle on the day salary actually lands, so a salary that arrives early or late before a holiday shifts the cycle automatically. Changing the setting starts the new cycle from the next start date and never rewrites past months.
- **Category budgets** with envelope behaviour; optional rollover of unspent amounts.
- Budget across methods: one Food budget consumes UPI + card + cash alike; a method split chart shows how it was paid.
- Optional **card cap**: max total card spend this cycle (keeps the next bill predictable).
- Pace indicator per category: "spent 62% with 40% of the month gone → over pace".
- Zero-based mode (P1): assign every rupee of salary to a category, goal or commitment.

### 4.5 Recurring payments, rent and bills (P0)

- Recurring rules: amount (fixed or variable range), frequency (monthly, quarterly, yearly, custom), due day, account/method, auto-post vs remind-to-confirm.
- Rent: landlord name, amount, due day, annual escalation %, deposit held (as receivable), payment history, **rent receipts** generated as PDF for HRA claims (P1).
- Bills: electricity, internet, mobile, OTT subscriptions; **subscription audit** listing all subscriptions with yearly cost and last-used note.
- Upcoming payments calendar; all fixed commitments are reserved from Safe-to-Spend on salary day.

### 4.6 IPO and investments (P0 IPO, P1 portfolio)

- IPO lifecycle states: **Applied → Funds blocked → Allotment pending → Allotted / Not allotted → Refund received → Listed → Sold / Holding**.
- Per application: IPO name, category (Retail / SHNI / employee), lots, price band, bid price, amount blocked, bank account, UPI mandate date, applicant PAN (self by default; family PANs can be added later in Settings, each with its own allotment stats and P&L and a per-person or combined view), allotment date, listing date.
- Blocked amount appears as an **active hold** and reduces Safe-to-Spend; on "Not allotted" it is released; on partial allotment the difference is released.
- On listing: record listing price, sell price, quantity sold; app computes listing gain %, absolute P&L, and **STCG** (short-term) tax estimate.
- IPO dashboard: total applied, allotment hit-rate, capital currently blocked, lifetime P&L, best/worst IPO.
- Reminders: "allotment out tomorrow", "listing today 10 AM", "mandate expires today".
- Portfolio (P1): holdings for stocks, mutual funds and SIPs entered manually or via CSV (CAS/broker export); SIP auto-posting as recurring transfer; net worth includes investments at last-entered value.
- Optional (P2): public IPO calendar feed to pre-fill IPO details.

### 4.7 Friends and shared expenses (P0)

- Friends are contacts (name, UPI ID, phone, avatar); groups like "Weekend Gang".
- Each shared expense records **who paid** (me, a friend, or several people) and **how to split**: equal, exact amounts, percentages, shares, or itemised (per-dish).
- Only **my share** counts toward my budget; the rest becomes a receivable (I paid) or my share becomes a payable (friend paid; my expense is logged without touching my bank).
- Per-friend running balance + group balances; **simplify debts** across a group to the fewest transfers.
- Settle up: generates a UPI deep link (`upi://pay?pa=…&am=…&tn=…`) to pay, or a shareable WhatsApp message with a payment link to request money.
- Reminders for balances older than N days; settle history with dates.
- Outing mode (P1): start an "outing", add multiple bills through the night, close it and split once.
- Stats: who I spend most with, average spend per outing, who usually pays.

### 4.8 Goals and savings (P1)

- Goals with target amount, date, linked account; monthly contribution computed automatically and reserved from Safe-to-Spend.
- Emergency fund goal pre-created (target = 6 × average monthly expenses).
- Sinking funds for annual costs (insurance, card annual fee, Diwali shopping) spread monthly.
- Round-up savings: virtual round-up of each spend to nearest ₹10/₹50 into a goal.

### 4.9 Insights and reports (P0 basic, P1 advanced)

- Home: Safe-to-Spend, today's spend, upcoming payments in next 7 days, card dues, active IPO holds, friend balances.
- Monthly report: income, spend, savings rate, top categories, top merchants, UPI vs card split, month-over-month change.
- **Month-end forecast**: projected spend using daily run-rate + scheduled commitments.
- Anomaly alerts: a category 40% above its 3-month average, an unusually large transaction, a new subscription.
- Net worth over time (accounts + investments + receivables − card dues − loans).
- Spending heatmap by weekday/hour; "weekend vs weekday" spend.
- Yearly review ("Wrapped"): top merchant, biggest month, total IPO gains, total spent with friends.
- AI assistant (P2): ask in plain language, "how much did I spend on food with card last quarter?".

### 4.10 Notifications (P0)

- Web push (PWA) + optional email digest.
- Card due in 5, 2 and 0 days; statement generated; utilisation above 30%.
- Rent / bill due; recurring auto-posted.
- Budget pace warnings at 80% and 100% of a category.
- IPO allotment / refund / listing reminders.
- Daily nudge at 9 PM: "Log today's spends?" with quick-add.
- Weekly summary every Sunday.

### 4.11 Data capture and automation (P1)

- **SMS / notification parsing**: on Android, paste or share bank SMS into the app; regex templates (Bank of India account and RuPay credit card alerts first, other banks later) extract amount, merchant, account and method into a draft transaction.
- **Email statement import**: forward card statement email/PDF to a parse endpoint (P2).
- CSV import from bank statements with column mapping and duplicate check.
- Rules engine: "if merchant contains UBER → Transport › Cab".
- iOS Shortcut / Android share-target that opens quick-add pre-filled.

### 4.12 Settings, security and data (P0)

- Supabase Auth (email magic link or Google) + app PIN / device biometric (WebAuthn) to unlock.
- Privacy mode: blur amounts with one tap (for using the app in public).
- Categories editor, pay-cycle start day, currency format, default account.
- Full export (CSV, JSON), import, and delete-all.
- Tax helper (P1): rent paid summary for HRA, IPO STCG/LTCG report, 80C investments list.

## 5. Key user flows

### F1. First-time setup (≤ 3 minutes)

1. Sign in with Google or magic link; set a 4-digit app PIN.
2. Enter monthly salary and pick the budget month: calendar month or a custom start day (your salary day).
3. Add bank account(s) with current balance and UPI handle.
4. Add credit card: limit, statement day, due day, current unbilled amount.
5. Add rent and 2–3 known bills as recurring.
6. Pick suggested category budgets (pre-filled from typical splits; editable).
7. Home screen shows the first Safe-to-Spend.

### F2. Log a UPI spend

1. Tap + (or home-screen shortcut) → quick-add bar is focused.
2. Type `180 chai upi` → parsed preview: ₹180 · Food › Tea & snacks · UPI · Bank of India.
3. Tap Save → Safe-to-Spend updates instantly (optimistic UI).

### F3. Log a card spend and pay the bill

1. Log `2400 amazon card` → lands in the open RuPay card cycle; budget reduced now.
2. On statement day, the cycle closes; push: "Statement ₹18,450 due 7 Nov".
3. Tap Pay → choose bank account, amount (full / minimum / custom) → creates transfer bank → card. Budget is not touched again.

### F4. Salary day

1. Recurring income auto-posts (or user confirms the amount).
2. App reserves rent, bills, SIPs, goal contributions and the buffer.
3. Shows the new cycle's Safe-to-Spend and daily allowance.

### F5. IPO application

1. Add IPO → name, lots, price → app computes blocked amount (e.g. 1 lot × ₹14,980).
2. Hold created; Safe-to-Spend drops by ₹14,980.
3. On allotment date, push asks: Allotted / Not allotted / Partial.
4. Not allotted → hold released. Allotted → amount moves to demat holding.
5. On listing day, enter sell price → P&L and tax estimate recorded.

### F6. Dinner with friends

1. Add expense ₹3,600, "Paid by: Rahul", split equally with Rahul, Amit, Deep.
2. Deep's share ₹1,200 is logged as an expense in Food › Dining out; payable to Rahul ₹1,200.
3. Next week Deep pays a ₹2,700 movie bill split 3 ways → receivable ₹900 from Rahul and ₹900 from Amit.
4. Rahul's net balance auto-nets to "You owe Rahul ₹300"; tap Settle → UPI app opens with ₹300 pre-filled → mark settled.

### F7. Month-end review

1. Notification on the last day of cycle → monthly report.
2. Review overspent categories, roll over or reset budgets, reconcile account balances.
3. Move leftover money to a goal with one tap.

## 6. Screens and navigation

Bottom tab bar with five tabs and a floating + button; desktop gets a left sidebar with the same items. Dark mode default, light mode optional.

| Tab | Screen | Key content |
| --- | --- | --- |
| Home | Dashboard | Safe-to-Spend ring, today's allowance, true cash after card dues, next 7 days of payments, active IPO holds, friends net, budget pace bars |
| Activity | Transactions | Infinite list grouped by day, filters (method, account, category, tag), search, bulk edit, calendar view |
| Activity | Transaction detail | Fields, receipt, split breakdown, linked refund/EMI, edit history |
| Cards | Card list + card detail | Unbilled, statement, due countdown, utilisation, rewards, EMIs, fee waiver progress, pay bill |
| Plan | Budgets | Category envelopes with pace, rollover settings, card cap |
| Plan | Recurring and rent | Calendar + list, subscription audit, rent receipts |
| Plan | Goals | Progress cards, contributions, round-ups |
| Invest | IPO tracker | Kanban by lifecycle state, IPO detail, dashboard stats |
| Invest | Portfolio | Holdings, SIPs, net worth chart |
| More | Friends | People list with net balance, groups, expense feed, settle up |
| More | Reports | Monthly report, trends, heatmap, yearly review, exports |
| More | Settings | Accounts, categories, rules, notifications, security, data |
| + (FAB) | Quick-add sheet | NL input, recent templates, mode switch: expense / income / transfer / split / IPO |

### UX principles

- One-thumb reach: primary actions in the bottom half.
- Every number is tappable and drills down to the transactions behind it.
- Optimistic updates; offline queue syncs when back online.
- Colours carry meaning only: green = under pace, amber = 80%+, red = over.
- Amounts in Indian format, with a privacy blur toggle on the home header.

## 7. Technical architecture

A Next.js (App Router) PWA on Vercel talks directly to Supabase for reads/writes under Row Level Security; money-critical logic (cycle closing, recurring posting, Safe-to-Spend) lives in Postgres functions so the numbers are identical everywhere.

### Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui | Fast to build, great mobile UI primitives |
| State / data | TanStack Query + Supabase JS client | Caching, optimistic updates, offline retries |
| Charts | Recharts or Tremor | Simple, responsive charts |
| Forms / validation | React Hook Form + Zod | Same schemas on client and server actions |
| PWA | next-pwa / Serwist, Web App Manifest, Web Push (VAPID) | Install to home screen, push alerts, offline shell |
| Offline queue | IndexedDB (Dexie) | Log spends with no network; sync later |
| Auth | Supabase Auth (Google / magic link) + WebAuthn app lock | Secure, no passwords to manage |
| Database | Supabase Postgres + RLS | Single source of truth |
| Server logic | Postgres functions (RPC), Next.js server actions, Supabase Edge Functions | Atomic money operations |
| Scheduled jobs | Supabase `pg_cron` (primary) or Vercel Cron | Recurring posting, cycle close, reminders |
| Storage | Supabase Storage (private bucket) | Receipts, statements, rent receipt PDFs |
| Realtime | Supabase Realtime | Desktop and phone stay in sync |
| Email | Resend | Weekly digest, statement reminders |
| AI (P2) | Claude API via a server route | NL quick-add fallback, ask-your-money |
| Monitoring | Vercel Analytics, Sentry | Errors and performance |

### Scheduled jobs

| Job | Schedule (IST) | Does |
| --- | --- | --- |
| `post_recurring` | daily 06:00 | Posts due recurring transactions or creates confirm-drafts |
| `close_card_cycles` | daily 00:15 | Closes cycles on statement day, creates statements |
| `reminders` | daily 09:00 and 21:00 | Due dates, IPO events, daily log nudge |
| `budget_pace` | daily 20:00 | Pace warnings at 80% / 100% |
| `snapshot_net_worth` | daily 23:55 | Stores a daily net worth row for charts |
| `weekly_digest` | Sunday 10:00 | Email + push summary |

### Environments

- `main` → production on Vercel, prod Supabase project.
- Preview deployments on every PR, pointing to a staging Supabase project.
- Schema managed with Supabase CLI migrations in the repo; types generated with `supabase gen types`.

## 8. Database schema (Supabase Postgres)

About 25 tables, every one carrying `user_id` with the same RLS policy, so the app stays private even though only one user exists today. Money is stored as `numeric(14,2)` in rupees, never floats.

| Table | Purpose |
| --- | --- |
| `profiles` | Salary, pay-cycle day, buffer %, settings |
| `accounts` | Bank, cash, wallet, card, demat, loan accounts |
| `upi_handles` | UPI IDs linked to accounts |
| `categories` | Two-level category tree with icons |
| `transactions` | Every money movement |
| `transaction_splits` | Per-person shares of a shared expense |
| `credit_cards` | Card-specific settings (limit, statement/due day, rewards) |
| `card_cycles` | Open and closed billing cycles |
| `card_statements` | Closed cycles with due amounts and payment status |
| `card_emis` | EMI conversions and schedules |
| `budgets` / `budget_lines` | Cycle budgets and per-category envelopes |
| `recurring_rules` | Rent, bills, salary, SIPs, subscriptions |
| `holds` | Temporary blocks (IPO mandates) |
| `ipo_applications` | Full IPO lifecycle |
| `holdings` | Stocks / MF positions |
| `friends` / `friend_groups` / `group_members` | People and groups |
| `settlements` | Payments between me and a friend |
| `goals` / `goal_contributions` | Savings goals |
| `rules` | Auto-categorisation rules |
| `net_worth_snapshots` | Daily net worth history |
| `notifications` / `push_subscriptions` | Alerts and web-push endpoints |

### Core DDL

```sql
create type account_type as enum ('savings','cash','wallet','credit_card','demat','loan');
create type txn_type as enum ('expense','income','transfer','refund','card_payment','adjustment');
create type pay_method as enum ('upi','card','cash','netbanking','auto_debit','other');

create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  type account_type not null,
  opening_balance numeric(14,2) not null default 0,
  include_in_net_worth boolean default true,
  archived boolean default false,
  created_at timestamptz default now()
);

create table credit_cards (
  account_id uuid primary key references accounts on delete cascade,
  user_id uuid not null references auth.users,
  last4 char(4),
  credit_limit numeric(14,2) not null,
  statement_day smallint not null check (statement_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  annual_fee numeric(10,2) default 0,
  fee_waiver_spend numeric(14,2),
  reward_rules jsonb default '[]'
);

create table card_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  card_id uuid not null references credit_cards(account_id),
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open','closed')),
  total_due numeric(14,2),
  min_due numeric(14,2),
  due_date date,
  amount_paid numeric(14,2) default 0,
  unique (card_id, start_date)
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  type txn_type not null,
  amount numeric(14,2) not null check (amount > 0),
  occurred_at timestamptz not null default now(),
  account_id uuid not null references accounts,
  to_account_id uuid references accounts,          -- transfers / card payments
  method pay_method not null,
  category_id uuid references categories,
  merchant text,
  note text,
  tags text[] default '{}',
  card_cycle_id uuid references card_cycles,       -- set by trigger for card spends
  my_share numeric(14,2),                           -- null = full amount is mine
  paid_by_friend_id uuid references friends,        -- friend paid, I owe my_share
  recurring_rule_id uuid references recurring_rules,
  refund_of uuid references transactions,
  exclude_from_budget boolean default false,
  receipt_path text,
  created_at timestamptz default now()
);
create index on transactions (user_id, occurred_at desc);
create index on transactions (user_id, category_id, occurred_at);

create table transaction_splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  transaction_id uuid not null references transactions on delete cascade,
  friend_id uuid references friends,               -- null = me
  share numeric(14,2) not null
);

create table holds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  account_id uuid not null references accounts,
  amount numeric(14,2) not null,
  reason text not null,                            -- 'ipo'
  ipo_application_id uuid references ipo_applications,
  status text not null default 'active' check (status in ('active','released','converted')),
  created_at timestamptz default now(),
  released_at timestamptz
);

create table ipo_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  company text not null,
  category text default 'retail',
  applicant text default 'self',
  lots int not null,
  lot_size int not null,
  bid_price numeric(10,2) not null,
  amount_blocked numeric(14,2) generated always as (lots * lot_size * bid_price) stored,
  status text not null default 'applied',          -- applied|blocked|allotted|not_allotted|partial|listed|sold
  shares_allotted int default 0,
  allotment_date date,
  listing_date date,
  listing_price numeric(10,2),
  sell_price numeric(10,2),
  shares_sold int default 0,
  realised_pnl numeric(14,2)
);
```

### RLS policy (applied to every table)

```sql
alter table transactions enable row level security;
create policy "own rows" on transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

### Key database functions

- `assign_card_cycle()` trigger: on insert of a card-method expense, finds or opens the correct `card_cycles` row by `occurred_at`.
- `safe_to_spend(cycle_start date)` RPC: returns month, today, true-cash numbers (section 9).
- `friend_balances()` view: net per friend = receivables − payables − settlements.
- `close_card_cycle(card_id)`: totals the cycle, sets `total_due`, `min_due`, `due_date`, opens the next cycle.
- `release_ipo_hold(ipo_id, shares_allotted)`: releases full or partial hold, records holding.

## 9. Calculation logic and business rules

These rules decide every number on screen; each gets a unit test before release.

### Budget impact by transaction type

| Type | Bank balance | Card outstanding | Budget / Safe-to-Spend |
| --- | --- | --- | --- |
| UPI / cash / netbanking expense | − amount | — | − my share |
| Card expense (incl. RuPay-on-UPI) | — | + amount | − my share |
| Card bill payment | − amount | − amount | no change |
| Income (salary) | + amount | — | sets cycle income |
| Refund | + to original account | − if card | + back to category |
| Friend paid, my share | — | — | − my share (payable created) |
| I paid for friends | − full amount | + if card | − my share only (receivable created) |
| Settlement received | + amount | — | no change |
| IPO bid | — (blocked) | — | − amount while hold active |
| IPO refund / not allotted | — | — | + hold released |
| IPO allotted | − amount to demat | — | no change (becomes investment) |
| SIP / investment transfer | − amount | — | counted as commitment, not spend |

### Card cycle rules

- Cycle for a swipe on date d: the cycle whose `start_date ≤ d ≤ end_date`; `end_date` = statement day of the month; statement day beyond month length → last day of month.
- Due date = statement date + card's grace days (default 20) or fixed `due_day`.
- Minimum due = max(5% of total, ₹200) unless the user overrides; EMIs due that month are added in full.
- Statement status: paid if `amount_paid ≥ total_due`; partly paid if `≥ min_due`; overdue after due date otherwise.
- Payment allocation: oldest unpaid statement first, then the open cycle.

### Safe-to-Spend rules

- Cycle income = posted salary + other income in the cycle (or expected salary before it arrives).
- Fixed commitments = sum of active recurring rules due within the cycle that are not yet posted; posted ones already count as spend.
- Variable upcoming commitments (bills with a range) use the 3-month average.
- Daily allowance = (month left − remaining variable commitments) ÷ days left; recalculated every transaction; never shown below ₹0 (shows "over by ₹X" instead).
- True cash = Σ bank + cash + wallet − Σ card outstanding (billed + unbilled) − active holds.

### Friends ledger rules

- Split amounts must sum exactly to the bill; rounding paise go to the payer.
- Net balance per friend = Σ their shares on bills I paid − Σ my shares on bills they paid − settlements I received + settlements I paid.
- Simplify debts within a group uses the greedy max-creditor / max-debtor algorithm; it only suggests transfers, never changes history.

### IPO rules

- Blocked amount = lots × lot size × bid price (cut-off price for retail).
- Partial allotment releases (applied shares − allotted shares) × bid price.
- Listing gain % = (listing price − issue price) ÷ issue price.
- Realised P&L = (sell price − issue price) × shares sold; holding period < 12 months → STCG estimate at the current rate stored in settings (editable, since rates change).

### Edge cases

- Back-dated transactions recompute the affected cycle and card statement; closed statements show an "adjusted" badge.
- Editing a split after partial settlement keeps settlements and recomputes the balance.
- Card limit exceeded → warning, not a block.
- Salary late → expected salary keeps the cycle open; prompt to confirm.

## 10. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Performance | Home screen interactive < 1.5 s on 4G; quick-add save reflected < 200 ms (optimistic); Safe-to-Spend RPC < 100 ms |
| Availability | Vercel + Supabase managed uptime; offline mode for viewing cached data and queuing new transactions |
| Security | RLS on every table; service-role key only in server code; app lock via PIN/biometric after 5 min idle; HTTPS only; CSP headers |
| Privacy | No card numbers beyond last 4; no bank credentials stored; receipts in a private bucket with signed URLs (60 s) |
| Data integrity | Money as `numeric`; money-moving operations in single Postgres transactions; soft delete with 30-day trash; audit log of edits |
| Backup | Supabase daily backups + weekly JSON export emailed or saved to Storage |
| Accessibility | WCAG AA contrast, screen-reader labels on every amount, tap targets ≥ 44 px |
| Testing | Unit tests for every rule in section 9 (Vitest), RLS tests with pgTAP, E2E flows F1–F7 with Playwright |
| Observability | Sentry for errors, a `job_runs` table logging every cron run and its result |
| Cost | Stay within Vercel Hobby and Supabase Free tiers for a single user |

## 11. Roadmap and open questions

Ship a usable MVP in four weeks of evening/weekend work, use it daily, then add automation and investing depth in two four-week releases.

&#91;embedded content: release roadmap · 4 phases\]

Each phase starts only after the previous one's exit check passes; the schema in section 8 is created whole in Phase 1 so later phases need no breaking migrations.

### Decisions

- **Budget month**: configurable start day (1–31) or calendar month, set in onboarding and Settings.
- **Friend receivables**: always excluded from Safe-to-Spend.
- **Banks**: Bank of India savings + Bank of India RuPay credit card; SMS parser and UPI-on-RuPay handling built for these first.
- **IPO PANs**: own PAN only for now; family PANs supported as an optional add-on.
- **Name**: Paisa OS.
