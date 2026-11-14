import type { Metadata } from "next";
import { OpsScreen } from "@/components/admin/ops-screen";
import { SettingsForm } from "@/components/admin/settings-form";
import { SETTING_KEYS, readSettings } from "@/lib/services/settings";
import { getAdminUser } from "@/lib/services/admin/authz";

export const metadata: Metadata = {
  title: "Settings | Operations",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * The business rules, editable.
 *
 * Everything on this screen used to be a constant somewhere in the codebase.
 * That is how a 5% cashback paid out for weeks at a rate nobody chose, and how
 * two invented GSTINs reached customers' invoices.
 */
export default async function AdminSettings() {
  /* Backstop for the layout gate: a request that renders only this page
     segment never ran app/admin/layout.tsx, so the page checks too. */
  if (!(await getAdminUser())) return null;
  const s = await readSettings();

  return (
    <OpsScreen
      title="Settings"
      intro="Values the business owns rather than the code. Changes apply to the storefront immediately."
    >
      <SettingsForm
        initial={{
          cashbackPercent: s[SETTING_KEYS.cashbackPercent] ?? "",
          gstin: s[SETTING_KEYS.gstin] ?? "",
          expressMinutes: s[SETTING_KEYS.expressMinutes] ?? "",
          /* Stored in paise, shown in rupees. Blank stays blank rather than
             becoming ₹0, which would read as free express delivery. */
          expressFeeRupees: s[SETTING_KEYS.expressFeePaise]
            ? String(Number(s[SETTING_KEYS.expressFeePaise]) / 100)
            : "",
          packSlaMinutes: s[SETTING_KEYS.packSlaMinutes] ?? "",
          deliverySlaMinutes: s[SETTING_KEYS.deliverySlaMinutes] ?? "",
          codEnabled: s[SETTING_KEYS.codEnabled] === "true" ? "true" : "false",
          defaultSort: s[SETTING_KEYS.defaultSort] === "most_ordered" ? "most_ordered" : "newest",
        }}
      />
    </OpsScreen>
  );
}
