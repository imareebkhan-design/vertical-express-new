import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { getAuthUserId } from "@/lib/auth/current-user";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = {
  title: "Sign in | Vertical Express",
  description: "Sign in to Vertical Express with a one-time code.",
  robots: { index: false },
};

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  if (await getAuthUserId()) redirect("/");

  const { next } = await searchParams;
  /* Same-site paths only. An open redirect here would let a phishing link
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

        <SignInForm next={safeNext} />

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
