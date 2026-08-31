import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Server-side Supabase client bound to the request's auth cookies. */
export async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component render — middleware refreshes sessions.
          }
        },
      },
    }
  );
}

/** Current authenticated user id, or null. */
/* getAuthUserId moved to lib/auth/current-user.ts when identity moved to
 * Clerk. Supabase remains the Postgres host and storage; it no longer issues
 * or reads sessions, and leaving a second reader here would be an invitation
 * to authenticate against the wrong system. */
