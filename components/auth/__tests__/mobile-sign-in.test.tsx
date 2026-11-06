import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ConfirmationResult } from "firebase/auth";
import type { useFirebaseSignIn } from "@/hooks/use-firebase-sign-in";
import { MobileSignInContent } from "@/components/mobile/auth/mobile-sign-in-view";

afterEach(cleanup);

function confirmation(id: string): ConfirmationResult {
  return { verificationId: id, confirm: async () => { throw new Error("No real sign-in in UI tests"); } };
}

function authState(): ReturnType<typeof useFirebaseSignIn> {
  return {
    busy: false, error: null, confirmation: null,
    setError: () => {}, reset: () => {}, toE164: (value) => value,
    sendCode: async () => {}, verifyCode: async () => {}, withGoogle: async () => {},
  };
}

test("phone/code/change-number transitions retain the exact reCAPTCHA node and its widget", () => {
  const auth = authState();
  const view = render(<MobileSignInContent auth={auth} />);
  const holder = document.getElementById("recaptcha-holder");
  assert.ok(holder);
  const widget = document.createElement("iframe");
  widget.title = "Test verifier attachment";
  holder.appendChild(widget);

  view.rerender(<MobileSignInContent auth={{ ...auth, confirmation: confirmation("first") }} />);
  assert.ok(document.getElementById("recaptcha-holder") === holder, "code step replaced the verifier holder");
  assert.equal(widget.isConnected, true);
  assert.equal(document.querySelectorAll("#recaptcha-holder").length, 1);

  view.rerender(<MobileSignInContent auth={auth} />);
  assert.ok(document.getElementById("recaptcha-holder") === holder, "phone step replaced the verifier holder");
  assert.equal(widget.isConnected, true);
});

test("each successful resend restarts cooldown; a failed resend remains retryable", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const first = confirmation("first");
  const auth = { ...authState(), confirmation: first };
  const view = render(<MobileSignInContent auth={auth} />);
  assert.match(screen.getByText("00:30").textContent ?? "", /00:30/);
  act(() => t.mock.timers.tick(30_000));
  assert.ok(screen.getByRole("button", { name: "Resend code" }));

  view.rerender(<MobileSignInContent auth={{ ...auth, error: "Send failed" }} />);
  assert.ok(screen.getByRole("button", { name: "Resend code" }));
  assert.equal(screen.getByRole("alert").textContent, "Send failed");

  view.rerender(<MobileSignInContent auth={{ ...auth, confirmation: confirmation("second") }} />);
  assert.ok(screen.getByText("00:30"));
  assert.equal(screen.queryByRole("button", { name: "Resend code" }), null);
  act(() => t.mock.timers.tick(30_000));
  assert.ok(screen.getByRole("button", { name: "Resend code" }));
});
