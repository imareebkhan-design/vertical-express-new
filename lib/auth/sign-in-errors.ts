/**
 * Firebase sign-in errors, in words a person on a building site can act on.
 * Pure and client-safe; used by `hooks/use-firebase-sign-in.ts`.
 *
 * Anything unrecognised gets a plain retry message, never Firebase's own
 * string — "Firebase: Error (auth/invalid-app-credential)." reached the sign-in
 * screen verbatim.
 */
export function signInErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  if (code.includes("invalid-phone-number")) return "That phone number doesn't look right.";
  if (code.includes("invalid-verification-code")) return "That code isn't correct.";
  if (code.includes("code-expired")) return "That code has expired — request a new one.";
  if (code.includes("too-many-requests")) return "Too many attempts. Try again in a few minutes.";
  if (code.includes("popup-closed")) return "Sign-in was cancelled.";
  /* The invisible bot check failed or its token was spent or expired. The
     hook resets the check after every failed send, so trying again works. */
  if (code.includes("invalid-app-credential") || code.includes("captcha-check-failed"))
    return "We couldn't complete the security check. Please try again.";
  /* Configuration, not user error — but the customer is the one looking at
     it. Firebase matches window.location.hostname against the authorized
     domain list exactly, so serving on a host that is not on the list (a new
     subdomain, a preview URL, www vs the apex) breaks every sign-in with this
     code. See ISS-050. */
  if (code.includes("unauthorized-domain"))
    return "Sign-in isn't available on this address yet. Please contact support.";
  /* Second-factor SMS is enabled on the project. Nobody is enrolled today, so
     this is unreachable — but if anyone ever enrols, an unhandled code here
     would surface as a raw Firebase string. Completing the challenge needs
     getMultiFactorResolver and a second OTP screen, which is not built. */
  if (code.includes("multi-factor-auth-required"))
    return "This account needs a second verification step, which isn't supported here yet.";
  if (code.includes("network-request-failed"))
    return "We couldn't reach the network. Check your connection and try again.";
  /* Our own errors (thrown with a sentence, no code) read as written. */
  if (!code && e instanceof Error && e.message && !e.message.startsWith("Firebase")) return e.message;
  return "Something went wrong. Please try again.";
}
