import type { Metadata } from "next";
import { OpsScreen } from "@/components/admin/ops-screen";
import { OpsTable, OpsFilters, OpsStats } from "@/components/admin/ops-table";

export const metadata: Metadata = {
  title: "COD cash | Operations",
  robots: { index: false },
};

export default function Page() {
  return (
    <OpsScreen title="COD cash" intro="Cash collected by drivers, and whether it has reached the bank.">
      <div className="flex flex-col gap-4">
        <p className="rounded-[12px] bg-ops-warn-tint px-3.5 py-3 text-[12px] font-semibold leading-[17px] text-ops-warn">
          Cash on delivery is switched off (ISS-063), and the reconciliation this screen performs is why. Cash moves customer → driver → office → bank with no record between the first step and the last, so a shortfall becomes visible at month end rather than on the day.
        </p>

        <OpsStats
          stats={[
            { label: "Collected today", note: "No collections — cash on delivery is off." },
            { label: "With drivers now", note: "Drivers exist and shipments are assigned to them, but no cash is collected — so there is nothing to hold." },
            { label: "Deposited today", note: "No deposit record. Nothing tracks money between the gate and the bank." },
            { label: "Unexplained variance", note: "Cannot be computed without both halves of the trail." },
          ]}
        />

        <OpsFilters filters={["Today", "Yesterday", "This week", "Unreconciled"]} active="Today" disabled />

        <OpsTable
          columns={["Driver", "Vehicle", "Stops", "Collected", "Deposited", "Variance", "Status"]}
          rows={[]}
          emptyTitle="No cash movements are recorded."
          emptyNote="A ledger per driver per day is the only thing that makes a shortfall visible while the driver is still in the building. It needs a Driver model and a deposit record — the same Driver model that blocks dispatch assignment and delivery."
        />

        {/*
          Deposits — the last step of the trail, and the one that closes it.
          Cash is only accounted for once it reaches a bank line with a
          reference somebody can look up. Without this the ledger above stops
          at "the driver handed it in", which is exactly where money goes
          missing without anyone being able to say when.
        */}
        <OpsTable
          columns={["Deposit", "By", "Bank", "Reference", "Amount", "Status"]}
          rows={[]}
          emptyTitle="No deposits are recorded."
          emptyNote="The trail runs customer → driver → office → bank, and this is its last step: an amount, a branch or CDM, and a reference that can be matched against a statement. Without it the ledger stops at 'handed in', which is precisely where cash goes missing with nobody able to say when."
        />
      </div>
    </OpsScreen>
  );
}
