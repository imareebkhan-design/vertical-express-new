import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Vertical Express — Expo app config.
 *
 * Static configuration lives in `app.json`. This wrapper exists to enforce one
 * rule at build time: the shell must know which origin to load.
 *
 * The shell renders the deployed Vertical Express web application inside a
 * WebView. If the origin is unset or is not HTTPS, the build fails here rather
 * than producing a binary that ships to a customer and loads nothing. Failing
 * at build time is deliberate — see the production-safety rule in CLAUDE.md.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const siteUrl = process.env.EXPO_PUBLIC_SITE_URL?.trim();

  if (!siteUrl) {
    throw new Error(
      "EXPO_PUBLIC_SITE_URL is not set. The mobile shell has no origin to load.\n" +
        "Set it to the canonical Vertical Express origin (e.g. https://example.in):\n" +
        "  • EAS builds — set it as an environment variable on the EAS project at expo.dev\n" +
        "  • Local dev  — put it in mobile/.env (see mobile/.env.example)\n" +
        "The canonical domain is not yet decided (KNOWN_ISSUES ISS-018); it must be\n" +
        "confirmed by the owner before a store build is produced.",
    );
  }

  let origin: URL;
  try {
    origin = new URL(siteUrl);
  } catch {
    throw new Error(`EXPO_PUBLIC_SITE_URL is not a valid URL: ${siteUrl}`);
  }

  if (origin.protocol !== "https:") {
    throw new Error(
      `EXPO_PUBLIC_SITE_URL must be https, got "${origin.protocol}//". ` +
        "The shell blocks cleartext traffic on both platforms.",
    );
  }

  return {
    ...config,
    name: config.name ?? "Vertical Express",
    slug: config.slug ?? "vertical-express",
  };
};
