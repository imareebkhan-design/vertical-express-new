/**
 * India Standard Time for the operations console.
 *
 * The console renders on a server whose clock is UTC, and `toLocaleDateString`
 * with no zone printed an order placed at 1:30 AM IST on the previous day.
 * IST is a fixed UTC+05:30 with no daylight saving, so day boundaries are a
 * plain offset — no tz database needed for the arithmetic, and the formatter
 * names the zone explicitly. Pure; safe on server and client.
 */
export const IST_ZONE = "Asia/Kolkata";
const OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** "2026-10-15" for the IST calendar day that contains `d`. */
export function istDateKey(d: Date): string {
  return new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** The UTC instant at which IST calendar day `key` (YYYY-MM-DD) begins. */
export function istDayStart(key: string): Date {
  return new Date(Date.parse(`${key}T00:00:00.000Z`) - OFFSET_MS);
}

/** `key` shifted by `days` calendar days. */
export function addDays(key: string, days: number): string {
  const t = Date.parse(`${key}T00:00:00.000Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function isDateKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
}

const DATE = new Intl.DateTimeFormat("en-IN", { timeZone: IST_ZONE, day: "numeric", month: "short", year: "numeric" });
const TIME = new Intl.DateTimeFormat("en-US", { timeZone: IST_ZONE, hour: "numeric", minute: "2-digit", hour12: true });

/** "15 Oct 2026 · 2:35 PM IST" — the exact placement time, always in IST. */
export function formatIst(d: Date): string {
  return `${DATE.format(d)} · ${TIME.format(d)} IST`;
}

/** "15 Oct 2026" — IST calendar date only. */
export function formatIstDate(d: Date): string {
  return DATE.format(d);
}

/** "2:35 PM" — IST clock time only. */
export function formatIstTime(d: Date): string {
  return TIME.format(d);
}
