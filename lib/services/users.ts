import "server-only";
import { db } from "@/lib/db";

/**
 * Mirror the Supabase auth user into our `users` table on login and ensure
 * the 1:1 profile row exists. Idempotent.
 */
export async function ensureUserMirror(input: {
  userId: string;
  email?: string | null;
  phone?: string | null;
}) {
  const { userId, email, phone } = input;
  await db.user.upsert({
    where: { id: userId },
    update: { email: email ?? undefined, phone: phone || undefined },
    create: {
      id: userId,
      email: email ?? undefined,
      phone: phone || undefined,
      profile: { create: {} },
    },
  });
}
