"use client";

import React from "react";
import { SafeAreaLayout } from "./safe-area-layout";

interface MobileScreenProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

/**
 * MobileScreen — root screen container providing safe area, sticky headers,
 * and bottom navigation spacing.
 */
export function MobileScreen({
  children,
  header,
  footer,
  className = "",
}: MobileScreenProps) {
  return (
    <SafeAreaLayout className={`flex flex-col bg-surface ${className}`}>
      {header && <header className="sticky top-0 z-30 w-full bg-surface/90 backdrop-blur-md">{header}</header>}
      <main className="flex-1 w-full pb-20">{children}</main>
      {footer && <footer className="fixed bottom-0 left-0 right-0 z-40 w-full">{footer}</footer>}
    </SafeAreaLayout>
  );
}
