import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Vertical Express — native iOS/Android shell (Capacitor).
 *
 * The app is a Next.js SSR + Server Actions app, so it can't be statically
 * exported. Instead the native shell loads the live production site via
 * `server.url`; auth, checkout, and server actions all keep working and the
 * design is identical to the web app. `webDir` is only a fallback shown while
 * offline before the remote URL loads.
 *
 * NOTE: `appId` is the app's identity in both stores — set it before the first
 * store submission (changing it later means re-registering the app).
 */
const config: CapacitorConfig = {
  appId: "com.verticalexpress.app",
  appName: "Vertical Express",
  webDir: "mobile-shell",
  server: {
    url: "https://new-virticalexpress.vercel.app",
    androidScheme: "https",
    cleartext: false,
  },
  backgroundColor: "#fcbd00",
  ios: {
    contentInset: "always",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#fcbd00",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
  },
};

export default config;
