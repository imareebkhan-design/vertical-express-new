import type { Metadata } from "next";
import Link from "next/link";
import { OpsScreen } from "@/components/admin/ops-screen";
import { DriversManager, type HistoryEntry } from "@/components/admin/drivers-manager";
import { getAdminUser } from "@/lib/services/admin/authz";
import { listRosterDetailed } from "@/lib/services/admin/roster-write";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Drivers & vehicles | Operations", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Human words for the roster audit actions. */
const ACTION_LABEL: Record<string, string> = {
  "driver.created": "Added",
  "driver.updated": "Details changed",
  "driver.retired": "Retired",
  "driver.reinstated": "Reinstated",
  "driver.login_released": "App login released",
  "vehicle.created": "Added",
  "vehicle.retired": "Retired",
  "vehicle.reinstated": "Reinstated",
};

/**
 * Drivers & vehicles — the delivery roster on its own page.
 *
 * It used to live only at the bottom of the dispatch board, below every lane,
 * and the console had no navigation at all below desktop width, so an operator
 * could not find it (owner, 14 Oct). The roster services are unchanged
 * (`lib/services/admin/roster-write.ts`); nobody is ever deleted.
 */
export default async function AdminDrivers() {
  /* Backstop for the layout gate: a request that renders only this page
     segment never ran app/admin/layout.tsx, so the page checks too. */
  if (!(await getAdminUser())) return null;
  const roster = await listRosterDetailed();
  const ids = [...roster.drivers.map((d) => d.id), ...roster.vehicles.map((v) => v.id)];
  const audit = ids.length
    ? await db.auditLog.findMany({
        where: { entityType: { in: ["driver", "vehicle"] }, entityId: { in: ids } },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: { entityId: true, action: true, createdAt: true, after: true },
      })
    : [];
  const history: Record<string, HistoryEntry[]> = {};
  for (const a of audit) {
    const reason = (a.after as { reason?: string } | null)?.reason;
    (history[a.entityId] ??= []).push({
      label: ACTION_LABEL[a.action] ?? a.action,
      at: a.createdAt.toISOString(),
      note: reason ?? null,
    });
  }
  const active = roster.drivers.filter((d) => d.isActive).length;
  const linked = roster.drivers.filter((d) => d.isActive && d.appLinked).length;

  return (
    <OpsScreen
      title="Drivers & vehicles"
      intro={`${active} active ${active === 1 ? "driver" : "drivers"}, ${linked} signed in to the app. Assign them to shipments on the dispatch board.`}
    >
      <div className="flex flex-col gap-4">
        <section className="rounded-panel bg-white p-4 shadow-card">
          <h2 className="text-[15px] font-bold tracking-tight">How a new driver starts</h2>
          <ol className="mt-2 grid gap-2 text-[12.5px] font-medium leading-[18px] text-ink-700 sm:grid-cols-3">
            <li><span className="font-bold text-ink">1. Add them here</span> with their name and the mobile number they will carry.</li>
            <li><span className="font-bold text-ink">2. They install the Vertical Express app</span> and sign in with that number — a one-time code is sent to it.</li>
            <li><span className="font-bold text-ink">3. Their card shows &ldquo;Signed in to app&rdquo;.</span> Assign deliveries on the <Link href="/admin/dispatch" className="font-bold underline underline-offset-2">dispatch board</Link>; they appear in the app&rsquo;s Delivery partner mode.</li>
          </ol>
        </section>
        <DriversManager roster={roster} history={history} />
      </div>
    </OpsScreen>
  );
}
