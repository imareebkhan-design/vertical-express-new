# Resumed client UAT verification — 8 November 2026

Checked around 11:10–11:30 IST. This supersedes deployment and journey-status
claims in the earlier preparation report; its commercial decision list still applies.

## Environment and Claude Code reconciliation

- Web release source: `cb8afc1`, including merged PRs #42 (UAT setup) and #43
  (guide corrections). Claude's `claude/uat-test-approvals` checkout was clean;
  it was preserved. This report uses a separate worktree and branch.
- Staging serves `ve-staging-build-2026-11-07-001` at 100% traffic. The client
  testing banner was verified in the browser. Runtime configuration reports
  staging, `razorpay-test`, explicit test opt-in, and a test-prefixed key.
  The staging database reference was checked before read-only SQL. No secret
  values were printed or placed in evidence.
- Four published, explicitly synthetic QA products exist: original item ₹199,
  paint tin ₹349, two-pack item ₹99/₹249, bulk bag ₹420. Five active QA variants
  each had 50 units at Srinagar Central before this run. The original item also
  has a zero-stock Delhi QA row. Its MRP remains missing; the four added variants
  have synthetic MRP equal to price. These are not verified commercial MRPs.
- PR #46 contains the three additional products' setup code. It remains OPEN
  with no submitted review, although the data is already present on staging.
  PR #45 offers a different approach, approving seed products at stored MRP;
  it also remains OPEN and unreviewed. Neither was merged or applied in this run.
  Resolve the intended catalogue approach during review; do not combine them
  merely to increase product counts.
- Workspace PR #18 merged staging `uat` / `uat-simulator` EAS profiles into
  workspace `main` (`1bb21efa`). Both public site/API URLs target staging, with
  `uat` inheriting internal APK distribution. Older local workspace/release
  checkouts do not contain these profiles. No installed UAT binary was verified.
- Read-only production check at 05:57 UTC: 100% traffic to
  `ve-production-build-2026-11-07-001`, `COMMERCE_MODE=catalogue`, no payment
  gateway configured. No production deploy, configuration or database write
  was performed in this run.

## Executed unpaid order cycle

Order **VE-2026-MW7F2MY12446**, staging only, two synthetic items:

| Check | Evidence |
|---|---|
| Cart quantities | ₹199 + ₹249 = ₹448. Increase original item to two: ₹398 + ₹249 = ₹647. Decrease back: ₹448. |
| Address | Selected an existing address explicitly labelled QA TEST and not a real delivery; did not submit a real address. |
| Checkout | Total ₹448; included GST ₹68.34; displayed test delivery fee zero; COD unavailable. |
| Payment initiation | Hosted Razorpay window displayed **Test Mode** and ₹448. Optional email cleared. No real payment instrument entered. |
| Provider blocker | Both synthetic contact attempts (`9000000000` and documentation example `9999999999`) returned “Please enter a valid mobile number.” No success/failure payment method was reached. |
| Abandonment | Exited the provider window. Order history showed Payment pending. SQL: order `pending_payment`, payment `created`, signature false, no webhook event. |
| Inventory after initiation | QA-STAGING-1 and QA-STAGING-3L each moved from 50 to 49 on hand; reserved field remained zero. This implementation deducts on hand at initiation; do not describe it as an increment of `qty_reserved`. |
| Customer cancellation | Used Cancel Order and its confirmation in the customer UI. Result: Cancelled, Payment: Not paid; no Complete Payment or Cancel button remained. |
| Reconciliation | Read-only SQL confirmed order `cancelled`, payment still `created` (uncaptured), both SKU quantities back at 50, reserved zero. No refund was due. |

Evidence: [cancelled order](evidence/unpaid-cancellation.png),
[selected large-pack price](evidence/large-pack-price.png).

