"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Box,
  CreditCard,
  Home,
  MapPin,
  PieChart,
  ShoppingBag,
  Tag,
  Users,
  Warehouse,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Operations console navigation.
 *
 * Grouped by job rather than by data model, because the people using this are a
 * dispatcher, a warehouse hand, an accountant and the owner — not developers.
 *
 * A fixed sidebar rather than the storefront's floating nav: this is a tool, and
 * a dispatcher needs every destination reachable without a menu.
 */

const GROUPS: { heading: string; items: { href: string; label: string; icon: typeof Home }[] }[] = [
  {
    heading: "Operations",
    items: [
      { href: "/admin", label: "Today", icon: Home },
      { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
    ],
  },
  {
    heading: "Catalog & stock",
    items: [
      { href: "/admin/products", label: "Products", icon: Box },
      { href: "/admin/inventory", label: "Inventory", icon: Warehouse },
    ],
  },
  {
    heading: "Customers",
    items: [{ href: "/admin/customers", label: "Customers", icon: Users }],
  },
  {
    heading: "Money",
    items: [{ href: "/admin/payments", label: "Payments", icon: CreditCard }],
  },
  {
    heading: "Configure",
    items: [
      { href: "/admin/serviceability", label: "Serviceability", icon: MapPin },
      { href: "/admin/coupons", label: "Coupons", icon: Tag },
      { href: "/admin/bi", label: "Reports", icon: PieChart },
    ],
  },
];

export function AdminSidebar({
  adminEmail,
  gatewayWarning,
}: {
  adminEmail: string;
  gatewayWarning: string | null;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[246px] flex-none flex-col gap-0.5 bg-white p-3.5 lg:flex">
      <Link href="/admin" className="mb-3 flex items-center gap-2.5 px-3 py-1">
        <span className="grid size-8 flex-none place-items-center rounded-xl bg-brand">
          <BarChart3 className="size-4 text-ink" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-extrabold tracking-tight">
            Vertical Express
          </span>
          <span className="block text-[11px] font-semibold text-ink-500">Operations</span>
        </span>
      </Link>

      {GROUPS.map((group) => (
        <div key={group.heading}>
          <p className="px-3 pb-1.5 pt-3.5 text-[9.5px] font-extrabold uppercase tracking-[0.1em] text-ink-300">
            {group.heading}
          </p>
          {group.items.map(({ href, label, icon: Icon }) => {
            const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9.5 items-center gap-2.5 rounded-xl px-3 text-[13px] transition-colors",
                  active
                    ? "bg-ink font-bold text-white"
                    : "font-semibold text-ink-700 hover:bg-hush"
                )}
              >
                <Icon className={cn("size-4", active ? "text-white" : "text-ink-500")} aria-hidden />
                {label}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="flex-1" />

      {gatewayWarning && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-ops-bad-tint p-3">
          <AlertTriangle className="mt-0.5 size-4 flex-none text-ops-bad" aria-hidden />
          <p className="text-[11px] font-bold leading-snug text-ops-bad">{gatewayWarning}</p>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2.5 rounded-xl px-3 py-2.5">
        <span className="grid size-7 flex-none place-items-center rounded-full bg-amber-soft text-[10px] font-extrabold">
          {adminEmail.slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ink-500">
          {adminEmail}
        </span>
      </div>
    </aside>
  );
}
