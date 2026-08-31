"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Cable,
  ChevronRight,
  Clock,
  Loader2,
  Package,
  PaintBucket,
  ShieldCheck,
  Truck,
  Zap,
} from "lucide-react";
import { PlaceholderValue } from "@/components/ui/placeholder-value";
import { triggerHaptic } from "@/lib/native/haptics";
import { RECAPTCHA_HOLDER_ID, useFirebaseSignIn } from "@/hooks/use-firebase-sign-in";

/**
 * The app's way in: artboards 1 (Splash + phone) and 2 (OTP).
 *
 * This is the mobile surface's own screen, not the web form squeezed into a
 * narrow column. The web sign-in is a split panel that explains the business to
 * someone deciding whether to use it; this is a first-run screen for someone who
 * already installed the app, so it leads with the product collage and puts a
 * single field where a thumb is.
 *
 * The credential work is shared with the web form via useFirebaseSignIn — same
 * normalisation, same bot check, same session exchange. Only the markup differs.
 */
const RESEND_SECONDS = 30;

/**
 * `+919876543210` → `+91 98765 43210`.
 *
 * The artboard groups it, and an unbroken run of twelve digits is genuinely
 * hard to check against the handset you are holding — which is the one thing
 * this line exists for. Anything that is not a +91 number is left alone rather
 * than grouped wrongly.
 */
