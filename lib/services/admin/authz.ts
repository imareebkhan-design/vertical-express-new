import "server-only";
import { readSession } from "@/lib/auth/session";
import { getAuthUserId } from "@/lib/auth/current-user";

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
