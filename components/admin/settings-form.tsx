"use client";

import { useState, useTransition } from "react";
import { adminSaveSettings } from "@/actions/settings";

/**
 * The values a shopkeeper owns, in one place.
 *
 * Every field here was previously a constant in a source file. The cashback
 * percentage paid out for weeks at a rate nobody chose because it lived in
 * wallet.ts; two invented GSTINs shipped because they lived in components. A
 * value on a screen gets questioned. A constant does not.
 *
 * Each field says what changes when you change it, because the person editing
 * this is deciding a business rule rather than filling in a form.
 */
export function SettingsForm({
  initial,
}: {
  initial: {
    cashbackPercent: string;
    gstin: string;
    expressMinutes: string;
    packSlaMinutes: string;
    deliverySlaMinutes: string;
    codEnabled: string;
    defaultSort: string;
  };
}) {
  const [values, setValues] = useState(initial);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (k: keyof typeof values) => (v: string) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  const save = () => {
    setMessage(null);
    start(async () => {
      const res = await adminSaveSettings(values);
      setMessage(
        res.ok
          ? { ok: true, text: "Saved. These apply to the storefront immediately." }
          : { ok: false, text: res.error.message }
      );
    });
  };

  const field =
    "h-10 w-full rounded-field bg-chip-soft px-3.5 text-[13px] font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink";

  return (
    <div className="flex flex-col gap-5">
      <Row
        label="Cashback"
        hint="Percent of the order total credited to the customer's wallet when an order is delivered. Leave blank to run no cashback programme at all — blank and 0 are different: 0 means the programme exists and currently pays nothing."
      >
        <div className="flex items-center gap-2">
          <input
            value={values.cashbackPercent}
            onChange={(e) => set("cashbackPercent")(e.target.value)}
            inputMode="decimal"
            placeholder="off"
            aria-label="Cashback percent"
            className={field}
          />
          <span className="text-[13px] font-bold text-ink-500">%</span>
        </div>
      </Row>

      <Row
        label="Company GSTIN"
        hint="Printed on invoices. Leave blank until the registration exists — a wrong number fails in the customer's accounting weeks later, against a document they have already filed."
      >
        <input
          value={values.gstin}
          onChange={(e) => set("gstin")(e.target.value.toUpperCase())}
          placeholder="not set"
          aria-label="Company GSTIN"
          className={field}
        />
      </Row>

      <Row
        label="Express delivery window"
        hint="Minutes quoted on fast items. Leave blank and no time is promised anywhere — the speed chip says 'fast' without a number. Only fill this in with a figure you can hold in Srinagar traffic."
      >
        <div className="flex items-center gap-2">
          <input
            value={values.expressMinutes}
            onChange={(e) => set("expressMinutes")(e.target.value)}
            inputMode="numeric"
            placeholder="no promise"
            aria-label="Express delivery minutes"
            className={field}
          />
          <span className="text-[13px] font-bold text-ink-500">min</span>
        </div>
      </Row>

      <Row
        label="Packing target"
        hint="Minutes from an order being placed to it being packed. Used only to measure ourselves — it is never shown to a customer. Leave blank and Reports says on-time performance is not measured, which is the truth until somebody picks a number."
      >
        <div className="flex items-center gap-2">
          <input
            value={values.packSlaMinutes}
            onChange={(e) => set("packSlaMinutes")(e.target.value)}
            inputMode="numeric"
            placeholder="not measured"
            aria-label="Packing target minutes"
            className={field}
          />
          <span className="text-[13px] font-bold text-ink-500">min</span>
        </div>
      </Row>

      <Row
        label="Delivery target"
        hint="Minutes from packed to delivered. Same rule: internal, and blank until it is chosen. These two were 120 and 240 inside the reporting code, and the console reported compliance against them as though somebody had agreed to them."
      >
        <div className="flex items-center gap-2">
          <input
            value={values.deliverySlaMinutes}
            onChange={(e) => set("deliverySlaMinutes")(e.target.value)}
            inputMode="numeric"
            placeholder="not measured"
            aria-label="Delivery target minutes"
            className={field}
          />
          <span className="text-[13px] font-bold text-ink-500">min</span>
        </div>
      </Row>

      <Row
        label="Cash on delivery"
        hint="Off until there is a driver float, a record of what was handed over at the gate, and a daily reconciliation. Turning this on offers cash at checkout wherever the pincode also permits it."
      >
        <select
          value={values.codEnabled}
          onChange={(e) => set("codEnabled")(e.target.value)}
          aria-label="Cash on delivery"
          className={field}
        >
          <option value="false">Off — online payment only</option>
          <option value="true">On — offer cash where the pincode allows</option>
        </select>
      </Row>

      <Row
        label="Default catalogue order"
        hint="How products are ordered when the customer has not chosen a sort. 'Most ordered' uses real order volume and shows nothing meaningful until orders exist."
      >
        <select
          value={values.defaultSort}
          onChange={(e) => set("defaultSort")(e.target.value)}
          aria-label="Default catalogue order"
          className={field}
        >
          <option value="newest">Newest first</option>
          <option value="most_ordered">Most ordered</option>
        </select>
      </Row>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="h-10 rounded-panel bg-ink px-5 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
        {message && (
          <p
            className={
              "text-[12.5px] font-semibold " + (message.ok ? "text-ink" : "text-ops-bad")
            }
            role="status"
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-panel bg-white p-4 shadow-card">
      <p className="text-[13px] font-bold text-ink">{label}</p>
      <p className="mt-1 max-w-[560px] text-[12px] font-medium leading-[17px] text-ink-700">
        {hint}
      </p>
      <div className="mt-3 max-w-[320px]">{children}</div>
    </div>
  );
}
