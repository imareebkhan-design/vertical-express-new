import "server-only";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Admin authorization via an env allowlist (ADMIN_EMAILS, comma-separated).
 * Keeps admin gating migration-free for the MVP; swap for the `admin_users`
 * table + permissions when the ops team grows.
 */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function getAdminUser(): Promise<{ id: string; email: string } | null> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!data.user || !email) return null;
  if (!adminEmails().includes(email)) return null;
  return { id: data.user.id, email };
}

export async function isAdmin(): Promise<boolean> {
  return (await getAdminUser()) !== null;
}
