import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUserId } from "@/lib/auth/current-user";
import { SiteSetupView } from "@/components/mobile/auth/site-setup-view";

export const metadata: Metadata = {
  title: "Where are we delivering? | Vertical Express",
  robots: { index: false },
};

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

/** Artboard 4 — the last step of the way in. */
export default async function WelcomeSitePage({ searchParams }: PageProps) {
  if (!(await getAuthUserId())) redirect("/login?next=/welcome/site");

  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  return <SiteSetupView next={safeNext} />;
}
