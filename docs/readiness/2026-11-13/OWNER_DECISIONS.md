# Owner decisions — 13 Nov 2026

Only what needs the owner, the accountant or a third party. Engineering cannot settle
any of these and has not guessed. Existing questions keep their place in
`docs/OWNER_INPUT_REQUIRED.md` (section numbers in brackets); this file is the short
list that stands between today and taking a paid order.

## Needed before any paid order

| ID | Decision | Why it blocks | What to supply | Gap |
|---|---|---|---|---|
| OD-1 | Prices, MRP and counted stock for the products to be sold first [§3–5] | Nothing in production is approved for sale. Staging prices are test values (stored MRP, 50 units per SKU) and are not live data | A list: SKU, selling price, MRP, units on the shelf. A small first range is enough | G-03 |
| OD-2 | GST rate and HSN per category, in writing from the accountant; cement in particular [§2, D5] | The code charges cement 28% and calls the table owner-confirmed; it is not. A wrong rate is charged to every customer and printed on every order | The accountant's table. One code change follows, then every affected product's review is recorded again | G-02, G-16 |
| OD-3 | Delivery: pincodes served, fee per pincode, free-delivery threshold (or none), and the delivery time to show [§6] | The site would show seed values — a ₹500 free-delivery threshold and placeholder times — as promises | The values, entered by the owner in Admin → Serviceability; the threshold needs one code change once decided | G-01 |
| OD-4 | Razorpay live account: KYC complete, live keys, live webhook, settlement account [§7] | Production cannot start in ordering mode without them. Nobody should paste a key into a chat: they go into Secret Manager | KYC done; then an approved session to add three secrets and the webhook | G-04 |
| OD-5 | Legal identity on the site: registered name, address, GSTIN, grievance officer, support phone and hours [§1] | These are bracketed placeholders on live pages today | The text | G-05 |
| OD-6 | Returns, refund and re-delivery terms [§8] | Policy pages are placeholders; the console can refund a cancelled order in full and nothing else | The terms. See OD-9 for the two cases the software cannot yet handle | G-05, G-49 |
| OD-7 | Tax invoice: is a GST invoice issued per order, in what format, from which series? [§2] | None is generated | The accountant's answer | G-19 |
| OD-8 | Who is an operator on production, and who may approve prices [§10, D4] | One allowlist covers staging and production; any operator can do everything, including recording a price review (PR #62) | Names for production; whether price review is owner-only; whether second-factor sign-in is required for operators | G-18 |
| OD-9 | Failed and partial deliveries: is the delivery fee refunded when a delivery fails? What happens when half an order is delivered and half is not? | PR #61 lets an operator end a failed delivery and refund in full. A part-delivered order cannot be ended or part-refunded from the console | The rule | G-13, G-49 |
| OD-10 | Customer notifications: order confirmation by email, SMS or neither; who is alerted to a new order [§10] | Nothing is sent to anyone today. The owner said on 4 Nov that enquiries need no alert; orders were not covered | The channel, the sender address, and an approved session to add the email-provider secret | G-14 |
| OD-11 | Delivery claim wording on the app sign-in screen and the site title | An unverified delivery-time claim is published | Approved wording, or approval to remove the claim | G-22 |

## Needed before the phone app is published

| ID | Decision | Gap |
|---|---|---|
| OD-12 | Apple Developer membership (needed for any iPhone build) | G-23 |
| OD-13 | Confirm the 6 Nov Android store build (1.0.0, build 4) was not uploaded to Play, and must not be: it was built from unreviewed source | G-06 |
| OD-14 | Is background location needed for customers, or only for delivery partners? Play requires a declaration | G-20 |

## Approvals engineering will ask for, in order

1. ~~Merge PR #57, then #58, then #59–#62~~ — done 14 Nov, release head `1f09491`. Still to decide: #63 (needs its staging check before production) and #64.
2. Protect `main` and the release branch (G-24) — a repository setting.
3. Deploy the release branch to **staging**.
4. A staging test customer and operator for the end-to-end tests (`UAT_EVIDENCE.md` says exactly what is missing).
5. Production deploy, still in catalogue mode.
6. Separately, and last: switching production to ordering mode.

Nothing in this list has been done without approval, and items 5 and 6 are separate
decisions.
