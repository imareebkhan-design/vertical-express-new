"use client";

import { useState, useTransition } from "react";
import { adminSaveBrand, adminSetBrandActive } from "@/actions/brands";

/**
 * The brands the catalogue sells, and a way to add one.
 *
 * A brand on a product page is a factual claim about what is in the bag. The
 * catalogue shipped with ten invented ones because there was no way to enter a
 * real one — this is that way.
 *
 * Names only. Logos and packaging photography are licensed separately from the
 * right to say you stock something, so there is no image field here until the
 * owner confirms what their agreements permit.
 */
export function BrandsManager({
  brands,
}: {
  brands: { slug: string; name: string; isActive: boolean; productCount: number }[];
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  /* Slug follows the name until somebody edits it themselves — a brand's slug
     is a URL that outlives spelling changes, so it stops tracking once touched. */
  const [slugTouched, setSlugTouched] = useState(false);
  const onName = (v: string) => {
    setName(v);
    if (!slugTouched) setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  };

  const add = () => {
    setMessage(null);
    start(async () => {
      const res = await adminSaveBrand({ name, slug, isActive: true });
      if (res.ok) {
        setMessage({ ok: true, text: `${name} added.` });
        setName("");
        setSlug("");
        setSlugTouched(false);
      } else {
        setMessage({ ok: false, text: res.error.message });
      }
    });
  };

  const toggle = (s: string, next: boolean) => {
    start(async () => {
      await adminSetBrandActive(s, next);
    });
  };

  const field =
    "h-10 w-full rounded-field bg-chip-soft px-3.5 text-[13px] font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink";

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-panel bg-white p-4 shadow-card">
        <p className="text-[13px] font-bold text-ink">Add a brand</p>
        <p className="mt-1 max-w-[560px] text-[12px] font-medium leading-[17px] text-ink-700">
          The name as it should appear on a product page. Only add brands you actually
          stock — this is what a customer reads as a statement of what is in the bag.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
              Name
            </span>
            <input
              value={name}
              onChange={(e) => onName(e.target.value)}
              placeholder="UltraTech"
              className={`${field} w-56`}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
              Slug
            </span>
            <input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              placeholder="ultratech"
              className={`${field} w-56`}
            />
          </label>
          <button
            type="button"
            onClick={add}
            disabled={pending || name.trim().length < 2 || slug.trim().length < 2}
            className="h-10 rounded-panel bg-ink px-5 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {pending ? "Saving…" : "Add brand"}
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
      </div>

      <div className="rounded-panel bg-white p-4 shadow-card">
        <p className="text-[13px] font-bold text-ink">Brands in the catalogue</p>
        <ul className="mt-3 divide-y divide-line">
          {brands.length === 0 && (
            <li className="py-4 text-[12.5px] font-semibold text-ink-500">
              No brands yet.
            </li>
          )}
          {brands.map((b) => (
            <li key={b.slug} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="text-[13.5px] font-bold text-ink">{b.name}</p>
                <p className="mt-0.5 text-[11.5px] font-semibold text-ink-500">
                  {b.slug} · {b.productCount}{" "}
                  {b.productCount === 1 ? "product" : "products"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggle(b.slug, !b.isActive)}
                disabled={pending}
                className={
                  "h-8 rounded-full px-3.5 text-[12px] font-bold disabled:opacity-50 " +
                  (b.isActive ? "bg-chip text-ink" : "bg-ops-warn-tint text-ops-warn")
                }
              >
                {b.isActive ? "Active" : "Hidden"}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11.5px] font-medium text-ink-500">
          Hiding a brand removes it from the storefront and leaves its products and past
          orders intact. Brands are never deleted — an order that referenced one still has
          to make sense.
        </p>
      </div>
    </div>
  );
}
