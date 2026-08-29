import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/logo";
import { getAuthUserId } from "@/lib/supabase/server";
import { LoginForm } from "@/components/auth/login-form";
import { LoginHero } from "@/components/auth/login-hero";

export const metadata: Metadata = {
  title: "Login | Vertical Express",
  description: "Log in to Vertical Express with a one-time code.",
};

export default async function LoginPage() {
  // Already signed in? Straight back to the store.
  if (await getAuthUserId()) redirect("/");

  return (
    <main id="main-content" className="grid min-h-screen place-items-center bg-surface/60 px-4">
      <div className="w-full max-w-md rounded-card-lg border border-neutral-100 bg-white p-8 shadow-card sm:p-10">
        <Link href="/" aria-label="Vertical Express home" className="mb-8 block hover:opacity-90 transition-opacity">
          <Logo variant="horizontal" className="h-12 mx-auto" />
        </Link>

        <LoginHero className="mb-8 aspect-[3/2] w-full rounded-panel" />

        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
