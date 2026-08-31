"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  createUserWithEmailAndPassword,
  type ConfirmationResult,
  type UserCredential,
} from "firebase/auth";
import { Loader2 } from "lucide-react";
import { firebaseAuth } from "@/lib/firebase/client";

/**
 * Sign-in: phone OTP first, then Google, then email.
 *
 * The order is the market's, not the framework's. Phone-based identity is the
 * norm in Srinagar, so it leads; email/password is last because a contractor on
 * a site is not inventing a password.
 *
 * Whatever the method, it ends the same way: Firebase issues an ID token, we
 * exchange it for an httpOnly session cookie, and the server reads that. The
 * browser never holds anything the server trusts.
 */
type Mode = "phone" | "email";

export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

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

  /* Firebase requires a bot check before it will send an SMS. Invisible, but it
     has to be attached to a real element and reused across resends. */
  const verifier = () => {
    recaptchaRef.current ??= new RecaptchaVerifier(firebaseAuth(), "recaptcha-holder", {
      size: "invisible",
    });
    return recaptchaRef.current;
  };

  const readable = (e: unknown) => {
    const code = (e as { code?: string })?.code ?? "";
    if (code.includes("invalid-phone-number")) return "That phone number doesn't look right.";
    if (code.includes("invalid-verification-code")) return "That code isn't correct.";
    if (code.includes("code-expired")) return "That code has expired — request a new one.";
    if (code.includes("too-many-requests")) return "Too many attempts. Try again in a few minutes.";
    if (code.includes("popup-closed")) return "Sign-in was cancelled.";
    if (code.includes("wrong-password") || code.includes("invalid-credential"))
      return "Those details don't match an account.";
    return e instanceof Error ? e.message : "Something went wrong. Please try again.";
  };

  const sendCode = async () => {
    setError(null);
    setBusy(true);
    try {
      /* Firebase wants E.164. Srinagar customers type ten digits, so assume +91
         only when the number is bare — never rewrite one they typed in full. */
      const digits = phone.replace(/[^\d+]/g, "");
      const e164 = digits.startsWith("+") ? digits : `+91${digits.replace(/^0+/, "")}`;
      setConfirmation(await signInWithPhoneNumber(firebaseAuth(), e164, verifier()));
    } catch (e) {
      setError(readable(e));
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!confirmation) return;
    setError(null);
    setBusy(true);
    try {
      await establishSession(await confirmation.confirm(code));
    } catch (e) {
      setError(readable(e));
      setBusy(false);
    }
  };

  const withGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      await establishSession(await signInWithPopup(firebaseAuth(), new GoogleAuthProvider()));
    } catch (e) {
      setError(readable(e));
      setBusy(false);
    }
  };

  const withEmail = async (creating: boolean) => {
    setError(null);
    setBusy(true);
    try {
      const fn = creating ? createUserWithEmailAndPassword : signInWithEmailAndPassword;
      await establishSession(await fn(firebaseAuth(), email, password));
    } catch (e) {
      setError(readable(e));
      setBusy(false);
    }
  };

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
        {mode === "phone"
          ? "We'll text you a one-time code."
          : "Use your email address and password."}
      </p>

      {mode === "phone" && !confirmation && (
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
          <button onClick={sendCode} disabled={busy || phone.length < 10} className={primary}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Send code"}
          </button>
        </div>
      )}

      {mode === "phone" && confirmation && (
        <div className="mt-5 space-y-3">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit code"
            className={`${field} tracking-[0.4em]`}
          />
          <button onClick={verifyCode} disabled={busy || code.length < 6} className={primary}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Verify and continue"}
          </button>
          <button
            onClick={() => {
              setConfirmation(null);
              setCode("");
            }}
            className="w-full text-[12px] font-bold text-ink-500 hover:text-ink"
          >
            Use a different number
          </button>
        </div>
      )}

      {mode === "email" && (
        <div className="mt-5 space-y-3">
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className={field}
          />
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className={field}
          />
          <button onClick={() => withEmail(false)} disabled={busy || !email || !password} className={primary}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
          </button>
          <button
            onClick={() => withEmail(true)}
            disabled={busy || !email || !password}
            className="w-full text-[12px] font-bold text-ink-500 hover:text-ink"
          >
            Create an account instead
          </button>
        </div>
      )}

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[11px] font-semibold text-ink-500">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <button
        onClick={withGoogle}
        disabled={busy}
        className="flex h-12 w-full items-center justify-center gap-2.5 rounded-full bg-chip text-[14px] font-bold text-ink disabled:opacity-50"
      >
        <GoogleMark /> Continue with Google
      </button>

      <button
        onClick={() => {
          setMode(mode === "phone" ? "email" : "phone");
          setError(null);
          setConfirmation(null);
        }}
        className="mt-3 w-full text-[12px] font-bold text-ink-500 hover:text-ink"
      >
        {mode === "phone" ? "Use email instead" : "Use a phone number instead"}
      </button>

      {error && (
        <p role="alert" className="mt-4 text-[12.5px] font-semibold text-danger">
          {error}
        </p>
      )}

      {/* RecaptchaVerifier needs a real element to attach to, even invisible. */}
      <div id="recaptcha-holder" />
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
