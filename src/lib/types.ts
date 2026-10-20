// Domain types. Field names are snake_case and match the Supabase tables
// one-to-one (see supabase/migrations), so rows sync without mapping.

export type ID = string;
/** ISO date, `YYYY-MM-DD` (IST calendar date). */
export type DateStr = string;
/** ISO timestamp. */
export type Timestamp = string;

export type AccountType = "savings" | "cash" | "wallet" | "credit_card" | "demat" | "loan";
export type TxnType = "expense" | "income" | "transfer" | "refund" | "card_payment" | "adjustment";
export type PayMethod = "upi" | "card" | "cash" | "netbanking" | "auto_debit" | "other";

export interface Account {
  id: ID;
  user_id?: string;
  name: string;
  type: AccountType;
  opening_balance: number;
  /** Balance as entered at setup is valid from this date. */
  opening_date: DateStr;
  include_in_net_worth: boolean;
  archived: boolean;
  color: string;
  icon: string;
  is_default: boolean;
  created_at: Timestamp;
}

export interface UpiHandle {
  id: ID;
  user_id?: string;
  account_id: ID;
  handle: string;
}

export interface Category {
  id: ID;
  user_id?: string;
  name: string;
  parent_id: ID | null;
  icon: string;
  color: string;
  /** Spending categories are budgetable; income categories are not. */
  kind: "expense" | "income";
}

export interface Payer {
  friend_id: ID | null; // null = me
  amount: number;
}

