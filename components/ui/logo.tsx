import React from "react";
import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "icon" | "horizontal" | "admin" | "light" | "dark";
  className?: string;
  showTagline?: boolean;
}

export function VerticalExpressIcon({ 
  className, 
  light = false 
}: { 
  className?: string; 
  light?: boolean;
}) {
  const src = light ? "/logo-icon-light.png" : "/logo-icon.png";
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt="Vertical Express Icon"
      className={cn("select-none object-contain", className)}
      draggable={false}
    />
  );
}

export function Logo({ 
  variant = "horizontal", 
  className 
}: LogoProps) {
  const isLight = variant === "light" || variant === "dark";
  const isAdmin = variant === "admin";
  
  if (variant === "icon") {
    return <VerticalExpressIcon className={className} light={isLight} />;
  }

  const src = isLight ? "/logo-light.png" : "/logo.png";

  return (
    <div className="relative flex items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Vertical Express Logo"
        className={cn("h-10 w-auto select-none object-contain", className)}
        draggable={false}
      />
      {isAdmin && (
        <span className="ml-2 rounded bg-brand px-1.5 py-0.5 text-[9px] font-extrabold uppercase italic tracking-wider text-brand-deep">
          Admin
        </span>
      )}
    </div>
  );
}
