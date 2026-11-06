import type { PickList as PickListData } from "@/lib/services/shipments";

/**
 * What to collect from the shelves.
 *
 * One row per variant, not per shipment: a picker walking the same aisle four
 * times for four shipments of the same cement is what this exists to stop.
 * Collect the total once, sort into shipments at the bench — so each row
 * carries the shipment references and their quantities.
 *
 * No location, because `Inventory` has no bin or aisle column. Saying nothing
 * about where something is beats sending somebody to a shelf that does not
 * exist.
 */
export function PickListPanel({ lines }: { lines: PickListData }) {
  const totalUnits = lines.reduce((n, l) => n + l.totalQty, 0);

  return (
    <section className="rounded-panel bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold tracking-tight text-ink">Pick list</h2>
        <p className="text-[11.5px] font-semibold text-ink-500">
          {lines.length === 0
            ? "nothing to pick"
            : `${lines.length} ${lines.length === 1 ? "line" : "lines"} · ${totalUnits} ${totalUnits === 1 ? "unit" : "units"}`}
        </p>
      </div>

      <p className="mt-1 text-[12px] font-medium leading-[17px] text-ink-700">
        Everything waiting to be packed, gathered by item so the walk happens once.
        Express first.
      </p>

      {lines.length === 0 ? (
        <p className="mt-3 rounded-[12px] bg-chip-soft px-3.5 py-3 text-[12px] font-semibold text-ink-500">
          Nothing is waiting to be picked.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {lines.map((l) => (
            <li key={l.variantId} className="rounded-[14px] bg-canvas p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-extrabold text-ink">{l.title}</p>
                  <p className="mt-0.5 text-[11.5px] font-semibold text-ink-500">
                    {l.variantName} · {l.sku}
                    {l.warehouse ? ` · ${l.warehouse}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-right">
                  <span className="block text-[18px] font-extrabold tabular-nums leading-none text-ink">
                    {l.totalQty}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-500">
                    {l.speedClass === "express" ? "express" : "truck"}
                  </span>
                </span>
              </div>

              {/* How the pile gets split once it reaches the bench. */}
              <p className="mt-2 border-t border-line pt-2 text-[11px] font-semibold text-ink-500">
                {l.forShipments.map((s) => `${s.ref} × ${s.qty}`).join("  ·  ")}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* Named rather than left as a gap, so nobody wonders why the list does
          not say where anything is. */}
      <p className="mt-2.5 text-[11.5px] font-medium leading-[16px] text-ink-500">
        No shelf locations: inventory records a warehouse, not a bin or an aisle.
      </p>
    </section>
  );
}
