import type { Metadata } from "next";
import { OpsScreen } from "@/components/admin/ops-screen";
import { DispatchLane } from "@/components/admin/dispatch-lane";
import {
  getDispatchBoard,
  getDispatchRoster,
  getShipmentsOnTheRoad,
  getPickList,
} from "@/lib/services/shipments";
import { PickListPanel } from "@/components/admin/pick-list";
import Link from "next/link";
import { getAdminUser } from "@/lib/services/admin/authz";

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
  /* Backstop for the layout gate: a request that renders only this page
     segment never ran app/admin/layout.tsx, so the page checks too. */
  if (!(await getAdminUser())) return null;
  const [board, roster, onTheRoad, pickList] = await Promise.all([
    getDispatchBoard(),
    getDispatchRoster(),
    getShipmentsOnTheRoad(),
    getPickList(),
  ]);
  const total = board.express.length + board.scheduled.length;

  return (
    <OpsScreen
      title="Dispatch board"
      intro={`${total} ${total === 1 ? "shipment" : "shipments"} still in the warehouse. Oldest first — the one that has waited longest is the one about to become a phone call.`}
    >
      <div className="flex flex-col gap-4">
        {/* First, because picking is what happens before anything on the lanes
            below can move. */}
        <PickListPanel lines={pickList} />

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

        {/* Already gone, not yet arrived. Deliberately its own lane rather than
            a third entry in the two above: those say "still in the warehouse"
            and the count over them says it too, so a shipment on the road in
            that list would make the sentence false. This is where the customer's
            code gets read back. */}
        <DispatchLane
          title="On the road"
          note={`${onTheRoad.length} out for delivery`}
          shipments={onTheRoad}
          emptyNote="Nothing out for delivery."
          roster={roster}
        />

        {/* The roster used to be edited down here, below every lane, and could not
            be found (owner, 14 Oct). It has its own page now; this is the way there. */}
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-panel bg-white p-4 shadow-card">
          <div>
            <h2 className="text-[15px] font-bold tracking-tight">Drivers and vehicles</h2>
            <p className="mt-1 text-[12px] font-medium text-ink-700">
              {roster.drivers.length} active {roster.drivers.length === 1 ? "driver" : "drivers"} and {roster.vehicles.length}{" "}
              {roster.vehicles.length === 1 ? "vehicle" : "vehicles"} available to assign.
            </p>
          </div>
          <Link href="/admin/drivers" className="rounded-full bg-ink px-4 py-2.5 text-[12.5px] font-bold text-white">
            Manage drivers &amp; vehicles
          </Link>
        </section>

        <section className="rounded-panel bg-white p-4 shadow-card">
          <h2 className="text-[15px] font-bold tracking-tight">Cash held per driver</h2>
          <div className="mt-2 rounded-field bg-ops-warn-tint p-3.5">
            <p className="text-[12.5px] font-bold text-ops-warn">Not shown.</p>
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
