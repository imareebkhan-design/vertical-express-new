"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

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

export function firebaseApp(): FirebaseApp {
  if (!config.apiKey || !config.authDomain || !config.projectId) {
    /* Fail loudly rather than half-initialising. A misconfigured auth client
       that silently no-ops looks exactly like "sign-in is broken" and costs an
       afternoon to trace. */
    throw new Error(
      "Firebase web config is missing. Set the NEXT_PUBLIC_FIREBASE_* variables."
    );
  }
  return getApps().length ? getApp() : initializeApp(config);
}

export function firebaseAuth(): Auth {
  return getAuth(firebaseApp());
}
