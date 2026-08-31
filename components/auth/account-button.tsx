"use client";

import Link from "next/link";
import { User } from "lucide-react";
import { Show, UserButton } from "@clerk/nextjs";

/**
 * The navbar auth control: a Sign in link when signed out, Clerk's user menu
 * when signed in.
 *
 * Clerk's `<Show when="signed-in|signed-out">` resolves on the server for the first
 * paint, which removes the flash the previous version had — it fetched the
 * Supabase user in an effect, so the header showed "Login" for a moment to
 * someone already signed in.
 *
 * Orders is added to Clerk's menu rather than rebuilt around it, so the account
 * routes stay reachable from the same place they always were.
 */
export function AccountButton() {
  return (
    <>
      <Show when="signed-out">
        <Link
          href="/login"
          aria-label="Sign in"
          className="flex cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-sm font-bold text-ink no-underline transition-colors hover:bg-chip"
        >
          <User className="size-5" aria-hidden />
          <span className="hidden sm:inline">Sign in</span>
        </Link>
      </Show>

      <Show when="signed-in">
        <UserButton
          appearance={{
            variables: {
              colorPrimary: "#111111",
              fontFamily: "var(--font-jakarta), ui-sans-serif, system-ui, sans-serif",
            },
            elements: { avatarBox: "size-8" },
          }}
          userProfileProps={{
            appearance: { variables: { colorPrimary: "#111111" } },
          }}
        >
          <UserButton.MenuItems>
            <UserButton.Link
              label="My orders"
              labelIcon={<OrdersIcon />}
              href="/account/orders"
            />
            <UserButton.Link
              label="My account"
              labelIcon={<AccountIcon />}
              href="/account"
            />
          </UserButton.MenuItems>
        </UserButton>
      </Show>
    </>
  );
}

/* Clerk renders menu icons at 16px inside its own chrome, so these are plain
   inline SVGs at the app's 1.7px stroke rather than lucide components, which
   would carry their own sizing. */
function OrdersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16.5 9.4 7.5 4.21" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
