import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ensureUserMirror } from "@/lib/services/users";
import { safeNextPath } from "@/lib/safe-next";

/**
 * Magic-link landing: verifies the token_hash from the emailed link and
 * establishes the session. Companion path to code entry on /login.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "email") as EmailOtpType;
  /* Same-site only — this redirects after verifying a link, so an open
     redirect here lends the site's name to anyone's phishing page. */
  const next = safeNextPath(searchParams.get("next"));

  if (tokenHash) {
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error && data.user) {
      await ensureUserMirror({
        userId: data.user.id,
        email: data.user.email,
        phone: data.user.phone,
      });
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=link", request.url));
}
