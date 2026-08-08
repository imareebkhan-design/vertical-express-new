"use client";

import React from "react";
import Link from "next/link";
import { MapPin, Bell, User, ChevronDown } from "lucide-react";
import { triggerHaptic } from "@/lib/native/haptics";
import { useNativeShell } from "@/components/mobile/native-shell-provider";

interface MobileHeaderProps {
  pincode?: string;
  cityName?: string;
  hasNotifications?: boolean;
}

/**
 * MobileHeader — safe-area aware top header with location selector,
 * notification indicator, and profile shortcut, integrated with the native shell.
 */
export function MobileHeader({
  pincode = "190001",
  cityName = "Srinagar",
  hasNotifications = true,
}: MobileHeaderProps) {
  const shell = useNativeShell();

  const currentPincode = shell?.isNative ? shell.pincode : pincode;
  const currentCity = shell?.isNative ? shell.cityName : cityName;
  const handleLocationClick = shell?.isNative ? shell.openLocationModal : () => triggerHaptic("light");

  const handleTouch = () => {
    triggerHaptic("light");
  };

  return (
    <div className="native-header flex items-center justify-between border-b border-mist/20 bg-surface/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top,12px)+6px)] backdrop-blur-md shadow-xs">
      {/* Location Selector Trigger */}
      <button
        onClick={handleLocationClick}
        className="flex items-center gap-2 text-left hover:opacity-85 transition-opacity"
        style={{ minHeight: "44px" }}
      >
        <div className="flex size-8 items-center justify-center rounded-full bg-brand-deep/10 text-brand-deep">
          <MapPin className="size-4" />
        </div>
        <div>
          <div className="flex items-center gap-0.5 text-[10px] font-bold text-ink/50 uppercase tracking-wider">
            Delivering to <ChevronDown className="size-3" />
          </div>
          <p className="text-xs font-extrabold text-ink">
            {currentPincode} <span className="font-normal text-ink/60">• {currentCity}</span>
          </p>
        </div>
      </button>

      {/* Right Controls */}
      <div className="flex items-center gap-2">
        <Link
          href="/account/notifications"
          onClick={handleTouch}
          className="relative flex size-9 items-center justify-center rounded-full bg-mist/20 text-ink transition-colors hover:bg-mist/30"
          style={{ minWidth: "44px", minHeight: "44px" }}
          aria-label="Notifications"
        >
          <Bell className="size-4" />
          {hasNotifications && (
            <span className="absolute top-2 right-2 size-2 rounded-full bg-danger ring-2 ring-surface" />
          )}
        </Link>
        <Link
          href="/account"
          onClick={handleTouch}
          className="flex size-9 items-center justify-center rounded-full bg-brand-deep text-white font-extrabold text-xs shadow-xs transition-opacity hover:opacity-90"
          style={{ minWidth: "44px", minHeight: "44px" }}
          aria-label="Account Profile"
        >
          <User className="size-4" />
        </Link>
      </div>
    </div>
  );
}
