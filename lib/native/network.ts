/** Native Network Status service wrapper. */

export interface NetworkState {
  connected: boolean;
  connectionType: string;
}

export async function getNetworkStatus(): Promise<NetworkState> {
  if (typeof window === "undefined") return { connected: true, connectionType: "wifi" };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Network } = await (import("@capacitor/network" as any) as Promise<any>);
    const status = await Network.getStatus();
    return {
      connected: status.connected,
      connectionType: status.connectionType,
    };
  } catch {
    return {
      connected: typeof navigator !== "undefined" ? navigator.onLine : true,
      connectionType: "unknown",
    };
  }
}
