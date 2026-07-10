import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, CalendarClock, Package, ShoppingBag } from "lucide-react";
import { getAdminUser } from "@/lib/services/admin/authz";
import { Logo } from "@/components/ui/logo";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: BarChart3 },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarClock },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminUser();
  if (!admin) redirect("/login?next=/admin");

  return (
    <div className="min-h-screen bg-surface/40">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/admin" className="hover:opacity-90 transition-opacity">
            <Logo variant="admin" className="h-10" showTagline={false} />
          </Link>
          <nav aria-label="Admin" className="ml-auto flex gap-1 overflow-x-auto">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold text-neutral-600 transition-colors hover:bg-surface hover:text-ink"
              >
                <Icon className="size-4" aria-hidden />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
          </nav>
          <Link href="/" className="text-xs font-bold text-neutral-500 hover:text-ink">
            ← Store
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
