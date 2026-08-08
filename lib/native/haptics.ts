/** Native Haptics service wrapper for Capacitor touch feedback. */

export type HapticImpactPattern = "light" | "medium" | "heavy";

export async function triggerHaptic(impact: HapticImpactPattern = "light"): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { Haptics, ImpactStyle } = await (import("@capacitor/haptics" as any) as Promise<any>);
      const style =
        impact === "heavy"
          ? ImpactStyle.Heavy
          : impact === "medium"
          ? ImpactStyle.Medium
          : ImpactStyle.Light;

      await Haptics.impact({ style });
    } else if ("vibrate" in navigator) {
      const ms = impact === "heavy" ? 30 : impact === "medium" ? 20 : 10;
      navigator.vibrate(ms);
    }
  } catch {
    // Fall back gracefully
  }
}
