"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/validators";
import type { LaunchChangeSet, LaunchPlan, LaunchDepartment } from "@/lib/launch-control";
import type { LaunchBatchSummary } from "@/lib/services/admin/launch-control";

/**
 * Launch Control switches: category and brand visibility.
 *
 * Nothing changes on a click. Switches build a change; "Review changes" asks the
 * server for a plan (what customers would lose or gain, measured on the real
 * catalogue); the dialog shows it and applies it as one batch, typed when it
 * changes more than one switch. Every batch is audited and can be undone.
 *
 * Visibility only — a hidden category's products keep their status, prices and
 * stock. Publishing is done in Products, behind its own gate.
 */

type Kind = "category" | "brand";
type Undo = { plan: LaunchPlan | null; conflicts: { kind: Kind; slug: string }[] };

export interface SwitchboardProps {
  departments: LaunchDepartment[];
  brands: { slug: string; name: string; isActive: boolean; products: number; visible: number }[];
  batches: LaunchBatchSummary[];
  plan: (input: LaunchChangeSet) => Promise<ActionResult<LaunchPlan>>;
  apply: (input: { changeSet: LaunchChangeSet; confirmText: string | null; undoOf?: string }) => Promise<ActionResult<{ batchId: string | null; changed: number }>>;
  planUndo: (batchId: string) => Promise<ActionResult<Undo>>;
}

const key = (kind: Kind, slug: string) => `${kind}:${slug}`;
const n = (x: number) => x.toLocaleString("en-IN");

function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={
        "relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors disabled:opacity-40 " +
        (on ? "bg-ops-ok" : "bg-chip")
      }
    >
      <span className={"inline-block size-5 rounded-full bg-white shadow transition-transform " + (on ? "translate-x-[22px]" : "translate-x-0.5")} />
    </button>
  );
}

function batchSummary(b: LaunchBatchSummary): string {
  const part = (list: { to: boolean }[], noun: string) => {
    const hid = list.filter((x) => !x.to).length;
    const showed = list.length - hid;
    return [hid ? `hid ${hid} ${noun}${hid === 1 ? "" : "s"}` : null, showed ? `showed ${showed} ${noun}${showed === 1 ? "" : "s"}` : null];
  };
  const text = [...part(b.categories, "category"), ...part(b.brands, "brand")].filter(Boolean).join(", ").replace(/categorys/g, "categories");
  return (b.undoOf ? "Undo: " : "") + (text.charAt(0).toUpperCase() + text.slice(1));
}

