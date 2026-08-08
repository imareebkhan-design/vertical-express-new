/** Native GPS Geolocation service wrapper. */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export async function getCurrentCoordinates(): Promise<Coordinates | null> {
  if (typeof window === "undefined") return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Geolocation } = await (import("@capacitor/geolocation" as any) as Promise<any>);
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch {
    return new Promise((resolve) => {
      if (!("geolocation" in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 10000 }
      );
    });
  }
}
