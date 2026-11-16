/**
 * Client idempotency key for one checkout attempt.
 *
 * `randomUUID` is missing outside a secure context (plain-HTTP previews, some
 * embedded webviews), but `getRandomValues` is not, so the fallback stays
 * cryptographically random instead of dropping to `Math.random`. A guessable
 * key would let a second request be mistaken for a retry of the first.
 */
type WebCrypto = Pick<Crypto, "getRandomValues"> & { randomUUID?: () => string };

export function generateIdempotencyKey(webCrypto: WebCrypto = globalThis.crypto): string {
  if (typeof webCrypto.randomUUID === "function") return webCrypto.randomUUID();
  const bytes = webCrypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
