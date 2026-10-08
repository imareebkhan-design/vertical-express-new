"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { WifiOff } from "lucide-react";
import { getNetworkStatus } from "@/lib/native/network";
import { triggerHaptic } from "@/lib/native/haptics";
import { useDeliveryPincode } from "@/hooks/use-delivery-pincode";
import { LocationPicker } from "@/components/location/location-picker";
import { OnboardingFlow } from "@/components/mobile/auth/onboarding-flow";
import { BiometricLock } from "@/components/mobile/auth/biometric-lock";
import { BottomSheetLayout } from "@/components/mobile/bottom-sheet-layout";
import { MobileTabBar } from "@/components/mobile/navigation/mobile-tab-bar";
import { showsTabBar } from "@/components/mobile/navigation/tab-bar-visibility";
import { useCart } from "@/hooks/use-cart";
import { useMobileSurface } from "@/hooks/use-mobile-surface";

interface NativeShellContextType {
  isNative: boolean;
  pincode: string;
  cityName: string;
  /** A pincode this visitor actually confirmed (this session or a saved one) —
   *  never true for the unconfirmed default, on web or native. */
  hasChosenLocation: boolean;
  /** What the header says after "Deliver to": the confirmed place's name, else the pincode. */
  locationLabel: string;
  openLocationModal: () => void;
}

const NativeShellContext = createContext<NativeShellContextType>({
  isNative: false,
  pincode: "",
  cityName: "",
  hasChosenLocation: false,
  locationLabel: "",
  openLocationModal: () => {},
});

export function useNativeShell() {
  return useContext(NativeShellContext);
}

