"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client (singleton per tab). */
export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
