# Live driver tracking — architecture, not implementation

*22 September 2026. Design only, per owner instruction. Nothing in this document is
built. No Firestore, no Navigation SDK, no Routes API call, no driver-facing
application has been created. `docs/DECISIONS.md` DEC-020 records why this now
exists despite `CLAUDE.md`'s "Do Not Build Yet" list still naming live GPS
driver tracking.*

## Why this is a document and not a PR

Section D of the location work asked one question first: **does real driver
location telemetry exist today?** A repository, schema and documentation search —
`driver`, `courier`, `rider`, `assignment`, `latitude`, `longitude`, `tracking`,
`dispatch` — found:

- `Driver` (`prisma/schema.prisma`): `id`, `name`, `phone`, `isActive`. A dispatch
  **contact**, not an authenticated actor. No password, no token, no session.
- `Shipment.driverId` / `Shipment.vehicleId`: who is assigned, set at dispatch.
  No location field on either model.
- `Vehicle`: `registration`, `kind`. No telemetry.
- `Warehouse`: `city`, `pincode`. No exact coordinates.
- No table, column, queue, webhook or third-party integration anywhere carries a
  moving coordinate.

**Conclusion: zero driver-location telemetry exists.** A customer-facing map with
a driver marker would therefore have nothing real to plot. `screens/order/index.tsx`
now renders the customer's own confirmed delivery pin plus the honest shipment
state (`lib/delivery-location.ts:trackingMessage`) and nothing else — no marker,
no route, no ETA countdown. That is Phase D, and it is built. Everything below is
Phase E: what would have to exist for Phase F to be honest instead of fake.

## The four things a real system needs, in order

### 1. An authenticated driver

`Driver` today cannot log in. Nothing can attribute a location update to a real,
verified person, which means nothing can authorize one either. This has to be
solved before anything else — it is not an implementation detail, it is the
security boundary.

**Two shapes, not evaluated to a recommendation here because it is entangled with
the operating-model decision in the next section:**

- **Firebase Auth, phone OTP** — reuses the identity system the customer app
  already has. A `Driver` row gains a `firebaseUid`, exactly parallel to `User`.
  Cheapest to build; the existing `verifyIdToken` / `resolveApiIdentity` path
  extends almost unchanged.
- **A short-lived signed dispatch token**, issued by an ops action when a
  shipment is assigned, scoped to that one shipment, expiring when the shipment
  closes. No driver account at all. Simpler for a driver who does not want to
  "sign in" to anything, weaker if a token leaks (bounded blast radius, but no
  revocation-by-identity).

### 2. A driver-facing surface that can hold a GPS permission open

Something has to run on the driver's device, ask for location, and send it
somewhere, while the driver is actively delivering. Three shapes:

| Shape | What it is | Reliability while driving | Cost to build |
|---|---|---|---|
| **A. Browser tab in the ops console** | Existing admin/ops surface gains a driver view; `navigator.geolocation.watchPosition` while the tab is open | Poor. Mobile browsers suspend background/locked-screen tabs; a driver who locks their phone or switches apps stops sending updates with no warning | Lowest — no new app, no store listing, no EAS build |
| **B. A "driver mode" inside the existing Expo customer app**, gated by a role check | Reuses `expo-location`, already integrated; a driver signs in with a role that unlocks a delivery screen instead of the shop | Better — a foreground `expo-location` service survives the screen being on and the app foregrounded, but not a locked screen or a backgrounded app, and this document does **not** propose background location for drivers without a separate decision (see below) | Moderate — new screens, a role field, careful UI separation from the customer experience so a driver never accidentally sees or edits customer catalogue state |
| **C. A separate, dedicated driver application** | Its own Expo project, its own store listing (or internal distribution — Android supports installing an unlisted APK directly, sidestepping Play Store review for an internal fleet app) | Best — a purpose-built app can request the delivery-specific permission grant, run a foreground service with a persistent notification ("Delivering shipment #1234"), and nothing about it is shaped by customer-app constraints | Highest — a second app to build, sign, version and support |

**This is the owner decision named explicitly in the location brief: "choosing a
driver operating model" and "approving a new driver application."** Nothing here
picks one. The engineering recommendation, if asked, is **B for a first cut**
(reuses existing auth, existing location code, existing EAS project — no new app
to stand up) with **C as the natural graduation point** once driver count or
delivery volume makes a dedicated app's isolation and reliability worth the extra
maintenance surface.

