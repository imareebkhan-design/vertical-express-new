import "server-only";
import { db } from "@/lib/db";
import { log } from "@/lib/observability";

/**
 * Operational settings, edited in the console rather than deployed.
 *
 * WHY THIS EXISTS
 *
 * A cashback percentage, a GST registration, the delivery windows we offer —
 * these change because the business changes, not because the code does. Every
 * one of them lived in a source file or an environment variable, which meant an
 * engineer had to be involved to change a number a shopkeeper owns.
 *
 * It also meant nobody could see them. The 5% cashback was paying out on every
 * delivered order and was visible only to whoever opened wallet.ts (ISS-055).
 * A value on a screen gets questioned; a constant in a file does not.
 *
 * THE RULES THAT KEEP THIS HONEST
 *
 * Every setting has an explicit default, and the default is the *safe* one —
 * cashback off, COD off, no GSTIN. An unconfigured system must not pay out, make
 * a tax claim, or promise a delivery window nobody agreed to. Reading a missing
 * setting is normal, not an error.
 *
 * Values are stored as text and parsed on read, because a settings table that
 * knows about types becomes a schema migration every time a setting is added.
 * The parsing is where the validation lives.
 */

export const SETTING_KEYS = {
  /** Percent of order total credited to the wallet on delivery. Default: off. */
  cashbackPercent: "cashback.percent",
  /** The company's GST registration, printed on invoices. Default: absent. */
  gstin: "company.gstin",
  /** Whether cash on delivery is offered at all. Default: off. */
  codEnabled: "cod.enabled",
  /** Maximum cash a driver may be asked to collect per shipment, in paise. */
  codCeilingPaise: "cod.ceiling_paise",
  /** Minutes quoted for express delivery. Default: absent, so nothing is promised. */
  expressMinutes: "delivery.express_minutes",
  /** Default catalogue sort. */
  defaultSort: "catalog.default_sort",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/** All settings, as raw strings. One query; callers parse what they need. */
export async function readSettings(): Promise<Record<string, string>> {
  const rows = await db.setting.findMany({ select: { key: true, value: true } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function readSetting(key: SettingKey): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key }, select: { value: true } });
  return row?.value ?? null;
}

export async function writeSetting(key: SettingKey, value: string, updatedBy: string) {
  await db.setting.upsert({
    where: { key },
    create: { key, value, updatedBy },
    update: { value, updatedBy },
  });
  /* Settings changes are the kind of thing somebody asks about three weeks
     later. The value is not logged — a GSTIN is not something to scatter
     through log aggregation — but the fact and the actor are. */
  log("INFO", {
    service: "settings",
    event: "setting_changed",
    metadata: { key, updatedBy },
  });
}

/**
 * A percentage between 0 and 100, or null.
 *
 * Anything unparseable is null rather than a guess. This is the read path for
 * money leaving the business, and a malformed value must not become a plausible
 * one.
 */
export function parsePercent(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

/** A positive integer of paise, or null. */
export function parsePaise(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

/** An explicit yes. Anything else — missing, malformed, "maybe" — is no. */
export function parseFlag(raw: string | null | undefined): boolean {
  return raw === "true";
}
