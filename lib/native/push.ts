/** Native Push Notifications service wrapper. */

export interface PushTokenPayload {
  token: string;
}

export async function requestPushPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { PushNotifications } = await (import("@capacitor/push-notifications" as any) as Promise<any>);
    const status = await PushNotifications.requestPermissions();
    if (status.receive === "granted") {
      await PushNotifications.register();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function listenToPushNotifications(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onNotificationReceived: (notification: any) => void
): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { PushNotifications } = await (import("@capacitor/push-notifications" as any) as Promise<any>);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await PushNotifications.addListener("pushNotificationReceived", (notification: any) => {
      onNotificationReceived(notification);
    });
  } catch {
    // Non-native fallback
  }
}

export async function setBadgeCount(count: number): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { PushNotifications } = await (import("@capacitor/push-notifications" as any) as Promise<any>);
    if (typeof PushNotifications.setBadge === "function") {
      await PushNotifications.setBadge({ badge: count });
    }
  } catch {}
}

