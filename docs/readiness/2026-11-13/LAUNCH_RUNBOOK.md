# Launch runbook — 13 Nov 2026

How to take the release branch to staging, then production, then paid orders.
Every step marked **APPROVAL** needs the owner's explicit go-ahead at that moment;
an earlier approval does not carry over. Nothing here has been executed.

This extends, and does not replace, `docs/DEPLOY_FIREBASE.md` and
`docs/readiness/2026-11-07-production-catalogue-rollout-checklist.md` — their
commands and safeguards stand; where this file repeats one it cites it.

## Gates

| Gate | Meaning | State on 13 Nov |
|---|---|---|
| 1 | Code ready: reviewed PRs merged, release SHA pinned, CI green on it | Not met — #57–#62 open |
| 2 | Staging verified isolated | Met for data and money; **not** for sign-in and operators (shared) |
| 3 | End-to-end transaction tests passed on staging | Not met — `UAT_EVIDENCE.md` |
| 4 | Commercial and operational approvals | Not met — `OWNER_DECISIONS.md` OD-1 to OD-11 |
| 5 | Production deployment approved | Not requested |
| 6 | Post-deployment smoke tests passed | — |
| 7 | Real-order launch approved | Not requested |

Gates 5 and 7 are separate decisions. Production stays in catalogue mode through
gate 6.

## Stage A — release candidate

1. **APPROVAL** Merge, in order: #57, #58, #59, #60, #61, #62 (then #40, #41). After each, wait for the `verify` check on the release branch.
2. Record the release head SHA. That SHA, and no other, is what is deployed below.
3. Confirm no new migration: `git diff --stat <deployed-sha>..<release-sha> -- prisma/migrations` must be empty. (True for everything open today.) If it is not, stop: migrations are applied by hand, staging first, production with a backup and the three guard variables in `docs/DEPLOY_FIREBASE.md` → Production.

## Stage B — staging

1. **APPROVAL** `npm run deploy:staging` from a clean checkout of the release head. The script refuses feature branches, uncommitted files and stale heads, and deploys an archived snapshot.
2. Confirm the rollout reached SUCCEEDED at 100% and that the uploaded source matches the SHA (the method in `CURRENT_STATE.md` §3).
3. Smoke: `/api/health` 200; `/admin` redirects when signed out; `/api/cron/cleanup-orders` 401 without the secret; the scheduler's next run returns `status: ok` with a `lateCaptureSweep` field (new in #60).
4. Run `UAT_EVIDENCE.md` tests 1–12 with a staging test customer and operator, Razorpay **test** mode only, synthetic products only. Record results in that file.
5. Before test 4 (duplicate webhook), confirm in the Razorpay dashboard that the test-mode webhook points at staging and nowhere else.
6. Clean up: cancel test orders through the console; leave audit rows.

Stop here if any of tests 1, 2, 4, 5, 6, 9 fails.

## Stage C — production, still catalogue mode

Follow the 7 Nov checklist sections B, D, E, F unchanged. In short:

1. Record the serving build (today `build-2026-11-07-001`, `51a2da8`) — the rollback target.
2. Back up the production database (read-only dump), named with date and purpose. Confirm the last restore test is recent (the checklist cites 6 Nov); repeat it if the schema has changed since.
3. **APPROVAL** Deploy a clean `git archive` of the pinned SHA with the pinned CLI, naming `ve-production`.
4. Confirm SUCCEEDED at 100%.
5. Smoke (checklist section F), plus: `COMMERCE_MODE` is still `catalogue` — an unauthenticated and a signed-in cart write are both refused; the serviceability answer still says COD is off.
6. Watch for 60 minutes: the runtime-errors alert, the two uptime checks, the cleanup job's runs.

**Rollback:** App Hosting console → Rollouts → the recorded previous build → Roll back, or redeploy the previous SHA. No data rollback: none of today's changes writes a migration. Trigger: any smoke check fails, an uptime alert fires, or errors rise above the pre-rollout baseline.

## Stage D — opening paid orders

Only after gates 1–6 and every row OD-1 to OD-11.

Before the switch:

1. Production operator allowlist is its own secret, with the names from OD-8.
2. Prices, MRP and stock entered and each product's review recorded by the approver (panel from #62). Tax table matches the accountant's (OD-2).
3. Pincodes, fees and times entered (OD-3). Legal and policy text live (OD-5, OD-6).
4. Email provider and error-reporting secrets set; one staging order has produced the customer and operator messages (OD-10).
5. Razorpay live: KYC complete; live key id, key secret and webhook secret created in Secret Manager **by the owner**, readable only by the production runtime identity; live webhook registered for `https://www.verticalexpress.in/api/webhooks/razorpay` with `payment.captured`, `payment.failed`, `order.paid` and the refund events.
6. Someone named is on call for the first day, with access to the console's Payments page and the Razorpay dashboard.

The switch, **APPROVAL** (gate 7), as one change to `apphosting.production.yaml`
and one deploy: `COMMERCE_MODE=transactional`, `PAYMENT_GATEWAY=razorpay-live`, the
three Razorpay secrets and the matching public key id. `ALLOW_TEST_GATEWAY` must not
appear. The server refuses to start with a test key, a missing secret or mismatched
key ids (ISS-002, ISS-087, #59) — a failed start is the guard working: roll back.

First order, by the owner, with a real card and a small real amount (this is a real
payment and needs the owner's explicit approval): place, pay, see the confirmation,
see the order in the console, pack, dispatch, deliver with the code. Then cancel a
second order after payment and refund it from the console; confirm the refund in
the Razorpay dashboard.

**Closing orders again** is the same switch reversed: `COMMERCE_MODE=catalogue` and
a deploy. Orders already placed stay in the console and must still be fulfilled or
refunded.

## Daily, once orders are open

- Console → Payments: "Refund required" and "Second captures" lists empty, or acted on.
- Razorpay dashboard settlements against the console's captured total for the day. There is no automated settlement report.
- Alerts: `late_payment_captured`, `paid_order_cancelled`, `webhook_unmatched_capture`, `*_gateway_lookup_failed`, `*_capture_amount_mismatch`. Today these reach Cloud Logging only (G-14, G-51); until an error-reporting destination is set, someone has to look.
- Dispatch board: nothing out for delivery from a previous day.
