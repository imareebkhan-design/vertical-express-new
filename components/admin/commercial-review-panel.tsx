"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/validators";
import { formatPaise } from "@/lib/money";

/**
 * The commercial review, on the product page.
 *
 * Changing a price, an MRP or a variant clears the review and the product
 * stops selling. This panel is how it comes back: it shows the offer exactly
 * as stored — nothing is typed here except why — and records that this
 * operator checked it. What it showed goes back with the click, so a product
 * that changed in another tab is refused rather than approved unseen.
 * Rules: lib/services/admin/commercial-review.ts.
 */

export interface OfferView {
  unitLabel: string;
  deliverySpeed: string | null;
  hsn: string | null;
  gstRatePct: number | null;
  variants: { sku: string; name: string; isDefault: boolean; pricePaise: number; compareAtPaise: number | null }[];
}

export type RecordReview = (input: { productId: string; reason: string; seen: OfferView }) => Promise<ActionResult<{ remaining: string[] }>>;

const label = "text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500";

export function CommercialReviewPanel({
  productId,
  offer,
  review,
  blockers,
  record,
}: {
  productId: string;
  offer: OfferView;
  /** The review on file, if one is; it may no longer match the offer (see blockers). */
  review: { by: string; at: string } | null;
  /** What currently stops this product being sold, in the server's words. */
  blockers: string[];
  record: RecordReview;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [checked, setChecked] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    setMessage(null);
    start(async () => {
      const r = await record({ productId, reason, seen: offer });
      if (!r.ok) {
        setMessage({ ok: false, text: r.error.message });
        return;
      }
      setReason("");
      setChecked(false);
      setMessage({
        ok: true,
        text: r.data.remaining.length
          ? `Review recorded. Still not for sale: ${r.data.remaining.join("; ")}.`
          : "Review recorded. Nothing else is stopping this product being sold.",
      });
      router.refresh();
    });
  };

  return (
    <section className="rounded-panel bg-white p-4 shadow-card">
      <h2 className="text-[15px] font-bold tracking-tight text-ink">Price and tax review</h2>
      <p className="mt-1 text-[12px] font-semibold leading-relaxed text-ink-500">
        A product is sold only while a named person has checked its prices, pack sizes and tax as they stand. Changing a
        price, an MRP or a variant clears that check.
      </p>

      <p className="mt-3 text-[12.5px] font-bold text-ink">
        {review ? `On file: reviewed by ${review.by}, ${new Date(review.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}` : "No review on file — this product is not for sale."}
      </p>
      {blockers.length > 0 && (
        <ul className="mt-1.5 list-disc pl-5 text-[12px] font-semibold text-ops-warn">
          {blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-[12.5px] font-semibold text-ink">
          <thead>
            <tr className={label}>
              <th className="py-1 pr-3">SKU</th>
              <th className="py-1 pr-3">Pack</th>
              <th className="py-1 pr-3">Selling price</th>
              <th className="py-1">MRP</th>
            </tr>
          </thead>
          <tbody>
            {offer.variants.map((v) => (
              <tr key={v.sku} className="border-t border-line">
                <td className="py-1.5 pr-3">{v.sku}</td>
                <td className="py-1.5 pr-3">{v.name}{v.isDefault ? " (default)" : ""}</td>
                <td className="py-1.5 pr-3 tabular-nums">{formatPaise(v.pricePaise)}</td>
                <td className="py-1.5 tabular-nums">{v.compareAtPaise === null ? "not recorded" : formatPaise(v.compareAtPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px] font-semibold text-ink sm:grid-cols-4">
        <div><dt className={label}>Sold</dt><dd>{offer.unitLabel}</dd></div>
        <div><dt className={label}>Delivery class</dt><dd>{offer.deliverySpeed ?? "not chosen"}</dd></div>
        <div><dt className={label}>HSN</dt><dd>{offer.hsn ?? "not confirmed"}</dd></div>
        <div><dt className={label}>GST charged at checkout</dt><dd>{offer.gstRatePct === null ? "not confirmed" : `${offer.gstRatePct}%`}</dd></div>
      </dl>

      <form
        className="mt-4 flex flex-col gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="block">
          <span className={`mb-1 block ${label}`}>What did you check against?</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            placeholder="e.g. Supplier price list of 12 Nov; MRP read from the bag"
            className="h-10 w-full rounded-field bg-chip-soft px-3.5 text-[13px] font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          />
        </label>
        <label className="flex items-start gap-2 text-[12.5px] font-semibold text-ink">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5" />
          <span>I have checked every price, MRP, pack size and the GST rate shown above, and they are correct to sell at.</span>
        </label>
        <div>
          <button
            type="submit"
            disabled={pending || !checked || reason.trim().length < 10 || offer.variants.length === 0}
            className="h-10 rounded-field bg-ink px-4 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {pending ? "Recording…" : "Record review"}
          </button>
        </div>
        {message && (
          <p role={message.ok ? "status" : "alert"} className={"text-[12px] font-bold " + (message.ok ? "text-success" : "text-danger")}>
            {message.text}
          </p>
        )}
      </form>
    </section>
  );
}
