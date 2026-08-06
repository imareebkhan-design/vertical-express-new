# Engineering Roadmap — Vertical Express

*Stages, not dates. Each stage has an objective and exit criteria. Do not start a stage
until the previous one's exit criteria are met — except where explicitly parallel.*

**Total to end of Stage 5 (launchable P0A): roughly 3 working weeks of engineering,
plus owner-dependent time for catalog data and provider onboarding.**

---

## STAGE 0 — Context transfer and repository verification

**Objective.** Claude Code has the full architectural and product context, has verified
the repository matches the audit, and can work without re-deriving decisions.

**Work.** Read `CLAUDE.md`, `PROJECT_CONTEXT.md`, `CURRENT_SYSTEM_AUDIT.md`,
`KNOWN_ISSUES.md`, `DECISIONS.md`, `OWNER_INPUT_REQUIRED.md` · clone and install ·
`npx tsc --noEmit` and `npm run lint` to establish a baseline · confirm the schema matches
audit §11 · confirm the four critical defects exist where documented.

**Exit criteria.**
- Baseline typecheck and lint results recorded (including any pre-existing failures)
- ISS-001 through ISS-005 confirmed present at the stated file locations
- No code modified

---

## STAGE 1 — Core commerce stabilisation

**Objective.** The commerce engine is correct and protected. **This stage requires no
owner input and should start immediately.**

**Work.** TASK 001–004 (see the implementation queue): production safety gate on the
dummy gateway · GST calculation mechanics and schema · checkout and payment hardening
(transaction boundary, warehouse scoping, amount verification) · the commerce regression
test suite · CI pipeline · Sentry and uptime · canonical domain fix.

**Exit criteria.**
- `activeGateway()` throws in production without Razorpay keys; test proves it
- GST math is correct and tested across slabs and rounding boundaries (**rates still
  pending from the CA — the engine is parameterised, not hardcoded**)
- No external I/O inside a database transaction
- Inventory decrement always warehouse-scoped; unserviceable pincode cannot produce an order
- Payment capture amount verified against order total
- 50 concurrent checkouts against 10 units sell exactly 10
- Double-submit with one idempotency key produces one order
- Duplicate webhook `event.id` is a provable no-op
- CI green; Sentry receiving events; canonical URLs on the real domain

---

## STAGE 2 — Owner requirements integration

**Objective.** Every invented business value is replaced with a confirmed one, and every
unverified public claim is removed.

**Blocked on:** Owner Decision Gate Round 1.

**Work.** Record answers in `OWNER_INPUT_REQUIRED.md` · apply GST rates and HSN codes ·
set real delivery charges, free-delivery threshold and SLA · set COD limits · strip or
replace all fabricated claims (ISS-008) · write and route the six legal pages (ISS-017) ·
fix contact details and add a real phone number.

**Exit criteria.**
- No hardcoded business value remains in source; all are configuration or database rows
- The string "educational purposes" does not appear in the built output
- Every footer link resolves to a 200
- Every remaining public claim is owner-confirmed
- GST rates and HSN codes are per-category and CA-approved

---

## STAGE 3 — Real catalog and inventory

**Objective.** The catalog is real and the owner can manage it without a developer.

**Blocked on:** owner catalog data (Q2, Q3, Q4).

**Work.** Schema extensions (`hsnCode`, `taxRatePercent`, `weightGrams`) · CSV import
pipeline with Zod validation, dry-run report and SKU upsert · admin product CRUD with
image upload and audit-logged price changes · import the real catalog · delete fictional
seed data and unstocked categories · opening stock count · search typo tolerance via
`pg_trgm`.

**Exit criteria.**
- Zero fictional products, brands or prices remain
- Owner can add a product and change a price without a deployment
- Stock figures match a physical count
- `sement`, `cementt`, `sariya`, `tanki` all return sensible results

---

## STAGE 4 — Fulfilment and operations

**Objective.** Operations can run a full day in the admin panel with nothing in a
spreadsheet.

**Blocked on:** Q8 (who performs each step) for UI shape — the data model can be built
ahead of it.

**Work.** `Shipment` and `Driver` models · dispatch board with driver assignment ·
delivery OTP and proof of delivery · partial fulfilment with automatic refund or COD
reduction · `CodCollection` and `CodDeposit` with reconciliation view · printable pick
list and packing slip · order transition enforcement · audit log on every money, stock,
price and status action.

**Exit criteria.**
- An order goes confirmed → picked → packed → dispatched → delivered with OTP proof
- COD collected reconciles to zero against expected
- A discrepancy blocks order closure
- Every admin mutation writes exactly one audit row
- Invalid status transitions are rejected at the service layer

---

## STAGE 5 — End-to-end P0A

**Objective.** A real customer completes a real paid order and receives it.

**Work.** Phone OTP live with a real SMS provider · Razorpay live with a ₹1 production
test · GST invoice generation, CA-approved and gaplessly numbered · order confirmation
notifications · full Playwright journey on a 380px viewport over throttled 3G · load
test · security headers and CSP · migrations gated out of the build step · staging
environment · backup restore drill.

**Exit criteria.**
- A real ₹1 order completes in production via UPI and via COD
- A duplicate webhook is proven a no-op **in production**
- Invoice arithmetic reconciles to the paise and the format is CA-approved
- Core Web Vitals pass on mid-tier Android over throttled 4G
- Backups restored at least once, documented and dated
- Alerts reach the owner's phone

---

## STAGE 6 — Mobile API readiness

**Objective.** The backend is ready for a mobile client without restructuring.

**Work.** Audit `lib/services/*` for framework independence · expose the commerce
surface over authenticated HTTP endpoints (Server Actions stay for web) · token-based
auth for non-browser clients · versioned API contract · document it.

**Exit criteria.**
- Every commerce operation is callable over HTTP with the same server-side authority
- No pricing, inventory, serviceability or order logic exists outside `lib/services/*`
- API contract documented and versioned

---

## STAGE 7 — Mobile application

**Objective.** Ship a real mobile app.

**Blocked on:** Stage 6, and the technology decision — see `MOBILE_PRODUCT_DIRECTION.md`.
**The choice between Capacitor, React Native/Expo, Flutter and PWA is deliberately not
made yet.**

**Exit criteria.** App published, completes a purchase, and shares 100% of commerce logic
with web.

---

## STAGE 8 — Soft launch

**Objective.** Prove the operation before spending on marketing.

**Work.** 30 days serving only people the owner already knows, 5–10 orders/day. Find every
operational break before a stranger does. Measure on-time rate, stock accuracy, COD
reconciliation cleanliness, repeat rate.

**Exit criteria.**
- 30 consecutive days with no lost order, no unreconciled cash, no oversell
- On-time delivery above 90%
- Owner confident enough to market

> **Do not market before Stage 8 is complete. In a relationship-driven market, a bad first
> delivery costs a network of contractors, not one customer.**
