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

  /* The brand being renamed, by its slug at the time editing started. Held
     rather than derived because the slug is itself editable, and the update has
     to target the row as it was, not as it is being retyped. */
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");

  const [query, setQuery] = useState("");

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

  const beginEdit = (b: { slug: string; name: string }) => {
    setMessage(null);
    setEditing(b.slug);
    setEditName(b.name);
    setEditSlug(b.slug);
  };

  const saveEdit = (isActive: boolean) => {
    setMessage(null);
    start(async () => {
      /* originalSlug is what makes this an edit rather than an insert. Without
         it the action would try to create a second brand. */
      const res = await adminSaveBrand({
        name: editName,
        slug: editSlug,
        isActive,
        originalSlug: editing,
      });
      if (res.ok) {
        setEditing(null);
        setMessage({ ok: true, text: `${editName} saved.` });
      } else {
        setMessage({ ok: false, text: res.error.message });
      }
    });
  };

  const shown = query.trim()
    ? brands.filter((b) =>
        `${b.name} ${b.slug}`.toLowerCase().includes(query.trim().toLowerCase())
      )
    : brands;

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
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[13px] font-bold text-ink">Brands in the catalogue</p>
          <span className="flex-1" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter brands"
            aria-label="Filter brands"
            className={`${field} w-52`}
          />
        </div>
        <ul className="mt-3 divide-y divide-line">
          {brands.length === 0 && (
            <li className="py-4 text-[12.5px] font-semibold text-ink-500">
              No brands yet.
            </li>
          )}
          {brands.length > 0 && shown.length === 0 && (
            <li className="py-4 text-[12.5px] font-semibold text-ink-500">
              No brand matches “{query}”.
            </li>
          )}
          {shown.map((b) => (
            <li key={b.slug} className="py-3">
              {editing === b.slug ? (
                <div className="flex flex-wrap items-end gap-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
                      Name
                    </span>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      aria-label={`Name for ${b.name}`}
                      className={`${field} w-56`}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
                      Slug
                    </span>
                    <input
                      value={editSlug}
                      onChange={(e) => setEditSlug(e.target.value)}
                      aria-label={`Slug for ${b.name}`}
                      className={`${field} w-56`}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => saveEdit(b.isActive)}
                    disabled={pending || editName.trim().length < 2 || editSlug.trim().length < 2}
                    className="h-10 rounded-panel bg-ink px-5 text-[13px] font-bold text-white disabled:opacity-50"
                  >
                    {pending ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="h-10 rounded-panel bg-chip px-4 text-[13px] font-bold text-ink"
                  >
                    Cancel
                  </button>
                  {b.productCount > 0 && (
                    <p className="w-full text-[11.5px] font-medium text-ink-700">
                      {b.productCount} product{b.productCount === 1 ? "" : "s"} say this
                      name on their page. Renaming changes what all of them claim to be;
                      changing the slug breaks any link filtered by this brand.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[13.5px] font-bold text-ink">{b.name}</p>
                    <p className="mt-0.5 text-[11.5px] font-semibold text-ink-500">
                      {b.slug} · {b.productCount}{" "}
                      {b.productCount === 1 ? "product" : "products"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => beginEdit(b)}
                      disabled={pending}
                      className="h-8 rounded-full bg-chip px-3.5 text-[12px] font-bold text-ink disabled:opacity-50"
                    >
                      Edit
                    </button>
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
                  </div>
                </div>
              )}
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
