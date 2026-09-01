import type { Metadata } from "next";
import { OpsScreen } from "@/components/admin/ops-screen";
import { OpsTable, OpsFilters, OpsStats } from "@/components/admin/ops-table";

export const metadata: Metadata = {
  title: "Staff & roles | Operations",
  robots: { index: false },
};

const ROLES = ["Owner", "Dispatcher", "Warehouse", "Accounts", "Support"] as const;

/**
 * The intended grid, in artboard order. Owner is not universally true — the
 * design has the owner picking and packing, which is a real thing an owner does
 * in a five-person business.
 */
const MATRIX: [string, boolean, boolean, boolean, boolean, boolean][] = [
  ["See customer prices", true, true, true, true, true],
  ["Change prices", true, false, false, false, false],
  ["See cost and margin", true, false, false, true, false],
  ["Assign dispatch", true, true, false, false, false],
  ["Pick and pack", true, true, true, false, false],
  ["Adjust stock", true, false, true, false, false],
  ["Receive goods and enter batches", true, false, true, false, false],
  ["Record cash deposits", true, false, false, true, false],
  ["Issue refunds and credit notes", true, false, false, true, true],
  ["View customer contact details", true, true, false, true, true],
  ["Manage staff and roles", true, false, false, false, false],
];

export default function Page() {
  return (
    <OpsScreen title="Staff & roles" intro="Who can see and change what.">
      <div className="flex flex-col gap-4">
        <p className="rounded-[12px] bg-ops-warn-tint px-3.5 py-3 text-[12px] font-semibold leading-[17px] text-ops-warn">
          The schema has four roles — customer, admin, vendor and professional. There is no dispatcher, warehouse, accounts or support role, so everyone working in this console today needs admin: a warehouse hand loading a truck has the same access as the owner, including margins and prices.
        </p>

        <OpsStats
          stats={[
            { label: "People with access", note: "Governed by the ADMIN_EMAILS allowlist, which is all-or-nothing." },
            { label: "Roles in the schema", note: "Four, none of which describes a job anyone here does." },
            { label: "Scoped permissions", note: "None. Access is a single boolean: admin, or not." },
            { label: "Last access review", note: "Never — nothing records who looked at what." },
          ]}
        />

        <OpsFilters filters={["All", "Active", "Invited", "Suspended"]} active="All" disabled />

        <OpsTable
          columns={["Name", "Phone", "Role", "Status", "Last active"]}
          rows={[]}
          emptyTitle="Staff are not managed here yet."
          emptyNote="Access is an environment variable — a comma-separated list of email addresses. Adding somebody means a deploy, removing them means a deploy, and in between everyone has everything. A picker should never see a margin."
        />

        {/*
          The permission matrix from the artboard.

          Rendered as the design intends it, with one change that is the whole
          point of the screen: every column reads "yes" today, because there is
          no scoping. The design's grid of ticks and dashes describes what these
          roles SHOULD be able to do; the reality is a single boolean. Showing
          the intended grid without that line would read as a description of
          access that is in force, and the rows where it matters most —
          margins, prices, refunds — are exactly the ones a warehouse hand can
          reach right now.
        */}
        <div className="overflow-x-auto rounded-panel bg-white p-4 shadow-card">
          <h2 className="text-[15px] font-bold tracking-tight">What each role can do</h2>
          <p className="mt-1 max-w-[640px] text-[12px] font-medium leading-[17px] text-ink-700">
            What each role <em>should</em> be able to do. None of it is enforced — the
            &ldquo;Today&rdquo; column is the access everyone in this console actually
            has, and it is the same column for all five roles.
          </p>
          <table className="mt-3 w-full min-w-[760px]">
            <thead>
              <tr className="text-left text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-ink-500">
                <th className="px-3 pb-2.5">Permission</th>
                {ROLES.map((r) => (
                  <th key={r} className="px-3 pb-2.5 text-center">
                    {r}
                  </th>
                ))}
                <th className="px-3 pb-2.5 text-center text-ops-warn">Today</th>
              </tr>
            </thead>
            <tbody>
              {MATRIX.map(([permission, ...granted]) => (
                <tr key={permission as string} className="border-t border-line">
                  <td className="px-3 py-2.5 text-[12.5px] font-semibold text-ink">
                    {permission}
                  </td>
                  {(granted as boolean[]).map((ok, i) => (
                    <td
                      key={ROLES[i]}
                      className="px-3 py-2.5 text-center text-[12.5px] font-bold text-ink"
                    >
                      {ok ? "Yes" : <span className="text-ink-500">—</span>}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-center text-[12.5px] font-bold text-ops-warn">
                    Yes
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </OpsScreen>
  );
}
