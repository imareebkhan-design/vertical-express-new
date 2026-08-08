/** Native Biometrics (TouchID / FaceID / Fingerprint) auth wrapper. */

export interface BiometricAvailability {
  available: boolean;
  biometryType?: "touchId" | "faceId" | "fingerprint" | "none";
}

export async function checkBiometrics(): Promise<BiometricAvailability> {
  if (typeof window === "undefined") return { available: false, biometryType: "none" };

  try {
    const { NativeBiometric } = await import("@capawesome/capacitor-biometric-auth" as string);
    const result = await NativeBiometric.isAvailable();
    return {
      available: result.isAvailable,
      biometryType: result.biometryType || "none",
    };
  } catch {
    return { available: false, biometryType: "none" };
  }
}

export async function authenticateBiometrics(reason = "Unlock Vertical Express"): Promise<boolean> {
  if (typeof window === "undefined") return false;

  try {
    const { NativeBiometric } = await import("@capawesome/capacitor-biometric-auth" as string);
    await NativeBiometric.verifyIdentity({
      reason,
      title: "Biometric Authentication",
      subtitle: "Verify your identity to proceed",
    });
    return true;
  } catch {
    return false;
  }
}
