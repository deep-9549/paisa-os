// Bank SMS parsing — PRD 4.11. Templates for Bank of India savings account
// and the BOI RuPay credit card first; a generic fallback covers most banks.

import type { PayMethod } from "../types";
import { parseAmount, round2 } from "./money";
import { titleCase } from "./parser";

export interface SmsDraft {
  amount: number;
  direction: "debit" | "credit";
  method: PayMethod;
  last4: string | null; // account or card digits
  isCard: boolean;
  merchant: string | null;
  vpa: string | null;
  date: string | null; // YYYY-MM-DD
  reference: string | null;
  bank: string | null;
}

const AMT = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;

function parseSmsDate(s: string): string | null {
  const m = s.match(/(\d{1,2})[-/.](\d{1,2}|[a-z]{3})[-/.](\d{2,4})/i);
  if (!m) return null;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const mon = /^\d+$/.test(m[2]) ? parseInt(m[2], 10) : months.indexOf(m[2].toLowerCase()) + 1;
  let y = parseInt(m[3], 10);
  if (y < 100) y += 2000;
  const d = parseInt(m[1], 10);
  if (!mon || mon > 12 || d > 31) return null;
  return `${y}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function cleanMerchant(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = raw
    .replace(/\b(upi|ref|no|txn|on|dt|avl|bal|via)\b.*$/i, "")
    .replace(/[^a-z0-9 &.'-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return m ? titleCase(m.toLowerCase()) : null;
}

/** Merchant name from a VPA like "swiggy.instamart@icici" or "paytmqr2810050501011@paytm". */
export function merchantFromVpa(vpa: string): string | null {
  const local = vpa.split("@")[0].replace(/[._-]+/g, " ").replace(/\d{4,}/g, "").replace(/\b(paytmqr|bharatpe|q\d*)\b/gi, "").trim();
  return local ? titleCase(local.toLowerCase()) : null;
}

export function parseBankSms(text: string): SmsDraft | null {
  const amtM = text.match(AMT);
  if (!amtM) return null;
  const amount = parseAmount(amtM[1]);
  if (!amount) return null;
  const lower = text.toLowerCase();

  const isCard = /credit card|card\s*(?:no\.?\s*)?(?:xx|\*\*|ending)|rupay card|\bcc\b/.test(lower) && !/a\/c|account/.test(lower.split("card")[0].slice(-30));
  const credit = /(credited|received|refund|reversed|deposited)/.test(lower) && !/debited|spent|withdrawn|purchase/.test(lower.split(/credited|received/)[0]);
  const debit = /(debited|spent|withdrawn|purchase|paid|sent|txn of|transaction of)/.test(lower);
  const direction: "debit" | "credit" = credit && !(debit && lower.indexOf("debited") >= 0 && lower.indexOf("debited") < lower.indexOf("credited")) ? "credit" : "debit";

  const last4 = text.match(/(?:a\/c|ac|acct|account|card)[^\d]{0,15}(?:xx+|\*+|x+|ending\s*)?(\d{4})\b/i)?.[1] ?? null;
  const vpa = text.match(/\b([a-z0-9.\-_]{2,}@[a-z]{2,})\b/i)?.[1] ?? null;
  const upi = /\bupi\b|vpa/.test(lower) || !!vpa;

  let merchant: string | null = null;
  const at = text.match(/\b(?:at|to|towards|info:?)\s+([A-Za-z0-9 &.'*-]{2,40}?)(?=\s+(?:on|via|ref|upi|avl|txn|dt|\.|,)|[.,]|$)/i);
  if (at && !/^(?:vpa|a\/c|your)/i.test(at[1])) merchant = cleanMerchant(at[1]);
  if (vpa && (!merchant || /@/.test(merchant))) merchant = merchantFromVpa(vpa) ?? merchant;
  if (direction === "credit") {
    const from = text.match(/\bfrom\s+([A-Za-z0-9 &.'-]{2,40}?)(?=\s+(?:on|via|ref|upi)|[.,]|$)/i);
    if (from) merchant = cleanMerchant(from[1]);
  }

  const method: PayMethod = isCard ? "card" : upi ? "upi" : /neft|imps|rtgs/.test(lower) ? "netbanking" : /atm|withdrawn/.test(lower) ? "cash" : /nach|ecs|auto.?debit|si\b/.test(lower) ? "auto_debit" : "other";

  return {
    amount: round2(amount),
    direction,
    method,
    last4,
    isCard,
    merchant,
    vpa,
    date: parseSmsDate(text),
    reference: text.match(/(?:ref(?:erence)?\.?\s*(?:no\.?)?|utr|rrn)[:\s]*([a-z0-9]{6,})/i)?.[1] ?? null,
    bank: /bank of india|\bboi\b/i.test(text) ? "Bank of India" : null,
  };
}
