import { redirectDeadSessionToSignIn } from "@/lib/auth/early-sign-in";

/**
 * Renders above ./loading.tsx, so a dead session is redirected with a real 307
 * before the loading shell streams — see lib/auth/early-sign-in.ts. Each page
 * still performs its own authoritative identity check.
 */
export default async function CheckoutLayout({ children }: { children: React.ReactNode }) {
  await redirectDeadSessionToSignIn("/checkout");
  return children;
}
