import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthUserId } from "@/lib/auth/current-user";
import { LoginSwitcher } from "@/components/auth/login-switcher";
import { safeNextPath } from "@/lib/safe-next";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Vertical Express with a one-time code.",
  robots: { index: false },
};

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  /* Same-site paths only. An open redirect here would let a phishing link
     bounce a freshly signed-in customer to another origin. */
  const safeNext = safeNextPath(next);

  /* Somebody already signed in has nothing to do on a sign-in form — but send
     them where they were going, not to the home page. Dropping `next` here is
     how a customer who followed a link to their order ended up on the shop
     front instead, with nothing said.
     
     Safe from looping only because no route sends an *authenticated* visitor
     here any more: the console distinguishes "not signed in" from "not an
     operator" (see adminGate) and answers the second itself. Reintroduce that
     redirect and this line turns it into an infinite bounce. */
  if (await getAuthUserId()) redirect(safeNext);

  return <LoginSwitcher next={safeNext} />;
}
