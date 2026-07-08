import Link from "next/link";
import { AlertTriangle, CalendarClock, IndianRupee, Package, ShoppingBag, TrendingUp, Users } from "lucide-react";
import { getAdminKpis } from "@/lib/services/admin/dashboard";
import { formatPaise } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const k = await getAdminKpis();

  const cards = [
    { icon: ShoppingBag, label: "Total orders", value: String(k.ordersTotal), sub: `${k.ordersToday} today`, href: "/admin/orders" },
    { icon: IndianRupee, label: "GMV", value: formatPaise(k.gmvPaise), sub: `AOV ${formatPaise(k.aovPaise)}`, href: "/admin/orders" },
    { icon: Package, label: "Published products", value: String(k.productsPublished), sub: `${k.lowStockCount} low stock`, href: "/admin/products" },
    { icon: CalendarClock, label: "Open bookings", value: String(k.bookingsOpen), sub: "needs action", href: "/admin/bookings" },
    { icon: Users, label: "Customers", value: String(k.customers), sub: "registered", href: "/admin/orders" },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {cards.map(({ icon: Icon, label, value, sub, href }) => (
          <Link
            key={label}
            href={href}
            className="rounded-card border border-neutral-100 bg-white p-5 shadow-card transition-shadow hover:shadow-card-hover"
          >
            <div className="flex items-center gap-2 text-neutral-400">
              <Icon className="size-4" aria-hidden />
              <span className="text-[11px] font-extrabold uppercase tracking-wider">{label}</span>
            </div>
            <p className="mt-2 text-2xl font-extrabold sm:text-3xl">{value}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs font-bold text-neutral-500">
              {label === "Published products" && k.lowStockCount > 0 && (
                <AlertTriangle className="size-3 text-amber-500" />
              )}
              {label === "GMV" && <TrendingUp className="size-3 text-success" />}
              {sub}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
