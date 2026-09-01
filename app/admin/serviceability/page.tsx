import { adminListServiceability } from "@/lib/services/admin/stock";
import { formatPaise } from "@/lib/money";
import { StatusChip } from "@/components/admin/status-chip";
import { PlaceholderValue } from "@/components/ui/placeholder-value";

export const dynamic = "force-dynamic";

export default async function AdminServiceability() {
  const { pincodes, warehouses } = await adminListServiceability();
  const active = pincodes.filter((p) => p.isActive).length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight">Serviceability</h1>
        <p className="mt-0.5 text-[11px] font-semibold text-ink-500">
          {active} of {pincodes.length} pincodes active · {warehouses.length}{" "}
          {warehouses.length === 1 ? "warehouse" : "warehouses"}
        </p>
      </div>

      <section className="rounded-panel bg-white p-4 shadow-card">
        <h2 className="mb-3 text-[15px] font-bold tracking-tight">Warehouses</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {warehouses.map((w) => (
            <li key={w.id} className="flex items-center gap-3 rounded-full bg-canvas px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-bold">{w.name}</p>
                <p className="text-[11px] font-semibold text-ink-500">
                  {w.city} · <span className="tabular-nums">{w.pincode}</span>
                </p>
              </div>
              <StatusChip tone={w.isActive ? "ok" : "neutral"}>
                {w.isActive ? "Active" : "Inactive"}
              </StatusChip>
            </li>
          ))}
        </ul>
      </section>

      <section className="overflow-x-auto rounded-panel bg-white p-4 shadow-card">
        <h2 className="mb-3 text-[15px] font-bold tracking-tight">Pincodes</h2>
        <table className="w-full min-w-[680px]">
          <thead>
            <tr className="text-left text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
              <th className="px-3 pb-2.5">Pincode</th>
              <th className="px-3 pb-2.5">Warehouse</th>
              <th className="px-3 pb-2.5 text-right">Express window</th>
              <th className="px-3 pb-2.5 text-right">Delivery fee</th>
              <th className="px-3 pb-2.5">COD</th>
              <th className="px-3 pb-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {pincodes.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-3 py-3 text-[12.5px] font-bold tabular-nums">{p.pincode}</td>
                <td className="px-3 py-3 text-[12px] font-semibold">
                  {p.warehouse.name}
                  <span className="block text-[11px] font-semibold text-ink-500">
                    {p.warehouse.city}
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-[12.5px] font-semibold tabular-nums">
                  {p.etaMinutes} min
                </td>
                <td className="px-3 py-3 text-right text-[12.5px] font-bold tabular-nums">
                  {p.deliveryFeePaise === 0 ? "Free" : formatPaise(p.deliveryFeePaise)}
                </td>
                <td className="px-3 py-3">
                  <StatusChip tone={p.codAllowed ? "ok" : "neutral"}>
                    {p.codAllowed ? "Allowed" : "Off"}
                  </StatusChip>
                </td>
                <td className="px-3 py-3">
                  <StatusChip tone={p.isActive ? "ok" : "neutral"}>
                    {p.isActive ? "Serving" : "Paused"}
                  </StatusChip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {pincodes.length === 0 && (
          <p className="py-10 text-center text-[13px] font-semibold text-ink-500">
            No serviceable pincodes configured. Checkout will reject every address.
          </p>
        )}
      </section>

      {/*
        The two sections the artboard puts beside the pincode table. Neither has
        a model, and the artboard's own callout says why that matters more here
        than elsewhere: "If capacity here says the 11 AM – 2 PM slot is full,
        the checkout must stop offering it — otherwise we sell a slot we cannot
        serve." A screen that showed five slots with capacities would be
        describing an arrangement that does not exist, and checkout would keep
        selling all of them regardless.
      */}
      <section className="rounded-panel bg-white p-4 shadow-card">
        <h2 className="text-[15px] font-bold tracking-tight">Delivery slots</h2>
        <div className="mt-3 rounded-field bg-ops-info-tint p-3.5">
          <p className="text-[12.5px] font-bold text-ops-info">
            There are no slots, so nothing here can be full.
          </p>
          <p className="mt-1 text-[12px] font-medium leading-[17px] text-ops-info">
            Checkout does not offer a time window, and there is no model that could hold
            one. This is the screen that would have to make the customer&rsquo;s slot
            picker honest — a slot marked full here has to disappear from checkout, or we
            sell a delivery we cannot make. Until a shipment exists to occupy a slot,
            capacity has nothing to count.
          </p>
        </div>
        <dl className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <Fact
            label="Needed first"
            value="A shipment model — slots count vehicles against loads, and neither is recorded"
          />
          <Fact
            label="Then"
            value="Per-slot capacity, an assigned vehicle, and a booking cut-off"
          />
        </dl>
      </section>

      <section className="rounded-panel bg-white p-4 shadow-card">
        <h2 className="text-[15px] font-bold tracking-tight">Seasonal rules</h2>
        <p className="mt-1 text-[12px] font-medium leading-[17px] text-ink-700">
          Srinagar winters genuinely stop heavy deliveries, and the season is the
          difference between a lead time that holds and one that does not. No rule is
          stored or applied — every order is quoted the same way in January as in July.
        </p>
        <dl className="mt-3 grid gap-2.5 sm:grid-cols-3">
          <Fact
            label="Window"
            value={
              <PlaceholderValue pending="the winter window needs last year's actual delivery dates, not the calendar">
                Not set
              </PlaceholderValue>
            }
          />
          <Fact
            label="Applies to"
            value={
              <PlaceholderValue pending="which materials are affected is the owner's to say — heavy loads from Jammu is the obvious candidate">
                Not set
              </PlaceholderValue>
            }
          />
          <Fact
            label="Lead time in window"
            value={
              <PlaceholderValue pending="needs last winter's delivery data; a guess here becomes a promise on a product page">
                Not set
              </PlaceholderValue>
            }
          />
        </dl>
        <p className="mt-3 text-[11.5px] font-medium leading-[16px] text-ink-500">
          The artboard sketches 1 December to 28 February with a five-to-seven day lead
          time and marks them as placeholders itself. They are not reproduced as values
          here: a window on this screen reads as a window in force, and the storefront
          would still ignore it.
        </p>
      </section>

      <p className="rounded-panel bg-ops-info-tint p-4 text-[12px] font-semibold leading-relaxed text-ops-info">
        Read-only for now. This table is what the storefront uses to decide whether it can
        take an order, what it charges for delivery and whether COD is offered — editing it
        changes what customers are promised, so it needs an audit trail before it becomes
        writable (ISS-015).
      </p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-field bg-chip-soft p-3">
      <dt className="text-[10px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
        {label}
      </dt>
      <dd className="mt-1 text-[12.5px] font-semibold leading-[17px] text-ink">{value}</dd>
    </div>
  );
}
