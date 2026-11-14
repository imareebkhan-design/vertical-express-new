import type { Metadata } from "next";
import { LaunchControlView } from "@/components/admin/launch-control-view";
import { getAdminUser } from "@/lib/services/admin/authz";
import { getLaunchCategory, getLaunchOverview, listLaunchBatches } from "@/lib/services/admin/launch-control";
import { LaunchSwitchboard } from "@/components/admin/launch-switchboard";
import { adminApplyLaunchChange, adminPlanLaunchChange, adminPlanLaunchUndo } from "@/actions/launch-control";

export const metadata: Metadata = {
  title: "Launch control | Operations",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * Launch control: the read-only report (components/admin/launch-control-view.tsx)
 * and, under it, the switches (components/admin/launch-switchboard.tsx), whose
 * actions each check the operator themselves.
 */
export default async function AdminLaunchControl({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /* Backstop for the layout gate: a request that renders only this page
     segment never ran app/admin/layout.tsx, so the page checks too. */
  if (!(await getAdminUser())) return null;
  const raw = (await searchParams).category;
  const selectedSlug = typeof raw === "string" && /^[a-z0-9-]{1,80}$/.test(raw) ? raw : null;
  const [overview, selected, batches] = await Promise.all([
    getLaunchOverview(),
    selectedSlug ? getLaunchCategory(selectedSlug) : Promise.resolve(null),
    listLaunchBatches(10),
  ]);
  return (
    <>
      <LaunchControlView overview={overview} selectedSlug={selectedSlug} selected={selected} />
      <LaunchSwitchboard
        departments={overview.departments}
        brands={overview.brands}
        batches={batches}
        plan={adminPlanLaunchChange}
        apply={adminApplyLaunchChange}
        planUndo={adminPlanLaunchUndo}
      />
    </>
  );
}
