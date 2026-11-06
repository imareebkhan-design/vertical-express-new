/**
 * A post-sign-in destination, kept on this site.
 *
 * `next` arrives in the query string, so it is attacker-controlled. The rule
 * that was repeated inline — starts with "/" but not "//" — let "/\evil.com"
 * through: browsers read a backslash as a slash in http(s) URLs, so the
 * redirect landed on //evil.com. A path must start with a single "/" followed
 * by something other than "/" or "\", and carry no control characters.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.length > 1 && (next[1] === "/" || next[1] === "\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}
