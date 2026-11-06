/** Optional receipt contact, never an account-identity update. */
export function normaliseContactEmail(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (!value || value.length > 254) return null;
  return /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(value) ? value : null;
}
