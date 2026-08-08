import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Vertical Express — Native iOS/Android Shell Configuration (Capacitor 8).
 * App ID: in.verticalexpress.app
 * Deep Link Scheme: verticalexpress://
 */
const config: CapacitorConfig = {
  appId: "in.verticalexpress.app",
  appName: "Vertical Express",
  webDir: "mobile-shell",
  server: {
    androidScheme: "https",
    iosScheme: "https",
    cleartext: false,
  },
  backgroundColor: "#161616",
  ios: {
    contentInset: "always",
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#161616",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    Keyboard: {
      resize: "body",
      style: "DARK",
    },
  },
};

export default config;
