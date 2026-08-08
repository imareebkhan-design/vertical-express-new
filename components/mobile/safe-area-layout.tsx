"use client";

import React from "react";

interface SafeAreaLayoutProps {
  children: React.ReactNode;
  top?: boolean;
  bottom?: boolean;
  className?: string;
}

/**
 * SafeAreaLayout — wraps screens with CSS env(safe-area-inset-*) padding
 * for iOS notch and Android gesture navigation bars.
 */
export function SafeAreaLayout({
  children,
  top = true,
  bottom = true,
  className = "",
}: SafeAreaLayoutProps) {
  return (
    <div
      className={`w-full min-h-screen ${className}`}
      style={{
        paddingTop: top ? "env(safe-area-inset-top, 0px)" : undefined,
        paddingBottom: bottom ? "env(safe-area-inset-bottom, 0px)" : undefined,
      }}
    >
      {children}
    </div>
  );
}
