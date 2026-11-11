import Link from "next/link";
import { OpsScreen } from "@/components/admin/ops-screen";
import { OpsStats, OpsTable } from "@/components/admin/ops-table";
import { ProductStatusChip, StatusChip, type StatusTone } from "@/components/admin/status-chip";
import {
  CATEGORY_STATE_LABEL,
  CATEGORY_STATE_NOTE,
  LAUNCH_CATEGORY_LIMIT,
  type CategoryLaunchState,
  type LaunchCategory,
} from "@/lib/launch-control";
import type { CatalogState } from "@/lib/catalog-explain";
import type { LaunchCategoryView, LaunchOverview } from "@/lib/services/admin/launch-control";

/**
 * Launch control — what customers can see and buy, and why.
 *
 * READ-ONLY in this release. Every number and state comes from the storefront's
 * own rules (lib/services/admin/launch-control.ts), so this screen shows what
 * the shop shows. Switches arrive with the write side; until then a change is
 * made where it is made today — Categories, Brands, Products, Approvals.
 *
 * Presentational: app/admin/launch-control/page.tsx loads the data.
 */

const STATE_TONE: Record<CategoryLaunchState, StatusTone> = {
  shown: "ok",
  coming_soon: "info",
  not_listed: "warn",
  hidden: "neutral",
  missing: "bad",
};

function CategoryState({ state }: { state: CategoryLaunchState }) {
  return <StatusChip tone={STATE_TONE[state]}>{CATEGORY_STATE_LABEL[state]}</StatusChip>;
}

/* Exhaustive on purpose: a new outcome must fail the typecheck here, not fall
   through to a label that says something else (a visible product read as Hidden). */
function productOutcome(s: CatalogState): { tone: StatusTone; label: string } {
  switch (s.action) {
    case "buy": return { tone: "ok", label: "Visible · can be bought" };
    case "enquire": return { tone: "info", label: "Visible · enquiry only" };
    case "refused": return { tone: "bad", label: "Visible · Add to cart is refused" };
    case "unknown": return { tone: "warn", label: "Visible · not checked" };
    case "hidden": return { tone: "neutral", label: "Hidden" };
    default: {
      const unhandled: never = s.action;
      return unhandled;
    }
  }
}

const n = (x: number) => x.toLocaleString("en-IN");

