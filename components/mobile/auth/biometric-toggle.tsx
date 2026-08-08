"use client";

import React, { useState, useEffect } from "react";
import { Fingerprint } from "lucide-react";
import { checkBiometrics } from "@/lib/native/biometrics";
import { triggerHaptic } from "@/lib/native/haptics";

export function BiometricToggle() {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    checkBiometrics().then((res) => {
      setAvailable(res.available);
    });

    if (typeof window !== "undefined") {
      setEnabled(localStorage.getItem("ve_biometric_enabled") === "true");
    }
  }, []);

  if (!available) return null;

  const handleToggle = () => {
    triggerHaptic("light");
    const nextState = !enabled;
    setEnabled(nextState);
    if (typeof window !== "undefined") {
      localStorage.setItem("ve_biometric_enabled", nextState ? "true" : "false");
    }
  };

  return (
    <div className="flex items-center justify-between rounded-card border border-mist/30 bg-surface p-4 shadow-xs">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-brand-deep/10 text-brand-deep">
          <Fingerprint className="size-5" />
        </div>
        <div>
          <p className="text-sm font-bold text-ink">Biometric App Lock</p>
          <p className="text-xs text-ink/60">Require Face ID / Fingerprint on launch</p>
        </div>
      </div>

      <button
        onClick={handleToggle}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          enabled ? "bg-brand-deep" : "bg-mist/40"
        }`}
      >
        <span
          className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
