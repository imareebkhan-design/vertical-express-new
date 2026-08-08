"use client";

import React from "react";

interface BottomSheetLayoutProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

/**
 * BottomSheetLayout — reusable touch bottom-sheet modal for checkout, coupons,
 * and filter selections.
 */
export function BottomSheetLayout({
  isOpen,
  onClose,
  title,
  children,
}: BottomSheetLayoutProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      {/* Backdrop tap to dismiss */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Sheet panel */}
      <div className="relative z-10 w-full max-h-[85vh] overflow-y-auto rounded-t-3xl bg-surface p-6 shadow-2xl animate-in slide-in-from-bottom duration-300">
        {/* Touch drag handle indicator */}
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-mist/40" />

        {title && <h3 className="mb-4 text-lg font-bold text-ink">{title}</h3>}
        {children}
      </div>
    </div>
  );
}
