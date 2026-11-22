"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSession, readSessionAllowingRevoked } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/session-cookie";
import { isDeletedUid } from "@/lib/auth/current-user";
import { deleteAccount, type DeletionBlocker } from "@/lib/services/account-deletion";
import { type ActionResult, fail } from "@/lib/validators";

/**
 * The website's "Delete account" button. Same service and rules as
 * POST /api/v1/me/deletion; the identity comes from the session cookie, never
 * from the form.
 */

const DELETION_PENDING_MESSAGE =
  "Your details have been removed, but we couldn't finish closing your sign-in. We'll keep retrying automatically, or you can try again now. Your account isn't fully deleted until this finishes.";

export type DeleteMyAccountResult = { status: "deleted" };

export async function deleteMyAccount(input: unknown): Promise<ActionResult<DeleteMyAccountResult>> {
  /* A server action's argument arrives from the browser: check it, don't trust its type. */
  const confirmed = typeof input === "object" && input !== null && (input as { confirm?: unknown }).confirm === true;
  if (!confirmed) return fail("VALIDATION", "Confirm that you want to delete your account", "confirm");

  /* A live account needs a valid session. A revoked one is accepted only to
     finish a deletion already under way (see readSessionAllowingRevoked). */
  let token = await readSession();
  if (!token) {
    const revoked = await readSessionAllowingRevoked();
    if (revoked && (await isDeletedUid(revoked.uid))) token = revoked;
  }
  if (!token) return fail("UNAUTHENTICATED", "Sign in to continue");

  const result = await deleteAccount(token.uid);
  switch (result.status) {
    case "deleted": {
      (await cookies()).set(SESSION_COOKIE, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
      /* Clearing the cookie makes Next re-render this page as signed out,
         which would unmount the panel before it could say the account was
         deleted. The confirmation therefore lives at its own URL. */
      redirect("/delete-account?deleted=1");
    }
    case "blocked":
      return fail<DeleteMyAccountResult>("CONFLICT", "This account can't be deleted yet.", undefined, {
        blockers: result.blockers satisfies DeletionBlocker[],
      });
    case "pending":
      return fail("UNAVAILABLE", DELETION_PENDING_MESSAGE, undefined, { status: "pending" });
    case "not_found":
      return fail("NOT_FOUND", "Account not found");
  }
}
