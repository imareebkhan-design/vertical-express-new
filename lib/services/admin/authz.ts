import "server-only";
import { readSession } from "@/lib/auth/session";
import { getAuthUserId, getAuthUser, isSignedIn } from "@/lib/auth/current-user";

/**
 * Admin authorization via an env allowlist (ADMIN_EMAILS, comma-separated).
 * Keeps admin gating migration-free for the MVP; swap for the `admin_users`
 * table + permissions when the ops team grows.
 *
 * WHY THE VERIFIED-EMAIL CHECK IS LOAD-BEARING
 *
 * This used to read `supabase.auth.getUser()`, which only ever returned an
 * email Supabase had confirmed. Firebase does not work that way: email/password
 * sign-up sets `email` on the token immediately, before anyone proves they can
 * read that inbox. Allowlisting on an unverified address would therefore let
 * anyone sign up as an address in ADMIN_EMAILS and walk into the admin console.
 *
 * So the token's email is only accepted when Firebase has verified it, and a
 * phone-only or Google-without-email identity is simply not an admin.
 */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function getAdminUser(): Promise<{ id: string; email: string } | null> {
  const token = await readSession();
  if (!token) return null;

  const email = typeof token.email === "string" ? token.email.trim().toLowerCase() : null;
  if (!email || token.email_verified !== true) return null;
  if (!adminEmails().includes(email)) return null;

  /* The application's own user id, not the Firebase uid — everything downstream
     of an admin action joins on `users.id`. */
  const id = await getAuthUserId();
  if (!id) return null;

  return { id, email };
}

export async function isAdmin(): Promise<boolean> {
  return (await getAdminUser()) !== null;
}

/**
 * What a console route should do when `getAdminUser()` comes back empty.
 *
 * THE BUG THIS EXISTS TO PREVENT
 *
 * Every admin route guarded on `!admin` and redirected to `/login?next=…`.
 * That conflates two different failures which need opposite answers:
 *
 *   - Nobody is signed in. Sending them to sign in is exactly right.
 *   - Somebody IS signed in, and this account is not an operator. Sending them
 *     to sign in cannot help — they already did, and the login page correctly
 *     bounces anyone holding a session straight back to the storefront.
 *
 * The second case was an infinite bounce that ended on the home page with no
 * explanation. It was reachable by every customer in the market's default
 * identity: phone sign-in produces no verified email, so it can never satisfy
 * the allowlist, so it always took this path.
 *
 * Returning a discriminated result rather than redirecting for both keeps the
 * decision in one place and forces each caller to handle the case that used to
 * be silently wrong.
 */
export type AdminGate =
  | { state: "admin"; admin: { id: string; email: string } }
  | { state: "anonymous" }
  | { state: "not-admin"; identity: string | null };

export async function adminGate(): Promise<AdminGate> {
  const admin = await getAdminUser();
  if (admin) return { state: "admin", admin };

  if (!(await isSignedIn())) return { state: "anonymous" };

  /* Signed in, not an operator. The identity is echoed back so the screen can
     say which account is the problem — "signed in as +91…" is what tells
     somebody they need to switch, and it is the thing a redirect cannot say. */
  const user = await getAuthUser();
  return { state: "not-admin", identity: user?.email ?? user?.phone ?? null };
}
