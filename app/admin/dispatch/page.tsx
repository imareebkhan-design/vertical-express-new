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

        <p className="rounded-[12px] bg-ops-warn-tint px-3.5 py-2.5 text-[12px] font-semibold text-ops-warn">
          Riders, vehicles and delivery slots do not exist yet, so nothing here can be
          assigned or scheduled — the board shows what is waiting, not who is taking it.
          Auto-assign and the per-slot lanes in the design need those models first
          (ISS-057).
        </p>
      </div>
    </OpsScreen>
  );
}
