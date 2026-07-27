# Mobile apps (iOS + Android) — Capacitor setup

The native apps are **Capacitor** shells that load the live production site
(`https://new-virticalexpress.vercel.app`). Because the web app uses Next.js
SSR + Server Actions (not static export), the shell loads the remote URL — so
auth, checkout, GST, and all server actions keep working, and every screen is
**pixel-identical to the web app**. Only the app icon and splash are native.

- App name: **Vertical Express**
- App ID (bundle id): **`com.verticalexpress.app`** — set before first store submission; changing it later means re-registering the app in both stores.
- Config: [`capacitor.config.ts`](../capacitor.config.ts)
- Brand: bg `#fcbd00`, navy `#0f2138`, ink `#0a0a0a`, font Karla.

## Already done (in-repo, no toolchain needed)
- Installed `@capacitor/core`, `cli`, `ios`, `android`.
- `capacitor.config.ts` (loads prod URL, brand splash).
- Fallback offline shell: `mobile-shell/index.html`.
- npm scripts: `cap:add:ios`, `cap:add:android`, `cap:sync`, `cap:ios`, `cap:android`.

## Prerequisites — YOU must do these (they need your accounts / large installs)

### Accounts
- **Apple Developer Program** — $99/year. Required to build on a device + publish to the App Store. https://developer.apple.com/programs/
- **Google Play Console** — $25 one-time. Required to publish to the Play Store. https://play.google.com/console/signup

### Tooling on this Mac (none currently installed)
- **Xcode** (iOS) — install from the Mac App Store (~10 GB). Then run once: `xcode-select --install` and open Xcode to accept the license.
- **CocoaPods** (iOS deps) — `sudo gem install cocoapods` (or `brew install cocoapods`).
- **Android Studio** (Android) — https://developer.android.com/studio — includes the Android SDK. During setup install an SDK Platform + Build-Tools + a virtual device.
- **JDK 17** (Android builds) — bundled with recent Android Studio, or `brew install openjdk@17`.

### Info I need from you
- Confirm app name (`Vertical Express`) and app ID (`com.verticalexpress.app`), or give preferred values.
- **Support email** (shown in store listings).
- **Privacy policy URL** — both stores require one. (Your site needs a `/privacy` page; I can build it.)
- Whether you want **push notifications** in v1 (adds Firebase for Android + APNs for iOS setup).

## Once the tooling is installed — the build steps
```bash
cd "/Users/areebsmac/Claude- Training/homerun-clone"
npm run cap:add:ios       # generates ios/ project (needs Xcode + CocoaPods)
npm run cap:add:android   # generates android/ project (needs Android SDK)
npm run cap:sync          # copies config + plugins into both
npm run cap:ios           # opens Xcode → run on simulator/device
npm run cap:android       # opens Android Studio → run on emulator/device
```

## App icon + splash
Generated from the brand (`#fcbd00`) with `@capacitor/assets` from a single
1024×1024 source. I'll produce the source and wire this once platforms exist.

## App Store review note
This is a full commerce app (catalog, cart, COD checkout, accounts) — not a
"thin wrapper" — so it meets Apple's minimum-functionality bar. Native push +
splash + icon further strengthen the submission.
