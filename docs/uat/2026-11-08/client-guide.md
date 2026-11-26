# Vertical Express — client acceptance testing guide (deliverable C)

> Latest release and test results: [deployment handoff](deployment-handoff-2026-11-09.md).

**Testing URL:** https://ve-staging--vertical-express.asia-southeast1.hosted.app
**Admin console:** the same URL + `/admin`
**Do not use** www.verticalexpress.in for testing: that is production, it is in
catalogue mode, and it takes no orders.

Credentials are not in this guide. The owner gives each tester access separately.

## Before you start

- **No real money moves.** Staging uses Razorpay TEST mode. Use only Razorpay's
  test methods (for example net-banking "Success" / "Failure" in the test checkout,
  or Razorpay's published test cards). **Never enter a real card, UPI ID or bank
  login.**
- **No real deliveries.** Addresses, delivery times ("About 60 minutes"), delivery
  fees and stock levels are test data. They are not business promises.
- **Prices are test values.** No SKU has a verified commercial MRP yet (owner
  input 4.1). Test-approved seed products and the added QA variants sell at stored
  test MRP without discounts. The original ₹199 QA fixture still has no MRP field.
  None of these values is an approved real price.
- **Returns policy is a DRAFT.** The proposed commercial policy is "no voluntary
  returns", pending owner and client approval. It does not remove remedies for
  defective, wrong or non-conforming goods. The public `/refunds` page still shows
  an older draft with return windows; treat both as drafts.
- **27 test products are purchasable**, verified through the staging public API
  on 8 November: 23 test-approved seed products plus four labelled QA products
  (original ₹199 item, paint tin ₹349, two pack sizes ₹99/₹249, bulk bag ₹420).
  These approvals are TEST reviews, not commercial identity/price approvals.
  The source changes in PRs #45/#46/#52 are merged. Missing verified commercial
  MRPs remain a launch blocker.
- Each SKU starts with **50 test units**. Stock is not topped up again when you buy it.
- **No order emails on staging.** Staging has no email provider configured, so
  order confirmations and status emails are not sent. Phone sign-in codes are real
  SMS messages.
- Report every problem using the checklist at the end of this guide.

## Platforms

| Platform | How | Status |
|---|---|---|
| Desktop web | Chrome, Edge, Safari or Firefox at the testing URL | Ready |
| Mobile web | Chrome on Android or Safari on iPhone at the testing URL | Ready |
| Android native | [UAT build and APK](https://expo.dev/accounts/vertical-express/projects/vertical-express/builds/43370e7b-64e3-4f7c-8172-28a63e203d24) | Completed internal UAT build from `6b0f8d0`. Resolved UAT config and embedded bundle point to staging. Installation and runtime journeys remain **NOT TESTED** in this continuation. |
| iOS native | `uat-simulator` build profile | Configuration merged in workspace PR #18; no installed staging build verified here. |

## Roles

| Role | How to get it | Used for |
|---|---|---|
| Customer | Sign in with phone OTP or Google at `/login` | Scenarios C1–C12 |
| Admin (owner) | The owner's account is on the admin allowlist | Scenarios A1–A6 |
| Second customer (optional) | Another phone or Google account | C12 (no access to someone else's order) |

## Customer scenarios

| # | Scenario | Steps | Expected |
|---|---|---|---|
| C1 | Sign up / sign in / sign out | Open `/login`, sign in with phone OTP (or Google). Open Account. Sign out. | Account page shows your name. After sign-out, `/account` sends you back to login. |
| C2 | Browse and search | Home → Categories → open a category. Search "QA". Search a nonsense word. | Category pages open. "QA" finds the test item. Nonsense search shows a helpful empty state, not an error. |
| C3 | Filters | On a listing, apply brand / price filters, then page through. | Results narrow; filters survive paging. |
| C4 | Product detail | Open the QA test item. Enter pincode 190008 and press Check. | Price ₹199, "Inclusive of all taxes", delivery check answers. |
| C5 | Cart | Add to cart. Open Cart. Press + to make 2, then – back to 1. Remove and re-add. | Line total and subtotal update; price matches the product page. |
| C6 | Stock limit | In the cart, try to set a quantity above the stock available (more than 50). | The site refuses or caps the quantity with a clear message; checkout cannot proceed above stock. |
| C7 | Address | At checkout press "Add Address", place the map pin, save. Select it. | Address saves with the pin; a pinless address warns before saving. |
| C8 | Checkout summary | Review delivery, shipments, coupon field, payment method. | Subtotal, GST (included), delivery and total agree with the cart. COD shows as unavailable. |
| C9 | Successful test payment | Press "Pay & Place Order"; in the Razorpay test window choose a **success** test method. | Order confirmation with an order number; order appears in My Orders as Confirmed; stock for the SKU drops by the quantity. |
| C10 | Failed / abandoned test payment | Repeat, but choose a **failure** test method, or close the Razorpay window. | No confirmed order; a clear message; you can retry. The order waits as "awaiting payment" and holds its stock. If it is not paid, it cancels itself within about 20 minutes (15-minute payment window, checked every 5 minutes) and the stock returns. |
| C11 | Order history and tracking | Account → My Orders → open the order; open the tracking link if shown. | Status timeline matches what the admin has done (A4). |
| C12 | Cancel an unpaid order | Start a checkout, close the Razorpay window, then in My Orders cancel the "awaiting payment" order. | Order shows Cancelled; stock returns at once. The site first checks with Razorpay that nothing was paid. |
| C12b | Try to cancel a paid order | Open the C9 order (paid, not yet dispatched) and look for Cancel. | No Cancel button. A customer cannot cancel a paid order themselves; the site says it is paid and to email support with the order number. (The address shown, `info@verticalexpress.in`, is not yet a confirmed business contact.) Cancelling and refunding a paid order is an admin task (A4b, A6). |
| C13 | Enquiry | On a product that offers "Enquire", submit an enquiry. | Confirmation shown; it appears in the admin inbox (A5). |
| C14 | Permissions | Signed out, open `/checkout`, `/account/orders`, `/admin`. As a customer, open `/admin`. As customer 2, open customer 1's order URL. | Login page or "not found"/"not allowed" — never another person's data. |

## Admin scenarios

| # | Scenario | Steps | Expected |
|---|---|---|---|
| A1 | Dashboard | Open `/admin`. | "Today" shows orders needing action and exceptions. The "Payment gateway is razorpay-test" exception is expected on staging. |
| A2 | Product approval (test only) | Admin → Catalogue approvals: open a test-approved product and check who approved it, then open one of the hidden products. | Test-approved products show the "client-uat (TEST ONLY)" approver. A hidden product without an MRP cannot be published until it has one. |
| A3 | Inventory | Admin → Inventory: check a SKU shows 50; use Adjust to move it; open Stock ledger. | Adjustment recorded with reason and actor; customer-side availability follows. |
| A4 | Order processing | Admin → Orders: open the C9 order, move it Packed → Dispatched/Out for delivery → Delivered (using dispatch where required). | Each step allowed only in order; customer sees the same status. |
| A4b | Cancel a paid order | Admin → Orders: open a second paid, not-dispatched order and move it to Cancelled. | Order is Cancelled and its stock returns. Because money was taken, the order appears under Admin → Payments → "Refund required" and a "paid order cancelled" alert is raised. Cancelling is refused once a shipment has been dispatched. |
| A5 | Enquiries | Admin → Enquiries: open the C13 enquiry, change its status. | Status and filters work; full message visible. |
| A6 | Refund | Admin → Payments → "Refund required": refund the A4b payment, giving a reason of at least the minimum length. | A Razorpay TEST refund is created (no real money) and shown as processed or pending; the payment cannot be refunded twice. Refunds of delivered orders and part-refunds are not available: they need the owner's refund policy. |

## What is out of scope for this round

Live payments, real deliveries, delivery slots and capacity (not built), COD
(switched off by the owner), order emails (not configured on staging), refunds of
delivered goods and part-refunds (need the refund policy), final legal pages, and
native-app acceptance until the staging APK has been installed and tested.

## Reporting an issue

Give each issue its own report, with every line below filled in:

| Field | What to write |
|---|---|
| ID | Your initials and a number, e.g. `AK-07` |
| Scenario | The scenario number from this guide, e.g. `C9` |
| Platform | Desktop / mobile web / app, plus device and browser |
| Signed in as | Customer, second customer, admin, or signed out |
| URL | The full address shown in the browser |
| Steps | Numbered, starting from a page anyone can open |
| Expected | What this guide (or common sense) says should happen |
| Actual | What happened, with the exact wording of any message |
| Evidence | Screenshot or screen recording; the order number if there is one |
| Severity | **Blocker** (journey cannot finish) · **Major** (wrong money, stock or status) · **Minor** (works but confusing) · **Cosmetic** |
| Repeatable | Every time / sometimes / once |

Never put a real card number, UPI ID, password or OTP code in a report.
