# Vertical Express — client acceptance testing guide (deliverable C)

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
- **Prices are placeholders.** No SKU has a verified MRP yet (owner input 4.1).
- **Returns policy is a DRAFT.** The proposed commercial policy is "no voluntary
  returns", pending owner and client approval. It does not remove remedies for
  defective, wrong or non-conforming goods. The public `/refunds` page still shows
  an older draft with return windows; treat both as drafts.
- **Only one product can be bought today:** "QA TEST ITEM — staging only, not for
  sale" (₹199). The other 45 staging SKUs are hidden until an admin approves them
  (scenario A2 below).
- Each SKU starts with **50 test units**. Stock is not topped up again when you buy it.
- Record every problem with: the URL, what you did, what you expected, what you saw
  and a screenshot. Note phone or desktop and the browser you used.

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
| C3 | Filters | On a listing, apply brand / price filters, then page through. | Results narrow; filters survive paging. (Limited while only one product is purchasable.) |
| C4 | Product detail | Open the QA test item. Enter pincode 190008 and press Check. | Price ₹199, "Inclusive of all taxes", delivery check answers. |
| C5 | Cart | Add to cart. Open Cart. Press + to make 2, then – back to 1. Remove and re-add. | Line total and subtotal update; price matches the product page. |
| C6 | Stock limit | In the cart, try to set a quantity above the stock available (more than 50). | The site refuses or caps the quantity with a clear message; checkout cannot proceed above stock. |
| C7 | Address | At checkout press "Add Address", place the map pin, save. Select it. | Address saves with the pin; a pinless address warns before saving. |
| C8 | Checkout summary | Review delivery, shipments, coupon field, payment method. | Subtotal, GST (included), delivery and total agree with the cart. COD shows as unavailable. |
| C9 | Successful test payment | Press "Pay & Place Order"; in the Razorpay test window choose a **success** test method. | Order confirmation with an order number; order appears in My Orders as Confirmed; stock for the SKU drops by the quantity. |
| C10 | Failed / cancelled test payment | Repeat, but choose a **failure** test method, or close the Razorpay window. | No confirmed order; a clear message; you can retry. Stock is not consumed by a failed attempt once the pending order expires. |
| C11 | Order history and tracking | Account → My Orders → open the order; open the tracking link if shown. | Status timeline matches what the admin has done (A4). |
| C12 | Cancel and refund | Cancel a confirmed, not-yet-dispatched order. | Order shows Cancelled; stock returns; a TEST refund is created in Razorpay test mode (no real money). |
| C13 | Enquiry | On a product that offers "Enquire", submit an enquiry. | Confirmation shown; it appears in the admin inbox (A5). |
| C14 | Permissions | Signed out, open `/checkout`, `/account/orders`, `/admin`. As a customer, open `/admin`. As customer 2, open customer 1's order URL. | Login page or "not found"/"not allowed" — never another person's data. |

## Admin scenarios

| # | Scenario | Steps | Expected |
|---|---|---|---|
| A1 | Dashboard | Open `/admin`. | "Today" shows orders needing action and exceptions. The "Payment gateway is razorpay-test" exception is expected on staging. |
| A2 | Product approval (test only) | Admin → Catalogue approvals: pick one staging SKU, confirm identity and record a commercial review **marked as test**. | The product appears on the storefront and can be bought. Approval is audit-logged. |
| A3 | Inventory | Admin → Inventory: check a SKU shows 50; use Adjust to move it; open Stock ledger. | Adjustment recorded with reason and actor; customer-side availability follows. |
| A4 | Order processing | Admin → Orders: open the C9 order, move it Packed → Dispatched/Out for delivery → Delivered (using dispatch where required). | Each step allowed only in order; customer sees the same status. |
| A5 | Enquiries | Admin → Enquiries: open the C13 enquiry, change its status. | Status and filters work; full message visible. |
| A6 | Refunds | Admin → Payments: find the C12 refund. | TEST refund shown with its status. |

## What is out of scope for this round

Live payments, real deliveries, delivery slots and capacity (not built), COD
(switched off by the owner), real SMS/email delivery guarantees, final legal pages,
the native mobile app builds.