export function LaunchSwitchboard({ departments, brands, batches, plan, apply, planUndo }: SwitchboardProps) {
  const router = useRouter();
  const [desired, setDesired] = useState<Map<string, boolean>>(new Map());
  const [brandFilter, setBrandFilter] = useState("");
  const [review, setReview] = useState<{ plan: LaunchPlan; undoOf?: string; conflicts?: Undo["conflicts"] } | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const current = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const d of departments) for (const c of d.categories) if (c.state !== "missing") m.set(key("category", c.slug), c.isActive);
    for (const b of brands) m.set(key("brand", b.slug), b.isActive);
    return m;
  }, [departments, brands]);

  const value = (k: string) => desired.get(k) ?? current.get(k) ?? false;
  const set = (k: string, v: boolean) =>
    setDesired((prev) => {
      const next = new Map(prev);
      if (current.get(k) === v) next.delete(k);
      else next.set(k, v);
      return next;
    });

  const changeSet = (): LaunchChangeSet => {
    const out: { categories: { slug: string; isActive: boolean }[]; brands: { slug: string; isActive: boolean }[] } = { categories: [], brands: [] };
    for (const [k, v] of desired) {
      const [kind, slug] = k.split(":") as [Kind, string];
      (kind === "category" ? out.categories : out.brands).push({ slug, isActive: v });
    }
    return out;
  };

  const openReview = (load: () => Promise<{ plan: LaunchPlan; undoOf?: string; conflicts?: Undo["conflicts"] } | string>) => {
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await load();
      if (typeof r === "string") setError(r);
      else {
        setTyped("");
        setReview(r);
      }
    });
  };

  const reviewChanges = () =>
    openReview(async () => {
      const r = await plan(changeSet());
      return r.ok ? { plan: r.data } : r.error.message;
    });

  const reviewUndo = (batchId: string) =>
    openReview(async () => {
      const r = await planUndo(batchId);
      if (!r.ok) return r.error.message;
      if (!r.data.plan) return "Nothing to undo: every switch in that batch has been changed again since.";
      return { plan: r.data.plan, undoOf: batchId, conflicts: r.data.conflicts };
    });

  const applyReviewed = () => {
    if (!review) return;
    const rows = review.plan.rows.filter((x) => x.change === "change" && x.before !== null);
    const cs = {
      categories: rows.filter((x) => x.kind === "category").map((x) => ({ slug: x.slug, isActive: x.to, expected: x.before! })),
      brands: rows.filter((x) => x.kind === "brand").map((x) => ({ slug: x.slug, isActive: x.to, expected: x.before! })),
    };
    setError(null);
    start(async () => {
      const r = await apply({ changeSet: cs, confirmText: review.plan.confirmText ? typed : null, undoOf: review.undoOf });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      setReview(null);
      setDesired(new Map());
      setNotice(r.data.changed ? `Applied: ${r.data.changed} switch${r.data.changed === 1 ? "" : "es"} changed. Customers see it on their next page load.` : "Nothing needed changing.");
      router.refresh();
    });
  };

  const shownBrands = brands.filter((b) => !brandFilter.trim() || b.name.toLowerCase().includes(brandFilter.trim().toLowerCase()));
  const confirmNeeded = review?.plan.confirmText ?? null;
  const confirmOk = !confirmNeeded || typed.trim().toUpperCase() === confirmNeeded;
  const imp = review?.plan.impact;

  return (
    <section aria-labelledby="launch-switches" className="mx-auto mt-10 max-w-[1100px]">
      <h2 id="launch-switches" className="text-[17px] font-extrabold tracking-tight text-ink">Change what customers see</h2>
      <p className="mt-1 max-w-[680px] text-[12.5px] font-medium leading-[18px] text-ink-700">
        Switch categories and brands on or off, review the effect, then apply. Hiding never changes a product&apos;s status,
        price or stock, and every change can be undone. Publishing is done in Products.
      </p>

      {notice && <p role="status" className="mt-3 rounded-field bg-ops-ok-tint px-3 py-2 text-[12.5px] font-semibold text-ops-ok">{notice}</p>}
      {error && !review && <p role="alert" className="mt-3 rounded-field bg-ops-bad-tint px-3 py-2 text-[12.5px] font-semibold text-ops-bad">{error}</p>}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {departments.map((d) => {
          const cats = d.categories.filter((c) => c.state !== "missing");
          if (!cats.length) return null;
          return (
            <div key={d.key} className="rounded-panel bg-white p-4 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-extrabold text-ink">{d.title}</h3>
                <div className="flex gap-1.5">
                  <button type="button" aria-label={`Show all in ${d.title}`} className="rounded-full bg-chip px-2.5 py-1 text-[11px] font-bold text-ink-700" onClick={() => cats.forEach((c) => set(key("category", c.slug), true))}>
                    Show all
                  </button>
                  <button type="button" aria-label={`Hide all in ${d.title}`} className="rounded-full bg-chip px-2.5 py-1 text-[11px] font-bold text-ink-700" onClick={() => cats.forEach((c) => set(key("category", c.slug), false))}>
                    Hide all
                  </button>
                </div>
              </div>
              <ul className="mt-2 divide-y divide-line">
                {cats.map((c) => {
                  const k = key("category", c.slug);
                  return (
                    <li key={c.slug} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-semibold text-ink">{c.name}</span>
                        <span className="text-[11px] font-medium text-ink-500">
                          {n(c.visible)} visible · {n(c.total)} in catalogue{desired.has(k) ? " · changed" : ""}
                        </span>
                      </span>
                      <Switch on={value(k)} label={`Show ${c.name}`} onChange={(v) => set(k, v)} disabled={pending} />
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-panel bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[13px] font-extrabold text-ink">Brands</h3>
          <input
            aria-label="Filter brands"
            placeholder="Filter brands"
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="h-8 rounded-field bg-chip-soft px-3 text-[12px] font-semibold text-ink"
          />
        </div>
        <ul className="mt-2 grid gap-x-6 sm:grid-cols-2">
          {shownBrands.map((b) => {
            const k = key("brand", b.slug);
            return (
              <li key={b.slug} className="flex items-center justify-between gap-3 border-t border-line py-2">
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-semibold text-ink">{b.name}</span>
                  <span className="text-[11px] font-medium text-ink-500">{n(b.visible)} visible · {n(b.products)} in catalogue{desired.has(k) ? " · changed" : ""}</span>
                </span>
                <Switch on={value(k)} label={`Show brand ${b.name}`} onChange={(v) => set(k, v)} disabled={pending} />
              </li>
            );
          })}
        </ul>
      </div>

      <div className="sticky bottom-3 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-panel bg-ink px-4 py-3 text-white shadow-card">
        <span className="text-[12.5px] font-semibold">
          {desired.size ? `${desired.size} change${desired.size === 1 ? "" : "s"} ready to review` : "No changes yet"}
        </span>
        <span className="flex gap-2">
          <button type="button" disabled={!desired.size || pending} onClick={() => setDesired(new Map())} className="rounded-full px-3 py-1.5 text-[12px] font-bold text-white/80 disabled:opacity-40">
            Clear
          </button>
          <button type="button" disabled={!desired.size || pending} onClick={reviewChanges} className="rounded-full bg-brand px-4 py-1.5 text-[12px] font-extrabold text-ink disabled:opacity-40">
            Review changes
          </button>
        </span>
      </div>

      <div className="mt-6">
        <h3 className="text-[13px] font-extrabold text-ink">Recent changes</h3>
        {batches.length === 0 ? (
          <p className="mt-1 text-[12px] font-medium text-ink-500">No visibility changes have been made here yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-panel bg-white px-4 shadow-card">
            {batches.map((b) => (
              <li key={b.batchId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="text-[12.5px] font-semibold text-ink">
                  {batchSummary(b)}
                  <span className="block text-[11px] font-medium text-ink-500">{new Date(b.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · {b.by}</span>
                </span>
                {b.undoneBy ? (
                  <span className="text-[11px] font-bold text-ink-500">Undone</span>
                ) : (
                  <button type="button" disabled={pending} onClick={() => reviewUndo(b.batchId)} className="rounded-full bg-chip px-3 py-1 text-[11.5px] font-bold text-ink-700">
                    Undo
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {review && imp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="launch-review-title" className="max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-panel bg-white p-5 shadow-card-hover">
            <h2 id="launch-review-title" className="text-[16px] font-extrabold text-ink">{review.undoOf ? "Undo this change?" : "Apply these changes?"}</h2>

            <ul className="mt-3 space-y-1 text-[12.5px] font-semibold text-ink">
              {review.plan.rows.map((r) => (
                <li key={`${r.kind}-${r.slug}`}>
                  {r.change === "missing" ? `${r.slug}: no longer exists` : r.change === "unchanged" ? `${r.name}: already ${r.to ? "shown" : "hidden"}` : `${r.to ? "Show" : "Hide"} ${r.kind === "brand" ? "brand " : ""}${r.name}`}
                </li>
              ))}
            </ul>
            {review.conflicts?.length ? (
              <p className="mt-2 text-[12px] font-medium text-ink-700">Left as they are, because they were changed again since: {review.conflicts.map((c) => c.slug).join(", ")}.</p>
            ) : null}

            <h3 className="mt-4 text-[12px] font-extrabold uppercase tracking-[0.06em] text-ink-500">What customers will notice</h3>
            <ul className="mt-1.5 space-y-1 text-[12.5px] font-medium text-ink-700">
              <li>Products customers can see: {n(imp.productsVisibleBefore)} → {n(imp.productsVisibleAfter)}{imp.newlyHidden ? ` (${n(imp.newlyHidden)} hidden)` : ""}{imp.newlyShown ? ` (${n(imp.newlyShown)} shown)` : ""}</li>
              <li>Categories customers can reach: {n(imp.categoriesReachableBefore)} → {n(imp.categoriesReachableAfter)}</li>
              {imp.departmentsEmptied.length > 0 && <li>Departments that disappear: {imp.departmentsEmptied.join(", ")}</li>}
              {imp.departmentsOpened.length > 0 && <li>Departments that appear: {imp.departmentsOpened.join(", ")}</li>}
              {imp.cartLinesAffected > 0 && <li>{n(imp.cartLinesAffected)} item{imp.cartLinesAffected === 1 ? "" : "s"} already in shoppers&apos; carts can no longer be bought.</li>}
            </ul>

            {confirmNeeded && (
              <label className="mt-4 block text-[12.5px] font-semibold text-ink">
                Type <span className="font-extrabold">{confirmNeeded}</span> to apply
                <input
                  aria-label={`Type ${confirmNeeded} to apply`}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  className="mt-1 block h-9 w-full rounded-field bg-chip-soft px-3 text-[13px] font-semibold text-ink"
                  autoComplete="off"
                />
              </label>
            )}

            {error && <p role="alert" className="mt-3 text-[12.5px] font-semibold text-ops-bad">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => { setReview(null); setError(null); }} disabled={pending} className="rounded-full bg-chip px-4 py-2 text-[12.5px] font-bold text-ink-700">
                Cancel
              </button>
              <button
                type="button"
                onClick={applyReviewed}
                disabled={pending || !confirmOk || !review.plan.rows.some((x) => x.change === "change")}
                className="rounded-full bg-ink px-4 py-2 text-[12.5px] font-extrabold text-white disabled:opacity-40"
              >
                {review.undoOf ? "Undo" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
