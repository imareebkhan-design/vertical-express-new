"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { backAction, nextDepth } from "@/lib/back-stack";

/*
 * How many in-app navigations deep this tab is. Module state, not React
 * state: it must survive the screen that reads it unmounting, and it is per
 * tab by construction (a new tab or a cold start of the app shell is a fresh
 * module). A hard reload also resets it, which errs towards the logical parent.
 */
let depth = 0;
let popPending = false;
let lastPath: string | null = null;
let listening = false;

/**
 * Mounted once, near the root. Counts route changes, and marks the ones the
 * browser caused (back/forward) so they unwind instead of deepen.
 */
export function useBackStackTracker(): void {
  const pathname = usePathname();

  useEffect(() => {
    if (listening) return;
    listening = true;
    const onPop = () => {
      popPending = true;
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      listening = false;
    };
  }, []);

  useEffect(() => {
    if (lastPath === null) {
      lastPath = pathname; // the entry page: depth stays 0
      return;
    }
    if (pathname === lastPath) return;
    depth = nextDepth(depth, popPending);
    popPending = false;
    lastPath = pathname;
  }, [pathname]);
}

/** A Back handler: real history when there is some in this app, else the logical parent. */
export function useBackOr(fallback: string): () => void {
  const router = useRouter();
  return useCallback(() => {
    const action = backAction(depth, fallback);
    if (action.kind === "history") router.back();
    else router.replace(action.href);
  }, [router, fallback]);
}
