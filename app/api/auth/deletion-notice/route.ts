import { NextResponse } from "next/server";
import { DELETION_DONE_COOKIE } from "@/lib/auth/deletion-marker";
import { sessionRequestRefusal } from "@/lib/auth/session-request";

/**
 * DELETE /api/auth/deletion-notice — consumes the one-time proof that an
 * account deletion just finished, once /delete-account has shown it.
 *
 * A route handler, not a server action: a server action that writes a cookie
 * makes Next re-render the page, and without the proof that re-render would
 * replace the confirmation the customer is reading. It only ever clears this
 * one cookie, and only for a same-origin request.
 */
export async function DELETE(request: Request) {
  const refusal = sessionRequestRefusal(request);
  if (refusal) return NextResponse.json({ ok: false }, { status: refusal });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(DELETION_DONE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/delete-account",
    maxAge: 0,
  });
  return response;
}
