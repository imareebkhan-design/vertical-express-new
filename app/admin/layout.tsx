import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/services/admin/authz";
import { activeGateway } from "@/lib/services/payments";
import { AdminSidebar } from "@/components/admin/sidebar";

/**
 * Operations console shell.
 *
 * A fixed sidebar rather than the storefront's nav — this is a tool used all day
 * by people who need every destination one click away.
 *
 * The gateway warning is deliberately permanent and not dismissable. While the
 * active gateway is `dummy`, orders confirm with no money taken, and that fact
 * should be in front of whoever is working the console rather than in a doc.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminUser();
  if (!admin) redirect("/login?next=/admin");

  let gatewayWarning: string | null = null;
  try {
    if (activeGateway() === "dummy") {
      gatewayWarning = "Gateway: dummy. Orders confirm with no money taken (ISS-002).";
    }
  } catch {
    // activeGateway throws on a misconfigured environment. Surfacing that is more
    // useful than a blank sidebar.
    gatewayWarning = "Payment gateway is misconfigured. Check PAYMENT_GATEWAY.";
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <AdminSidebar adminEmail={admin.email} gatewayWarning={gatewayWarning} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 flex-none items-center gap-4 bg-white px-5 shadow-header sm:px-7">
          <Link href="/admin" className="text-[13px] font-extrabold lg:hidden">
            Operations
          </Link>
          <div className="flex-1" />
          <Link
            href="/"
            className="rounded-xl bg-chip px-3.5 py-2 text-xs font-bold transition-colors hover:bg-hush"
          >
            View store
          </Link>
        </header>

        <main className="min-w-0 flex-1 px-5 py-6 sm:px-7">{children}</main>
      </div>
    </div>
  );
}
