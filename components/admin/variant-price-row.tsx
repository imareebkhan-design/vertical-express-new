"use client";

import { useState, useTransition } from "react";
import { formatPaise, parseRupeeInput } from "@/lib/money";
import type { ActionResult } from "@/lib/validators";

/** Paise as the text an operator would type: 38500 → "385", 38550 → "385.50". */
export function paiseInput(paise: number | null): string {
  if (paise === null) return "";
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, "0")}`;
}

export type SaveVariantPrice = (input: {
  variantId: string;
  price: string;
  mrp: string;
  shownPricePaise: number;
  shownCompareAtPaise: number | null;
}) => Promise<ActionResult<{ changed: boolean }>>;

export interface PriceRowVariant {
  id: string;
  name: string;
  sku: string;
  pricePaise: number;
  compareAtPaise: number | null;
  onHand: number;
}

/**
 * One variant's selling price and MRP (ISS-068). Sends the typed text plus the
 * amounts this row was showing; the server parses the text and refuses the save
 * if the stored price has moved since (someone else saved first).
 *
 * The page has a second, unrelated "Save" for the product's details. A price
 * typed here and never saved with this row's own button must not look saved,
 * so the row says so as soon as its fields differ from the stored price, and an
 * earlier "Price saved" is cleared by the next edit.
 */
export function VariantPriceRow({
  variant,
  field,
  save,
}: {
  variant: PriceRowVariant;
  field: string;
  save: SaveVariantPrice;
}) {
  const [shown, setShown] = useState({ pricePaise: variant.pricePaise, compareAtPaise: variant.compareAtPaise });
  const [price, setPrice] = useState(paiseInput(variant.pricePaise));
  const [mrp, setMrp] = useState(paiseInput(variant.compareAtPaise));
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const unsaved = price.trim() !== paiseInput(shown.pricePaise) || mrp.trim() !== paiseInput(shown.compareAtPaise);

  const edit = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setMessage(null);
  };

  const submit = () => {
    setMessage(null);
    start(async () => {
      const res = await save({
        variantId: variant.id,
        price,
        mrp,
        shownPricePaise: shown.pricePaise,
        shownCompareAtPaise: shown.compareAtPaise,
      });
      if (!res.ok) {
        setMessage({ ok: false, text: res.error.message });
        return;
      }
      const pricePaise = parseRupeeInput(price);
      const compareAtPaise = mrp.trim() === "" ? null : parseRupeeInput(mrp);
      if (pricePaise !== null) {
        setShown({ pricePaise, compareAtPaise });
        setPrice(paiseInput(pricePaise));
        setMrp(paiseInput(compareAtPaise));
      }
      setMessage({ ok: true, text: res.data.changed ? "Price saved. New orders use it now." : "No change." });
    });
  };

  const priceId = `price-${variant.id}`;
  const mrpId = `mrp-${variant.id}`;
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-field bg-chip-soft/50 p-3">
      <div className="min-w-[160px] flex-1">
        <p className="text-[13px] font-bold text-ink">{variant.name}</p>
        <p className="text-[11px] font-semibold text-ink-500">
          {variant.sku} · {variant.onHand} available · now {formatPaise(shown.pricePaise)}
        </p>
      </div>
      <div className="w-[130px]">
        <label htmlFor={priceId} className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
          Selling (₹)
        </label>
        <input
          id={priceId}
          inputMode="decimal"
          value={price}
          onChange={(e) => edit(setPrice)(e.target.value)}
          className={field}
        />
      </div>
      <div className="w-[130px]">
        <label htmlFor={mrpId} className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
          MRP (₹)
        </label>
        <input
          id={mrpId}
          inputMode="decimal"
          value={mrp}
          placeholder="None"
          onChange={(e) => edit(setMrp)(e.target.value)}
          className={field}
        />
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="h-10 rounded-panel bg-ink px-4 text-[13px] font-bold text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save price"}
      </button>
      {message ? (
        <p
          className={"w-full text-[12px] font-semibold " + (message.ok ? "text-ink" : "text-ops-bad")}
          role={message.ok ? "status" : "alert"}
        >
          {message.text}
        </p>
      ) : (
        unsaved &&
        !pending && (
          <p className="w-full text-[12px] font-semibold text-ops-warn" role="status">
            Not saved yet — press Save price. The Save button at the top does not save prices.
          </p>
        )
      )}
    </div>
  );
}
