import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasPlausibleSession } from "@/lib/auth/session";
import { REQUESTED_PATH_HEADER } from "@/lib/auth/session-cookie";
import { signInPathFor } from "@/lib/auth/sign-in-path";
import { safeNextPath } from "@/lib/safe-next";

/**
 * Sends a visitor with a dead session to sign-in before the page streams.
 *
 * WHY THIS EXISTS
 *
 * Middleware redirects a visitor with NO session cookie. A visitor whose cookie
 * is present but dead — expired, or from another environment — passes
 * middleware and reaches the page, which finds no user and calls redirect().
 * On /account and /checkout that page sits under a loading.tsx, so by then the
 * loading shell has already been sent with a 200: the redirect can no longer be
 * an HTTP 307. Next hands it to the client router as a hard navigation, and the
 * router's hard-navigation branch throws part-way through its hooks — the
 * browser logs "Rendered more hooks than during the previous render" (React
 * error #310) on the way to the sign-in page.
 *
 * Called from the protected segment's layout, which renders above the
 * loading.tsx boundary, the redirect happens before any byte is sent and is a
 * plain 307.
 *
 * NOT AN AUTH CHECK. It can only turn somebody away. The pages still resolve
 * identity through getAuthUser(), which also checks revocation and refuses
 * anything this lets through.
 */
export async function redirectDeadSessionToSignIn(fallbackPath: string): Promise<void> {
  if (await hasPlausibleSession()) return;
  const requested = safeNextPath((await headers()).get(REQUESTED_PATH_HEADER), fallbackPath);
  redirect(signInPathFor(requested));
}
