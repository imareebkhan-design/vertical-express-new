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

/* Identity lives in lib/auth/current-user.ts. Supabase is the Postgres host and
 * nothing else: Prisma reaches it over DATABASE_URL, which does not involve this
 * client at all.
 *
 * This comment previously claimed Supabase "no longer issues or reads sessions".
 * That was false for six weeks — placeOrder, confirmRazorpayPayment,
 * submitBooking, the account and checkout pages and the admin gate all still
 * called supabase.auth.getUser(), which by then signed nobody in, so checkout
 * was dead (ISS-046). The comment is why it took so long to find: it told every
 * reader the thing they needed to doubt.
 *
 * It is true now. lib/__tests__/single-identity-reader.test.ts keeps it true,
 * which is the only reason it is safe to write down. This whole file is due for
 * deletion with the rest of the Supabase Auth cleanup. */
