"use client";

import React, { useState } from "react";
import { Fingerprint, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authenticateBiometrics } from "@/lib/native/biometrics";
import { triggerHaptic } from "@/lib/native/haptics";

interface BiometricLockProps {
  onUnlocked: () => void;
}

export function BiometricLock({ onUnlocked }: BiometricLockProps) {
  const [error, setError] = useState<string | null>(null);

  const handleUnlock = async () => {
    setError(null);
    triggerHaptic("light");
    const success = await authenticateBiometrics("Unlock Vertical Express");
    if (success) {
      triggerHaptic("light");
      onUnlocked();
    } else {
      setError("Biometric authentication failed. Try again.");
      triggerHaptic("heavy");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-surface px-6 pt-16 pb-12 text-center">
      <div className="flex flex-col items-center">
        <div className="mb-6 flex size-20 items-center justify-center rounded-3xl bg-brand-deep/10 text-brand-deep shadow-inner">
          <Fingerprint className="size-10" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-ink">App Locked</h2>
        <p className="mt-2 text-xs text-ink/60 max-w-xs">
          Verify your biometric identity to access Vertical Express
        </p>
      </div>

      <div className="w-full space-y-4">
        {error && <p className="text-xs font-semibold text-danger">{error}</p>}

        <Button
          onClick={handleUnlock}
          className="w-full bg-brand-deep py-6 text-base font-bold text-white shadow-lg"
        >
          <Lock className="mr-2 size-5" /> Unlock App
        </Button>
      </div>
    </div>
  );
}
