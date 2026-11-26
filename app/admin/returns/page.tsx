import type { Metadata } from "next";
import Link from "next/link";
import type { ReturnStatus } from "@/prisma/generated/client/client";
import { getAdminUser } from "@/lib/services/admin/authz";
import { listReturnRequests } from "@/lib/services/admin/returns";
import { RETURN_REASON_LABEL, RETURN_STATUS_LABEL } from "@/lib/return-flow";
import { formatIst } from "@/lib/ist";
import { StatusChip } from "@/components/admin/status-chip";

export const metadata: Metadata = { title: "Returns | Operations", robots: { index: false } };
export const dynamic = "force-dynamic";

const VIEWS: { key: ReturnStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "requested", label: "Requested" },
  { key: "under_review", label: "Under review" },
  { key: "inspecting", label: "Inspecting" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "closed", label: "Closed" },
];
const TONE: Record<ReturnStatus, "warn" | "info" | "ok" | "bad" | "neutral"> = {
  requested: "warn", under_review: "info", inspecting: "info", approved: "ok", rejected: "bad", closed: "neutral",
};

/**
 * Return requests — the queue. Intake and review only: the return window,
 * opened-material rules and refund policy await the owner, so nothing here
 * refunds, restocks or exchanges. Requests are recorded from an order's page.
 */
export default async function AdminReturns({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  if (!(await getAdminUser())) return null;
  const sp = await searchParams;
  const active = VIEWS.find((v) => v.key === sp.status) ?? VIEWS[0];
  const { rows, counts } = await listReturnRequests(active.key === "all" ? null : active.key);
  const total = Object.values(counts).reduce((n, c) => n + (c ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight">Returns</h1>
        <p className="mt-0.5 text-[12px] font-semibold text-ink-500">Return requests recorded against delivered orders · times in IST</p>
      </div>
      <p className="rounded-[12px] bg-ops-warn-tint px-3.5 py-3 text-[12px] font-semibold leading-[17px] text-ops-warn">
        Implemented: recording a request (items, quantities, reason, the customer&rsquo;s words, when they asked) and reviewing it —
        under review, inspecting, approved or rejected, closed — with full history. <strong>Not implemented, awaiting the owner&rsquo;s
        return policy:</strong> refunds, restocking and exchanges. &ldquo;Approved&rdquo; means accepted for collection, not refunded.
      </p>
      <nav aria-label="Return views" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex gap-2 pb-1">
          {VIEWS.map((v) => {
            const on = v.key === active.key;
            const n = v.key === "all" ? total : counts[v.key] ?? 0;
            return (
              <li key={v.key}>
                <Link
                  href={v.key === "all" ? "/admin/returns" : `/admin/returns?status=${v.key}`}
                  aria-current={on ? "page" : undefined}
                  className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[12.5px] ${on ? "bg-ink font-bold text-white" : "border border-line bg-white font-semibold text-ink hover:bg-chip"}`}
                >
                  {v.label} <span className={on ? "text-white/70" : "text-ink-500"}>{n}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {rows.length === 0 ? (
        <div className="rounded-panel bg-white p-10 text-center shadow-card">
          <p className="text-[14px] font-bold">No return requests{active.key === "all" ? " yet" : " here"}.</p>
          <p className="mt-1 text-[12.5px] font-medium text-ink-500">Record one from the order&rsquo;s page when a customer asks to return delivered goods.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) => {
            const addr = (r.order.address ?? {}) as Record<string, unknown>;
            return (
              <li key={r.id}>
                <Link href={`/admin/returns/${r.returnNo}`} className="block rounded-panel bg-white p-4 shadow-card hover:bg-canvas">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold tabular-nums">{r.returnNo}</p>
                      <p className="text-[11.5px] font-semibold text-ink-500">
                        Asked {formatIst(r.requestedAt)} · order {r.order.orderNo} · {typeof addr.name === "string" ? addr.name : "—"}
                      </p>
                    </div>
                    <StatusChip tone={TONE[r.status]}>{RETURN_STATUS_LABEL[r.status]}</StatusChip>
                  </div>
                  <p className="mt-2 text-[12.5px] font-semibold">
                    {r.items.map((i) => `${i.qty} × ${i.orderItem.title}`).join(", ")}
                    <span className="text-ink-500"> · {RETURN_REASON_LABEL[r.reason]}</span>
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