export interface Transaction {
  id: ID;
  user_id?: string;
  type: TxnType;
  amount: number;
  occurred_at: Timestamp;
  account_id: ID | null; // null only when a friend paid the whole bill
  to_account_id: ID | null;
  method: PayMethod;
  category_id: ID | null;
  merchant: string | null;
  note: string | null;
  tags: string[];
  my_share: number | null; // null = full amount is mine
  paid_by_friend_id: ID | null;
  payers: Payer[] | null; // several people paid
  group_id: ID | null;
  split_mode: SplitMode | null;
  recurring_rule_id: ID | null;
  refund_of: ID | null;
  emi_id: ID | null;
  ipo_application_id: ID | null;
  goal_id: ID | null;
  /** +1 / -1, adjustments only. */
  adjustment_sign: number | null;
  is_salary: boolean;
  is_draft: boolean;
  exclude_from_budget: boolean;
  receipt_path: string | null;
  location: string | null;
  deleted_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type SplitMode = "equal" | "exact" | "percent" | "shares" | "itemised";

export interface TransactionSplit {
  id: ID;
  user_id?: string;
  transaction_id: ID;
  friend_id: ID | null; // null = me
  share: number;
}

export interface RewardRule {
  match: string; // merchant substring, "*" = everything else
  rate: number; // percent, e.g. 5 for 5%
}

export interface CreditCard {
  account_id: ID;
  user_id?: string;
  bank: string;
  last4: string;
  credit_limit: number;
  statement_day: number;
  due_mode: "fixed" | "after_statement";
  due_day: number;
  grace_days: number;
  min_due_pct: number;
  annual_fee: number;
  fee_waiver_spend: number | null;
  fee_anniversary: DateStr | null;
  reward_rules: RewardRule[];
  points_redeemed: number;
  points_expiry_months: number;
  is_rupay_upi: boolean;
}

export interface CardCycle {
  id: ID;
  user_id?: string;
  card_id: ID;
  start_date: DateStr;
  end_date: DateStr;
  status: "open" | "closed";
  total_due: number | null;
  min_due: number | null;
  min_due_override: number | null;
  due_date: DateStr | null;
  amount_paid: number;
}

export interface CardEmi {
  id: ID;
  user_id?: string;
  card_id: ID;
  transaction_id: ID;
  principal: number;
  tenure_months: number;
  annual_rate: number;
  processing_fee: number;
  gst_pct: number;
  start_date: DateStr;
  active: boolean;
}

export interface BudgetLine {
  id: ID;
  user_id?: string;
  category_id: ID;
  amount: number;
  rollover: boolean;
}

export type Frequency = "monthly" | "quarterly" | "yearly" | "weekly" | "custom";
export type RecurringKind = "rent" | "bill" | "subscription" | "salary" | "sip" | "emi" | "income" | "other";

export interface RecurringRule {
  id: ID;
  user_id?: string;
  name: string;
  kind: RecurringKind;
  txn_type: "expense" | "income" | "transfer";
  amount: number;
  amount_min: number | null; // variable range
  amount_max: number | null;
  frequency: Frequency;
  interval_days: number | null; // custom frequency
  due_day: number;
  start_date: DateStr;
  end_date: DateStr | null;
  account_id: ID | null;
  to_account_id: ID | null;
  method: PayMethod;
  category_id: ID | null;
  auto_post: boolean;
  active: boolean;
  landlord: string | null;
  landlord_pan: string | null;
  property_address: string | null;
  escalation_pct: number;
  deposit: number;
  last_used_note: string | null;
  tags: string[];
}

export interface Hold {
  id: ID;
  user_id?: string;
  account_id: ID;
  amount: number;
  reason: string;
  ipo_application_id: ID | null;
  status: "active" | "released" | "converted";
  created_at: Timestamp;
  released_at: Timestamp | null;
}

export type IpoStatus =
  | "applied"
  | "blocked"
  | "allotted"
  | "not_allotted"
  | "partial"
  | "listed"
  | "sold"
  | "holding";

export interface IpoApplication {
  id: ID;
  user_id?: string;
  company: string;
  category: "retail" | "shni" | "employee" | "shareholder";
  applicant: string; // 'self' or a family PAN label
  lots: number;
  lot_size: number;
  price_band_low: number | null;
  price_band_high: number | null;
  bid_price: number;
  issue_price: number | null;
  account_id: ID;
  applied_date: DateStr;
  mandate_date: DateStr | null;
  allotment_date: DateStr | null;
  listing_date: DateStr | null;
  status: IpoStatus;
  shares_allotted: number;
  listing_price: number | null;
  sell_price: number | null;
  shares_sold: number;
  sold_date: DateStr | null;
  realised_pnl: number | null;
  refund_received: boolean;
}

export interface Holding {
  id: ID;
  user_id?: string;
  name: string;
  symbol: string | null;
  kind: "stock" | "mf" | "etf" | "other";
  quantity: number;
  avg_cost: number;
  current_price: number;
  account_id: ID | null;
  ipo_application_id: ID | null;
  buy_date: DateStr | null;
  as_of: DateStr;
}

export interface Friend {
  id: ID;
  user_id?: string;
  name: string;
  upi_id: string | null;
  phone: string | null;
  color: string;
  archived: boolean;
}

export interface FriendGroup {
  id: ID;
  user_id?: string;
  name: string;
  emoji: string;
}

export interface GroupMember {
  id: ID;
  user_id?: string;
  group_id: ID;
  friend_id: ID;
}

export interface Settlement {
  id: ID;
  user_id?: string;
  friend_id: ID;
  direction: "received" | "paid";
  amount: number;
  date: DateStr;
  account_id: ID | null;
  note: string | null;
}

export interface Goal {
  id: ID;
  user_id?: string;
  name: string;
  kind: "goal" | "emergency" | "sinking";
  target: number;
  target_date: DateStr | null;
  account_id: ID | null;
  emoji: string;
  roundup_to: number; // 0 = off, 10, 50, 100
  archived: boolean;
  created_at: Timestamp;
}

export interface GoalContribution {
  id: ID;
  user_id?: string;
  goal_id: ID;
  amount: number;
  date: DateStr;
  source: "manual" | "roundup" | "leftover" | "auto";
}

export interface Rule {
  id: ID;
  user_id?: string;
  match: string; // case-insensitive substring of merchant
  category_id: ID | null;
  method: PayMethod | null;
  account_id: ID | null;
}

export interface MerchantMemory {
  id: ID; // normalised merchant key
  user_id?: string;
  merchant: string;
  category_id: ID | null;
  method: PayMethod | null;
  account_id: ID | null;
  uses: number;
}

export interface Template {
  id: ID;
  user_id?: string;
  label: string;
  text: string;
  emoji: string;
}

export interface NetWorthSnapshot {
  id: ID; // the date
  user_id?: string;
  date: DateStr;
  value: number;
}

export interface AppNotification {
  id: ID; // deterministic key so jobs never duplicate
  user_id?: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  created_at: Timestamp;
  read: boolean;
}

export interface CycleSetting {
  effective_from: DateStr;
  mode: "calendar" | "custom" | "salary";
  start_day: number;
}

export interface Profile {
  id: ID;
  user_id?: string;
  name: string;
  salary: number;
  cycle_history: CycleSetting[];
  buffer_pct: number;
  stcg_rate: number;
  ltcg_rate: number;
  card_cap: number | null;
  default_account_id: ID | null;
  my_upi_id: string | null;
  pin_hash: string | null;
  webauthn_credential_id: string | null;
  lock_minutes: number;
  theme: "dark" | "light" | "system";
  privacy_mode: boolean;
  onboarded: boolean;
  notify_daily_nudge: boolean;
  notify_weekly: boolean;
  friend_reminder_days: number;
  family_pans: string[];
  email_digest: boolean;
  created_at: Timestamp;
}

export interface AuditEntry {
  id: ID;
  user_id?: string;
  entity: string;
  entity_id: ID;
  action: "create" | "update" | "delete" | "restore";
  before: unknown;
  at: Timestamp;
}

/** A trip: a tag with a budget and dates; quick-add tags spends while it's active. */
export interface Trip {
  id: ID;
  user_id?: string;
  name: string;
  emoji: string;
  tag: string;
  budget: number;
  start_date: DateStr;
  end_date: DateStr;
  currency: string | null; // e.g. "USD" for trips abroad
  fx_rate: number | null; // ₹ per unit of `currency`
  separate_budget: boolean; // keep trip spends out of the monthly budget
  archived: boolean;
  created_at: Timestamp;
}

/** A day the user "closed": reviewed today's spends (drives streaks). */
export interface DayLog {
  id: ID; // the IST date
  user_id?: string;
  date: DateStr;
  mood: string | null; // emoji
  note: string | null;
  spent: number; // budget spend that day, snapshotted at close
  allowance: number; // daily allowance that day, snapshotted at close
  closed_at: Timestamp;
}

export interface JobRun {
  id: ID; // job:date key
  user_id?: string;
  job: string;
  ran_at: Timestamp;
  result: string;
}

/** Every synced collection, keyed by its Supabase table name. */
export interface Tables {
  profiles: Profile[];
  accounts: Account[];
  upi_handles: UpiHandle[];
  categories: Category[];
  transactions: Transaction[];
  transaction_splits: TransactionSplit[];
  credit_cards: CreditCard[];
  card_cycles: CardCycle[];
  card_emis: CardEmi[];
  budget_lines: BudgetLine[];
  recurring_rules: RecurringRule[];
  holds: Hold[];
  ipo_applications: IpoApplication[];
  holdings: Holding[];
  friends: Friend[];
  friend_groups: FriendGroup[];
  group_members: GroupMember[];
  settlements: Settlement[];
  goals: Goal[];
  goal_contributions: GoalContribution[];
  rules: Rule[];
  merchant_memory: MerchantMemory[];
  templates: Template[];
  net_worth_snapshots: NetWorthSnapshot[];
  notifications: AppNotification[];
  audit_log: AuditEntry[];
  job_runs: JobRun[];
  day_logs: DayLog[];
  trips: Trip[];
}

export type TableName = keyof Tables;

/** Primary-key column per table (all `id` except credit_cards). */
export const PRIMARY_KEY: Record<TableName, string> = {
  profiles: "id",
  accounts: "id",
  upi_handles: "id",
  categories: "id",
  transactions: "id",
  transaction_splits: "id",
  credit_cards: "account_id",
  card_cycles: "id",
  card_emis: "id",
  budget_lines: "id",
  recurring_rules: "id",
  holds: "id",
  ipo_applications: "id",
  holdings: "id",
  friends: "id",
  friend_groups: "id",
  group_members: "id",
  settlements: "id",
  goals: "id",
  goal_contributions: "id",
  rules: "id",
  merchant_memory: "id",
  templates: "id",
  net_worth_snapshots: "id",
  notifications: "id",
  audit_log: "id",
  job_runs: "id",
  day_logs: "id",
  trips: "id",
};

export const TABLE_NAMES = Object.keys(PRIMARY_KEY) as TableName[];
