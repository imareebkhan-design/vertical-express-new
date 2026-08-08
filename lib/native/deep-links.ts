/** Native Deep Links wrapper for universal links & scheme routing. */

export function listenToDeepLinks(onDeepLinkReceived: (url: string) => void): () => void {
  if (typeof window === "undefined") return () => {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cap = (window as any).Capacitor;
  const App = cap?.Plugins?.App;

  if (App) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listener = App.addListener("appUrlOpen", (event: any) => {
      onDeepLinkReceived(event.url);
    });
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      listener.then((l: any) => l.remove());
    };
  }

  return () => {};
}
