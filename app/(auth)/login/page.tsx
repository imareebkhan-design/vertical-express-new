import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Zap } from "lucide-react";
import { getAuthUserId } from "@/lib/supabase/server";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Login | Vertical Express",
  description: "Log in to Vertical Express with a one-time code.",
};

export default async function LoginPage() {
  // Already signed in? Straight back to the store.
  if (await getAuthUserId()) redirect("/");

  return (
    <main className="grid min-h-screen place-items-center bg-surface/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-100 bg-white p-8 shadow-card sm:p-10">
        <Link href="/" className="mb-8 flex items-center gap-1.5" aria-label="Vertical Express home">
          <span className="grid size-9 place-items-center rounded-lg bg-brand">
            <Zap className="size-5 fill-ink text-ink" aria-hidden />
          </span>
          <span className="text-xl font-extrabold tracking-tight">
            Vertical<span className="text-brand-deep">Express</span>
          </span>
        </Link>

        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
