import type { Account, CreditCard, Transaction } from "../../types";
import { dateToTs } from "../dates";

let n = 0;
export const id = (p = "id") => `${p}-${++n}`;

export function acct(over: Partial<Account> = {}): Account {
  return {
    id: id("acc"),
    name: "Bank of India",
    type: "savings",
    opening_balance: 0,
    opening_date: "2026-01-01",
    include_in_net_worth: true,
    archived: false,
    color: "#000",
    icon: "🏦",
    is_default: false,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

export function card(accountId: string, over: Partial<CreditCard> = {}): CreditCard {
  return {
    account_id: accountId,
    bank: "Bank of India",
    last4: "1234",
    credit_limit: 100000,
    statement_day: 15,
    due_mode: "after_statement",
    due_day: 5,
    grace_days: 20,
    min_due_pct: 5,
    annual_fee: 999,
    fee_waiver_spend: 50000,
    fee_anniversary: "2026-03-15",
    reward_rules: [],
    points_redeemed: 0,
    points_expiry_months: 0,
    is_rupay_upi: true,
    ...over,
  };
}

export function txn(over: Partial<Transaction> & { date?: string } = {}): Transaction {
  const { date, ...rest } = over;
  return {
    id: id("tx"),
    type: "expense",
    amount: 100,
    occurred_at: dateToTs(date ?? "2026-10-10"),
    account_id: null,
    to_account_id: null,
    method: "upi",
    category_id: null,
    merchant: null,
    note: null,
    tags: [],
    my_share: null,
    paid_by_friend_id: null,
    payers: null,
    group_id: null,
    split_mode: null,
    recurring_rule_id: null,
    refund_of: null,
    emi_id: null,
    ipo_application_id: null,
    goal_id: null,
    adjustment_sign: null,
    is_salary: false,
    is_draft: false,
    exclude_from_budget: false,
    receipt_path: null,
    location: null,
    deleted_at: null,
    created_at: "2026-10-10T00:00:00Z",
    updated_at: "2026-10-10T00:00:00Z",
    ...rest,
  };
}
