// Money helpers. Amounts are rupees with 2-decimal precision; all arithmetic
// goes through paise integers to avoid float drift.

export const toPaise = (r: number) => Math.round(r * 100);
export const fromPaise = (p: number) => p / 100;
export const round2 = (r: number) => fromPaise(toPaise(r));

export function sum(values: number[]): number {
  return fromPaise(values.reduce((acc, v) => acc + toPaise(v), 0));
}

/** Indian digit grouping: 1,23,45,678.50 */
export function formatINR(
  amount: number,
  opts: { decimals?: boolean; sign?: boolean; symbol?: boolean; compact?: boolean } = {},
): string {
  const { decimals = false, sign = false, symbol = true, compact = false } = opts;
  const neg = amount < 0;
  const abs = Math.abs(amount);
  let body: string;
  if (compact && abs >= 1e5) {
    body = abs >= 1e7 ? `${trim(abs / 1e7)}Cr` : `${trim(abs / 1e5)}L`;
  } else if (compact && abs >= 1e3) {
    body = `${trim(abs / 1e3)}k`;
  } else {
    const [int, frac] = abs.toFixed(decimals || toPaise(abs) % 100 ? 2 : 0).split(".");
    body = groupIndian(int) + (frac ? `.${frac}` : "");
  }
  const prefix = neg ? "−" : sign && amount > 0 ? "+" : "";
  return `${prefix}${symbol ? "₹" : ""}${body}`;
}

function trim(n: number): string {
  return n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2).replace(/\.?0+$/, "");
}

export function groupIndian(int: string): string {
  if (int.length <= 3) return int;
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

/** Spoken form for screen readers, e.g. "1,200 rupees". */
export function ariaINR(amount: number): string {
  return `${amount < 0 ? "minus " : ""}${groupIndian(Math.abs(Math.round(amount)).toString())} rupees`;
}

/** Parse "1,23,456.5", "1.2k", "2L" into rupees. */
export function parseAmount(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/[₹,\s]/g, "").replace(/^rs\.?/, "");
  const m = s.match(/^(\d+(?:\.\d+)?)(k|l|lakh|cr)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const mult = m[2] === "k" ? 1e3 : m[2] === "l" || m[2] === "lakh" ? 1e5 : m[2] === "cr" ? 1e7 : 1;
  return round2(n * mult);
}
