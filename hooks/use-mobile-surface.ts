"use client";

import { useEffect, useState } from "react";

/**
 * The design treats mobile web and the app as the same product: below this width
 * the storefront renders the app-language views, not a narrowed desktop layout.
 * Matches the `< 768 · mobile web` breakpoint in the web system board.
 */
export const MOBILE_SURFACE_MAX_PX = 768;

const QUERY = `(max-width: ${MOBILE_SURFACE_MAX_PX - 0.02}px)`;

export interface MobileSurface {
  /**
   * False until the first client effect has run. The viewport is unknowable on
   * the server, so callers render their loader while this is false rather than
   * guessing — that keeps the media query out of SSR and avoids both a
   * hydration mismatch and a desktop-to-mobile layout flash.
   */
  ready: boolean;
  /** Render the app-language view: inside the native shell, or on a narrow viewport. */
  isMobile: boolean;
}

/**
 * Decides which surface a page should render.
 *
 * Takes `isNative` as an argument rather than reading it from context so that
 * `NativeShellProvider` — which supplies that context — can use this hook too
 * without a circular import.
 */
export function useMobileSurface(isNative: boolean): MobileSurface {
  const [surface, setSurface] = useState<MobileSurface>({ ready: false, isMobile: false });

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    // Re-runs on resize and rotation, so a desktop window dragged narrow gets
    // the mobile view and back again without a reload.
    const sync = () => setSurface({ ready: true, isMobile: isNative || mql.matches });

    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, [isNative]);

  return surface;
}