function statusSummary(c: LaunchCategory): string {
  const parts = [
    c.byStatus.published ? `${c.byStatus.published} published` : null,
    c.byStatus.catalog_only ? `${c.byStatus.catalog_only} catalogue-only` : null,
    c.byStatus.draft ? `${c.byStatus.draft} draft` : null,
    c.byStatus.archived ? `${c.byStatus.archived} archived` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No products";
}

export function LaunchControlView({
  overview,
  selectedSlug,
  selected,
}: {
  overview: LaunchOverview;
  selectedSlug: string | null;
  selected: LaunchCategoryView | null;
}) {
  const { totals } = overview;
  return (
    <OpsScreen
      title="Launch control"
      intro="What customers can see and buy, category by category, and the reason for anything held back. This screen only reports: to change something, use Categories, Brands, Products or Approvals."
    >
      <OpsStats
        stats={[
          {
            label: "How the shop trades",
            value: overview.orderingOpen ? "Orders" : "Enquiries",
            sub: overview.orderingOpen ? "Customers can order and pay" : "Catalogue mode: nothing can be ordered",
          },
          {
            label: "Categories customers can reach",
            value: `${n(totals.categoriesReachable)} of ${n(totals.categories)}`,
            sub: "Shown or Coming soon",
          },
          {
            label: "Products customers can see",
            value: `${n(totals.visible)} of ${n(totals.products)}`,
            sub: overview.strict ? "Production catalogue rules" : "Staging/test catalogue rules",
          },
          {
            label: "Published and listed",
            value: n(totals.visiblePublished),
            sub: overview.orderingOpen ? "Each still passes checkout's own checks" : "Shown with Enquire while ordering is off",
          },
        ]}
      />

      {selectedSlug && (
        <section aria-labelledby="launch-category" className="mt-8">
          {selected ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="launch-category" className="text-[17px] font-extrabold tracking-tight text-ink">
                  {selected.name} <span className="font-semibold text-ink-500">/{selected.slug}</span>
                </h2>
                <Link href="/admin/launch-control" className="text-[12px] font-bold text-ink-700 hover:text-ink">
                  Close
                </Link>
              </div>
              <p className="mt-1 text-[12px] font-medium text-ink-700">
                {selected.isActive ? "Category switched on." : "Category switched off: every product below is hidden for that reason, and keeps its own status."}
                {selected.total > selected.products.length && ` Showing ${selected.products.length} of ${n(selected.total)} products.`}
              </p>
              <div className="mt-3">
                <OpsTable
                  columns={["Product", "Status", "Customers", "Why"]}
                  emptyTitle="No products in this category"
                  emptyNote="Products are added from Listing or the catalogue import."
                  rows={selected.products.map((p) => {
                    const outcome = productOutcome(p.state);
                    return [
                      <div key="p">
                        <Link href={`/admin/products/${p.slug}`} className="text-ink hover:underline">{p.title}</Link>
                        <p className="text-[11px] font-medium text-ink-500">
                          {p.brand.name}{p.brand.isActive ? "" : " (brand switched off)"}
                        </p>
                      </div>,
                      <ProductStatusChip key="s" status={p.status} />,
                      <StatusChip key="c" tone={outcome.tone}>{outcome.label}</StatusChip>,
                      p.state.reasons.length ? (
                        <ul key="w" className="space-y-0.5 text-[11.5px] font-medium leading-[16px] text-ink-700">
                          {p.state.reasons.map((r, i) => (
                            <li key={`${r.code}-${i}`}>
                              {r.message}
                              {r.detail ? <span className="text-ink-500"> — {r.detail}</span> : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span key="w" className="text-[11.5px] font-medium text-ink-500">
                          {p.state.action === "unknown" ? "Readiness not checked" : "Nothing held back"}
                        </span>
                      ),
                    ];
                  })}
                />
              </div>
              {selected.total > LAUNCH_CATEGORY_LIMIT && (
                <p className="mt-2 text-[11px] font-semibold text-ink-500">
                  The first {LAUNCH_CATEGORY_LIMIT} are explained here; use Products to search the rest.
                </p>
              )}
            </>
          ) : (
            <p id="launch-category" className="text-[13px] font-semibold text-ink-700">
              No category called “{selectedSlug}”. <Link href="/admin/launch-control" className="underline">Back to all categories</Link>
            </p>
          )}
        </section>
      )}

      {overview.departments.map((d) => (
        <section key={d.key} aria-labelledby={`dept-${d.key}`} className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`dept-${d.key}`} className="text-[15px] font-extrabold tracking-tight text-ink">{d.title}</h2>
            <p className="text-[11px] font-semibold text-ink-500">
              {d.reachable === 0
                ? d.curated ? "Customers do not see this department" : "None of these reach customers"
                : `${d.reachable} of ${d.categories.length} reach customers`}
            </p>
          </div>
          <div className="mt-3">
            <OpsTable
              columns={["Category", "Customers see", "Visible products", "In the catalogue", "Tax"]}
              emptyTitle="No categories"
              emptyNote="Categories are added from Categories."
              rows={d.categories.map((c) => [
                c.state === "missing" ? (
                  <span key="n" className="text-ink-700">{c.name}</span>
                ) : (
                  <Link key="n" href={`/admin/launch-control?category=${c.slug}`} className="text-ink hover:underline">
                    {c.name}
                  </Link>
                ),
                <div key="s" title={CATEGORY_STATE_NOTE[c.state]}>
                  <CategoryState state={c.state} />
                  <p className="mt-1 max-w-[260px] text-[11px] font-medium leading-[15px] text-ink-500">{CATEGORY_STATE_NOTE[c.state]}</p>
                </div>,
                <span key="v" className="tabular-nums">{n(c.visible)}</span>,
                <span key="t" className="text-[11.5px] font-medium text-ink-700">{statusSummary(c)}</span>,
                c.hasTaxMapping ? (
                  <span key="x" className="text-[11.5px] font-medium text-ink-700">Set</span>
                ) : (
                  <StatusChip key="x" tone="warn">No HSN/GST</StatusChip>
                ),
              ])}
            />
          </div>
        </section>
      ))}
    </OpsScreen>
  );
}
