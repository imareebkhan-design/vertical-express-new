"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithPopup,
  type ConfirmationResult,
  type UserCredential,
} from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";

/**
 * Every way into the application, in one place.
 *
 * There are two sign-in surfaces — the web split-panel form and the mobile
 * app's phone-then-code flow — and they look nothing alike. What they must not
 * do is authenticate differently.
 *
 * Phone and Google only. Email/password was removed with ISS-048 — it was
 * offered in the UI and supported nowhere (no verification mail, no reset), and
 * dropping it also leaves the project's unrotatable scrypt signer key guarding
 * nothing. Two copies of this logic is precisely the
 * shape of ISS-046, where identity call sites drifted apart and one of them
 * quietly stopped signing anybody in; the fix there was one abstraction on the
 * server, and this is its client-side twin.
 *
 * So the surfaces own their markup and this owns the credential: normalising
 * the number, the invisible bot check, trading the credential for the server's
 * httpOnly session, and turning Firebase's error codes into something a person
 * on a building site can act on.
 */

/** The element the invisible reCAPTCHA attaches to. Both surfaces must render it. */
export const RECAPTCHA_HOLDER_ID = "recaptcha-holder";

export function useFirebaseSignIn(next: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  /* Invisible, but it still has to attach to a real element, and the same
     instance has to survive a resend or Firebase rejects the second send. */
  const verifier = useCallback(() => {
    recaptchaRef.current ??= new RecaptchaVerifier(firebaseAuth(), RECAPTCHA_HOLDER_ID, {
      size: "invisible",
    });
    return recaptchaRef.current;
  }, []);

  const readable = (e: unknown) => {
    const code = (e as { code?: string })?.code ?? "";
    if (code.includes("invalid-phone-number")) return "That phone number doesn't look right.";
    if (code.includes("invalid-verification-code")) return "That code isn't correct.";
    if (code.includes("code-expired")) return "That code has expired — request a new one.";
    if (code.includes("too-many-requests")) return "Too many attempts. Try again in a few minutes.";
    if (code.includes("popup-closed")) return "Sign-in was cancelled.";
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
    return e instanceof Error ? e.message : "Something went wrong. Please try again.";
  };

  /** Trades the Firebase credential for the server session, then continues. */
  const establishSession = async (cred: UserCredential) => {
    const idToken = await cred.user.getIdToken();
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) throw new Error("Could not start your session. Please try again.");
    router.push(next);
    router.refresh();
  };

  /**
   * Firebase wants E.164. Srinagar customers type ten digits, so assume +91
   * only when the number is bare — never rewrite one they typed in full.
   */
  const toE164 = (raw: string) => {
    const digits = raw.replace(/[^\d+]/g, "");
    return digits.startsWith("+") ? digits : `+91${digits.replace(/^0+/, "")}`;
  };

  const run = async (work: () => Promise<void>, clearBusyOnSuccess: boolean) => {
    setError(null);
    setBusy(true);
    try {
      await work();
      if (clearBusyOnSuccess) setBusy(false);
    } catch (e) {
      setError(readable(e));
      setBusy(false);
    }
  };

  return {
    busy,
    error,
    setError,
    /** Non-null once a code is on its way to the handset. */
    confirmation,
    /** Drops back to the number step so the customer can correct it. */
    reset: () => {
      setConfirmation(null);
      setError(null);
    },
    sendCode: (phone: string) =>
      run(async () => {
        setConfirmation(await signInWithPhoneNumber(firebaseAuth(), toE164(phone), verifier()));
      }, true),
    verifyCode: (code: string) =>
      run(async () => {
        if (!confirmation) throw new Error("Request a code first.");
        /* Busy stays true through the redirect — the screen is on its way out
           and re-enabling the button would invite a second submit. */
        await establishSession(await confirmation.confirm(code));
      }, false),
    withGoogle: () =>
      run(async () => {
        await establishSession(await signInWithPopup(firebaseAuth(), new GoogleAuthProvider()));
      }, false),
    toE164,
  };
}
