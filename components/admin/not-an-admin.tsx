"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signOutEverywhereOnThisDevice } from "@/lib/auth/sign-out-client";

/**
 * Shown when somebody who IS signed in reaches the console without admin
 * access — the case that used to be a redirect, and that redirect was a loop.
 *
 * WHY THIS IS A SCREEN AND NOT A REDIRECT
 *
 * The console guarded on `getAdminUser()` and sent every failure to
 * `/login?next=/admin`. That treats "not authorized" as "not authenticated",
 * and the two need opposite answers. Signing in again as the same identity
 * cannot grant access, so the login page — which correctly bounces anyone who
 * already has a session — sent them straight back to the storefront. The
 * customer saw the home page and no explanation, however many times they tried.
 *
 * A redirect cannot carry a reason. This can, and the reason is the whole
 * point: the fix is to sign in as a different account, which is not something
 * anybody guesses from being dropped on the shop.
 */
export function NotAnAdmin({ identity }: { identity: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const switchAccount = () => {
    start(async () => {
      /* This device only. Revoking every session everywhere would sign the
         person out of their phone to fix a browser tab. */
      await signOutEverywhereOnThisDevice();
      router.replace("/login?next=/admin");
      router.refresh();
    });
  };

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-[560px] flex-col justify-center px-6 py-16">
      <h1 className="text-[22px] font-extrabold tracking-tight text-ink">
        You&rsquo;re signed in, but not as an operator.
      </h1>
      <p className="mt-2.5 text-[13px] font-medium leading-[19px] text-ink-700">
        This account can shop and track orders. It cannot open the operations console —
        that needs an account on the operator list, signed in with a verified email
        address.
      </p>

      {identity && (
        <p className="mt-4 rounded-field bg-chip-soft px-3.5 py-3 text-[12.5px] font-semibold text-ink">
          Signed in as {identity}
        </p>
      )}

      <p className="mt-4 text-[12px] font-medium leading-[17px] text-ink-500">
        A phone number on its own is never enough, however it is spelled: the operator
        list is matched against an email address Google or the provider has verified. If
        you have an operator account, sign out and use that one.
      </p>

      <div className="mt-6 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={switchAccount}
          disabled={pending}
          className="h-11 rounded-panel bg-ink px-5 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {pending ? "Signing out…" : "Sign in as someone else"}
        </button>
        <Link
          href="/"
          className="h-11 rounded-panel bg-chip px-5 text-[13px] font-bold leading-[44px] text-ink no-underline"
        >
          Back to the shop
        </Link>
      </div>
    </main>
  );
}