export function NativeShellProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isNative, setIsNative] = useState(false);
  const { isMobile } = useMobileSurface(isNative);
  const cart = useCart();
  const [isOnboarded, setIsOnboarded] = useState(true);
  const [isUnlocked, setIsUnlocked] = useState(true);
  const [isOnline, setIsOnline] = useState(true);

  /* The delivery location is the storefront's one store (useDeliveryPincode),
     not a second copy held here. This provider used to keep its own state over
     the same localStorage keys, so a pincode confirmed in the desktop navbar
     did not reach phone-web in the same tab until a reload (W-26), and its
     unchosen state was a "190001 · Srinagar" placeholder. Unchosen is now
     empty, and only a server-confirmed pincode is ever stored. */
  const delivery = useDeliveryPincode();
  const pincode = delivery.pincode ?? "";
  const cityName = delivery.city ?? "";
  const hasChosenLocation = delivery.hasChosen;
  const locationLabel = delivery.place?.label ?? (pincode ? `${pincode}${cityName ? ` · ${cityName}` : ""}` : "");
  const [isLocationOpen, setIsLocationOpen] = useState(false);

  // Detect native shell and load settings from local storage
  useEffect(() => {
    if (typeof window === "undefined") return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = (window as any).Capacitor;
    const native = !!cap?.isNativePlatform();
    setIsNative(native);

    if (native) {
      document.body.classList.add("is-native");

      // Check onboarding state
      const onboarded = localStorage.getItem("ve_onboarded") === "true";
      setIsOnboarded(onboarded);

      // Check biometrics lock state
      const bioEnabled = localStorage.getItem("ve_biometric_enabled") === "true";
      setIsUnlocked(!bioEnabled);
    }
    // A previously confirmed location is restored by useDeliveryPincode itself,
    // on web and native alike.
  }, []);

  // Listen to Native Platform events (Deep Links, Push, App Lifecycle)
  useEffect(() => {
    if (!isNative) return;

    let cleanupDeepLinks: (() => void) | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let activeListener: any;

    // 1. Deep Links routing
    import("@/lib/native/deep-links").then(({ listenToDeepLinks }) => {
      cleanupDeepLinks = listenToDeepLinks((url: string) => {
        void triggerHaptic("medium");
        try {
          const parsedUrl = new URL(url);
          const path = (parsedUrl.host + parsedUrl.pathname).replace(/^(verticalexpress:\/\/|verticalexpress:)/, "");
          const route = path.startsWith("/") ? path : `/${path}`;
          router.push(route);
        } catch {
          const route = url.replace("verticalexpress://", "/").replace("verticalexpress:", "/");
          router.push(route);
        }
      });
    }).catch(() => {});

    // 2. Push Notifications
    import("@/lib/native/push").then(({ listenToPushNotifications }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void listenToPushNotifications((notification: any) => {
        void triggerHaptic("heavy");
        alert(`[Vertical Express Alert]\n${notification.title}\n${notification.body}`);
      });
    }).catch(() => {});

    // 3. App State Resumed / Lifecycle
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = (window as any).Capacitor;
    const AppPlugin = cap?.Plugins?.App;
    if (AppPlugin) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      activeListener = AppPlugin.addListener("appStateChange", (state: any) => {
        if (state.isActive) {
          void triggerHaptic("light");
          router.refresh();
        }
      });
    }

    return () => {
      if (typeof cleanupDeepLinks === "function") cleanupDeepLinks();
      if (activeListener) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        activeListener.then((l: any) => l.remove());
      }
    };
  }, [isNative, router]);

  // Monitor network connection (native & web)
  useEffect(() => {
    const checkNetwork = async () => {
      const status = await getNetworkStatus();
      setIsOnline(status.connected);
    };

    void checkNetwork();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // If on native, also poll status periodically
    let interval: ReturnType<typeof setInterval>;
    if (isNative) {
      interval = setInterval(checkNetwork, 5000);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (interval) clearInterval(interval);
    };
  }, [isNative]);

  const openLocationModal = () => {
    triggerHaptic("light");
    setIsLocationOpen(true);
  };

  /* "Where should we deliver?" — the location sheet itself lives in
     components/location/location-picker.tsx (GPS, address search, pincode). */

  // 1. Render Offline Overlay
  if (isNative && !isOnline) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface px-6 text-center">
        <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-danger/10 text-danger animate-pulse">
          <WifiOff className="size-10" />
        </div>
        <h2 className="text-xl font-extrabold text-ink">Connection Lost</h2>
        <p className="mt-2 text-sm text-ink/60 max-w-xs leading-relaxed">
          Please check your network settings. Vertical Express will automatically reconnect when a connection is restored.
        </p>
        <button
          onClick={async () => {
            triggerHaptic("light");
            const status = await getNetworkStatus();
            setIsOnline(status.connected);
          }}
          className="mt-6 rounded-full bg-brand-deep px-6 py-2.5 text-xs font-bold text-white shadow-md active:scale-95"
        >
          Check Again
        </button>
      </div>
    );
  }

  // 2. Render Onboarding Flow
  if (isNative && !isOnboarded) {
    return (
      <OnboardingFlow
        onComplete={() => {
          setIsOnboarded(true);
        }}
      />
    );
  }

  // 3. Render Biometric App Lock
  if (isNative && !isUnlocked) {
    return (
      <BiometricLock
        onUnlocked={() => {
          setIsUnlocked(true);
        }}
      />
    );
  }

  // The floating pill nav belongs to the app language, and mobile web now shares
  // it — the design treats the two as the same product below 768px.
  const showTabBar = showsTabBar(pathname, isMobile, cart.summary.lines.length > 0);

  // One instance for both surfaces. The native shell wraps children in its own
  // <main>; web pages supply their own, so only the wrapper differs.
  const locationSheet = (
      <BottomSheetLayout
        isOpen={isLocationOpen}
        onClose={() => {
          triggerHaptic("light");
          setIsLocationOpen(false);
        }}
        title="Where should we deliver?"
        dialogOnDesktop
      >
        <LocationPicker
          key={isLocationOpen ? "open" : "closed"}
          onDone={() => {
            triggerHaptic("light");
            setIsLocationOpen(false);
          }}
        />
      </BottomSheetLayout>
  );

  // 4. Render Main Native Shell Wrapper
  return (
    <NativeShellContext.Provider value={{ isNative, pincode, cityName, hasChosenLocation, locationLabel, openLocationModal }}>
      {isNative ? (
        <div className="flex flex-col min-h-screen bg-surface">
          <main className={`flex-1 w-full ${showTabBar ? "pb-24" : "pb-6"}`}>
            {children}
          </main>
        </div>
      ) : (
        <div className={`flex flex-col min-h-screen ${showTabBar ? "pb-24" : ""}`}>
          {children}
        </div>
      )}

      {showTabBar && (
        <>
          {/* Content fades into the canvas behind the floating nav rather than
              being cut by it — the scrim the app design pairs with the pill. */}
          <div
            aria-hidden
            className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-[120px]"
            style={{
              background:
                "linear-gradient(180deg, rgba(243,242,240,0) 0%, var(--color-canvas) 62%)",
            }}
          />
          <footer className="native-footer fixed bottom-0 left-0 right-0 z-40 w-full">
            <MobileTabBar />
          </footer>
        </>
      )}

      {locationSheet}
    </NativeShellContext.Provider>
  );
}
