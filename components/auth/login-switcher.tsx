"use client";

import Link from "next/link";
import { useNativeShell } from "@/components/mobile/native-shell-provider";
import { useMobileSurface } from "@/hooks/use-mobile-surface";
import { PageLoader } from "@/components/page-loader";
import { Logo } from "@/components/ui/logo";
import { SignInForm } from "@/components/auth/sign-in-form";
import { MobileSignInView } from "@/components/mobile/auth/mobile-sign-in-view";

/**
 * Two sign-in screens, one route.
 *
 * They are different designs on purpose, not one design at two widths. The web
 * screen is a split panel adapted from the operations sign-in artboard, because
 * it has to explain the business to somebody still deciding whether to use it.
 * The mobile screen is artboards 1 and 2 of the app canvas — a first-run screen
 * for somebody who already installed the app, so it leads with the product
 * collage and puts a single field under a thumb.
 *
 * Both authenticate through useFirebaseSignIn. The markup forks; the credential
 * does not, which is the lesson of ISS-046.
 */

/**
 * The four L1 groups, verbatim from the navbar's taxonomy.
 *
 * The customer-side counterpart of the role chips on the ops artboard — same
 * structural job, showing what is behind the door before you open it. Real
 * category names rather than marketing adjectives, so nothing here is a claim
 * that has to be checked with the owner.
 */
const GROUPS = ["Civil & Interiors", "Furniture & Hardware", "Electrical", "Plumbing & Bath"];

export function LoginSwitcher({ next }: { next: string }) {
  const { isNative } = useNativeShell();
  const { ready, isMobile } = useMobileSurface(isNative);

  if (!ready) return <PageLoader />;

  if (isMobile) return <MobileSignInView next={next} />;

  return (
    <main id="main-content" className="flex min-h-screen flex-col bg-canvas lg:flex-row">
      <aside className="flex flex-col justify-end bg-ink px-6 py-10 sm:px-10 lg:w-[560px] lg:flex-none lg:px-14 lg:py-14">
        <Link
          href="/"
          aria-label="Vertical Express home"
          className="mb-8 inline-flex w-fit transition-opacity hover:opacity-90 lg:mb-auto"
        >
          <Logo variant="light" className="h-9 lg:h-10" />
        </Link>

        <h2 className="text-[28px] font-extrabold leading-[32px] tracking-[-0.03em] text-white sm:text-[38px] sm:leading-[43px]">
          <span className="font-light text-white/50">Cement to switches,</span>
          <br />
          delivered to your site.
        </h2>

        <p className="mt-4 hidden max-w-[400px] text-[14.5px] font-medium leading-[22px] text-white/60 sm:block">
          Order what the build needs without leaving it. Prices include GST, and you can pay
          online or on delivery where that is available.
        </p>

        <div className="mt-6 hidden flex-wrap gap-2.5 sm:flex">
          {GROUPS.map((group) => (
            <span
              key={group}
              className="rounded-full bg-white/10 px-3 py-1 text-[12px] font-bold text-white/75"
            >
              {group}
            </span>
          ))}
        </div>
      </aside>

      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-[400px]">
          {/* SignInForm owns the "Sign in" heading and every auth path. */}
          <SignInForm next={next} />

          <div className="mt-5 rounded-[14px] bg-chip-soft px-4 py-3">
            <p className="text-[12px] font-semibold leading-[17px] text-ink-700">
              First time here? Signing in creates your account — there is no separate sign-up
              step and no password to remember.
            </p>
          </div>

          <p className="mt-5 text-center text-[12px] font-medium leading-4 text-ink-500">
            By continuing you agree to our{" "}
            <Link href="/terms" className="font-bold text-ink underline underline-offset-2">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-bold text-ink underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