Razorpay documents simulated netbanking success/failure methods in its
[test integration instructions](https://github.com/razorpay/markdown-docs/blob/master/payments/payment-gateway/flutter-integration/standard/integration-steps.md).
Those methods were not reached here. A tester must complete the provider contact
step with an authorized contact, using TEST payment methods only. Do not substitute
an arbitrary real person's number or bypass the provider's validation.

## Current journey status

PASS is limited to the specific evidence stated. Earlier automated test counts
(1,477 backend / 221 UI / 14 staging smoke) belong to the preparation report;
they are not fresh full-suite results or proof of a completed payment lifecycle.

| Journey | Status | Evidence / remaining work |
|---|---|---|
| Registration / fresh login / logout | NOT TESTED | Existing authenticated customer/admin session worked; fresh authentication remains. |
| Browse / search / categories / filters | NOT TESTED | Earlier 14-test smoke passed; full current filter/category walkthrough not repeated. |
| Product detail / variant choice | PASS | QA two-pack product switched displayed price from ₹99 to ₹249. |
| Cart and quantity changes | PASS | Persisted items, increase/decrease and totals verified above. Removal and maximum-stock UI case remain untested. |
| Address creation | NOT TESTED | No new address created. |
| Address selection | PASS | Existing explicitly synthetic pinned address selected and carried into test order. |
| Delivery / checkout totals | PASS | Test summary, included GST, fee and COD-off checked. No real delivery promise approved. |
| Successful / failed payment methods | BLOCKED | Provider contact validation; neither simulated success nor simulated failure completed. |
| Unpaid order creation / history | PASS | New order number, pending state, item amounts and total matched checkout. |
| Paid order confirmation / webhook | BLOCKED | No captured test payment in this run. |
| Tracking after fulfilment transitions | NOT TESTED | No new paid order to process. |
| Customer unpaid cancellation | PASS | UI and database both confirm cancellation. |
| Paid customer refusal / admin cancellation / refund | BLOCKED | Requires a separate captured TEST payment; no refund submitted. |
| Inventory deduction / cancellation restoration | PASS | 50 → 49 → 50 for both ordered variants; no initializer rerun. |
| Maximum-stock refusal | NOT TESTED | Existing automated coverage only; current browser limit test outstanding. |
| Admin dashboard / access | PASS | Authorized Operations dashboard rendered with test-gateway exception. |
| Admin product/inventory edits | NOT TESTED | Existing data inspected read-only; no edits or replenishment performed. |
| Admin order status changes | NOT TESTED | No fulfilment transition performed. |
| Customer/admin enquiries | NOT TESTED | No enquiry submitted or processed in this run. |
| Notifications | BLOCKED | Staging email provider absent; no real SMS/email sent as part of these tests. |
| Error handling | PASS | Provider rejected invalid contact visibly; app retained recoverable unpaid order. Other errors not exhaustively tested. |
| Cross-account permission checks | NOT TESTED | Prior anonymous checks documented; second-account test outstanding. |
| Responsive/mobile web | NOT TESTED | IAB mobile layout used, but no fresh full device-width acceptance matrix. |
| Native Android/iOS runtime | BLOCKED | Profiles merged; installed staging binary and runtime endpoint verification outstanding. |
| Testing notice / draft policy label | PASS | Visible throughout product, cart, checkout, order and admin pages. |

## Readiness and remaining release gates

**Client testing: conditional.** The four-fixture web environment can be reviewed,
and an unpaid order can be cancelled without losing stock. It is not UAT-passed:
captured payment, provider failure, expiry cleanup, paid cancellation, refund,
fulfilment, fresh authentication, enquiries and native runtime evidence remain.

**Commercial production: not ready and not activated.** Verified MRP/price data,
catalogue identity approvals, GST/HSN, legal/business contacts, approved delivery
and returns terms, physical stock, live-payment configuration and explicit launch
authorization remain separate requirements. See the preparation report section E
and [configuration map](configuration-map.md) for exact owner inputs and locations.

**Next actions:** resolve PR #45/#46 review and source/data discrepancy; complete
the provider contact step with an authorized tester; execute TEST success/failure,
paid cancellation/refund and ledger reconciliation; finish the untested rows; then
validate a staging native build. Passing these does not authorize production ordering.

Only documentation and two synthetic-data screenshots changed in this branch.
No application, schema, payment configuration, approval rules or production data
were changed. Rollback is reverting this documentation commit; the cancelled test
order remains as an audit record and its stock has already been restored.
