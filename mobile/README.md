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

The canonical production domain is **not yet decided** — the repository currently
references `verticalexpress.app`, `.co`, `.com`, `.dev` and `.in` in different files
(ISS-018). Confirm it with the owner before producing a store build.

- **Local:** copy `.env.example` to `.env` and fill it in.
- **EAS:** set it as an environment variable on the EAS project at expo.dev. Do not commit it.

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
3. Replace `assets/icon.png` and the adaptive-icon layers — they are still Expo's template
   artwork, not Vertical Express branding.
4. Confirm the `app.json` `slug` (`vertical-express`) matches the slug of EAS project
   `fb9abf0f-301b-49f4-a8ad-c79fcae2b5b3` on expo.dev; a mismatch fails the build.
5. Fix the open commerce defects first. A shell shipped today ships the ISS-001 GST
   overcharge and the ISS-002 dummy gateway to a second surface.
