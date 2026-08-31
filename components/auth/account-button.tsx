"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { ChevronDown, LogOut, Package, User, UserRound } from "lucide-react";
import { firebaseAuth } from "@/lib/firebase/client";
import { signOutEverywhereOnThisDevice } from "@/lib/auth/sign-out-client";
import { cn } from "@/lib/utils";

/** Navbar auth control: Sign in when signed out, an account menu when signed in. */
export function AccountButton() {
  const router = useRouter();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return onAuthStateChanged(firebaseAuth(), (u) => {
      setUser(u);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const handleSignOut = async () => {
    await signOutEverywhereOnThisDevice();
    setOpen(false);
    router.refresh();
  };

  if (!ready || !user) {
    return (
      <Link
        href="/login"
        aria-label="Sign in"
        className="flex size-[38px] items-center justify-center rounded-full bg-chip-soft text-ink no-underline transition-colors hover:bg-chip"
      >
        <User className="size-4.5" aria-hidden />
      </Link>
    );
  }

  /* Phone-first market: show the number when that is how they signed in. */
  const label = user.phoneNumber ?? user.email?.split("@")[0] ?? "Account";
  const initial = (user.displayName ?? user.email ?? "A").trim()[0]?.toUpperCase() ?? "A";

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex cursor-pointer items-center gap-2 rounded-full bg-chip-soft px-2.5 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-chip"
      >
        <span className="grid size-6 place-items-center rounded-full bg-amber text-[11px] font-extrabold text-ink">
          {initial}
        </span>
        <span className="hidden max-w-28 truncate sm:inline">{label}</span>
        <ChevronDown
          className={cn("hidden size-3.5 transition-transform sm:block", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 min-w-48 rounded-[20px] bg-paper p-2 shadow-card-hover"
        >
          <Link
            href="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-full px-3 py-2 text-[13px] font-semibold text-ink-700 no-underline transition-colors hover:bg-chip hover:text-ink"
          >
            <UserRound className="size-4" /> My account
          </Link>
          <Link
            href="/account/orders"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-full px-3 py-2 text-[13px] font-semibold text-ink-700 no-underline transition-colors hover:bg-chip hover:text-ink"
          >
            <Package className="size-4" /> My orders
          </Link>
          <button
            role="menuitem"
            onClick={handleSignOut}
            className="flex w-full cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-[13px] font-semibold text-ink-700 transition-colors hover:bg-chip hover:text-ink"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
