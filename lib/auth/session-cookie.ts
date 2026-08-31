/**
 * The session cookie's name and lifetime — and nothing else.
 *
 * Deliberately free of imports. `lib/auth/session.ts` pulls in firebase-admin,
 * which needs `node:crypto` and therefore cannot be loaded in the Edge runtime;
 * middleware importing the constant from there took the whole Admin SDK with it
 * and every route 500'd with "Cannot find module 'node:crypto'".
 *
 * Middleware needs the name to check for presence. Only the server needs the
 * verifier. Splitting the constant out keeps the two apart.
 */
export const SESSION_COOKIE = "__session";

/** Two weeks — Firebase's maximum for a session cookie. */
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
