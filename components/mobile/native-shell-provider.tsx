"use client";

import React, { createContext, useContext, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { WifiOff, MapPin, Loader2, Navigation, AlertCircle } from "lucide-react";
import { getNetworkStatus } from "@/lib/native/network";
import { getCurrentCoordinates } from "@/lib/native/geolocation";
import { triggerHaptic } from "@/lib/native/haptics";
import { OnboardingFlow } from "@/components/mobile/auth/onboarding-flow";
import { BiometricLock } from "@/components/mobile/auth/biometric-lock";
import { BottomSheetLayout } from "@/components/mobile/bottom-sheet-layout";
import { MobileTabBar } from "@/components/mobile/navigation/mobile-tab-bar";

interface NativeShellContextType {
  isNative: boolean;
  pincode: string;
  cityName: string;
  openLocationModal: () => void;
}

const NativeShellContext = createContext<NativeShellContextType>({
  isNative: false,
  pincode: "190001",
  cityName: "Srinagar",
  openLocationModal: () => {},
});

export function useNativeShell() {
  return useContext(NativeShellContext);
}

export function NativeShellProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isNative, setIsNative] = useState(false);
  const [isOnboarded, setIsOnboarded] = useState(true);
  const [isUnlocked, setIsUnlocked] = useState(true);
  const [isOnline, setIsOnline] = useState(true);

  // Pincode and location state
  const [pincode, setPincode] = useState("190001");
  const [cityName, setCityName] = useState("Srinagar");
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [pincodeInput, setPincodeInput] = useState("");
  const [locError, setLocError] = useState<string | null>(null);
  const [isCheckingSvc, startCheckingSvc] = useTransition();

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

      // Load saved delivery location
      const savedPincode = localStorage.getItem("ve_pincode");
      const savedCity = localStorage.getItem("ve_city");
      if (savedPincode) setPincode(savedPincode);
      if (savedCity) setCityName(savedCity);
    }
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
    setPincodeInput(pincode);
    setLocError(null);
    setIsLocationOpen(true);
  };

  const handlePincodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocError(null);

    const cleanPin = pincodeInput.replace(/\D/g, "");
    if (cleanPin.length !== 6) {
      setLocError("Please enter a valid 6-digit pincode.");
      triggerHaptic("heavy");
      return;
    }

    triggerHaptic("medium");

    startCheckingSvc(async () => {
      try {
        const res = await fetch(`/api/serviceability/${cleanPin}`);
        if (!res.ok) {
          throw new Error("Could not verify serviceability.");
        }
        const data = await res.json();
        if (data.serviceable) {
          setPincode(cleanPin);
          // Seed database resolves all serviceable items to Srinagar
          const city = "Srinagar";
          setCityName(city);
          localStorage.setItem("ve_pincode", cleanPin);
          localStorage.setItem("ve_city", city);
          setIsLocationOpen(false);
          triggerHaptic("light");
        } else {
          setLocError("We do not deliver here yet. Try central Srinagar (190001 - 190015).");
          triggerHaptic("heavy");
        }
      } catch {
        setLocError("Network error check. Please try again.");
      }
    });
  };

  const handleUseCurrentLocation = async () => {
    setLocError(null);
    triggerHaptic("medium");
    const coords = await getCurrentCoordinates();

    if (!coords) {
      setLocError("Location permissions denied or unavailable. Please type your pincode.");
      triggerHaptic("heavy");
      return;
    }

    // Mock reverse lookup: if close to Srinagar coordinates (lat ~34.08, lon ~74.80), set to 190001
    const latDiff = Math.abs(coords.latitude - 34.08);
    const lonDiff = Math.abs(coords.longitude - 74.80);

    if (latDiff < 0.2 && lonDiff < 0.2) {
      setPincodeInput("190001");
      setLocError(null);
    } else {
      setLocError("Your location is outside our service area (Srinagar).");
      triggerHaptic("heavy");
    }
  };

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

  // Determine if primary tab page to show footer tab bar
  const isPrimaryTab = ["/", "/categories", "/search", "/cart", "/account"].includes(pathname);

  // 4. Render Main Native Shell Wrapper
  return (
    <NativeShellContext.Provider value={{ isNative, pincode, cityName, openLocationModal }}>
      {isNative ? (
        <div className="flex flex-col min-h-screen bg-surface">
          <main className={`flex-1 w-full ${isPrimaryTab ? "pb-24" : "pb-6"}`}>
            {children}
          </main>

          {isPrimaryTab && (
            <footer className="native-footer fixed bottom-0 left-0 right-0 z-40 w-full">
              <MobileTabBar />
            </footer>
          )}

          {/* Location Selection Sheet */}
          <BottomSheetLayout
            isOpen={isLocationOpen}
            onClose={() => {
              triggerHaptic("light");
              setIsLocationOpen(false);
            }}
            title="Choose Delivery Location"
          >
            <form onSubmit={handlePincodeSubmit} className="space-y-4">
              <p className="text-xs text-ink/60">
                Enter your 6-digit site pincode to check instant delivery availability.
              </p>

              <div className="flex items-center rounded-2xl border border-mist/40 bg-surface px-4 py-3 focus-within:border-brand-deep">
                <MapPin className="size-4 text-brand-deep mr-2" />
                <input
                  type="tel"
                  maxLength={6}
                  value={pincodeInput}
                  onChange={(e) => setPincodeInput(e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 190001"
                  className="w-full bg-transparent text-sm font-bold text-ink outline-none placeholder:text-ink/30"
                  disabled={isCheckingSvc}
                  autoFocus
                />
              </div>

              {locError && (
                <div className="flex items-start gap-1.5 text-xs font-semibold text-danger">
                  <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                  <span>{locError}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={isCheckingSvc}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-mist/30 bg-surface px-4 py-3.5 text-xs font-bold text-ink shadow-xs active:scale-95 disabled:opacity-50"
                >
                  <Navigation className="size-3.5 text-brand-deep" />
                  GPS Pin
                </button>
                <button
                  type="submit"
                  disabled={isCheckingSvc || pincodeInput.length !== 6}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-deep px-4 py-3.5 text-xs font-bold text-white shadow-md active:scale-95 disabled:opacity-50"
                >
                  {isCheckingSvc ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Confirm Pincode"
                  )}
                </button>
              </div>
            </form>
          </BottomSheetLayout>
        </div>
      ) : (
        children
      )}
    </NativeShellContext.Provider>
  );
}
