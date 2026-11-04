# F. Acceptance criteria and testing strategy

## 1. Universal definition of done

Every change still satisfies the `CLAUDE.md` Definition of Done: tsc, lint and tests green;
no invented business value; paise integers; nothing price, stock or payment related trusted
from the client; no secrets; migration documented; rollback written down; `KNOWN_ISSUES.md`
updated. UI work adds the following, because the memory rule for this project is that
**screenshots, not green gates, prove a UI change**:

- [ ] Screenshot of the route at 380 px and 1440 px (web), or on the simulator (mobile), next to the artboard. Differences listed.
- [ ] No control on the screen that does nothing.
- [ ] Loading, error and empty states shown, each with a screenshot.
- [ ] Catalogue mode and transactional mode both checked where the screen differs between them.

## 2. Acceptance criteria by area

### Categories and browsing (P2, issue #26)

| AC | Given / When / Then |
|---|---|
| AC-CAT-1 | Given the live directory, every category tile on Home, Categories (web and mobile) and in the nav goes to a page that returns 200 and shows either ≥ 1 product or the agreed empty state with **at least one working next action** |
| AC-CAT-2 | A category with 0 visible products is never shown as if it has products (no count, no "See all N") |
| AC-CAT-3 | A product failing `publicProductWhere()` (unapproved identity or photo, inactive brand or category, QA fixture in production) is excluded from listing, counts, search, facets and direct URL (404) |
| AC-CAT-4 | Group and category order and names match the owner-approved taxonomy (D-01) on web and mobile |
| AC-CAT-5 | L3 (if D-02 approved): each grade/type chip shows a true count, and selecting it filters to exactly those products |
| AC-CAT-6 | Breadcrumbs (web) and back navigation (mobile) return to the previous level with the scroll position kept |
| AC-CAT-7 | Deep links `/category/<slug>` and `verticalexpress://category/<slug>` open the right screen from a cold start |

### Listing, search, filter and sort

| AC | Criterion |
|---|---|
| AC-LST-1 | The first page renders within budget. "Load more" or scrolling reaches the last product, and the total matches the API `total` |
| AC-LST-2 | Price sort and price range appear only if ≥ 1 listed product is priced. When they appear, the result order is strictly monotonic |
| AC-LST-3 | Brand facet counts equal the number of results after that facet is applied |
| AC-LST-4 | An empty search shows the closest alternatives that are publicly visible. No "request" button until CLG-08 is decided |

### PDP

| AC | Criterion |
|---|---|
| AC-PDP-1 | Catalogue mode: no price, stock or ETA is shown. "Price on request" sits next to a working **Enquire** action on every viewport, including the mobile sticky bar |
| AC-PDP-2 | Transactional mode: the price shown equals the server-resolved price of the default variant. Add to cart refuses quantity above stock |
| AC-PDP-3 | A representative image carries the "representative image" label (IMG-2) |
| AC-PDP-4 | Specs render from either stored shape (`specRows`) |

### Cart, checkout and payments (P5)

| AC | Criterion |
|---|---|
| AC-CHK-1 | Catalogue mode: cart and order endpoints return 403 `ORDERING_CLOSED`. Web and mobile show no add-to-cart |
| AC-CHK-2 | The total a customer confirms equals the total charged. Any change requires a re-confirmation (regression coverage for ISS-080/081/083/084) |
| AC-CHK-3 | An order confirms only on a verified Razorpay webhook with the matching amount. Replays are idempotent |
| AC-CHK-4 | GST lines follow the CA-approved rates, and the invoice carries GSTIN and HSN |

### Delivery, driver and ops

| AC | Criterion |
|---|---|
| AC-DEL-1 | Tracking never shows an ETA that is not `promisedAt`. "Not scheduled yet" otherwise |
| AC-DRV-1 | Only a rostered phone reaches driver mode. A driver sees only their own shipments. Delivery needs the customer's code |
| AC-OPS-1 | Each ops page renders on staging with the owner's existing verified admin account (the owner signs in; no new account is created) and shows no fabricated figure |
| AC-OPS-2 | Before transactional launch: every `/api/admin/*` route enforces a role server-side, and every money, stock, price and approval action writes an `AuditLog` row with actor and before/after (T20) |

### Mobile release

| AC | Criterion |
|---|---|
| AC-MOB-1 | The build is cut from the single merged mobile line (GAP-M-01 closed) and honours `orderingOpen` |
| AC-MOB-2 | Journeys run on one physical mid-tier Android over a throttled network: sign-in, location, browse, PDP, enquiry |

## 3. Test strategy

| Layer | Tool (existing → proposed) | Scope | Gate |
|---|---|---|---|
| Static | `tsc`, ESLint, `check:ds`, `check:assets` (existing) | Every push | CI blocks merge |
| Service / domain | `node --test` with real Postgres behind `db-guard` (existing) | Pricing, GST, inventory concurrency, idempotency, webhooks, catalogue visibility, category directory, import validation | CI blocks merge |
| UI component | `test:ui` (existing) | Catalogue-mode controls, enquiry form, empty states | CI blocks merge |
| Mobile screen | Screen tests in `mobile/src/**/__tests__` (existing) | Location-first, checkout address and quote, account sites; **add** category, subcategory, product and catalogue mode | Mobile CI (proposed; confirm whether the workspace runs any) |
| API contract | **Proposed:** route tests for `/api/v1/*` response shapes (`ok`, `data`, `orderingOpen`, facets) shared by web and mobile | Every push | CI |
| Browser E2E | **Proposed:** Playwright, anonymous journeys against staging (home → category → listing → PDP → enquiry, search, 404) at 380 and 1440 px, with screenshot capture | Nightly and before release | Release gate |
| Accessibility | **Proposed:** `@axe-core/playwright` on the E2E routes | Nightly | Zero serious or critical |
| Performance | **Proposed:** Lighthouse CI (mobile, throttled) on Home, Category and PDP | Nightly | Owner-approved budgets |
| Device | **Proposed:** Maestro flows on an Android emulator in CI. Manual run on a physical handset before each store build | Before each build | Release gate |
| Visual parity | Manual screenshot-against-artboard log, saved under `docs/evidence/` | Each P2/P3 slice | PR review |
| Staging smoke | `docs/release/v1.1-smoke-test.md` (existing) | Each staging deploy | Recorded in the PR |

**Test data:** the QA fixture prefix (`QA_FIXTURE_PREFIX`) is the only synthetic data allowed
on staging, and it is excluded from production by `publicProductWhere()`. Tests never
assert real-world prices. They assert server-resolved consistency.
