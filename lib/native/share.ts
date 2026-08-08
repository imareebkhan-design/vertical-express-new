export interface SharePayload {
  title: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
}

export async function shareContent(payload: SharePayload): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Share } = await (import("@capacitor/share" as any) as Promise<any>);
    const canShare = await Share.canShare();
    if (canShare.value) {
      await Share.share({
        title: payload.title,
        text: payload.text,
        url: payload.url,
        dialogTitle: payload.dialogTitle || "Share Vertical Express",
      });
      return true;
    }
    return false;
  } catch {
    // Web fallback
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: payload.title,
          text: payload.text,
          url: payload.url,
        });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}