function displayPhone(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

export function MobileSignInView({ next }: { next: string }) {
  const auth = useFirebaseSignIn(next);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  const onCodeStep = auth.confirmation !== null;

  /* Resend countdown. Starts when a code is actually on its way, not when the
     button is pressed — a failed send should not make them wait. */
  useEffect(() => {
    if (!onCodeStep) return;
    setSecondsLeft(RESEND_SECONDS);
    const id = setInterval(() => setSecondsLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [onCodeStep]);

  useEffect(() => {
    if (onCodeStep) codeRef.current?.focus();
  }, [onCodeStep]);

  const digits = phone.replace(/\D/g, "");
  const canSend = digits.length >= 10 && !auth.busy;
  const canVerify = code.length === 6 && !auth.busy;

  const send = async () => {
    triggerHaptic("medium");
    await auth.sendCode(phone);
  };

  const verify = async () => {
    triggerHaptic("medium");
    await auth.verifyCode(code);
  };

  /* ---------------------------------------------------------------- step 2 */
  if (onCodeStep) {
    return (
      <div style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        className="flex min-h-screen flex-col bg-canvas">
        <div className="px-5 pt-3">
          <button
            type="button"
            onClick={() => {
              triggerHaptic("light");
              setCode("");
              auth.reset();
            }}
            aria-label="Change number"
            className="flex size-10 items-center justify-center rounded-full bg-paper shadow-card"
          >
            <ArrowLeft className="size-[18px] text-ink" aria-hidden />
          </button>
        </div>

        <div className="px-5 pt-9">
          <h1 className="text-[32px] font-extrabold leading-[36px] tracking-[-0.03em] text-ink">
            <span className="font-light text-ink-500">Enter the</span>
            <br />
            6-digit code.
          </h1>
          <p className="mt-3 text-[14px] font-medium leading-5 text-ink-700">
            Sent by SMS to{" "}
            <strong className="font-bold text-ink">{displayPhone(auth.toE164(phone))}</strong>{" "}
            <button
              type="button"
              onClick={() => {
                setCode("");
                auth.reset();
              }}
              className="font-bold text-ink underline underline-offset-2"
            >
              Change
            </button>
          </p>
        </div>

        {/*
          Six boxes are the design; one input is the behaviour. A real input per
          box fights every Android keyboard and breaks SMS autofill, so this is a
          single field with the boxes painted under it.
        */}
        <div className="relative px-5 pt-8">
          <input
            ref={codeRef}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="6-digit code"
            className="absolute inset-x-5 top-8 z-10 h-[66px] w-[calc(100%-40px)] opacity-0"
          />
          <div className="flex gap-2.5" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={
                  "flex h-[66px] flex-1 items-center justify-center rounded-[20px] text-[26px] font-extrabold text-ink " +
                  (code[i]
                    ? "bg-paper shadow-card"
                    : i === code.length
                      ? "bg-paper shadow-card ring-[2.5px] ring-amber"
                      : "bg-chip")
                }
              >
                {code[i] ?? ""}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 pt-5">
          <Clock className="size-[15px] text-ink-500" aria-hidden />
          {secondsLeft > 0 ? (
            <span className="text-[13px] font-medium text-ink-700">
              Resend code in{" "}
              <span className="font-bold text-ink">
                00:{String(secondsLeft).padStart(2, "0")}
              </span>
            </span>
          ) : (
            <button
              type="button"
              onClick={send}
              disabled={auth.busy}
              className="text-[13px] font-bold text-ink underline underline-offset-2 disabled:opacity-50"
            >
              Resend code
            </button>
          )}
        </div>

        <div className="px-5 pt-6">
          <div className="flex items-start gap-3 rounded-[22px] bg-paper p-4 shadow-card">
            <div className="flex size-[34px] flex-none items-center justify-center rounded-full bg-amber-soft">
              <ShieldCheck className="size-[17px] text-ink" aria-hidden />
            </div>
            <div>
              <p className="text-[14px] font-bold text-ink">We never ask for this code</p>
              <p className="mt-1 text-[13px] font-medium leading-[18px] text-ink-700">
                Nobody from Vertical Express will call or message you for it — not our
                drivers, not our support team.
              </p>
            </div>
          </div>
        </div>

        {auth.error && (
          <p role="alert" className="px-5 pt-4 text-[13px] font-semibold text-ink">
            {auth.error}
          </p>
        )}

        <div className="flex-1" />

        <div className="px-5 pb-8 pt-6">
          <button
            type="button"
            onClick={verify}
            disabled={!canVerify}
            className="flex h-[54px] w-full items-center justify-center gap-2 rounded-full bg-ink text-[15px] font-bold text-white disabled:opacity-50"
          >
            {auth.busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Verify and continue"}
          </button>
        </div>
        <div id={RECAPTCHA_HOLDER_ID} />
      </div>
    );
  }

  /* ---------------------------------------------------------------- step 1 */
  return (
    <div style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        className="flex min-h-screen flex-col bg-canvas">
      <div className="flex items-center gap-2.5 px-5 pt-3">
        <div className="flex size-[34px] items-center justify-center rounded-[11px] bg-amber">
          <Zap className="size-[18px] fill-ink text-ink" aria-hidden />
        </div>
        <span className="text-[17px] font-extrabold tracking-[-0.02em] text-ink">
          Vertical Express
        </span>
      </div>

      {/* The product collage — three tilted category cards, a mark and a city pill. */}
      <div className="relative mt-3.5 h-[262px] flex-none" aria-hidden>
        <div className="absolute left-[34px] top-[34px] flex h-[152px] w-[128px] -rotate-[8deg] items-center justify-center rounded-[26px] bg-tint-civil shadow-card">
          <Package className="size-[62px] text-ink/40" strokeWidth={1.5} />
        </div>
        <div className="absolute left-[132px] top-[14px] flex h-[168px] w-[140px] rotate-[5deg] items-center justify-center rounded-[28px] bg-tint-furniture shadow-card">
          <PaintBucket className="size-[68px] text-ink/40" strokeWidth={1.5} />
        </div>
        <div className="absolute left-[238px] top-[74px] flex h-[132px] w-[116px] rotate-[11deg] items-center justify-center rounded-[24px] bg-tint-electrical shadow-card">
          <Cable className="size-[54px] text-ink/40" strokeWidth={1.5} />
        </div>
        <div className="absolute left-[88px] top-[176px] flex size-[52px] items-center justify-center rounded-full bg-paper shadow-card">
          <Zap className="size-[22px] fill-amber text-amber" />
        </div>
        <div className="absolute left-[216px] top-[196px] flex h-[30px] items-center gap-1.5 rounded-full bg-paper px-3.5 shadow-card">
          <Truck className="size-[14px] text-ink-500" />
          <span className="text-[12px] font-bold text-ink">Srinagar</span>
        </div>
      </div>

      <div className="mt-1.5 px-5">
        <h1 className="text-[32px] font-extrabold leading-[36px] tracking-[-0.03em] text-ink">
          <span className="font-light text-ink-500">Building material,</span>
          <br />
          on site today.
        </h1>
        <p className="mt-2.5 max-w-[300px] text-[14px] font-medium leading-5 text-ink-700">
          Cement, tiles, wiring and fittings delivered across Srinagar — small items{" "}
          <PlaceholderValue pending="Delivery SLA is unconfirmed — owner to confirm before launch">
            in an hour
          </PlaceholderValue>
          , heavy loads on a slot you pick.
        </p>
      </div>

      <div className="flex-1" />

      <div className="px-5 pb-8">
        <div className="rounded-[26px] bg-paper p-4 pb-[18px] shadow-card">
          <label
            htmlFor="mobile-phone"
            className="mb-3 block text-[11px] font-bold uppercase tracking-[0.09em] text-ink-500"
          >
            Mobile number
          </label>
          <div className="flex h-[52px] items-center gap-3 rounded-full bg-chip px-4.5">
            <span className="text-[17px] font-bold text-ink-700">+91</span>
            <span className="h-5 w-[1.5px] rounded-sm bg-line" aria-hidden />
            <input
              id="mobile-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, "").slice(0, 13))}
              onKeyDown={(e) => e.key === "Enter" && canSend && send()}
              inputMode="tel"
              autoComplete="tel"
              placeholder="98765 43210"
              className="w-full bg-transparent text-[17px] font-bold tracking-[0.06em] text-ink placeholder:font-semibold placeholder:tracking-normal placeholder:text-ink-300 focus:outline-none"
            />
          </div>

          {auth.error && (
            <p role="alert" className="mt-3 text-[13px] font-semibold text-ink">
              {auth.error}
            </p>
          )}

          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            className="mt-3 flex h-[54px] w-full items-center justify-center gap-2 rounded-full bg-ink text-[15px] font-bold text-white disabled:opacity-50"
          >
            {auth.busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <>
                Continue
                <ChevronRight className="size-[17px]" aria-hidden />
              </>
            )}
          </button>
        </div>

        <p className="mt-3.5 px-4 text-center text-[12px] font-medium leading-4 text-ink-500">
          By continuing you agree to our{" "}
          <Link href="/terms" className="font-bold text-ink underline underline-offset-2">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-bold text-ink underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
      <div id={RECAPTCHA_HOLDER_ID} />
    </div>
  );
}
