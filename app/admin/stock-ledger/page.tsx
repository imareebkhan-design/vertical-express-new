import type { Metadata } from "next";
import Link from "next/link";
import { OpsScreen } from "@/components/admin/ops-screen";
import { OpsTable } from "@/components/admin/ops-table";
import { StatusChip, type StatusTone } from "@/components/admin/status-chip";
import { findLedgerDrift, listStockMovements, listUnresolvedRestocks } from "@/lib/services/inventory-movements";
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
 * `StockMovement` records every change a person makes from the console, with
 * a reason and a name, and — since the ISS-090 follow-up — every sale at
 * checkout and every release when an order or shipment is cancelled, in the
 * same transaction as the change. What it still cannot explain is stock set
 * before the ledger existed, or changed outside the app; the drift panel lists
 * the first kind as a count and the second as rows to recount.
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
  released: "info",
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
  released: "Released",
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
  const [{ rows, total, perPage }, drift, unresolved] = await Promise.all([
    listStockMovements(page),
    findLedgerDrift(20),
    listUnresolvedRestocks(20),
  ]);
  const pages = Math.max(1, Math.ceil(total / perPage));

  return (
    <OpsScreen
      title="Stock ledger"
      intro={`Every movement, with a reason and a person attached. ${total} recorded.`}
    >
      <div className="flex flex-col gap-4">
        {/* Honest about what the ledger still cannot explain. Sales and
            cancellations are recorded now; stock that predates the ledger, or
            was changed outside the app, is not. */}
        <p className="rounded-[12px] bg-ops-info-tint px-3.5 py-3 text-[12px] font-semibold leading-[17px] text-ops-info">
          Recorded here: console adjustments, every sale at checkout, and stock put back when
          an order or shipment is cancelled. Not recorded: stock levels set before the ledger
          existed
          {drift.unledgeredCount > 0
            ? ` — ${drift.unledgeredCount} stocked ${drift.unledgeredCount === 1 ? "item has" : "items have"} no history yet; a recount from Inventory gives ${drift.unledgeredCount === 1 ? "it" : "them"} one`
            : ""}
          .
        </p>

        {unresolved.length > 0 && (
          <section className="flex flex-col gap-2" aria-labelledby="unresolved-restocks">
            <h2 id="unresolved-restocks" className="text-[14px] font-bold text-ops-bad">
              Cancelled goods not put back ({unresolved.length === 20 ? "20 newest" : unresolved.length})
            </h2>
            <p className="text-[12px] font-semibold leading-[17px] text-ink-500">
              These orders were cancelled, but the system could not tell which shelf the goods
              belong on, so it changed no count. Find the goods, then record a Received or Recount
              from Inventory at the warehouse where they actually are, with the order number in
              the note.
            </p>
            <OpsTable
              columns={["When", "Order", "Product", "Qty", "Why"]}
              rows={unresolved.map((u) => [
                u.at.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
                u.orderNo ? (
                  <Link key={`${u.orderId}-${u.variantId}-o`} href={`/admin/orders/${u.orderNo}`} className="font-bold text-ink no-underline hover:underline">
                    {u.orderNo}
                  </Link>
                ) : (
                  u.orderId
                ),
                <span key={`${u.orderId}-${u.variantId}-p`}>
                  {u.productSlug ? (
                    <Link href={`/admin/products/${u.productSlug}`} className="font-bold text-ink no-underline hover:underline">
                      {u.productTitle}
                    </Link>
                  ) : (
                    u.variantId
                  )}
                  {u.sku && <span className="block text-[11px] font-semibold text-ink-500">{u.sku}</span>}
                </span>,
                String(u.qty),
                u.cause === "no_warehouse" ? "Order has no warehouse" : "No stock record at its warehouse",
              ])}
              emptyTitle="Nothing outstanding."
              emptyNote=""
            />
          </section>
        )}

        {drift.driftCount > 0 && (
          <section className="flex flex-col gap-2" aria-labelledby="ledger-drift">
            <h2 id="ledger-drift" className="text-[14px] font-bold text-ops-bad">
              {drift.driftCount} {drift.driftCount === 1 ? "count disagrees" : "counts disagree"} with the ledger
            </h2>
            <p className="text-[12px] font-semibold leading-[17px] text-ink-500">
              The last movement says one number and the shelf record says another, so something
              changed the count without writing a movement. Recount these from Inventory. Nothing
              here is changed automatically.
            </p>
            <OpsTable
              columns={["Product", "Warehouse", "On hand", "Ledger says", "Gap"]}
              rows={drift.rows.map((d) => [
                <span key={`${d.variantId}-${d.warehouseId}-p`}>
                  <Link
                    href={`/admin/products/${d.productSlug}`}
                    className="font-bold text-ink no-underline hover:underline"
                  >
                    {d.productTitle}
                  </Link>
                  <span className="block text-[11px] font-semibold text-ink-500">{d.sku}</span>
                </span>,
                d.warehouseName,
                String(d.qtyOnHand),
                String(d.ledgerQty),
                <span key={`${d.variantId}-${d.warehouseId}-g`} className="font-bold tabular-nums text-ops-bad">
                  {d.qtyOnHand - d.ledgerQty > 0 ? `+${d.qtyOnHand - d.ledgerQty}` : d.qtyOnHand - d.ledgerQty}
                </span>,
              ])}
              emptyTitle="No disagreements."
              emptyNote=""
            />
          </section>
        )}

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
