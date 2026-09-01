import { notFound } from "next/navigation";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { adminCustomerDetail } from "@/lib/services/admin/stock";
import { OpsTable } from "@/components/admin/ops-table";
import { OrderStatusChip, StatusChip } from "@/components/admin/status-chip";
import { formatPaise } from "@/lib/money";
import { PlaceholderValue } from "@/components/ui/placeholder-value";

export const dynamic = "force-dynamic";

const BUYER_LABEL: Record<string, string> = {
  contractor: "Contractor",
  homeowner: "Homeowner",
  designer: "Architect or designer",
};

const DATE = { day: "numeric", month: "short", year: "numeric" } as const;

export default async function AdminCustomerDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = await adminCustomerDetail(id);
  if (!c) notFound();

  const name = c.profile?.fullName ?? c.profile?.companyName ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/admin/customers"
          className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500 no-underline hover:underline"
        >
          ← Customers
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          <h1 className="text-[22px] font-extrabold tracking-tight">
            {name ?? c.phone ?? c.email ?? "Customer"}
          </h1>
          {c.profile?.buyerType && (
            <StatusChip tone="neutral">
              {BUYER_LABEL[c.profile.buyerType] ?? c.profile.buyerType}
            </StatusChip>
          )}
        </div>
        <p className="mt-1 text-[12px] font-semibold text-ink-500">
          {c.phone ?? "no phone"} · {c.email ?? "no email"} · joined{" "}
          {c.createdAt.toLocaleDateString("en-IN", DATE)}
        </p>
      </div>

      {/*
        The artboard puts "High value" beside the name as a badge. It is a
        segment, and segments are not a thing this system has — see the Segments
        panel below. A badge that looks computed but is not is worse than no
        badge, so it is absent here and the absence is stated once, there.
      */}

      <section>
        <h2 className="mb-2 text-[15px] font-bold tracking-tight text-ink">
          Orders{" "}
          <span className="text-[12px] font-semibold text-ink-500">{c.orderCount} counted</span>
        </h2>
        <OpsTable
          columns={["Order", "Placed", "Items", "Status", "Payment", "Total"]}
          rows={c.orders.map((o) => [
            <Link
              key={o.id}
              href={`/admin/orders/${o.orderNo}`}
              className="font-bold text-ink no-underline hover:underline"
            >
              {o.orderNo}
            </Link>,
            o.placedAt.toLocaleDateString("en-IN", DATE),
            `${o._count.items} item${o._count.items === 1 ? "" : "s"}`,
            <OrderStatusChip key={`${o.id}-s`} status={o.status} />,
            o.paymentMethod,
            formatPaise(o.totalPaise),
          ])}
          emptyTitle="No orders yet."
          emptyNote="This customer has an account but has not bought anything."
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-5">
          <section className="rounded-panel bg-white p-4 shadow-card">
            <h2 className="text-[15px] font-bold tracking-tight text-ink">Sites</h2>
            <p className="mt-0.5 text-[11.5px] font-medium text-ink-500">
              Saved by the customer. Adding one from here would mean typing an address
              somebody else has to receive a truck at.
            </p>
            <div className="mt-3 flex flex-col gap-2.5">
              {c.addresses.map((a) => (
                <div key={a.id} className="rounded-field bg-chip-soft p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <MapPin className="size-3.5 text-ink-500" aria-hidden />
                    <p className="text-[12.5px] font-bold text-ink">
                      {a.name} · {a.pincode}
                    </p>
                    {a.isDefault && <StatusChip tone="neutral">Default</StatusChip>}
                  </div>
                  <p className="mt-1 text-[12px] font-medium leading-[17px] text-ink-700">
                    {[a.line1, a.line2, a.landmark, a.city].filter(Boolean).join(" · ")}
                  </p>
                  {/* The line that decides whether a truck can get there. */}
                  {a.accessNote && (
                    <p className="mt-1 text-[12px] font-semibold text-ink">{a.accessNote}</p>
                  )}
                </div>
              ))}
              {c.addresses.length === 0 && (
                <p className="py-6 text-center text-[12.5px] font-semibold text-ink-500">
                  No saved sites.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-panel bg-white p-4 shadow-card">
            <h2 className="text-[15px] font-bold tracking-tight text-ink">Notes and issues</h2>
            <div className="mt-3 rounded-field bg-ops-info-tint p-3.5">
              <p className="text-[12.5px] font-bold text-ops-info">Not recorded anywhere.</p>
              <p className="mt-1 text-[12px] font-medium leading-[17px] text-ops-info">
                There is no note or ticket model in the schema, so an empty panel here
                would read as “no problems with this customer” when it means “nobody has
                ever written anything down”. Support conversations currently live in
                whichever phone took the call.
              </p>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-5">
          <section className="rounded-panel bg-white p-4 shadow-card">
            <h2 className="text-[15px] font-bold tracking-tight text-ink">Value</h2>
            <dl className="mt-3 flex flex-col gap-2.5">
              <Row label="Lifetime value" value={formatPaise(c.lifetimePaise)} />
              <Row label="Orders" value={String(c.orderCount)} />
              <Row
                label="Average order"
                value={c.averageOrderPaise === null ? "—" : formatPaise(c.averageOrderPaise)}
              />
              <Row
                label="Last order"
                value={c.lastOrderAt ? c.lastOrderAt.toLocaleDateString("en-IN", DATE) : "Never"}
              />
              <Row
                label="Preferred speed"
                value={
                  <PlaceholderValue pending="delivery preference is not asked for or stored">
                    Not recorded
                  </PlaceholderValue>
                }
              />
            </dl>
            <p className="mt-3 text-[11.5px] font-medium leading-[16px] text-ink-500">
              Cancelled and refunded orders are excluded. Money that came back is not
              lifetime value.
            </p>
          </section>

          <section className="rounded-panel bg-white p-4 shadow-card">
            <h2 className="text-[15px] font-bold tracking-tight text-ink">Money</h2>
            <dl className="mt-3 flex flex-col gap-2.5">
              <Row label="Wallet" value={formatPaise(c.wallet?.balancePaise ?? 0)} />
              <Row label="Credit limit" value="No product yet" />
              <Row label="Outstanding COD" value="COD is switched off" />
              <Row label="GSTIN" value={c.profile?.gstin ?? "Not given"} />
            </dl>
          </section>

          <section className="rounded-panel bg-white p-4 shadow-card">
            <h2 className="text-[15px] font-bold tracking-tight text-ink">Segments</h2>
            <p className="mt-2 text-[12px] font-medium leading-[17px] text-ink-700">
              The artboard shows five — Contractor, High value, Cement buyer, Hyderpora,
              Repeat monthly. Only the first is stored; the rest are rules nobody has
              written, and each needs a threshold the owner has to set. Inventing
              “high value” here would put a number on a customer that no one agreed to.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {c.profile?.buyerType ? (
                <StatusChip tone="neutral">
                  {BUYER_LABEL[c.profile.buyerType] ?? c.profile.buyerType}
                </StatusChip>
              ) : (
                <StatusChip tone="neutral">Buyer type not asked</StatusChip>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">{label}</dt>
      <dd className="text-[13px] font-bold tabular-nums text-ink">{value}</dd>
    </div>
  );
}
