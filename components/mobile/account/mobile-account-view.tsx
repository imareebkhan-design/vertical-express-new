"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  User,
  Package,
  MapPin,
  Wallet,
  Bell,
  Fingerprint,
  Moon,
  Info,
  LogOut,
  ChevronRight,
  LifeBuoy,
  RefreshCw,
  WifiOff,
  Heart,
} from "lucide-react";
import { signOut } from "@/actions/auth";
import { triggerHaptic } from "@/lib/native/haptics";
import { checkBiometrics } from "@/lib/native/biometrics";
import { BottomSheetLayout } from "../bottom-sheet-layout";
import { cn } from "@/lib/utils";

interface MobileAccountViewProps {
  ordersCount: number;
  addressesCount: number;
  wishlistCount: number;
  email: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recentOrders: any[];
}

export function MobileAccountView({
  ordersCount,
  addressesCount,
  wishlistCount,
  email,
  recentOrders,
}: MobileAccountViewProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loggingOut, startLogout] = useTransition();

  // Settings states
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Network Offline checker
  const [isOffline, setIsOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Check biometrics availability
    checkBiometrics().then((res) => {
      setBiometricsAvailable(res.available);
    });

    if (typeof window !== "undefined") {
      setNotificationsEnabled(localStorage.getItem("ve_notifications_enabled") !== "false");
      setBiometricsEnabled(localStorage.getItem("ve_biometric_enabled") === "true");
      setDarkModeEnabled(localStorage.getItem("ve_dark_mode_enabled") === "true");
      
      // Setup online/offline listeners
      setIsOffline(!navigator.onLine);
      const goOnline = () => setIsOffline(false);
      const goOffline = () => setIsOffline(true);
      window.addEventListener("online", goOnline);
      window.addEventListener("offline", goOffline);
      return () => {
        window.removeEventListener("online", goOnline);
        window.removeEventListener("offline", goOffline);
      };
    }
  }, []);

  const handleNotificationToggle = async () => {
    triggerHaptic("light");
    const nextState = !notificationsEnabled;
    if (nextState) {
      try {
        const { requestPushPermission } = await import("@/lib/native/push");
        const granted = await requestPushPermission();
        if (!granted) {
          alert("Push notification permissions denied. Please enable them in system settings.");
          setNotificationsEnabled(false);
          localStorage.setItem("ve_notifications_enabled", "false");
          return;
        }
      } catch {
        // Fallback for non-native context
      }
    }
    setNotificationsEnabled(nextState);
    localStorage.setItem("ve_notifications_enabled", nextState ? "true" : "false");
  };

  const handleBiometricToggle = async () => {
    triggerHaptic("light");
    const nextState = !biometricsEnabled;
    if (nextState) {
      try {
        const { checkBiometrics, authenticateBiometrics } = await import("@/lib/native/biometrics");
        const bio = await checkBiometrics();
        if (!bio.available) {
          alert("Biometrics are not available or configured on this device.");
          setBiometricsEnabled(false);
          localStorage.setItem("ve_biometric_enabled", "false");
          return;
        }
        const verified = await authenticateBiometrics("Verify identity to enable lock");
        if (!verified) {
          setBiometricsEnabled(false);
          localStorage.setItem("ve_biometric_enabled", "false");
          return;
        }
      } catch {
        // Fallback for non-native context
      }
    }
    setBiometricsEnabled(nextState);
    localStorage.setItem("ve_biometric_enabled", nextState ? "true" : "false");
  };

  const handleDarkModeToggle = () => {
    triggerHaptic("light");
    const nextState = !darkModeEnabled;
    setDarkModeEnabled(nextState);
    localStorage.setItem("ve_dark_mode_enabled", nextState ? "true" : "false");
  };

  const handleLogout = () => {
    triggerHaptic("medium");
    startLogout(async () => {
      await signOut();
      router.push("/");
      router.refresh();
    });
  };

  const handlePullToRefresh = () => {
    triggerHaptic("medium");
    setRefreshing(true);
    router.refresh();
    setTimeout(() => {
      setRefreshing(false);
      triggerHaptic("light");
    }, 1000);
  };

  if (!mounted) {
    return <div className="min-h-screen bg-surface" />;
  }

  // Derive mock notifications from orders list
  const mockNotifications = recentOrders.map((o) => {
    let title = `Order #${o.orderNo} Update`;
    let body = `Your order status is now ${o.status}.`;
    if (o.status === "confirmed") {
      title = `Order #${o.orderNo} Confirmed!`;
      body = `Vertical Express has accepted your order. Delivering soon!`;
    } else if (o.status === "delivered") {
      title = `Order #${o.orderNo} delivered`;
      body = `Cashback reward of 5% has been added to your wallet balance.`;
    }
    return {
      id: o.id,
      title,
      body,
      time: new Date(o.placedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    };
  });

  return (
    <div className="flex flex-col min-h-screen bg-surface pb-28 overflow-x-hidden">
      {/* Offline Status Bar */}
      {isOffline && (
        <div className="bg-danger text-white text-[10px] font-extrabold py-2 px-4 flex items-center justify-center gap-1.5 animate-pulse sticky top-0 z-50">
          <WifiOff className="size-3.5" />
          <span>You are currently offline. Checking network connectivity...</span>
        </div>
      )}

      {/* Sticky Native Header */}
      <div className="native-header sticky top-0 z-30 flex items-center justify-between border-b border-mist/20 bg-surface/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top,12px)+6px)] backdrop-blur-md shadow-xs">
        <h1 className="text-base font-extrabold text-ink leading-none">My Profile</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              triggerHaptic("light");
              setIsNotificationsOpen(true);
            }}
            className="relative flex size-8 items-center justify-center rounded-full bg-mist/20 text-ink active:bg-mist/35"
            title="Notifications"
          >
            <Bell className="size-4" />
            {notificationsEnabled && mockNotifications.length > 0 && (
              <span className="absolute right-1 top-1 size-2 rounded-full bg-danger" />
            )}
          </button>
          <button
            onClick={handlePullToRefresh}
            className={cn(
              "flex size-8 items-center justify-center rounded-full bg-mist/20 text-ink active:bg-mist/35",
              refreshing ? "animate-spin text-brand-deep" : ""
            )}
          >
            <RefreshCw className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Profile Info Card */}
      <div className="p-4 space-y-4">
        <div className="rounded-2xl border border-mist/15 bg-white p-5 shadow-2xs flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-full bg-brand-deep/15 text-brand-deep">
            <User className="size-7" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-ink leading-none capitalize">
              {email ? email.split("@")[0] : "VE Builder"}
            </h2>
            <p className="text-[11px] text-ink/40 font-semibold mt-1.5 truncate">
              {email || "ve-user@example.com"}
            </p>
          </div>
        </div>

        {/* Counter cards linking to account paths */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            icon={Package}
            label="Orders"
            value={String(ordersCount)}
            onClick={() => {
              triggerHaptic("light");
              router.push("/account/orders");
            }}
          />
          <StatCard
            icon={MapPin}
            label="Addresses"
            value={String(addressesCount)}
            onClick={() => {
              triggerHaptic("light");
              router.push("/account/addresses");
            }}
          />
          <StatCard
            icon={Wallet}
            label="Wallet"
            value="History"
            onClick={() => {
              triggerHaptic("light");
              router.push("/account/wallet");
            }}
          />
        </div>

        {/* Activity block */}
        <div className="rounded-2xl border border-mist/15 bg-white shadow-2xs divide-y divide-mist/10 overflow-hidden">
          <h3 className="p-4 text-[10px] font-extrabold uppercase tracking-wider text-ink/35 leading-none bg-surface/30">
            My Activity
          </h3>
          <Link
            href="/account/wishlist"
            onClick={() => triggerHaptic("light")}
            className="w-full text-left p-4 flex items-center justify-between active:bg-mist/5 block"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-pink-50 text-pink-600">
                <Heart className="size-4.5" />
              </div>
              <div>
                <p className="text-xs font-bold text-ink">My Wishlist</p>
                <p className="text-[9px] text-ink/50 font-semibold mt-0.5">
                  {wishlistCount} saved item{wishlistCount !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <ChevronRight className="size-4 text-ink/30" />
          </Link>
        </div>

        {/* Account settings block */}
        <div className="rounded-2xl border border-mist/15 bg-white shadow-2xs divide-y divide-mist/10 overflow-hidden">
          <h3 className="p-4 text-[10px] font-extrabold uppercase tracking-wider text-ink/35 leading-none bg-surface/30">
            App Settings
          </h3>

          {/* Notifications Toggle */}
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <Bell className="size-4.5" />
              </div>
              <div>
                <p className="text-xs font-bold text-ink">Push Notifications</p>
                <p className="text-[9px] text-ink/50 font-semibold mt-0.5">Order updates & wallet alerts</p>
              </div>
            </div>
            <button
              onClick={handleNotificationToggle}
              className={cn(
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                notificationsEnabled ? "bg-brand-deep" : "bg-mist/35"
              )}
            >
              <span
                className={cn(
                  "inline-block size-3.5 transform rounded-full bg-white transition-transform",
                  notificationsEnabled ? "translate-x-4.5" : "translate-x-1"
                )}
              />
            </button>
          </div>

          {/* Biometric Toggle if Available */}
          {biometricsAvailable && (
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                  <Fingerprint className="size-4.5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-ink">Biometric App Lock</p>
                  <p className="text-[9px] text-ink/50 font-semibold mt-0.5">Secure launch lock screen</p>
                </div>
              </div>
              <button
                onClick={handleBiometricToggle}
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                  biometricsEnabled ? "bg-brand-deep" : "bg-mist/35"
                )}
              >
                <span
                  className={cn(
                    "inline-block size-3.5 transform rounded-full bg-white transition-transform",
                    biometricsEnabled ? "translate-x-4.5" : "translate-x-1"
                  )}
                />
              </button>
            </div>
          )}

          {/* Dark Mode Toggle */}
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                <Moon className="size-4.5" />
              </div>
              <div>
                <p className="text-xs font-bold text-ink">Dark Mode (Beta)</p>
                <p className="text-[9px] text-ink/50 font-semibold mt-0.5">Toggle interface design theme</p>
              </div>
            </div>
            <button
              onClick={handleDarkModeToggle}
              className={cn(
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                darkModeEnabled ? "bg-brand-deep" : "bg-mist/35"
              )}
            >
              <span
                className={cn(
                  "inline-block size-3.5 transform rounded-full bg-white transition-transform",
                  darkModeEnabled ? "translate-x-4.5" : "translate-x-1"
                )}
              />
            </button>
          </div>

          {/* Help & Support */}
          <button
            onClick={() => {
              triggerHaptic("light");
              setIsHelpOpen(true);
            }}
            className="w-full text-left p-4 flex items-center justify-between active:bg-mist/5"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <LifeBuoy className="size-4.5" />
              </div>
              <div>
                <p className="text-xs font-bold text-ink">Help & Support</p>
                <p className="text-[9px] text-ink/50 font-semibold mt-0.5">Contact customer support team</p>
              </div>
            </div>
            <ChevronRight className="size-4 text-ink/30" />
          </button>

          {/* App Version Info */}
          <div className="p-4 flex items-center gap-3 bg-surface/20">
            <div className="flex size-9 items-center justify-center rounded-xl bg-mist/20 text-ink/65">
              <Info className="size-4.5" />
            </div>
            <div>
              <p className="text-xs font-bold text-ink">App Version</p>
              <p className="text-[9px] text-ink/40 font-semibold mt-0.5">Vertical Express Native Shell v1.0.2</p>
            </div>
          </div>
        </div>

        {/* Logout CTA */}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center justify-center gap-2 rounded-2xl border border-danger/35 bg-danger/5 py-4 text-xs font-extrabold text-danger shadow-2xs active:scale-[0.98]"
        >
          <LogOut className="size-4.5" />
          <span>{loggingOut ? "Signing Out..." : "Sign Out Account"}</span>
        </button>
      </div>

      {/* Notifications Inbox overlay BottomSheet */}
      <BottomSheetLayout
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        title="Notifications Inbox"
      >
        <div className="space-y-4 pb-8 max-h-[70vh] overflow-y-auto">
          {!notificationsEnabled || mockNotifications.length === 0 ? (
            <div className="py-12 text-center text-xs font-bold text-ink/45">
              All caught up! No new notifications.
            </div>
          ) : (
            <div className="space-y-3.5">
              {mockNotifications.map((notif) => (
                <div key={notif.id} className="rounded-xl border border-mist/20 p-3 bg-white flex gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-deep/10 text-brand-deep">
                    <Package className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-extrabold text-ink truncate leading-none">
                        {notif.title}
                      </h4>
                      <span className="text-[8px] text-ink/35 font-semibold leading-none">
                        {notif.time}
                      </span>
                    </div>
                    <p className="text-[10px] text-ink/60 font-semibold mt-1.5 leading-relaxed">
                      {notif.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </BottomSheetLayout>

      {/* Help & Support overlay BottomSheet */}
      <BottomSheetLayout
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        title="Help & Support"
      >
        <div className="space-y-4 pb-8">
          <p className="text-xs font-semibold text-ink/75 leading-relaxed">
            Need help with your building materials order? Contact our regional support team in Srinagar directly.
          </p>
          <div className="rounded-xl border border-mist/20 p-4 bg-white space-y-3">
            <div>
              <span className="text-[9px] font-extrabold uppercase text-ink/40">Customer Support Phone</span>
              <p className="text-xs font-extrabold text-ink mt-0.5">+91 94190 12345</p>
            </div>
            <div>
              <span className="text-[9px] font-extrabold uppercase text-ink/40">Support Email</span>
              <p className="text-xs font-extrabold text-ink mt-0.5">support@verticalexpress.com</p>
            </div>
            <div>
              <span className="text-[9px] font-extrabold uppercase text-ink/40">Warehouse Location</span>
              <p className="text-xs font-extrabold text-ink mt-0.5">Rajbagh Industrial Zone, Srinagar, J&K</p>
            </div>
          </div>
        </div>
      </BottomSheetLayout>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl border border-mist/15 bg-white p-4 text-center shadow-2xs active:scale-95 transition-transform w-full"
    >
      <Icon className="mx-auto size-5 text-brand-deep" strokeWidth={1.8} />
      <p className="mt-1.5 text-sm font-extrabold text-ink leading-none">{value}</p>
      <p className="text-[9px] font-extrabold uppercase tracking-wider text-ink/35 mt-1 leading-none">
        {label}
      </p>
    </button>
  );
}
