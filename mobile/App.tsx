import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import type {
  WebViewErrorEvent,
  WebViewNavigation,
  WebViewNavigationEvent,
} from "react-native-webview/lib/WebViewTypes";

/**
 * Vertical Express — native shell.
 *
 * This app renders the deployed Vertical Express web application. It deliberately
 * implements no commerce logic: no pricing, no inventory, no serviceability, no
 * totals, no order or payment state. Those stay server-side and shared, per
 * docs/MOBILE_PRODUCT_DIRECTION.md. Anything added to this file that computes a
 * price or a delivery promise is a bug.
 */

const BACKGROUND = "#161616";

// Guaranteed present and https — app.config.ts fails the build otherwise.
const SITE_URL: string = process.env.EXPO_PUBLIC_SITE_URL!;
const SITE_ORIGIN = new URL(SITE_URL).origin;

const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";

function Shell() {
  const webViewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const canGoBackRef = useRef(false);

  // Android hardware back walks the web history before it leaves the app.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBackRef.current) {
        webViewRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, []);

  const onNavigationStateChange = useCallback((nav: WebViewNavigation) => {
    canGoBackRef.current = nav.canGoBack;
  }, []);

  const onLoadEnd = useCallback((event: WebViewNavigationEvent | WebViewErrorEvent) => {
    setIsLoading(false);
    if ("canGoBack" in event.nativeEvent) {
      canGoBackRef.current = event.nativeEvent.canGoBack;
    }
  }, []);

  /**
   * Navigation policy.
   *
   * https is allowed to proceed inside the WebView. This is deliberate and not
   * laziness: a card payment redirects through the gateway and then through the
   * issuing bank's 3-D Secure page, which is an arbitrary domain that cannot be
   * known ahead of time. An origin allowlist would break those payments.
   *
   * Non-http schemes are handed to the OS — that is how UPI apps, the dialler,
   * mail and WhatsApp are reached (upi:, tel:, mailto:, whatsapp:, intent:).
   * Cleartext http is refused outright; the site is https-only.
   */
  const onShouldStartLoadWithRequest = useCallback((request: { url: string }) => {
    const { url } = request;

    if (url.startsWith("https://")) return true;

    if (url.startsWith("http://")) {
      Linking.openURL(url.replace(/^http:\/\//, "https://")).catch(() => {
        /* nothing sensible to do if the OS refuses the handoff */
      });
      return false;
    }

    if (url.startsWith("about:")) return true;

    Linking.openURL(url).catch(() => {
      /* no installed handler for this scheme (no UPI app, no mail client) */
    });
    return false;
  }, []);

  const reload = useCallback(() => {
    setHasError(false);
    setIsLoading(true);
    webViewRef.current?.reload();
  }, []);

  if (hasError) {
    return (
      <SafeAreaView style={styles.fill}>
        <View style={styles.centred}>
          <Text style={styles.errorTitle}>No connection</Text>
          <Text style={styles.errorBody}>
            Vertical Express could not be reached. Check your mobile data or Wi-Fi
            and try again.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
            onPress={reload}
            accessibilityRole="button"
            accessibilityLabel="Retry loading Vertical Express"
          >
            <Text style={styles.retryLabel}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.fill, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <WebView
        ref={webViewRef}
        source={{ uri: SITE_URL }}
        originWhitelist={["https://*"]}
        style={styles.fill}
        containerStyle={styles.fill}
        applicationNameForUserAgent={`VerticalExpressApp/${APP_VERSION}`}
        onNavigationStateChange={onNavigationStateChange}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onLoadEnd={onLoadEnd}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
        onHttpError={({ nativeEvent }) => {
          // Only a failed document load is fatal; a 404 on a sub-resource is not.
          if (nativeEvent.url === SITE_URL || nativeEvent.statusCode >= 500) {
            setIsLoading(false);
            setHasError(true);
          }
        }}
        // Session cookies must survive a cold start or the customer is logged
        // out of their cart every time they close the app.
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        javaScriptEnabled
        // Razorpay opens its checkout in a nested browsing context.
        javaScriptCanOpenWindowsAutomatically
        setSupportMultipleWindows={false}
        mixedContentMode="never"
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        pullToRefreshEnabled={Platform.OS === "ios"}
        overScrollMode="never"
        // Mid-tier Android over degrading 4G: let the platform cache aggressively.
        cacheEnabled
        androidLayerType="hardware"
        onRenderProcessGone={reload}
        onContentProcessDidTerminate={reload}
      />
      {isLoading ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      ) : null}
      <StatusBar style="light" />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: BACKGROUND },
  centred: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    backgroundColor: BACKGROUND,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BACKGROUND,
  },
  errorTitle: { color: "#ffffff", fontSize: 20, fontWeight: "600", marginBottom: 8 },
  errorBody: {
    color: "#a3a3a3",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 24,
  },
  retry: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 8,
  },
  retryPressed: { opacity: 0.7 },
  retryLabel: { color: BACKGROUND, fontSize: 15, fontWeight: "600" },
});
