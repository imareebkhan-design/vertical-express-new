import { triggerHaptic } from "./haptics";

export async function checkSpeechPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { SpeechRecognition } = await (import("@capacitor-community/speech-recognition" as any) as Promise<any>);
    const status = await SpeechRecognition.hasPermission();
    if (!status.permission) {
      const req = await SpeechRecognition.requestPermission();
      return !!req.permission;
    }
    return true;
  } catch {
    return false;
  }
}

export async function startListening(onResult: (text: string) => void): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { SpeechRecognition } = await (import("@capacitor-community/speech-recognition" as any) as Promise<any>);
    
    // Request permission if not checked
    const hasPerm = await checkSpeechPermission();
    if (!hasPerm) {
      throw new Error("Speech permission denied");
    }

    await SpeechRecognition.start({
      language: "en-IN",
      partialResults: false,
      popup: false,
    });
    
    void triggerHaptic("medium");

    // listen to speech recognition results
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition.addListener("partialResults", (data: any) => {
      if (data.matches && data.matches.length > 0) {
        onResult(data.matches[0]);
      }
    });
  } catch {
    // Fallback to web SpeechRecognition if available
    const SpeechRecognitionWeb =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognitionWeb) {
      const recognition = new SpeechRecognitionWeb();
      recognition.lang = "en-IN";
      recognition.continuous = false;
      recognition.interimResults = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        const text = event.results[0]?.[0]?.transcript;
        if (text) {
          void triggerHaptic("light");
          onResult(text);
        }
      };
      recognition.start();
    } else {
      throw new Error("Speech recognition not supported on this platform.");
    }
  }
}

export async function stopListening(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { SpeechRecognition } = await (import("@capacitor-community/speech-recognition" as any) as Promise<any>);
    await SpeechRecognition.stop();
  } catch {
    // Fallback stop is automatic for single-shot web speech recognition
  }
}
