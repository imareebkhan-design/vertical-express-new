# Mobile Product Direction — Vertical Express

*Recorded now so it is not forgotten. **No technology decision is being made in this
document.***

---

## The requirement

Vertical Express ultimately requires:

```
        WEB APPLICATION
              +
      MOBILE APPLICATION
              +
   SHARED COMMERCE BACKEND
```

Not two products. One commerce system with two clients.

## Why this matters now, before any mobile work starts

The primary customer is a contractor or tradesperson on a mid-tier Android phone,
standing on a construction site. Mobile is not a secondary surface — it is the surface.
Repeat ordering, which is the whole business, happens from a phone.

## The non-negotiable constraint

**The mobile application must NEVER independently implement:**

| | Why |
|---|---|
| **Pricing** | Two implementations diverge, and the divergence is discovered when a customer is charged a different price on the app than on the web |
| **Inventory** | Client-side stock logic cannot be race-free; overselling follows |
| **Serviceability** | A delivery promise computed on-device is a promise nobody can honour |
| **Checkout calculations** | Totals, tax, delivery fee and discount must have exactly one source |
| **Order truth** | The server decides what an order is and what state it is in |
| **Payment truth** | The payment provider's webhook is authoritative — a mobile client cannot confirm a payment |

All of the above stay **server-side and shared**. The mobile client sends intent
(`variantId`, `qty`, `pincode`, `addressId`) and renders what the server returns.

This is already the architecture on web — `CartItem` stores no price, `getCartSummary()`
resolves the bulk ladder on every read, serviceability comes from the database. The
mobile client must inherit that discipline, not work around it.

## What this implies for engineering today

Business logic lives in `lib/services/*`, framework-free and free of React. Server
Actions are thin wrappers over it, not a home for it. **Any commerce logic written into a
React component or into an action body is a future mobile blocker** — and should be
rejected in review on those grounds alone.

## Current state in the repository

Capacitor 8.4.2 is scaffolded — `capacitor.config.ts`, `mobile-shell/index.html`,
`@capacitor/ios`, `@capacitor/android`, and `cap:*` npm scripts. **No `ios/` or `android/`
project has been generated and no application has been published.**

Meanwhile the live site displays App Store and Google Play badges linking to `#`. That is
a false availability claim and must be removed (ISS-008) until an app genuinely exists.

## The decision that was deferred — now made

> **Superseded 31 Aug 2026 by DEC-019.** The owner has chosen **Expo, built through EAS**,
> shipping first as a **WebView shell** over the deployed web app. The section below is
> kept as the reasoning that was in force beforehand; it is history, not current guidance.
>
> Two of the three preconditions listed below were **not** met when the decision was
> taken: core commerce is not stabilised (ISS-001 to ISS-005 are open) and there is no
> usage data. The API-readiness point was answered rather than waited on — the absence of
> an HTTP surface is precisely why the first release is a shell and not a native client.

**Capacitor vs React Native/Expo vs Flutter vs PWA had NOT been decided at the time of
writing.**

Capacitor being already scaffolded is a data point, not a decision. Each option carries
real trade-offs — native feel, plugin ecosystem, code sharing with the existing Next.js
app, build and release overhead for a very small team, and ongoing maintenance of a second
codebase.

**This decision will be made after:**

1. **Core commerce stabilisation** (Stages 1–5) — building a client against a backend with
   four known correctness defects, a fictional catalog and no fulfilment loop means
   building against a moving target and discarding the work.
2. **Mobile API readiness analysis** (Stage 6) — the shape of the API surface materially
   affects which client technology is the right fit.
3. **Real usage data** — whether app-installed users convert or retain better than mobile
   web. That data does not exist yet because there are no users.

## What would change the recommendation

| Signal | Implication |
|---|---|
| Mobile web retention is strong | A PWA or a thin Capacitor shell is sufficient; defer native further |
| Customers explicitly ask for an app / distrust a web-only business | Ship the fastest credible shell — Capacitor, already scaffolded |
| Push notifications drive measurable reorder | Native shell justified; invest properly |
| A distinct driver application is needed | Reconsider the whole mobile strategy — the driver app has different requirements (background location, offline, camera) than the customer app |

## Recorded position

> Mobile is a **requirement**, not an aspiration. The architecture is already being built
> to support it.

**Current position (31 Aug 2026, DEC-019).** The technology choice is **closed**: Expo via
EAS, WebView shell first, in `mobile/`. The non-negotiable constraint at the top of this
document is unchanged and is satisfied trivially by a shell — it computes no price, no
stock, no delivery promise, and holds no order or payment state. A native React Native
client remains a later question, and its prerequisite is the HTTP API layer, not the app.
