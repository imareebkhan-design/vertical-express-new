"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { RECAPTCHA_HOLDER_ID, useFirebaseSignIn } from "@/hooks/use-firebase-sign-in";

/**
 * Sign-in: phone OTP, then Google.
 *
 * The order is the market's, not the framework's. Phone-based identity is the
 * norm in Srinagar, so it leads.
 *
 * WHY THERE IS NO EMAIL AND PASSWORD OPTION
 *
 * There was one, and it was the weakest path in the product. Nothing ever sent
 * a verification email, so `email_verified` was false for every account created
 * that way — which meant the link policy would not let them claim an existing
 * row and they could never be an admin. Nothing sent a reset either, so a
 * forgotten password locked the account permanently. It was a method offered in
 * the UI and supported nowhere (ISS-048).
 *
 * Removing it also removes the only thing in this project that Firebase's
 * per-project scrypt signer key protects. That key has no documented rotation
 * path, so making it guard nothing is the available remediation.
 *
 * A contractor standing on a slab is not inventing a password. Phone and Google
 * cover the market; Apple joins them when the developer account exists.
 *
 * Whatever the method, it ends the same way: Firebase issues an ID token, we
 * exchange it for an httpOnly session cookie, and the server reads that. The
 * browser never holds anything the server trusts.
 */

export function SignInForm({ next }: { next: string }) {
  /* Credential handling lives in the hook, shared with the mobile screen. This
     component owns only its markup and which fields it is showing. */
  const auth = useFirebaseSignIn(next);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");

  const { busy, error, confirmation } = auth;

  const field =
    "h-12 w-full rounded-full bg-canvas px-4 text-[14px] font-semibold text-ink placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-ink/15";
  const primary =
    "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-[14px] font-bold text-white disabled:opacity-50";

  return (
    <div className="rounded-[28px] bg-paper p-6 shadow-card sm:p-7">
      <h1 className="text-[23px] font-extrabold leading-7 tracking-[-0.022em] text-ink">
        Sign in
      </h1>
      <p className="mt-1.5 text-[13px] font-medium text-ink-700">
        We&apos;ll text you a one-time code.
      </p>

      {!confirmation && (
        <div className="mt-5 space-y-3">
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone number"
            className={field}
          />
          <button onClick={() => auth.sendCode(phone)} disabled={busy || phone.length < 10} className={primary}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Send code"}
          </button>
        </div>
      )}

      {confirmation && (
        <div className="mt-5 space-y-3">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit code"
            className={`${field} tracking-[0.4em]`}
          />
          <button onClick={() => auth.verifyCode(code)} disabled={busy || code.length < 6} className={primary}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Verify and continue"}
          </button>
          <button
            onClick={() => {
              auth.reset();
              setCode("");
            }}
            className="w-full text-[12px] font-bold text-ink-500 hover:text-ink"
          >
            Use a different number
          </button>
        </div>
      )}

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[11px] font-semibold text-ink-500">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <button
        onClick={auth.withGoogle}
        disabled={busy}
        className="flex h-12 w-full items-center justify-center gap-2.5 rounded-full bg-chip text-[14px] font-bold text-ink disabled:opacity-50"
      >
        <GoogleMark /> Continue with Google
      </button>

      {error && (
        <p role="alert" className="mt-4 text-[12.5px] font-semibold text-danger">
          {error}
        </p>
      )}

      {/* RecaptchaVerifier needs a real element to attach to, even invisible. */}
      <div id={RECAPTCHA_HOLDER_ID} />
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
      <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.14 6.16-4.14z" />
    </svg>
  );
}
