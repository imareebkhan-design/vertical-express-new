"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminSaveCoupon, adminSetCouponActive } from "@/actions/coupons";
import { formatPaise } from "@/lib/money";
import { StatusChip } from "@/components/admin/status-chip";
import type { CouponRow } from "@/lib/services/admin/coupons";

/**
 * Running promotions from the console.
 *
 * The list leads with what each coupon has actually cost, because that is the
 * question somebody opens this screen to answer. A usage limit shown beside no
 * usage tells you nothing about whether the promotion is working.
 *
 * There is no delete. Orders carry the code as a string, so removing a coupon
 * turns every order that used it into a discount with no explanation. Pausing
 * is how a promotion ends.
 */
type Draft = {
  code: string;
  type: "percent" | "flat" | "free_delivery";
  value: string;
  minOrder: string;
  maxDiscount: string;
  usageLimit: string;
  perUserLimit: string;
  firstNOrders: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  originalCode?: string;
};

const BLANK: Draft = {
  code: "",
  type: "percent",
  value: "",
  minOrder: "",
  maxDiscount: "",
  usageLimit: "",
  perUserLimit: "1",
  firstNOrders: "",
  startsAt: "",
  endsAt: "",
  isActive: true,
};

const iso = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export function CouponsManager({ coupons }: { coupons: CouponRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const edit = (c: CouponRow) =>
    setDraft({
      code: c.code,
      type: c.type,
      /* A percentage is stored as the percentage; a flat discount as paise.
         The form works in rupees, so only the flat case converts back. */
      value: c.type === "percent" ? String(c.value) : c.type === "flat" ? String(c.value / 100) : "",
      minOrder: c.minOrderPaise ? String(c.minOrderPaise / 100) : "",
      maxDiscount: c.maxDiscountPaise ? String(c.maxDiscountPaise / 100) : "",
      usageLimit: c.usageLimit === null ? "" : String(c.usageLimit),
      perUserLimit: String(c.perUserLimit),
      firstNOrders: c.firstNOrders === null ? "" : String(c.firstNOrders),
      startsAt: iso(c.startsAt),
      endsAt: iso(c.endsAt),
      isActive: c.isActive,
      originalCode: c.code,
    });

  const save = () => {
    if (!draft) return;
    setMessage(null);
    start(async () => {
      const res = await adminSaveCoupon(draft);
      if (res.ok) {
        setDraft(null);
        setMessage({ ok: true, text: `${draft.code} saved.` });
        router.refresh();
      } else {
        setMessage({ ok: false, text: res.error.message });
      }
    });
  };

  const toggle = (code: string, next: boolean) => {
    start(async () => {
      await adminSetCouponActive(code, next);
      router.refresh();
    });
  };

  const field =
    "h-10 w-full rounded-field bg-chip-soft px-3.5 text-[13px] font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink";

  /* An uncapped percentage is the one term on this form that can cost an
     unbounded amount: 20% off with no cap is ₹20,000 off a ₹1,00,000 order.
     Legitimate, and worth being asked about rather than discovered later. */
  const uncappedPercent = draft?.type === "percent" && draft.maxDiscount.trim() === "";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setDraft({ ...BLANK });
          }}
          className="h-10 rounded-panel bg-ink px-5 text-[13px] font-bold text-white"
        >
          New coupon
        </button>
        {message && (
          <p
            className={"text-[12.5px] font-semibold " + (message.ok ? "text-ink" : "text-ops-bad")}
            role="status"
          >
            {message.text}
          </p>
        )}
      </div>

      {draft && (
        <div className="rounded-panel bg-white p-4 shadow-card">
          <p className="text-[13px] font-bold text-ink">
            {draft.originalCode ? `Editing ${draft.originalCode}` : "New coupon"}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="Code" hint="What the customer types. Capitals, digits and hyphens.">
              <input
                value={draft.code}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
                placeholder="MONSOON-10"
                aria-label="Coupon code"
                className={field}
              />
            </Field>

            <Field label="Discount type">
              <select
                value={draft.type}
                onChange={(e) => set("type", e.target.value as Draft["type"])}
                aria-label="Discount type"
                className={field}
              >
                <option value="percent">Percentage off</option>
                <option value="flat">Flat amount off</option>
                <option value="free_delivery">Free delivery</option>
              </select>
            </Field>

            {draft.type !== "free_delivery" && (
              <Field
                label={draft.type === "percent" ? "Percentage" : "Amount off"}
                hint={draft.type === "percent" ? "A whole number, 1 to 100." : "In rupees."}
              >
                <input
                  value={draft.value}
                  onChange={(e) => set("value", e.target.value)}
                  inputMode="decimal"
                  placeholder={draft.type === "percent" ? "10" : "250"}
                  aria-label={draft.type === "percent" ? "Percentage off" : "Amount off in rupees"}
                  className={field}
                />
              </Field>
            )}

            {draft.type === "percent" && (
              <Field label="Maximum discount" hint="In rupees. Leave blank for no cap.">
                <input
                  value={draft.maxDiscount}
                  onChange={(e) => set("maxDiscount", e.target.value)}
                  inputMode="decimal"
                  placeholder="no cap"
                  aria-label="Maximum discount in rupees"
                  className={field}
                />
              </Field>
            )}

            <Field label="Minimum order" hint="In rupees. Blank means any order.">
              <input
                value={draft.minOrder}
                onChange={(e) => set("minOrder", e.target.value)}
                inputMode="decimal"
                placeholder="any"
                aria-label="Minimum order in rupees"
                className={field}
              />
            </Field>

            <Field label="Total uses" hint="Across all customers. Blank means unlimited.">
              <input
                value={draft.usageLimit}
                onChange={(e) => set("usageLimit", e.target.value)}
                inputMode="numeric"
                placeholder="unlimited"
                aria-label="Total usage limit"
                className={field}
              />
            </Field>

            <Field label="Uses per customer">
              <input
                value={draft.perUserLimit}
                onChange={(e) => set("perUserLimit", e.target.value)}
                inputMode="numeric"
                placeholder="1"
                aria-label="Uses per customer"
                className={field}
              />
            </Field>

            <Field
              label="New customers only"
              hint="Valid on a customer's first N orders. Blank means everyone."
            >
              <input
                value={draft.firstNOrders}
                onChange={(e) => set("firstNOrders", e.target.value)}
                inputMode="numeric"
                placeholder="everyone"
                aria-label="Valid on first N orders"
                className={field}
              />
            </Field>

            <Field label="Starts" hint="Blank means immediately.">
              <input
                type="date"
                value={draft.startsAt}
                onChange={(e) => set("startsAt", e.target.value)}
                aria-label="Start date"
                className={field}
              />
            </Field>

            <Field label="Ends" hint="Blank means it runs until paused.">
              <input
                type="date"
                value={draft.endsAt}
                onChange={(e) => set("endsAt", e.target.value)}
                aria-label="End date"
                className={field}
              />
            </Field>

            <Field label="Live">
              <select
                value={draft.isActive ? "true" : "false"}
                onChange={(e) => set("isActive", e.target.value === "true")}
                aria-label="Coupon is live"
                className={field}
              >
                <option value="true">Live — customers can use it</option>
                <option value="false">Paused</option>
              </select>
            </Field>
          </div>

          {uncappedPercent && (
            <p className="mt-3 rounded-field bg-ops-warn-tint px-3.5 py-2.5 text-[12px] font-semibold leading-[17px] text-ops-warn">
              This percentage has no maximum. On a ₹1,00,000 order a 20% coupon gives away
              ₹20,000, and a contractor ordering for a whole slab is exactly who will find
              it. Set a cap unless you mean that.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="h-10 rounded-panel bg-ink px-5 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save coupon"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="h-10 rounded-panel bg-chip px-4 text-[13px] font-bold text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-panel bg-white p-4 shadow-card">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="text-left text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
              <th className="px-3 pb-2.5">Code</th>
              <th className="px-3 pb-2.5">Discount</th>
              <th className="px-3 pb-2.5 text-right">Minimum</th>
              <th className="px-3 pb-2.5 text-right">Used</th>
              <th className="px-3 pb-2.5 text-right">Given away</th>
              <th className="px-3 pb-2.5">Window</th>
              <th className="px-3 pb-2.5">Status</th>
              <th className="px-3 pb-2.5" />
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <Row key={c.id} c={c} onEdit={() => edit(c)} onToggle={toggle} pending={pending} />
            ))}
          </tbody>
        </table>
        {coupons.length === 0 && (
          <p className="py-10 text-center text-[13px] font-semibold text-ink-500">
            No coupons yet.
          </p>
        )}
      </div>
    </div>
  );
}

