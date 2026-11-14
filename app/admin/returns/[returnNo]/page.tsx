import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAdminUser } from "@/lib/services/admin/authz";
import { getReturnRequest } from "@/lib/services/admin/returns";
import { RETURN_REASON_LABEL, RETURN_STATUS_LABEL } from "@/lib/return-flow";
import { formatIst } from "@/lib/ist";
import { formatPaise } from "@/lib/money";
import { StatusChip } from "@/components/admin/status-chip";
import { ReturnActions } from "@/components/admin/returns/return-actions";

export const dynamic = "force-dynamic";

export default async function AdminReturnDetail({ params }: { params: Promise<{ returnNo: string }> }) {
  if (!(await getAdminUser())) return null;
  const { returnNo } = await params;
  const d = await getReturnRequest(returnNo);
  if (!d) notFound();
  const { r, history, next } = d;
  const addr = (r.order.address ?? {}) as Record<string, unknown>;
  const goodsValue = r.items.reduce((n, i) => n + i.qty * i.orderItem.unitPricePaise, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start gap-3">
        <Link href="/admin/returns" aria-label="Back to returns" className="grid size-9 place-items-center rounded-chip bg-chip hover:bg-hush">
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-extrabold tabular-nums tracking-tight">{r.returnNo}</h1>
            <StatusChip tone={r.status === "rejected" ? "bad" : r.status === "approved" ? "ok" : "info"}>{RETURN_STATUS_LABEL[r.status]}</StatusChip>
          </div>
          <p className="text-[12px] font-semibold text-ink-500">
            Customer asked {formatIst(r.requestedAt)} by {r.channel.toLowerCase()} · recorded {formatIst(r.createdAt)} · order{" "}
            <Link className="underline" href={`/admin/orders/${r.order.orderNo}`}>{r.order.orderNo}</Link>
          </p>
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-5">
          <section className="rounded-panel bg-white p-4 shadow-card" aria-label="Items">
            <h2 className="mb-2 text-[15px] font-bold">Items</h2>
            <ul className="flex flex-col gap-1.5">
              {r.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 text-[12.5px] font-semibold">
                  <span>{i.qty} × {i.orderItem.title} <span className="text-ink-500">· {i.orderItem.variantName} · {i.orderItem.qty} ordered</span></span>
                  <span className="tabular-nums">{formatPaise(i.qty * i.orderItem.unitPricePaise)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] font-semibold text-ink-500">
              Goods value at the order&rsquo;s prices: {formatPaise(goodsValue)}. This is not a refund amount — refunds await the owner&rsquo;s policy.
            </p>
          </section>
          <section className="rounded-panel bg-white p-4 shadow-card" aria-label="Reason">
            <h2 className="mb-2 text-[15px] font-bold">Reason · {RETURN_REASON_LABEL[r.reason]}</h2>
            <p className="whitespace-pre-line text-[12.5px] font-semibold leading-relaxed text-ink-700">{r.explanation}</p>
            {r.decisionNote && (
              <p className="mt-3 rounded-[12px] bg-canvas p-3 text-[12px] font-semibold">
                Decision{r.decidedAt ? ` · ${formatIst(r.decidedAt)}` : ""}: {r.decisionNote}
              </p>
            )}
          </section>
          <section className="rounded-panel bg-white p-4 shadow-card" aria-label="History">
            <h2 className="mb-2 text-[15px] font-bold">History</h2>
            <ol className="flex flex-col gap-2.5">
              {history.map((h) => {
                const after = (h.after ?? {}) as Record<string, unknown>;
                const before = (h.before ?? {}) as Record<string, unknown>;
                return (
                  <li key={h.id} className="text-[12px] font-semibold">
                    <p className="text-ink">
                      {h.action === "return.requested"
                        ? "Request recorded"
                        : `${RETURN_STATUS_LABEL[before.status as keyof typeof RETURN_STATUS_LABEL] ?? before.status} → ${RETURN_STATUS_LABEL[after.status as keyof typeof RETURN_STATUS_LABEL] ?? after.status}`}
                      {typeof after.note === "string" ? ` · ${after.note}` : ""}
                    </p>
                    <p className="text-[11px] text-ink-500">{formatIst(h.createdAt)}</p>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
        <div className="flex flex-col gap-5">
          <section className="rounded-panel bg-white p-4 shadow-card" aria-label="Customer">
            <h2 className="mb-2 text-[15px] font-bold">Customer</h2>
            <p className="text-[13px] font-bold">{typeof addr.name === "string" ? addr.name : "—"}</p>
            <p className="text-[12px] font-semibold text-ink-500">{typeof addr.phone === "string" ? addr.phone : ""}</p>
          </section>
          <section className="rounded-panel bg-white p-4 shadow-card" aria-label="Next step">
            <h2 className="mb-2 text-[15px] font-bold">Next step</h2>
            <ReturnActions returnNo={r.returnNo} next={next} />
          </section>
        </div>
      </div>
    </div>
  );
}
