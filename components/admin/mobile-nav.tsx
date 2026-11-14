"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { GROUPS } from "@/components/admin/sidebar";

/**
 * The console's navigation below desktop width.
 *
 * The sidebar is `hidden lg:flex`, and the header offered only a link back to
 * /admin — on a phone or tablet there was no way to reach Dispatch, Drivers &
 * vehicles or anything else (owner, 14 Oct). Same destinations as the sidebar
 * (one `GROUPS` list), in a panel under the header.
 */
export function AdminMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  /* Close after navigating. */
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="lg:hidden print:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="admin-mobile-nav"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 items-center gap-2 rounded-full bg-chip px-3.5 text-[13px] font-bold"
      >
        {open ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
        Menu
      </button>
      {open && (
        <nav
          id="admin-mobile-nav"
          aria-label="Operations"
          className="absolute inset-x-0 top-16 z-40 max-h-[calc(100vh-4rem)] overflow-y-auto bg-white px-4 pb-6 shadow-header"
        >
          {GROUPS.map((group) => (
            <div key={group.heading}>
              <p className="px-2 pb-1.5 pt-4 text-[10px] font-extrabold uppercase tracking-[0.1em] text-ink-300">{group.heading}</p>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 items-center gap-2 rounded-panel px-3 text-[13px]",
                        active ? "bg-ink font-bold text-white" : "font-semibold text-ink-700 hover:bg-hush"
                      )}
                    >
                      <Icon className={cn("size-4 flex-none", active ? "text-white" : "text-ink-500")} aria-hidden />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      )}
    </div>
  );
}
