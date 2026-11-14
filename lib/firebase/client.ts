"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
} from "firebase/app-check";

/**
 * The browser-side Firebase app.
 *
 * Every value here is public by design — the web config ships to the browser and
 * is not a secret. What protects the project is Firebase Auth's own rules and
 * the authorized-domain list, not the obscurity of the API key.
 *
 * Initialised lazily and memoised: Next remounts client components freely, and
 * `initializeApp` throws on a duplicate name.
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * App Check — the only thing that can throttle OTP sends here.
 *
 * Under the retired Supabase path the OTP send went through our server, so a
 * rate limiter in front of it worked: five per identifier per fifteen minutes,
 * failing closed, because each send costs money and reaches a real handset
 * (DEC-016). Under Firebase the browser calls `signInWithPhoneNumber` directly
 * against Google. **Our server is not in that path and cannot throttle it.**
 * Re-adding a limiter to a server action would protect nothing, which is why
 * ISS-047 stayed open rather than being "fixed" with one.
 *
 * App Check attests that the caller is our real app before Firebase will send
 * an SMS. It is the mechanism Firebase documents for this, and the invisible
 * reCAPTCHA already on the sign-in form is not a substitute: that is a bot
 * check on one request, not a volume control. The exposure is SMS pumping — an
 * attacker driving paid messages to numbers they control. The SMS region policy
 * is restricted to IN, which caps who can be reached but not how much it costs.
 *
 * **Inert until configured, deliberately.** Turning App Check on in code before
 * the Firebase Console knows about this site would block every sign-in on the
 * site instead of protecting it. So: no site key, no App Check, and sign-in
 * behaves exactly as it does today. The console side is the owner's — see
 * `docs/OWNER_INPUT_REQUIRED.md`.
 */
const APP_CHECK_SITE_KEY = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY;

/** reCAPTCHA Enterprise when asked for, else reCAPTCHA v3. Both take a site key. */
const APP_CHECK_ENTERPRISE =
  process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_PROVIDER === "enterprise";

let appCheckStarted = false;

/**
 * Start App Check once, if a site key is configured.
 *
 * Never throws. A failure here must not take sign-in down with it: App Check
 * being misconfigured should degrade to today's behaviour, not to a site
 * nobody can log in to. Enforcement is a console setting, so while it is off
 * an unattested request still succeeds — which is exactly how it should be
 * rolled out, monitored first and enforced second.
 */
function startAppCheck(app: FirebaseApp): void {
  if (appCheckStarted || !APP_CHECK_SITE_KEY) return;
  appCheckStarted = true;

  try {
    initializeAppCheck(app, {
      provider: APP_CHECK_ENTERPRISE
        ? new ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY)
        : new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    /* Already initialised on a remount, or the key is rejected. Neither is
       worth breaking sign-in over, and the console reports attestation
       failures far more usefully than a thrown error here would. */
  }
}

export function firebaseApp(): FirebaseApp {
  if (!config.apiKey || !config.authDomain || !config.projectId) {
    /* Fail loudly rather than half-initialising. A misconfigured auth client
       that silently no-ops looks exactly like "sign-in is broken" and costs an
       afternoon to trace. */
    throw new Error(
      "Firebase web config is missing. Set the NEXT_PUBLIC_FIREBASE_* variables."
    );
  }
  const app = getApps().length ? getApp() : initializeApp(config);
  startAppCheck(app);
  return app;
}

/** Whether OTP sends are attested. False means Firebase will send for anyone. */
export function appCheckConfigured(): boolean {
  return Boolean(APP_CHECK_SITE_KEY);
}

export function firebaseAuth(): Auth {
  return getAuth(firebaseApp());
}
