import { test } from "node:test";
import assert from "node:assert/strict";
import { signInErrorMessage } from "../auth/sign-in-errors";

const fb = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });

test("a failed security check reads as something to retry, not a Firebase string", () => {
  for (const code of ["auth/invalid-app-credential", "auth/captcha-check-failed"]) {
    const msg = signInErrorMessage(fb(code));
    assert.equal(msg, "We couldn't complete the security check. Please try again.");
    assert.doesNotMatch(msg, /Firebase|auth\//);
  }
});

test("known codes keep their plain wording", () => {
  assert.equal(signInErrorMessage(fb("auth/invalid-phone-number")), "That phone number doesn't look right.");
  assert.equal(signInErrorMessage(fb("auth/invalid-verification-code")), "That code isn't correct.");
  assert.equal(signInErrorMessage(fb("auth/too-many-requests")), "Too many attempts. Try again in a few minutes.");
});

test("an unknown Firebase error never shows its raw text", () => {
  assert.equal(signInErrorMessage(fb("auth/some-new-code")), "Something went wrong. Please try again.");
  assert.equal(signInErrorMessage(new Error("Firebase: Error (auth/whatever).")), "Something went wrong. Please try again.");
});

test("our own messages, thrown without a code, read as written", () => {
  assert.equal(signInErrorMessage(new Error("Could not start your session. Please try again.")), "Could not start your session. Please try again.");
  assert.equal(signInErrorMessage("not an error"), "Something went wrong. Please try again.");
});
