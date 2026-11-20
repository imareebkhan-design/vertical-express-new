/**
 * "Who is signed in on this page just changed" — for client state that belongs
 * to the customer and would otherwise outlive them (E8).
 *
 * The cart provider fetches once, on mount. Sign-in and sign-out finish with
 * `router.refresh()`, which re-renders server components but keeps client
 * state, so the previous customer's cart (count, lines) stayed on screen after
 * sign-out on a shared phone, and after sign-in the merged cart was not
 * fetched. Sign-in and sign-out announce the change; holders of per-customer
 * state listen and re-fetch. A plain DOM event: no SDK load for pages that only
 * need to know that it happened.
 */

const EVENT = "ve:auth-changed";
const STORAGE_KEY = "ve:auth-change";

export function announceAuthChanged(): void {
  /* The window's own Event constructor — the same one in a browser, and the
     matching one wherever a DOM is provided separately from the runtime. */
  if (typeof window !== "undefined") {
    window.dispatchEvent(new window.Event(EVENT));
    // Cookies are shared across tabs. Broadcast only a nonce, never identity or tokens.
    try { window.localStorage.setItem(STORAGE_KEY, window.crypto.randomUUID()); } catch { /* Storage can be disabled. */ }
  }
}

/** Subscribe; returns the unsubscribe. */
export function onAuthChanged(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
