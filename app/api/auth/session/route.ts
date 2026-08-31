import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionCookie } from "@/lib/auth/session";
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from "@/lib/auth/session-cookie";

/**
 * Exchanges a Firebase ID token for an httpOnly session cookie, and clears it
 * on sign-out.
 *
 * The browser holds the ID token; the server holds the session. Nothing here
 * trusts the client beyond the token itself, which is verified against
 * Firebase's signing keys before a cookie is issued — a forged or expired token
 * produces no session.
 *
 * The cookie is httpOnly so client script cannot read it, which is what stops a
 * cross-site script from lifting a two-week session.
 */
const bodySchema = z.object({ idToken: z.string().min(1).max(4096) });

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const cookie = await createSessionCookie(parsed.data.idToken);
  if (!cookie) {
    /* Deliberately unspecific: distinguishing "expired" from "forged" from
       "issued too long ago" tells an attacker which part to fix. */
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_MS / 1000,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