function Row({
  c,
  onEdit,
  onToggle,
  pending,
}: {
  c: CouponRow;
  onEdit: () => void;
  onToggle: (code: string, next: boolean) => void;
  pending: boolean;
}) {
  const now = new Date();
  const expired = c.endsAt != null && new Date(c.endsAt) < now;
  const scheduled = c.startsAt != null && new Date(c.startsAt) > now;
  const exhausted = c.usageLimit !== null && c.redeemed >= c.usageLimit;

  const discount =
    c.type === "percent"
      ? `${c.value}% off${c.maxDiscountPaise ? `, max ${formatPaise(c.maxDiscountPaise)}` : " — uncapped"}`
      : c.type === "flat"
        ? `${formatPaise(c.value)} off`
        : "Free delivery";

  return (
    <tr className="border-t border-line">
      <td className="px-3 py-3 text-[12.5px] font-bold tabular-nums">{c.code}</td>
      <td className="px-3 py-3 text-[12px] font-semibold">{discount}</td>
      <td className="px-3 py-3 text-right text-[12px] font-semibold tabular-nums">
        {c.minOrderPaise > 0 ? formatPaise(c.minOrderPaise) : "—"}
      </td>
      <td className="px-3 py-3 text-right text-[12px] font-semibold tabular-nums">
        {c.redeemed}
        {c.usageLimit !== null && <span className="text-ink-500"> / {c.usageLimit}</span>}
      </td>
      <td className="px-3 py-3 text-right text-[12.5px] font-bold tabular-nums">
        {c.discountedPaise > 0 ? formatPaise(c.discountedPaise) : "—"}
      </td>
      <td className="px-3 py-3 text-[11px] font-semibold text-ink-500">
        {c.startsAt
          ? new Date(c.startsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
          : "—"}
        {" → "}
        {c.endsAt
          ? new Date(c.endsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
          : "no end"}
      </td>
      <td className="px-3 py-3">
        {!c.isActive ? (
          <StatusChip tone="neutral">Paused</StatusChip>
        ) : exhausted ? (
          <StatusChip tone="warn">Fully claimed</StatusChip>
        ) : expired ? (
          <StatusChip tone="neutral">Expired</StatusChip>
        ) : scheduled ? (
          <StatusChip tone="info">Scheduled</StatusChip>
        ) : (
          <StatusChip tone="ok">Live</StatusChip>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onEdit}
            disabled={pending}
            className="h-8 rounded-full bg-chip px-3.5 text-[12px] font-bold text-ink disabled:opacity-50"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onToggle(c.code, !c.isActive)}
            disabled={pending}
            className="h-8 rounded-full bg-chip px-3.5 text-[12px] font-bold text-ink disabled:opacity-50"
          >
            {c.isActive ? "Pause" : "Resume"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] font-medium text-ink-500">{hint}</span>}
    </label>
  );
}
