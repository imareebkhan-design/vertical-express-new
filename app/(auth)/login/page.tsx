import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUserId } from "@/lib/auth/current-user";
import { LoginSwitcher } from "@/components/auth/login-switcher";

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

  return <LoginSwitcher next={safeNext} />;
}
