import type { Metadata } from "next";
import Link from "next/link";
import { OpsScreen } from "@/components/admin/ops-screen";
import { OpsTable } from "@/components/admin/ops-table";
import { StatusChip, type StatusTone } from "@/components/admin/status-chip";
import { listStockMovements } from "@/lib/services/inventory-movements";
import { getAdminUser } from "@/lib/services/admin/authz";

export const metadata: Metadata = {
  title: "Stock ledger | Operations",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * Stock ledger — artboard 12.
 *
 * This screen used to say the ledger did not exist, and it was right: inventory
 * kept one quantity per variant per warehouse with no history, so a stock
 * figure could only be asserted, never explained. A number nobody can explain
 * gets overruled by whoever counted last, and that count is usually wrong too.
 *
 * `StockMovement` now records every change a person makes from the console,
 * with a reason and a name. What it does NOT yet record is the decrement the
 * order path makes at checkout — that is still race-free and transactional and
 * still silent, so the ledger is honest about being half a history rather than
 * pretending to be the whole one.
 */
const TONE: Record<string, StatusTone> = {
  received: "ok",
  returned: "ok",
  recount: "info",
  correction: "info",
  transfer: "neutral",
  damaged: "bad",
  lost: "bad",
  sold: "neutral",
};

const LABEL: Record<string, string> = {
  received: "Received",
  returned: "Returned",
  recount: "Recount",
  correction: "Correction",
  transfer: "Transfer",
  damaged: "Damaged",
  lost: "Lost",
  sold: "Sold",
};

export default async function AdminStockLedger({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  /* Backstop for the layout gate: a request that renders only this page
     segment never ran app/admin/layout.tsx, so the page checks too. */
  if (!(await getAdminUser())) return null;
  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page, 10) || 1 : 1;
  const { rows, total, perPage } = await listStockMovements(page);
  const pages = Math.max(1, Math.ceil(total / perPage));

  return (
    <OpsScreen
      title="Stock ledger"
      intro={`Every movement, with a reason and a person attached. ${total} recorded.`}
    >
      <div className="flex flex-col gap-4">
        {/* Honest about the half that is still missing. A ledger that looks
            complete and silently omits every sale is worse than one that says
            which movements it does not yet see. */}
        <p className="rounded-[12px] bg-ops-info-tint px-3.5 py-3 text-[12px] font-semibold leading-[17px] text-ops-info">
          Console adjustments are recorded here — recounts, receipts, damage, transfers.
          The decrement an order makes at checkout is not yet written to this ledger, so a
          row is missing for every sale. Until that is wired, this explains what people
          did to the count, not everything that happened to it.
        </p>

        <OpsTable
          columns={["When", "Type", "Product", "Warehouse", "Change", "On hand", "Who"]}
          rows={rows.map((m) => [
            m.createdAt.toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            }),
            <StatusChip key={`${m.id}-t`} tone={TONE[m.reason] ?? "neutral"}>
              {LABEL[m.reason] ?? m.reason}
            </StatusChip>,
            <span key={`${m.id}-p`}>
              <Link
                href={`/admin/products/${m.variant.product.slug}`}
                className="font-bold text-ink no-underline hover:underline"
              >
                {m.variant.product.title}
              </Link>
              <span className="block text-[11px] font-semibold text-ink-500">
                {m.variant.sku}
                {m.note ? ` · ${m.note}` : ""}
              </span>
            </span>,
            m.warehouse.name,
            <span
              key={`${m.id}-d`}
              className={"font-bold tabular-nums " + (m.qtyDelta < 0 ? "text-ops-bad" : "text-ink")}
            >
              {m.qtyDelta > 0 ? `+${m.qtyDelta}` : m.qtyDelta}
            </span>,
            String(m.qtyAfter),
            m.actorEmail ?? "system",
          ])}
          emptyTitle="No movements yet."
          emptyNote="Adjust a count from Inventory and it will appear here with the reason and the person attached."
        />

        {pages > 1 && (
          <div className="flex items-center justify-center gap-2">
            {Array.from({ length: Math.min(pages, 10) }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={{ pathname: "/admin/stock-ledger", query: { page: p } }}
                className={`grid size-9 place-items-center rounded-chip text-[12px] tabular-nums transition-colors ${
                  p === page ? "bg-ink font-bold text-white" : "bg-chip font-semibold hover:bg-hush"
                }`}
              >
                {p}
              </Link>
            ))}
          </div>
        )}
      </div>
    </OpsScreen>
  );
}
