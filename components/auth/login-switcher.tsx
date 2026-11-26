"use client";

import Link from "next/link";
import { useNativeShell } from "@/components/mobile/native-shell-provider";
import { useMobileSurface } from "@/hooks/use-mobile-surface";
import { PageLoader } from "@/components/page-loader";
import { Logo } from "@/components/ui/logo";
import { SignInForm } from "@/components/auth/sign-in-form";
import { MobileSignInView } from "@/components/mobile/auth/mobile-sign-in-view";
import { ProductShowcase } from "@/components/auth/product-showcase";

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

export function LoginSwitcher({ next }: { next: string }) {
  const { isNative } = useNativeShell();
  const { ready, isMobile } = useMobileSurface(isNative);

  if (!ready) return <PageLoader />;

  if (isMobile) return <MobileSignInView next={next} />;

  return (
    <main id="main-content" className="flex min-h-dvh flex-col bg-canvas lg:flex-row">
      <aside className="ve-login-editorial">
        <div className="ve-login-brand-row">
          <Link href="/" aria-label="Vertical Express home" className="inline-flex w-fit">
            <Logo className="h-14" />
          </Link>
          <span className="ve-login-city">Srinagar, Kashmir</span>
        </div>
        <div className="ve-login-intro">
          <h2><span>From foundation</span><br />to finishing touches.</h2>
          <p>Building materials, interiors and tools for your home project. Explore the range, build your cart and follow your orders in one place.</p>
        </div>
        <ProductShowcase />
        <Link href="/categories" className="ve-login-browse">Explore materials before signing in →</Link>
      </aside>

      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-[400px]">
          {/* SignInForm owns the "Sign in" heading and every auth path. */}
          <SignInForm next={next} />

          <p className="mt-4 text-[12px] font-medium text-ink-500">New here? Signing in creates your account.</p>

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
