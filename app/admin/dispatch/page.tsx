import type { Metadata } from "next";
import { OpsScreen } from "@/components/admin/ops-screen";
import { DispatchLane } from "@/components/admin/dispatch-lane";
import { getDispatchBoard, getDispatchRoster } from "@/lib/services/shipments";

export const metadata: Metadata = {
  title: "Dispatch | Operations",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * The dispatch board — artboard 5.
 *
 * Two lanes rather than the artboard's five, because only one lane distinction
 * is real: express leaves from the store, heavy goes on a truck. The per-slot
 * lanes still need delivery slots, which do not exist (ISS-057) — drawing four
 * empty time lanes would suggest a dispatcher could load them.
 *
 * Drivers and vehicles landed in `20260905061559_drivers_vehicles`, so the
 * board can now assign and move a shipment. This comment, and the panel below
 * it, both said that was impossible; correcting them is part of the feature
 * rather than an afterthought.
 */
export default async function AdminDispatch() {
  const [board, roster] = await Promise.all([getDispatchBoard(), getDispatchRoster()]);
  const total = board.express.length + board.scheduled.length;

  return (
    <OpsScreen
      title="Dispatch board"
      intro={`${total} ${total === 1 ? "shipment" : "shipments"} still in the warehouse. Oldest first — the one that has waited longest is the one about to become a phone call.`}
    >
      <div className="flex flex-col gap-4">
        <DispatchLane
          title="Express lane"
          note={`${board.express.length} waiting · out from the store`}
          shipments={board.express}
          emptyNote="Nothing waiting on the express lane."
          roster={roster}
        />

        <DispatchLane
          title="Heavy — by truck"
          note={`${board.scheduled.length} waiting`}
          shipments={board.scheduled}
          emptyNote="Nothing waiting for a truck."
          roster={roster}
        />

        {/*
          "Drivers and vehicles" — the right-hand rail of artboard 5.

          This panel used to state that the roster, the vehicle records and the
          slots were all absent. Two of those three stopped being absent when
          the models landed: assignment works, and the controls on each card do
          it.

          The old wording is not quoted here on purpose — a guard sweeps the
          source for exactly those phrases, and it cannot tell a historical
          quotation from a live claim. Keeping the guard blunt is worth more
          than keeping the quote.

          What remains missing is the cash column, and it is the one to be most
          careful about. Cash held per driver is what a day's takings get
          reconciled against, and there is no COD collection, no driver float
          and no reconciliation (ISS-010) — so a figure there would be
          reconciled against nothing. Slots are still absent too (ISS-057),
          which is why the lanes above are two rather than five.
        */}
        <section className="rounded-panel bg-white p-4 shadow-card">
          <h2 className="text-[15px] font-bold tracking-tight">Drivers and vehicles</h2>
          <p className="mt-1 text-[12px] font-medium leading-[17px] text-ink-700">
            {roster.drivers.length === 0
              ? "No drivers on the roster yet. A shipment cannot be dispatched until somebody is assigned to carry it."
              : `${roster.drivers.length} ${roster.drivers.length === 1 ? "driver" : "drivers"} and ${roster.vehicles.length} ${roster.vehicles.length === 1 ? "vehicle" : "vehicles"} available. Assign from the card on each shipment.`}
          </p>

          {roster.drivers.length > 0 && (
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {roster.drivers.map((d) => (
                <li
                  key={d.id}
                  className="flex items-baseline justify-between gap-2 rounded-field bg-canvas px-3 py-2"
                >
                  <span className="text-[12.5px] font-bold text-ink">{d.name}</span>
                  <span className="text-[11.5px] font-semibold tabular-nums text-ink-500">
                    {d.phone}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 rounded-field bg-ops-warn-tint p-3.5">
            <p className="text-[12.5px] font-bold text-ops-warn">
              Cash held per driver is not shown.
            </p>
            <p className="mt-1 text-[12px] font-medium leading-[17px] text-ops-warn">
              There is no cash collection, no driver float and no daily reconciliation
              (ISS-010), so there is nothing to total. It is the column a day&rsquo;s
              takings get reconciled against, and a plausible figure there would be
              reconciled against nothing.
            </p>
          </div>
        </section>

        <p className="rounded-[12px] bg-ops-warn-tint px-3.5 py-2.5 text-[12px] font-semibold text-ops-warn">
          The board shows what is waiting, not who is taking it.
        </p>
      </div>
    </OpsScreen>
  );
}
