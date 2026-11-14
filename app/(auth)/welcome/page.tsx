import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUserId } from "@/lib/auth/current-user";
import { RoleSelectView } from "@/components/mobile/auth/role-select-view";
import { safeNextPath } from "@/lib/safe-next";

export const metadata: Metadata = {
  title: "Welcome",
  robots: { index: false },
};

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

/**
 * The third step of the way in — artboard 3.
 *
 * Behind the auth gate, because the answer is stored against a profile. A
 * signed-out visitor has nowhere to put it, so they get sign-in first and land
 * back here.
 */
export default async function WelcomePage({ searchParams }: PageProps) {
  if (!(await getAuthUserId())) redirect("/login?next=/welcome");

  const { next } = await searchParams;
  /* Same-site only, exactly as the login page does — this is reachable with a
     ?next= from a link, and an open redirect is an open redirect wherever it is. */
  const safeNext = safeNextPath(next);

  /* Onboarding runs 3 → 4: what you are, then where you are. Passing the
     caller's destination through means a customer who arrived here from
     checkout still lands back in checkout at the end. */
  const onward = safeNext === "/" ? "/welcome/site" : `/welcome/site?next=${encodeURIComponent(safeNext)}`;

  return <RoleSelectView next={onward} />;
}
