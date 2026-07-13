"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { sendOtp, verifyOtp } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Step = "identifier" | "token";

/**
 * Phone-first OTP login. The identifier field accepts email today
 * (AUTH_OTP_CHANNEL=email); flipping the channel to SMS changes copy only.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const linkError = searchParams.get("error") === "link";

  const [step, setStep] = useState<Step>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(
    linkError ? "That login link was invalid or expired. Request a new one." : null
  );
  const [pending, startTransition] = useTransition();

  const handleSend = () => {
    setError(null);
    startTransition(async () => {
      const result = await sendOtp(identifier);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setStep("token");
    });
  };

  const handleVerify = () => {
    setError(null);
    startTransition(async () => {
      const result = await verifyOtp(identifier, token);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push(next);
      router.refresh();
    });
  };

  return (
    <div className="w-full max-w-sm">
      <AnimatePresence mode="wait" initial={false}>
        {step === "identifier" ? (
          <motion.form
            key="identifier"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <h1 className="text-2xl font-extrabold tracking-tight">Login or Sign up</h1>
            <p className="mt-1 text-sm font-semibold text-neutral-500">
              We&apos;ll send you a one-time code — no password needed.
            </p>

            <label htmlFor="identifier" className="mt-6 block text-xs font-extrabold uppercase tracking-widest text-neutral-500">
              Email address
            </label>
            <Input
              id="identifier"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="mt-2"
            />

            <Button type="submit" size="lg" className="mt-4 w-full" disabled={pending || !identifier}>
              {pending ? <Loader2 className="animate-spin" /> : "Continue"}
            </Button>
          </motion.form>
        ) : (
          <motion.form
            key="token"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onSubmit={(e) => {
              e.preventDefault();
              handleVerify();
            }}
          >
            <button
              type="button"
              onClick={() => setStep("identifier")}
              className="mb-4 inline-flex cursor-pointer items-center gap-1 text-xs font-extrabold uppercase tracking-widest text-neutral-500 hover:text-ink"
            >
              <ArrowLeft className="size-3.5" /> Change email
            </button>

            <div className="mb-4 flex items-start gap-3 rounded-card bg-tile p-4">
              <MailCheck className="mt-0.5 size-5 shrink-0 text-brand-deep" aria-hidden />
              <p className="text-sm font-semibold text-neutral-600">
                We&apos;ve sent a 6-digit code to{" "}
                <span className="font-extrabold text-ink">{identifier}</span>.
                Enter it below to log in.
              </p>
            </div>

            <label htmlFor="token" className="block text-xs font-extrabold uppercase tracking-widest text-neutral-500">
              6-digit code
            </label>
            <Input
              id="token"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
              className="mt-2 text-center text-lg font-extrabold tracking-[0.5em]"
            />

            <Button type="submit" size="lg" className="mt-4 w-full" disabled={pending || token.length !== 6}>
              {pending ? <Loader2 className="animate-spin" /> : "Verify & Login"}
            </Button>

            <button
              type="button"
              onClick={handleSend}
              disabled={pending}
              className="mt-3 w-full cursor-pointer text-center text-xs font-bold text-neutral-500 hover:text-ink"
            >
              Didn&apos;t get it? Resend code
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      <p aria-live="polite" className="mt-3 min-h-5 text-sm font-bold text-danger">
        {error}
      </p>

      <p className="mt-6 text-center text-xs font-semibold text-neutral-400">
        By continuing you agree to our Terms of Service and Privacy Policy.
      </p>
    </div>
  );
}
