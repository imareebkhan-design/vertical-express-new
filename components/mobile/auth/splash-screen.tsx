"use client";

import React, { useEffect, useState } from "react";

interface SplashScreenProps {
  onFinish: (authenticated: boolean) => void;
}

/**
 * SplashScreen — Native launch animation and session initialization.
 */
export function SplashScreen({ onFinish }: SplashScreenProps) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setFading(true);
      setTimeout(() => {
        onFinish(false);
      }, 400);
    }, 1200);

    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface transition-opacity duration-400 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-brand-deep text-white font-extrabold text-2xl shadow-xl animate-pulse">
          VE
        </div>
        <div className="text-center">
          <h1 className="text-xl font-bold tracking-tight text-ink">Vertical Express</h1>
          <p className="text-xs text-ink/60 font-medium mt-0.5">Construction Material Delivered</p>
        </div>
      </div>
    </div>
  );
}
