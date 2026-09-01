import type { Metadata } from "next";
import { OpsScreen } from "@/components/admin/ops-screen";
import { DispatchLane } from "@/components/admin/dispatch-lane";
import { getDispatchBoard } from "@/lib/services/shipments";

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
 * lanes with occupancy counts and an assigned vehicle need slots, vehicles and
 * drivers, none of which exist (ISS-057). Drawing four empty time lanes would
 * suggest a dispatcher could load them.
 */
export default async function AdminDispatch() {
  const board = await getDispatchBoard();
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
        />

        <DispatchLane
          title="Heavy — by truck"
          note={`${board.scheduled.length} waiting`}
          shipments={board.scheduled}
          emptyNote="Nothing waiting for a truck."
        />

        {/*
          "Drivers and vehicles" — the right-hand rail of artboard 5, and the
          half of the board that turns a queue into a plan.

          It is the panel that decides who takes what, and it is empty for a
          reason worth writing down rather than leaving as a gap: there is no
          Driver, no vehicle and no slot. Four names with registration plates
          and cash-held figures beside them would be the most convincing thing
          on this screen and the least true — the cash column in particular is
          what a day gets reconciled against.
        */}
        <section className="rounded-panel bg-white p-4 shadow-card">
          <h2 className="text-[15px] font-bold tracking-tight">Drivers and vehicles</h2>
          <p className="mt-1 text-[12px] font-medium leading-[17px] text-ink-700">
            Who is on route, what they are driving, how many stops they have left and how
            much cash they are holding.
          </p>
          <div className="mt-3 rounded-field bg-ops-warn-tint p-3.5">
            <p className="text-[12.5px] font-bold text-ops-warn">
              There is no driver roster.
            </p>
            <p className="mt-1 text-[12px] font-medium leading-[17px] text-ops-warn">
              No Driver model, no vehicle, no slot — so a shipment cannot be assigned to
              anybody, and nothing on this board can be scheduled. The design&rsquo;s
              auto-assign and its per-slot lanes need those three before they need a
              button (ISS-057).
            </p>
          </div>
          <p className="mt-2.5 text-[11.5px] font-medium leading-[16px] text-ink-500">
            The cash-held column is the one to be most careful about: it is what a
            day&rsquo;s takings get reconciled against, and a plausible figure there would
            be reconciled against nothing.
          </p>
        </section>

        <p className="rounded-[12px] bg-ops-warn-tint px-3.5 py-2.5 text-[12px] font-semibold text-ops-warn">
          The board shows what is waiting, not who is taking it.
        </p>
      </div>
    </OpsScreen>
  );
}
