# A-6 — staging acceptance checklist (Phase A payments)

Release line `release/rc-2026-10-19`. Staging only (`ve-staging`). **Nothing here touches
production, and nothing here is approval to deploy it.** Every step that writes to the
staging database or rolls out a build needs the owner's approval first; this document
does not give it.

What is being accepted: the Phase A work merged on 16–17 Nov 2026:

| Task | PR | What staging must show |
|---|---|---|
| A-3 unmatched / mismatched captures | #72 | Signed captures that cannot settle are recorded once, acknowledged with 200, listed under Payments → *Needs investigation*, counted on Today |
| A-4 operator alerting | #71 | An alert reaches the on-call operator's verified channel |
| A-5 free-delivery threshold | #70 | No free-delivery offer while the setting is blank; delivery fee charged |

Fill the **Result** column as you go: time (IST), the build, and what you saw. Stop at
the first unexpected result and record it; do not work around it.

Use only Razorpay **TEST** mode and test cards. Use the fictional demo catalogue staging
is seeded with. Never type a real card, and never point anything below at production.

## 0. Before the rollout — staging migration (owner approval required)

Every command touching the staging database needs `VE_ALLOW_REMOTE_DB=1`, `status`
included. `scripts/staging-db.sh` refuses the production project. Staging ref (from
`docs/release/inventory-ledger-staging-checklist.md`): `gjhxhmcsuhxcmrvtkggz`.
Run from a clean checkout of the release head that will be deployed, with the
gitignored `.env.staging` present.

| # | Step | Expected | Result |
|---|---|---|---|
| 0.1 | Record the release head: `git fetch origin && git rev-parse origin/release/rc-2026-10-19` | A SHA that contains #70, #71 and #72 (`git merge-base --is-ancestor 6a682b3 <sha>` exits 0) | |
| 0.2 | Take a staging database backup (Supabase dashboard → Database → Backups) | Backup listed with today's time | |
| 0.3 | `VE_ALLOW_REMOTE_DB=1 VE_EXPECTED_DB_REF=gjhxhmcsuhxcmrvtkggz scripts/staging-db.sh status` | `20261116120000_payment_exceptions` is pending. Any of `20261019120000_payment_refunds` or `20261031140000_order_confirmation_outbox` may also be pending if staging has not had them yet. **Anything else pending, or a failed migration → stop** and review it separately | |
| 0.4 | Same command with `migrate` instead of `status` | "All migrations have been successfully applied"; status "up to date" | |
| 0.5 | Read-only SQL (Supabase SQL editor): `SELECT unnest(enum_range(NULL::"PaymentExceptionReason"));` then `SELECT count(*) AS rows, count(DISTINCT gateway_payment_id) AS payments FROM payment_exceptions;` | Enum shows `unmatched`, `amount_mismatch`. **Record `rows` as R0 and `payments` as P0**: 0 on the first run; on a rerun, the rows earlier runs left (they are never deleted). Every later expectation is relative to R0 / P0 | |

Order matters: migrate (0.4) **before** the rollout (1.1). The build neither applies nor
checks migrations; code that reads `payment_exceptions` fails against a database without it.

Recovery: the migration is additive (one enum, one table). If the rollout is abandoned,
leave the table; earlier code never reads it. Restore from 0.2 only if something else in
the migration run went wrong.

## 1. Rollout and baseline

| # | Step | Expected | Result |
|---|---|---|---|
| 1.1 | `npm run deploy:staging` from the clean release checkout | Guard accepts the head from 0.1; rollout succeeds for `ve-staging` only | |
| 1.2 | Open `/admin/payments` on staging as an admin | *Needs investigation · R0* (if R0 = 0: "Every signed capture matched an order and its amount."). Gateway shown as `razorpay-test` | |
| 1.3 | Open `/admin` (Today) | If P0 = 0, no "captured payment(s) need investigation" row; otherwise "P0 captured payment(s) need investigation" | |
| 1.4 | `/admin/settings`: confirm "Free delivery from" is **blank** | Blank. Do not enter a figure: the threshold is the owner's decision | |

