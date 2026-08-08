import { triggerHaptic } from "./haptics";

export interface ScanResult {
  content: string;
  format?: string;
}

export async function checkScannerPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { BarcodeScanner } = await (import("@capacitor/barcode-scanner" as any) as Promise<any>);
    const status = await BarcodeScanner.requestPermissions();
    return status.camera === "granted";
  } catch {
    return false;
  }
}

export async function startBarcodeScan(): Promise<ScanResult | null> {
  if (typeof window === "undefined") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { BarcodeScanner } = await (import("@capacitor/barcode-scanner" as any) as Promise<any>);
    
    // Add transparent style class to body so native camera is visible
    document.body.classList.add("barcode-scanner-active");
    
    // Check if new Capacitor 6+ scan method exists
    if (typeof BarcodeScanner.scan === "function") {
      const result = await BarcodeScanner.scan();
      document.body.classList.remove("barcode-scanner-active");
      if (result.barcodes && result.barcodes.length > 0) {
        void triggerHaptic("medium");
        return {
          content: result.barcodes[0].rawValue,
          format: result.barcodes[0].format,
        };
      }
      return null;
    }
    
    // Fallback to older community startScan API
    if (typeof BarcodeScanner.startScan === "function") {
      const result = await BarcodeScanner.startScan();
      document.body.classList.remove("barcode-scanner-active");
      if (result && result.hasContent) {
        void triggerHaptic("medium");
        return {
          content: result.content,
        };
      }
      return null;
    }
    
    document.body.classList.remove("barcode-scanner-active");
    return null;
  } catch {
    document.body.classList.remove("barcode-scanner-active");
    return null;
  }
}

export async function stopBarcodeScan(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { BarcodeScanner } = await (import("@capacitor/barcode-scanner" as any) as Promise<any>);
    if (typeof BarcodeScanner.stopScan === "function") {
      await BarcodeScanner.stopScan();
    }
    document.body.classList.remove("barcode-scanner-active");
  } catch {}
}
