"use client";

import { useState, useTransition } from "react";
import { adminAssignProductBrand } from "@/actions/brands";

/**
 * Assigning a product to a brand, one product at a time.
 *
 * Inline on the products list rather than behind a full editor, because this is
 * the operation that converts a catalogue of placeholder brands into a real one
 * and it wants to be quick — a person working down the list with the warehouse
 * in mind, not opening and closing twenty forms.
 *
 * Deliberately not a bulk action. Which brand a product actually is, is a fact
 * about what is on the floor; a "map all BuildPro to UltraTech" button would
 * make that guess forty times in one click.
 */
export function ProductBrandSelect({
  productId,
  currentBrandId,
  brands,
}: {
  productId: string;
  currentBrandId: string;
  brands: { id: string; name: string }[];
}) {
  const [value, setValue] = useState(currentBrandId);
  const [pending, start] = useTransition();
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");

  const change = (brandId: string) => {
    const previous = value;
    setValue(brandId);
    setState("idle");
    start(async () => {
      const res = await adminAssignProductBrand({ productId, brandId });
      if (res.ok) {
        setState("saved");
      } else {
        setValue(previous);
        setState("error");
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => change(e.target.value)}
        disabled={pending}
        aria-label="Brand"
        className="h-8 max-w-[160px] rounded-field bg-chip-soft px-2.5 text-[12px] font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
      >
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      {state === "saved" && (
        <span className="text-[11px] font-bold text-ink-500" role="status">
          saved
        </span>
      )}
      {state === "error" && (
        <span className="text-[11px] font-bold text-ops-bad" role="status">
          failed
        </span>
      )}
    </div>
  );
}
