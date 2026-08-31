"use client";

import { signOut as firebaseSignOut } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";

/**
 * Signs the customer out of both halves of the session.
 *
 * There are two, and clearing only one is the bug this replaced: the server
 * trusts the httpOnly cookie, the browser SDK holds its own credential. The old
 * sign-out called Supabase, which by then held neither, so "Sign out" appeared
 * to work and left the customer signed in — on a shared phone, which is common
 * on a site, that is somebody else reading their orders.
 *
 * The cookie goes first. If the SDK call then fails there is still no server
 * session, which is the half that grants access.
 *
 * This clears THIS device only. Refresh tokens are deliberately not revoked —
 * signing out on a phone should not sign the same person out on their laptop.
 */
export async function signOutEverywhereOnThisDevice(): Promise<void> {
  try {
    await fetch("/api/auth/session", { method: "DELETE" });
  } finally {
    try {
      await firebaseSignOut(firebaseAuth());
    } catch {
      /* The server session is already gone, which is what gates access. A
         failure here leaves a stale client credential that grants nothing. */
    }
  }
}

/**
 * Signs the customer out of every device, not just this one.
 *
 * For "my phone was stolen" and "someone else is in my account". Revokes the
 * Firebase refresh tokens server-side, which invalidates every outstanding
 * session cookie, then clears this browser's own.
 */
export async function signOutEverywhere(): Promise<void> {
  try {
    await fetch("/api/auth/session?scope=all", { method: "DELETE" });
  } finally {
    try {
      await firebaseSignOut(firebaseAuth());
    } catch {
      /* The server sessions are already revoked, which is what gates access. */
    }
  }
}
