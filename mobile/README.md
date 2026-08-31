# Vertical Express — Mobile Shell

An Expo application that renders the deployed Vertical Express web app inside a WebView,
so it can be distributed through the App Store and Google Play. See `docs/DECISIONS.md`
DEC-019 for why this shape was chosen.

**This app implements no commerce logic** — no pricing, no inventory, no serviceability,
no totals, no order or payment state. Those are server-side and shared
(`docs/MOBILE_PRODUCT_DIRECTION.md`). Anything added here that computes a price or a
delivery promise is a bug, not a feature.

It is a separate npm workspace: React Native and Next.js cannot share one dependency tree.
Run every command below from `mobile/`, not the repository root. The root `tsconfig.json`
and `eslint.config.mjs` both exclude this directory.

## Configuration

| Variable | Required | Notes |
|---|---|---|
| `EXPO_PUBLIC_SITE_URL` | yes | The https origin the shell loads. |

`app.config.ts` throws if it is missing, malformed, or not https, so a misconfigured build
fails at build time instead of shipping a binary that loads nothing.

**This is already set** — `eas.json` supplies `https://www.verticalexpress.in` to all
three build profiles, the canonical host recorded in ISS-018 and verified serving the
production site. It is deliberately committed rather than stored on expo.dev: `EXPO_PUBLIC_*`
is compiled into the JS bundle and readable from any downloaded APK, so it is not a secret,
and keeping it in the repo makes it reviewable.

Copy `.env.example` to `.env` only if you want to run locally against a different origin.

## Local development

```bash
npm install
npx expo start
```

## Builds

Requires an Expo account. Set `EXPO_TOKEN` in the environment (create one at
expo.dev → Settings → Access tokens) or run `npx eas login`.

```bash
npx eas build --profile production --platform android   # .aab for Play Store
npx eas build --profile production --platform ios       # .ipa for App Store
npx eas build --profile preview --platform android      # .apk for internal testing
```

`eas.json` defines `development`, `preview` and `production`. This project is already
linked to its EAS project via `extra.eas.projectId` in `app.json`, so `eas init` is not
needed. `appVersionSource` is `remote`: EAS owns build numbers, because a dynamic
`app.config.ts` cannot be written back to.

## Before the first store submission

These are not code tasks and are not done:

1. Confirm the canonical domain and set `EXPO_PUBLIC_SITE_URL` (ISS-018).
2. Confirm the Expo account or organisation that owns the EAS project, and add `owner` to
   `app.json` if it belongs to an organisation rather than a personal account.
3. **App icons — needs a designer, not code.** `assets/` is still Expo's template artwork.
   Generating icons from the repo's existing assets was attempted and abandoned: there is
   no vector source, `public/logo-icon.png` is a broken crop that slices through the
   tagline (ISS-038), and in `public/logo.png` the emblem and the "VERTICAL" wordmark
   interlock — the truck's nose sits under the V — so no rectangular crop separates them.
   What is needed from the original artwork: a square emblem-only export, 1024x1024, in
   three forms — opaque for `icon.png` (no rounded corners; iOS masks it itself),
   transparent with the mark inside the centre 66% for `android-icon-foreground.png`, and
   a flat single-colour silhouette for `android-icon-monochrome.png`. Drop them in and
   nothing else needs to change.
4. **Splash image.** The launch screen is configured (`expo-splash-screen`, `#161616` in
   both light and dark) but carries no image, for the same reason. Add `image` to the
   plugin options in `app.json` once the emblem export exists.
5. Confirm the `app.json` `slug` (`vertical-express`) matches the slug of EAS project
   `fb9abf0f-301b-49f4-a8ad-c79fcae2b5b3` on expo.dev; a mismatch fails the build.
6. Fix the open commerce defects first. A shell shipped today ships the ISS-001 GST
   overcharge and the ISS-002 dummy gateway to a second surface.
