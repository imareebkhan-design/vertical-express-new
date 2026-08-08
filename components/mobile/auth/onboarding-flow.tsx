"use client";

import React, { useState } from "react";
import { Truck, ShieldCheck, Wallet, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { triggerHaptic } from "@/lib/native/haptics";

interface OnboardingFlowProps {
  onComplete: () => void;
}

const ONBOARDING_CARDS = [
  {
    id: 1,
    icon: Truck,
    title: "Express Site Delivery",
    description: "Get cement, adhesives, and construction supplies delivered directly to your jobsite in hours.",
  },
  {
    id: 2,
    icon: ShieldCheck,
    title: "Transparent GST Invoices",
    description: "Official tax invoices with CGST/SGST/IGST breakdown for effortless business tax input claims.",
  },
  {
    id: 3,
    icon: Wallet,
    title: "5% Wallet Cashback",
    description: "Earn 5% cashback automatically on every delivered order to save on your next supply purchase.",
  },
];

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const isLast = currentIndex === ONBOARDING_CARDS.length - 1;
  const currentCard = ONBOARDING_CARDS[currentIndex];
  const Icon = currentCard.icon;

  const handleNext = () => {
    triggerHaptic("light");
    if (isLast) {
      if (typeof window !== "undefined") {
        localStorage.setItem("ve_onboarded", "true");
      }
      onComplete();
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handleSkip = () => {
    triggerHaptic("light");
    if (typeof window !== "undefined") {
      localStorage.setItem("ve_onboarded", "true");
    }
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-surface px-6 pt-12 pb-8">
      {/* Top Header Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {ONBOARDING_CARDS.map((card, idx) => (
            <div
              key={card.id}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === currentIndex ? "w-8 bg-brand-deep" : "w-2 bg-mist/40"
              }`}
            />
          ))}
        </div>
        {!isLast && (
          <button
            onClick={handleSkip}
            className="text-xs font-semibold text-ink/60 hover:text-ink transition-colors"
          >
            Skip
          </button>
        )}
      </div>

      {/* Main Content Card */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
        <div className="mb-8 flex size-24 items-center justify-center rounded-3xl bg-brand-deep/10 text-brand-deep shadow-inner">
          <Icon className="size-12" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-ink">{currentCard.title}</h2>
        <p className="mt-3 text-sm text-ink/70 max-w-xs leading-relaxed">{currentCard.description}</p>
      </div>

      {/* Action CTA Button */}
      <div className="w-full">
        <Button
          onClick={handleNext}
          className="w-full bg-brand-deep py-6 text-base font-bold text-white shadow-lg hover:opacity-95"
        >
          {isLast ? (
            <>
              Get Started <Check className="ml-2 size-5" />
            </>
          ) : (
            <>
              Next <ArrowRight className="ml-2 size-5" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
