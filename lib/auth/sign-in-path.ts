/**
 * The sign-in URL that returns the visitor to `path`.
 *
 * Encoded with URLSearchParams, as middleware encodes its own redirect, so one
 * destination has one sign-in URL. Import-free so it can be used and tested
 * anywhere.
 */
export function signInPathFor(path: string): string {
  return `/login?${new URLSearchParams({ next: path })}`;
}
