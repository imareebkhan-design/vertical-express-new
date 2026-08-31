import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { Logo } from "@/components/ui/logo";
import { getAuthUserId } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Sign in | Vertical Express",
  description: "Sign in to Vertical Express with a one-time code.",
};

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

/**
 * Sign-in, rendered by Clerk.
 *
 * `<SignIn />` renders whatever identifiers the Clerk instance has enabled, so
 * this page does not hardcode a channel. Today that is email; the moment phone
 * and SMS verification are switched on in the dashboard it becomes phone OTP,
 * which is what this market actually signs in with (ISS-006) — without a code
 * change here.
 *
 * `next` comes from the middleware, which appends the route a customer was
 * bounced from, so someone interrupted mid-checkout lands back in checkout
 * rather than on the home page.
 */
export default async function LoginPage({ searchParams }: PageProps) {
  if (await getAuthUserId()) redirect("/");

  const { next } = await searchParams;
  /* Only same-site paths — an open redirect here would let a phishing link
     bounce a freshly signed-in customer to another origin. */
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  return (
    <main id="main-content" className="grid min-h-screen place-items-center bg-canvas px-4 py-12">
      <div className="w-full max-w-[400px]">
        <Link
          href="/"
          aria-label="Vertical Express home"
          className="mb-8 block transition-opacity hover:opacity-90"
        >
          <Logo variant="horizontal" className="mx-auto h-12" />
        </Link>

        <SignIn
          routing="hash"
          forceRedirectUrl={safeNext}
          signUpForceRedirectUrl={safeNext}
          appearance={{
            variables: {
              // Ink primary, paper ground, the app's one type family — the
              // rest of Clerk's defaults are close enough not to fight.
              colorPrimary: "#111111",
              colorBackground: "#FFFFFF",
              borderRadius: "0.75rem",
              fontFamily: "var(--font-jakarta), ui-sans-serif, system-ui, sans-serif",
            },
          }}
        />

        <p className="mt-6 text-center text-[12px] font-medium leading-4 text-ink-500">
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
    </main>
  );
}