**Background location.** Every shape above assumes **foreground only** — a driver
app open and on screen, matching the customer-side rule in `device-location.ts`.
Requesting Android's `ACCESS_BACKGROUND_LOCATION` or iOS's Always permission for
drivers is its own owner decision (the location brief calls this out explicitly:
"Never request background location... unless a real requirement later proves it
necessary"). It is not assumed or designed for here.

### 3. Where a location update goes, and how a customer reads it back

**Do not introduce Firestore.** The commerce source of truth is PostgreSQL via
Supabase, and DEC-014 already settled that; a moving-coordinate feed is
operationally trivial next to inventory or payment correctness, and splitting it
into a second database buys nothing except a second thing to keep consistent and
secure.

**Proposed shape — additive, inside the existing schema:**

```prisma
model DriverPing {
  id          String   @id @default(uuid()) @db.Uuid
  shipmentId  String   @map("shipment_id") @db.Uuid
  driverId    String   @map("driver_id") @db.Uuid
  latitude    Float
  longitude   Float
  recordedAt  DateTime @default(now()) @map("recorded_at")
  shipment    Shipment @relation(fields: [shipmentId], references: [id], onDelete: Cascade)
  driver      Driver   @relation(fields: [driverId], references: [id])

  @@index([shipmentId, recordedAt])
  @@map("driver_pings")
}
```

One row per update, not an update-in-place column, so a delivery's path is
reconstructable for dispute resolution ("the driver was never near my address")
without extra design work later — and old rows for closed shipments can be
pruned on a schedule once retention policy exists, which is a housekeeping
decision, not an architectural one.

**Write path:** `POST /api/v1/driver/location` (or an ops-console equivalent),
authenticated as the driver, authorized against **their own currently assigned,
`dispatched`/`out_for_delivery` shipment only** — never an arbitrary shipment ID
the client supplies unchecked. Reject once the shipment reaches `delivered` or
`cancelled`; that is precisely "delivery completion stops tracking."

**Read path — two options, in order of how much they cost to build:**

1. **Polling.** The customer's tracking screen, while genuinely open and the
   shipment is `out_for_delivery`, calls `GET /api/v1/orders/:orderNo/tracking`
   every 10–15 seconds. The route re-checks order ownership every call (the same
   check `handleGetOrder` already does), returns the latest `DriverPing` for that
   shipment, and the poll stops the moment the screen closes or the shipment
   leaves `out_for_delivery`. No new infrastructure — it is a `SELECT` behind an
   existing authenticated route.
2. **Supabase Realtime.** Postgres's own logical replication, exposed by
   Supabase, lets a client subscribe to `INSERT`s on `driver_pings` filtered to
   one `shipmentId`, so the marker updates the instant a row lands rather than on
   the next poll tick. It is **not Firestore** — it is a subscription layer on
   the same Postgres table — so it does not violate DEC-014's "commerce stays in
   Supabase" boundary; it is an upgrade to *how the same data is delivered*, not
   a change in *where it lives*. It needs the client SDK's Realtime channel wired
   into the mobile app and, because `driver_pings` would sit behind RLS like every
   other customer-reachable row, a policy that scopes a subscription to the
   requesting customer's own order.

**Recommendation: start with polling.** A shipment moving across Srinagar does
not need sub-second updates — a customer watching a 10–15 second-old dot is a
completely normal delivery-app experience, and polling costs nothing to add
beyond the endpoint and query above. Move to Realtime only if driver volume or a
concrete customer complaint about staleness justifies the extra subscription
plumbing and RLS policy work. Neither Google Maps Mobility/Fleet Engine is
justified at this scale — that product is priced and built for large,
route-optimizing fleets, not a first live-tracking cut for one city.

### 4. Route and ETA — only once step 3 exists

Once a real `DriverPing` exists, the customer experience described in the brief
— "driver location → customer location → route/polyline → traffic-aware ETA" —
becomes possible, and only then. It needs:

- **Routes API** (`routes.googleapis.com`) enabled — **not enabled today**;
  confirmed absent from the project's enabled-services list. A new,
  server-restricted key (`VE server — Routes`, matching the existing
  `ve-server-geocoding` / `ve-server-places` naming and restriction pattern)
  would call `computeRoutes` with the latest driver ping and the order's
  confirmed delivery coordinate, server-side, never from the device — the same
  reason geocoding and Places already go through the server.
- **A clear split from `promisedAt`.** The order screen already keeps "the
  delivery promise" (`etaMinutes`, quoted at checkout) and "what tracking says"
  as separate concepts on separate lines; a Routes-derived ETA would render
  next to, never in place of, the promised time. This document does not propose
  overwriting one with the other, and neither should any future implementation.
- **Caching discipline.** A route call on every marker update is the "recompute
  a route every second" anti-pattern the brief explicitly warns against. Recompute
  only when the driver's position has moved meaningfully (e.g. >150 m) or a fixed
  interval (e.g. every 60–90 seconds) has elapsed since the last call — whichever
  is coarser — not on every `DriverPing` insert.

**Navigation SDK is out of scope for the customer app entirely** — it is a
driver-side, turn-by-turn concern, and even there the brief's own comparison
holds: a driver app can launch Google Maps externally for navigation while
separately sending authorized location pings, which is far simpler than
embedding Navigation SDK, and should be the default assumption unless a concrete
product reason (e.g. needing in-app arrival events tied to navigation state)
justifies the added native complexity and licensing.

## What Phase F would actually require, end to end

```
Owner picks a driver operating model (B or C above)
        │
Driver auth mechanism built (§1)
        │
Driver-facing location screen/app built, foreground-only (§2)
        │
`driver_pings` migration + write endpoint, shipment-scoped authorization (§3)
        │
Customer tracking screen polls (or subscribes to) the same shipment (§3)
        │
Routes API enabled, restricted key created, computeRoutes wired server-side,
cached, kept separate from `promisedAt` (§4)
        │
Order-detail "Track delivery" card gains a driver marker and route line —
ONLY once a real ping exists for that shipment, falling back to today's
truthful no-marker state the moment pings stop (delivery completed, driver
app closed, connectivity lost)
```

Every box above is new work; none of it is built by this document. The nearest
useful next increment, if the owner picks an operating model, is §1 + §3 (driver
auth and the ping table/endpoint) — the customer side already has the map and
the honest-state rendering it would attach to.

## What this explicitly does not do

- Does not create a `driver_pings` table, migration, or endpoint.
- Does not enable the Routes API or create a Routes-restricted key.
- Does not add a driver-facing screen, role, or application.
- Does not request background location for anyone.
- Does not touch `Driver`, `Shipment`, or any other model.

All of it stays proposed until the owner decisions above are made.
