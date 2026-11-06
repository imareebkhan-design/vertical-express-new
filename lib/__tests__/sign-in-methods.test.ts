import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Which ways in exist, asserted rather than assumed.
 *
 * Email/password was removed deliberately, for two reasons that both bite
 * quietly if it comes back:
 *
 *   1. Nothing sends a verification mail, so `email_verified` is false for every
 *      account created that way. The link policy will not let an unverified
 *      email claim a row and `getAdminUser()` will not admit one — so those
 *      accounts silently cannot link and cannot administer (ISS-048). Nothing
 *      sends a reset either, so a forgotten password is permanent.
 *   2. It is the only thing in the project that Firebase's per-project scrypt
 *      signer key protects. That key has no documented rotation path, so the
 *      remediation for its exposure is to leave it guarding nothing.
 *
 * Re-adding the UI without also building verification and reset would restore
 * both problems, and neither shows up in a manual click-through — a developer
 * testing it would simply sign in successfully and see nothing wrong.
 */
const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const hook = strip(read("../../hooks/use-firebase-sign-in.ts"));
const webForm = strip(read("../../components/auth/sign-in-form.tsx"));
const mobileView = strip(read("../../components/mobile/auth/mobile-sign-in-view.tsx"));

test("no surface offers email and password", () => {
  for (const [name, src] of [
    ["the shared hook", hook],
    ["the web form", webForm],
    ["the mobile view", mobileView],
  ] as const) {
    for (const banned of [
      "signInWithEmailAndPassword",
      "createUserWithEmailAndPassword",
      "withEmail",
      'type="password"',
    ]) {
      assert.ok(
        !src.includes(banned),
        `${name} references ${banned} — email/password needs verification and reset before it comes back (ISS-048)`
      );
    }
  }
});

test("phone and Google are still wired", () => {
  /* The other half of the rule: removing a method must not quietly remove the
     ones the market actually uses. */
  assert.ok(hook.includes("signInWithPhoneNumber"), "phone sign-in must remain");
  assert.ok(hook.includes("signInWithPopup"), "Google sign-in must remain");
  assert.ok(hook.includes("RecaptchaVerifier"), "phone auth needs its bot check");
});

test("both surfaces render the reCAPTCHA holder the phone flow needs", () => {
  /* Invisible, but Firebase refuses to send an SMS without a real element to
     attach to — and the failure is silent on whichever surface forgot it. */
  for (const [name, src] of [
    ["the web form", webForm],
    ["the mobile view", mobileView],
  ] as const) {
    assert.ok(
      src.includes("RECAPTCHA_HOLDER_ID"),
      `${name} must render the reCAPTCHA holder or its SMS send fails`
    );
  }
});