### 1b. Operator alerting in place before any exception is produced (A-4)

Steps 4 and 5 create the first-sight events the alert must catch, so the policy has to
exist first. Follow `docs/DEPLOY_FIREBASE.md` → *Order and payment alerts* (log-based alert
on `jsonPayload.service="alert-notifier"`, scoped to the staging service, with a
**verified** notification channel the owner chose). The checks on what it delivered are in
step 6.

| # | Step | Expected | Result |
|---|---|---|---|
| 1.5 | Alert policy exists for the staging service only, with the operator's verified channel | Policy and channel named in the Result column. **Not in place → stop here**; do not run 4 or 5 | |

## 2. A-5 — no invented free-delivery offer

| # | Step | Expected | Result |
|---|---|---|---|
| 2.1 | As a test customer, add any demo product to the cart, including a basket well over ₹500 | No free-delivery promise anywhere in cart or checkout (the phone app API reports threshold 0) | |
| 2.2 | Go to checkout with a serviceable demo pincode | Delivery fee is the pincode's fee, not ₹0 | |

## 3. A-3 — matched capture still settles (regression)

| # | Step | Expected | Result |
|---|---|---|---|
| 3.1 | Place an order and pay with a Razorpay TEST card | Order becomes `confirmed`; payment `captured`, signature verified | |
| 3.2 | `/admin/payments` | Payment listed as captured; *Needs investigation* still R0 | |
| 3.3 | Razorpay TEST dashboard → Webhooks → the `payment.captured` delivery for 3.1 | HTTP 200, body status `ok` | |

## 4. A-3 — unmatched capture

A capture whose Razorpay order id no staging order has. Produce it **outside the app**:
Razorpay TEST dashboard → Payment Links → create a ₹1 link → pay it with a test card.
The capture is delivered to the staging webhook like any other.

| # | Step | Expected | Result |
|---|---|---|---|
| 4.1 | Pay the ₹1 TEST payment link | Razorpay shows it captured | |
| 4.2 | Razorpay webhook delivery log for that `payment.captured` | HTTP 200, status `unmatched_recorded`, **one delivery, no retries** | |
| 4.3 | `/admin/payments` → *Needs investigation* | R0 + 1; the newest row: *Matches no order*, ₹1, the `pay_…` id, its Razorpay order id (or —), "no order here", event and time | |
| 4.4 | Today | "P0 + 1 captured payment(s) need investigation", linking to the list | |
| 4.5 | Replay: Razorpay dashboard → that delivery → **Resend** | HTTP 200, status `already_recorded`; list and Today unchanged; no second alert (step 6) | |
| 4.6 | If an `order.paid` for the same payment also arrives | 200; still one row | |

## 5. A-3 — amount mismatch and bad signature

Razorpay fixes an order's amount, so a real TEST payment cannot produce a mismatch. Use a
**signed synthetic delivery** to the staging webhook. It moves no money.

It needs a **fresh order that is still `pending_payment`**. Do not reuse the order from
3.1: it is already `confirmed` and `captured`, and a mismatch deliberately leaves states
alone, so 5.2–5.3 would fail even though the code is right.

1. As a test customer, place a new order and, when the Razorpay checkout opens, **close
   it without paying**. The order stays `pending_payment`.
2. Read its Razorpay order id (read-only SQL):
   `SELECT p.gateway_order_id, o.total_paise FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.order_no = '<order number>';`
3. Run 5.1 within **15 minutes** (`PAYMENT_WINDOW_MINUTES`): after that the expiry job may
   cancel the order. If it is already `cancelled`, place another and start again.

The signature uses the staging webhook secret from the gitignored
`.env.local.secrets` (`RAZORPAY_WEBHOOK_SECRET`, see `docs/DEPLOY_FIREBASE.md`). The
command below reads it without printing it. Run it only from the operator's machine.

