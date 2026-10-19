// Calendar-date helpers on `YYYY-MM-DD` strings. All arithmetic is done in UTC
// on date-only values so DST/timezone never shifts a day. "Today" is IST.

import type { DateStr, Timestamp } from "../types";

export const TIMEZONE = "Asia/Kolkata";

const pad = (n: number) => String(n).padStart(2, "0");

export function toDateStr(d: Date): DateStr {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function parseDate(s: DateStr): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** IST calendar date of a timestamp (or now). */
export function istDate(ts?: Timestamp | Date): DateStr {
  const d = ts ? new Date(ts) : new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts; // en-CA formats as YYYY-MM-DD
}

/** IST hour (0-23) and weekday (0=Sun) of a timestamp. */
export function istParts(ts?: Timestamp | Date): { hour: number; weekday: number } {
  const d = ts ? new Date(ts) : new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", hour12: false }).format(d),
  );
  const date = parseDate(istDate(d));
  return { hour: hour % 24, weekday: date.getUTCDay() };
}

export function addDays(s: DateStr, n: number): DateStr {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateStr(d);
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** Date with `day` in the given month; days past month end clamp to the last day. */
export function clampedDate(year: number, month0: number, day: number): DateStr {
  const y = year + Math.floor(month0 / 12);
  const m = ((month0 % 12) + 12) % 12;
  return toDateStr(new Date(Date.UTC(y, m, Math.min(day, daysInMonth(y, m)))));
}

export function addMonths(s: DateStr, n: number, keepDay?: number): DateStr {
  const d = parseDate(s);
  return clampedDate(d.getUTCFullYear(), d.getUTCMonth() + n, keepDay ?? d.getUTCDate());
}

export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86_400_000);
}

export function minDate(a: DateStr, b: DateStr): DateStr {
  return a < b ? a : b;
}
export function maxDate(a: DateStr, b: DateStr): DateStr {
  return a > b ? a : b;
}

export function inRange(d: DateStr, start: DateStr, end: DateStr): boolean {
  return d >= start && d <= end;
}

export function monthsBetween(from: DateStr, to: DateStr): number {
  const a = parseDate(from);
  const b = parseDate(to);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function fmtDate(s: DateStr, withYear = false): string {
  const d = parseDate(s);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${withYear ? ` ${d.getUTCFullYear()}` : ""}`;
}

export function fmtMonth(s: DateStr): string {
  const d = parseDate(s);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function weekdayName(i: number): string {
  return WEEKDAYS[i];
}

export function relativeDay(s: DateStr, today: DateStr): string {
  const n = diffDays(s, today);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n > 1 && n < 7) return `In ${n} days`;
  if (n < -1 && n > -7) return `${-n} days ago`;
  return fmtDate(s, parseDate(s).getUTCFullYear() !== parseDate(today).getUTCFullYear());
}

/** Timestamp at noon IST for a date (stable sort + correct IST date). */
export function dateToTs(s: DateStr, time = "12:00"): Timestamp {
  return new Date(`${s}T${time}:00+05:30`).toISOString();
}

/** "Today · 20 Oct", "3 days ago · 17 Oct", or just "10 Oct" when the relative form is already a date. */
export function dayHeading(s: DateStr, today: DateStr): string {
  const rel = relativeDay(s, today);
  return /^\d/.test(rel) ? rel : `${rel} · ${fmtDate(s)}`;
}
