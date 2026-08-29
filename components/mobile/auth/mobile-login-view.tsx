"use client";

import React, { useState, useTransition } from "react";
import { Phone, Loader2, ArrowRight } from "lucide-react";
import { sendOtp } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { LoginHero } from "@/components/auth/login-hero";
import { triggerHaptic } from "@/lib/native/haptics";

interface MobileLoginViewProps {
  onOtpSent: (phone: string) => void;
}

export function MobileLoginView({ onOtpSent }: MobileLoginViewProps) {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      setError("Please enter a valid 10-digit mobile number");
      triggerHaptic("heavy");
      return;
    }

    triggerHaptic("medium");

    startTransition(async () => {
      const formattedPhone = `+91${cleanPhone.slice(-10)}`;
      const res = await sendOtp(formattedPhone);

      if (!res.ok) {
        setError(res.error.message);
        triggerHaptic("heavy");
        return;
      }

      onOtpSent(formattedPhone);
    });
  };

  return (
    <div className="flex flex-col min-h-screen bg-surface px-6 pt-12 pb-8">
      <LoginHero className="mb-8 -mx-6 h-[240px]" />

      {/* Header */}
      <div className="mb-8">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-deep/10 text-brand-deep mb-4">
          <Phone className="size-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Enter Phone Number</h1>
        <p className="mt-1 text-sm text-ink/60">We&apos;ll send a 6-digit verification code to your mobile</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-between">
        <div className="space-y-4">
          <div className="relative flex items-center rounded-2xl border border-mist/40 bg-surface px-4 py-3.5 shadow-xs focus-within:border-brand-deep focus-within:ring-1 focus-within:ring-brand-deep">
            <span className="text-sm font-bold text-ink mr-3 border-r border-mist/40 pr-3">+91</span>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isPending}
              className="w-full bg-transparent text-base font-medium text-ink placeholder:text-ink/40 outline-none"
              autoFocus
            />
          </div>

          {error && <p className="text-xs font-semibold text-danger">{error}</p>}
        </div>

        <Button
          type="submit"
          disabled={isPending || phone.replace(/\D/g, "").length < 10}
          className="w-full bg-brand-deep py-6 text-base font-bold text-white shadow-lg disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <>
              Continue <ArrowRight className="ml-2 size-5" />
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