```bash
# Fill these in. RZP_ORDER is the gateway_order_id read in step 2 above (order_…);
# AMOUNT is anything other than that order's total_paise.
STAGING=https://ve-staging--vertical-express.asia-southeast1.hosted.app
RZP_ORDER=order_xxxxxxxxxxxx
AMOUNT=100
RUN=$(date +%s)$(openssl rand -hex 4)   # unique per run, even within the same second
PAY_ID=pay_A6MISMATCH$RUN
EVT_ID=evt_A6MISMATCH$RUN

node --env-file=.env.local.secrets -e '
const crypto = require("crypto");
const [url, order, amount, pay, evt] = process.argv.slice(1);
const body = JSON.stringify({ event: "payment.captured",
  payload: { payment: { entity: { id: pay, order_id: order, amount: Number(amount), currency: "INR" } } } });
// SIGN_WITH is only for the bad-signature check (5.5); normally it is unset.
const secret = process.env.SIGN_WITH || process.env.RAZORPAY_WEBHOOK_SECRET;
const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
fetch(url + "/api/webhooks/razorpay", { method: "POST", body,
  headers: { "content-type": "application/json", "x-razorpay-signature": sig, "x-razorpay-event-id": evt } })
  .then(async r => console.log(r.status, await r.text()));
' "$STAGING" "$RZP_ORDER" "$AMOUNT" "$PAY_ID" "$EVT_ID"
```

| # | Step | Expected | Result |
|---|---|---|---|
| 5.1 | Run the command once | `200 {"status":"amount_mismatch_recorded"}` | |
| 5.2 | `/admin/payments` → *Needs investigation* | Row: *Amount mismatch*, AMOUNT in rupees (₹1 for the default `AMOUNT=100`) · expected <total_paise in rupees>, the order number linked, its status `pending_payment` | |
| 5.3 | The order itself | Still `pending_payment`; its payment still `created` (nothing settled) | |
| 5.4 | Rerun **only the `node …` line** in the same shell (rerunning the whole block makes new `PAY_ID` / `EVT_ID` values) | `200 {"status":"already_recorded"}`; no new row; no second alert | |
| 5.5 | Bad signature: rerun the whole block (fresh ids) with the `node` line prefixed by `SIGN_WITH=not-the-secret`, i.e. `SIGN_WITH=not-the-secret node --env-file=.env.local.secrets -e '…'` | `400 {"error":"Invalid webhook signature"}`; no row for that `PAY_ID` | |
| 5.6 | Today, and the 0.5 count query again | Today shows P0 + 2; the query shows rows R0 + 2 and payments P0 + 2 (one from 4, one from 5.1; 5.4 and 5.5 add none) | |

Clean-up: none. Rows in `payment_exceptions` are never deleted, and there is no resolve
action yet (owner policy). Record the `pay_…` ids used here in the Result column so they
can be told apart from real exceptions later.

## 6. A-4 — operator alert reaches a person

Uses the policy confirmed in 1.5.

| # | Step | Expected | Result |
|---|---|---|---|
| 6.2 | Step 4.1 or 5.1 (first sight) | One incident (`webhook_capture_unmatched` / `webhook_amount_mismatch`) delivered to the operator; record incident id and acknowledgement time | |
| 6.3 | Steps 4.5 and 5.4 (replays) | No new incident | |
| 6.4 | Scheduler-absence alert, per that section (needs an approved maintenance window) | Incident on pause; recovery after resume | |

## 7. Sign-off

| Item | Value |
|---|---|
| Release SHA deployed (0.1) | |
| Migration applied (0.4), by whom, when | |
| All steps passed? If not, which stopped | |
| Owner acceptance (name, date) | |

Not covered here, and still the owner's: what happens to money listed under *Needs
investigation* (refund or attach; no workflow exists), the free-delivery figure, and live
Razorpay keys. Passing this checklist is staging acceptance only; it is not approval to
deploy production.
