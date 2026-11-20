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
import { signInErrorMessage } from "@/lib/auth/sign-in-errors";
import { announceAuthChanged } from "@/lib/auth/auth-events";

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

  /**
   * After a failed send the widget's token is spent, and reusing it makes
   * every retry fail with `auth/invalid-app-credential` — the reset Firebase's
   * docs call for after a `signInWithPhoneNumber` error. The instance itself is
   * kept (see above); only its challenge is renewed. If the widget cannot be
   * reset, it is discarded and the next send builds a fresh one.
   */
  const resetVerifier = async () => {
    const v = recaptchaRef.current;
    if (!v) return;
    try {
      const widgetId = await v.render();
      (window as unknown as { grecaptcha?: { reset: (id: number) => void } }).grecaptcha?.reset(widgetId);
    } catch {
      v.clear();
      recaptchaRef.current = null;
    }
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
    /* The guest cart has just been merged into the account's (E8): re-fetch it. */
    announceAuthChanged();
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
      setError(signInErrorMessage(e));
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
        try {
          setConfirmation(await signInWithPhoneNumber(firebaseAuth(), toE164(phone), verifier()));
        } catch (e) {
          await resetVerifier();
          throw e;
        }
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
