import { formatPaise } from "@/lib/money";
import { StatusChip } from "@/components/admin/status-chip";
import type { DispatchShipment } from "@/lib/services/shipments";

/**
 * One lane of the dispatch board.
 *
 * The artboard draws express as a single lane and heavy goods as a lane per
 * two-hour slot, each with an occupancy count and a vehicle. Only the first
 * split is real: express leaves from the store, scheduled goes on a truck.
 * Slots, vehicles and drivers do not exist (ISS-057), so the heavy side is one
 * lane rather than four invented ones.
 *
 * A card carries what a dispatcher needs to decide the next move — where it is
 * going, how much of it there is, what it is worth, and how long it has been
 * waiting. How long is the one the artboard does not show and the warehouse
 * always asks: the oldest shipment is the one about to become a phone call.
 */
export function DispatchLane({
  title,
  note,
  shipments,
  emptyNote,
}: {
  title: string;
  note: string;
  shipments: DispatchShipment[];
  emptyNote: string;
}) {
  return (
    <section className="rounded-panel bg-white p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold tracking-tight text-ink">{title}</h2>
        <p className="text-[11.5px] font-semibold text-ink-500">{note}</p>
      </div>

      {shipments.length === 0 ? (
        <p className="mt-3 rounded-[12px] bg-chip-soft px-3.5 py-3 text-[12px] font-semibold text-ink-500">
          {emptyNote}
        </p>
      ) : (
        <ul className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {shipments.map((s) => (
            <li key={s.id} className="rounded-[14px] bg-canvas p-3.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[12.5px] font-extrabold tabular-nums text-ink">{s.ref}</p>
                <StatusChip tone={s.status === "packed" ? "ok" : "warn"}>
                  {s.status === "packed" ? "Packed" : "Awaiting"}
                </StatusChip>
              </div>

              <p className="mt-1.5 text-[12.5px] font-bold text-ink">{s.destination}</p>
              <p className="mt-0.5 text-[11.5px] font-semibold text-ink-500">
                {s.itemCount} {s.itemCount === 1 ? "item" : "items"} · {s.lineCount}{" "}
                {s.lineCount === 1 ? "line" : "lines"}
                {s.warehouse ? ` · ${s.warehouse}` : ""}
              </p>

              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-extrabold tabular-nums text-ink">
                  {formatPaise(s.valuePaise)}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-500">
                  {s.paymentMethod}
                </span>
              </div>

              <p className="mt-2 border-t border-line pt-2 text-[11px] font-semibold text-ink-500">
                Waiting {waitedFor(s.waitingSince)} · no rider assignable yet
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Whole units, because a dispatcher reads this at a glance. */
function waitedFor(since: Date | string): string {
  const ms = Date.now() - new Date(since).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(mins, 0)} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}
