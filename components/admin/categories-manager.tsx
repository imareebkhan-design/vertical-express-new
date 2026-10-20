"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/validators";

export type CategoryGroupKey = "civil_interiors" | "furniture_hardware" | "electrical" | "plumbing_bath" | "tools" | "other";

export const GROUP_LABELS: Record<CategoryGroupKey, string> = {
  civil_interiors: "Civil & Interiors",
  furniture_hardware: "Furniture & Hardware",
  electrical: "Electrical",
  plumbing_bath: "Plumbing & Bath",
  tools: "Tools & Equipment",
  other: "Other",
};

export interface CategoryRow {
  slug: string;
  name: string;
  group: CategoryGroupKey;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  productCount: number;
  visibleCount: number;
  hasTaxMapping: boolean;
}

export type SaveCategory = (input: {
  slug: string;
  name: string;
  group: CategoryGroupKey;
  description: string;
  sortOrder: number;
  isActive: boolean;
  seoTitle: string;
  seoDescription: string;
  existingSlug?: string;
}) => Promise<ActionResult<{ created: boolean }>>;

type Draft = Omit<CategoryRow, "productCount" | "visibleCount" | "hasTaxMapping" | "description" | "seoTitle" | "seoDescription"> & {
  description: string;
  seoTitle: string;
  seoDescription: string;
};

const EMPTY: Draft = { slug: "", name: "", group: "other", description: "", sortOrder: 100, isActive: true, seoTitle: "", seoDescription: "" };

const slugOf = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Categories: add one, rename it, describe it, order it, switch it off.
 *
 * The slug is fixed once a category exists — checkout tax and the department
 * directory are keyed by it. A new category sells nothing until its HSN/GST is
 * confirmed and added (the "No tax mapping" note), but can be browsed.
 * Switching a category off hides its products from the shop without changing
 * them; switching it back restores them.
 */
export function CategoriesManager({ categories, save }: { categories: CategoryRow[]; save: SaveCategory }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const editingRow = editing ? categories.find((c) => c.slug === editing) : null;
  const switchingOff = editingRow && editingRow.isActive && !draft.isActive && editingRow.visibleCount > 0;

  const begin = (c: CategoryRow) => {
    setMessage(null);
    setEditing(c.slug);
    setSlugTouched(true);
    setDraft({
      slug: c.slug,
      name: c.name,
      group: c.group,
      description: c.description ?? "",
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      seoTitle: c.seoTitle ?? "",
      seoDescription: c.seoDescription ?? "",
    });
  };
  const reset = () => {
    setEditing(null);
    setSlugTouched(false);
    setDraft(EMPTY);
  };

  const submit = () => {
    setMessage(null);
    start(async () => {
      const r = await save({ ...draft, ...(editing ? { existingSlug: editing } : {}) });
      if (r.ok) {
        setMessage({ ok: true, text: r.data.created ? `${draft.name} added.` : `${draft.name} saved.` });
        reset();
      } else {
        setMessage({ ok: false, text: r.error.message });
      }
    });
  };

  const field =
    "h-10 w-full rounded-field bg-chip-soft px-3.5 text-[13px] font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink";
  const label = "mb-1 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500";

  return (
    <div className="flex flex-col gap-5">
      <form
        className="rounded-panel bg-white p-4 shadow-card"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="text-[13px] font-bold text-ink">{editing ? `Edit ${editingRow?.name ?? editing}` : "Add a category"}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Name</span>
            <input
              value={draft.name}
              onChange={(e) => {
                set("name", e.target.value);
                if (!slugTouched) set("slug", slugOf(e.target.value));
              }}
              required
              className={field}
            />
          </label>
          <label className="block">
            <span className={label}>Slug (web address, fixed once saved)</span>
            <input
              value={draft.slug}
              readOnly={Boolean(editing)}
              aria-readonly={Boolean(editing)}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value);
              }}
              required
              className={field + (editing ? " opacity-60" : "")}
            />
          </label>
          <label className="block">
            <span className={label}>Department</span>
            <select value={draft.group} onChange={(e) => set("group", e.target.value as CategoryGroupKey)} className={field}>
              {(Object.keys(GROUP_LABELS) as CategoryGroupKey[]).map((g) => (
                <option key={g} value={g}>
                  {GROUP_LABELS[g]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={label}>Order (lower first)</span>
            <input
              type="number"
              min={0}
              max={9999}
              value={draft.sortOrder}
              onChange={(e) => set("sortOrder", Number(e.target.value))}
              className={field}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>Description</span>
            <textarea
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              maxLength={600}
              rows={2}
              className="w-full rounded-field bg-chip-soft px-3.5 py-2 text-[13px] font-semibold text-ink"
            />
          </label>
          <label className="block">
            <span className={label}>Search title (optional)</span>
            <input value={draft.seoTitle} maxLength={70} onChange={(e) => set("seoTitle", e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className={label}>Search description (optional)</span>
            <input value={draft.seoDescription} maxLength={160} onChange={(e) => set("seoDescription", e.target.value)} className={field} />
          </label>
          <label className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <input type="checkbox" checked={draft.isActive} onChange={(e) => set("isActive", e.target.checked)} />
            Shown in the shop
          </label>
        </div>
        {switchingOff && (
          <p role="alert" className="mt-2 rounded-field bg-ops-warn-tint p-2 text-[12px] font-semibold text-ops-warn">
            Switching this off hides {editingRow?.visibleCount} product{editingRow?.visibleCount === 1 ? "" : "s"} from the shop
            until it is switched back on. Their own settings are not changed.
          </p>
        )}
        {message && (
          <p role={message.ok ? "status" : "alert"} className={"mt-2 text-[12px] font-bold " + (message.ok ? "text-success" : "text-danger")}>
            {message.text}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <button type="submit" disabled={pending} className="h-10 rounded-field bg-ink px-4 text-[13px] font-bold text-white disabled:opacity-50">
            {pending ? "Saving…" : editing ? "Save category" : "Add category"}
          </button>
          {editing && (
            <button type="button" onClick={reset} className="h-10 rounded-field px-4 text-[13px] font-bold text-ink-500">
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="overflow-x-auto rounded-panel bg-white p-4 shadow-card">
        <table className="w-full min-w-[720px] text-[12.5px]">
          <thead>
            <tr className="text-left text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
              <th className="px-3 pb-2.5">Category</th>
              <th className="px-3 pb-2.5">Department</th>
              <th className="px-3 pb-2.5 text-right">Products</th>
              <th className="px-3 pb-2.5 text-right">In the shop</th>
              <th className="px-3 pb-2.5">Tax</th>
              <th className="px-3 pb-2.5">Status</th>
              <th className="px-3 pb-2.5" />
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.slug} className="border-t border-line">
                <td className="px-3 py-2">
                  <p className="font-bold text-ink">{c.name}</p>
                  <p className="text-[11px] text-ink-500">{c.slug}</p>
                </td>
                <td className="px-3 py-2">{GROUP_LABELS[c.group]}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.productCount}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.visibleCount}</td>
                <td className="px-3 py-2">{c.hasTaxMapping ? "HSN/GST set" : <span className="text-ops-warn">No tax mapping — cannot sell</span>}</td>
                <td className="px-3 py-2">{c.isActive ? "Shown" : <span className="text-ink-500">Off</span>}</td>
                <td className="px-3 py-2 text-right">
                  <button type="button" onClick={() => begin(c)} className="text-[12px] font-bold text-ink underline">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
