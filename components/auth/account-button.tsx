"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, LogOut, Package, User, UserRound } from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { signOut } from "@/actions/auth";
import { cn } from "@/lib/utils";

/** Navbar auth control: Login link when signed out, account menu when signed in. */
export function AccountButton() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const handleSignOut = () => {
    startTransition(async () => {
      await signOut();
      setOpen(false);
      router.refresh();
    });
  };

  if (!ready || !email) {
    return (
      <Link
        href="/login"
        className="flex cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-sm font-bold transition-colors hover:bg-surface"
        aria-label="Log in"
      >
        <User className="size-5" aria-hidden />
        <span className="hidden sm:inline">Login</span>
      </Link>
    );
  }

  const handle = email.split("@")[0];

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-sm font-bold transition-colors hover:bg-surface"
      >
        <span className="grid size-6 place-items-center rounded-full bg-brand text-[11px] font-extrabold uppercase text-ink">
          {handle[0]}
        </span>
        <span className="hidden max-w-24 truncate sm:inline">{handle}</span>
        <ChevronDown
          className={cn("hidden size-3.5 transition-transform duration-200 sm:block", open && "rotate-180")}
          aria-hidden
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute right-0 top-full z-50 mt-1 min-w-48 rounded-panel border border-neutral-100 bg-white p-2 shadow-card-hover"
          >
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-full px-3 py-2 text-[13px] font-semibold text-neutral-600 transition-colors hover:bg-surface hover:text-ink"
            >
              <UserRound className="size-4" /> My Account
            </Link>
            <Link
              href="/account/orders"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-full px-3 py-2 text-[13px] font-semibold text-neutral-600 transition-colors hover:bg-surface hover:text-ink"
            >
              <Package className="size-4" /> My Orders
            </Link>
            <button
              role="menuitem"
              onClick={handleSignOut}
              disabled={pending}
              className="flex w-full cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-[13px] font-semibold text-danger transition-colors hover:bg-danger/5"
            >
              <LogOut className="size-4" /> {pending ? "Signing out…" : "Sign out"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
