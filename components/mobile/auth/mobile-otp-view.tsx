"use client";

import React, { useState, useEffect, useTransition } from "react";
import { Lock, Loader2, ArrowLeft, RotateCw } from "lucide-react";
import { verifyOtp, sendOtp } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { triggerHaptic } from "@/lib/native/haptics";

interface MobileOtpViewProps {
  identifier: string;
  onBack: () => void;
  onSuccess: () => void;
}

export function MobileOtpView({ identifier, onBack, onSuccess }: MobileOtpViewProps) {
  const [code, setCode] = useState("");
  const [timer, setTimer] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const handleVerify = (tokenToVerify = code) => {
    if (tokenToVerify.length < 6) return;
    setError(null);
    triggerHaptic("medium");

    startTransition(async () => {
      const res = await verifyOtp(identifier, tokenToVerify);
      if (!res.ok) {
        setError(res.error.message);
        triggerHaptic("heavy");
        return;
      }
      triggerHaptic("light");
      onSuccess();
    });
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(val);
    if (val.length === 6) {
      handleVerify(val);
    }
  };

  const handleResend = () => {
    if (timer > 0) return;
    setError(null);
    triggerHaptic("light");

    startTransition(async () => {
      const res = await sendOtp(identifier);
      if (!res.ok) {
        setError(res.error.message);
        triggerHaptic("heavy");
        return;
      }
      setTimer(60);
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-surface px-6 pt-12 pb-8">
      {/* Top Header */}
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex size-10 items-center justify-center rounded-xl bg-mist/20 text-ink hover:bg-mist/40"
        >
          <ArrowLeft className="size-5" />
        </button>
      </div>

      <div className="mb-8">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-deep/10 text-brand-deep mb-4">
          <Lock className="size-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Verify 6-Digit Code</h1>
        <p className="mt-1 text-sm text-ink/60">
          Sent to <span className="font-bold text-ink">{identifier}</span>
        </p>
      </div>

      <div className="flex-1 flex flex-col justify-between">
        <div className="space-y-6">
          {/* OTP Input Field */}
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={handleCodeChange}
              disabled={isPending}
              placeholder="000000"
              className="w-full tracking-[1em] text-center text-3xl font-extrabold text-ink rounded-2xl border border-mist/40 bg-surface py-4 shadow-xs outline-none focus:border-brand-deep focus:ring-1 focus:ring-brand-deep"
              autoFocus
            />
          </div>

          {error && <p className="text-xs font-semibold text-danger text-center">{error}</p>}

          {/* Resend Timer */}
          <div className="text-center">
            {timer > 0 ? (
              <p className="text-xs font-medium text-ink/60">
                Resend code in <span className="font-bold text-ink">{timer}s</span>
              </p>
            ) : (
              <button
                onClick={handleResend}
                disabled={isPending}
                className="inline-flex items-center text-xs font-bold text-brand-deep hover:underline"
              >
                <RotateCw className="mr-1.5 size-3.5" /> Resend Code
              </button>
            )}
          </div>
        </div>

        <Button
          onClick={() => handleVerify()}
          disabled={isPending || code.length < 6}
          className="w-full bg-brand-deep py-6 text-base font-bold text-white shadow-lg disabled:opacity-50"
        >
          {isPending ? <Loader2 className="size-5 animate-spin" /> : "Verify & Continue"}
        </Button>
      </div>
    </div>
  );
}
