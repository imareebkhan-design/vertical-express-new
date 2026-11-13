# Implementation plan — 13 Nov 2026

Order of work from the gap register, with what is done. "In review" means a pull
request is open against `release/rc-2026-10-19` and nothing is merged or deployed.

## 1. Done today, in review

| PR | Branch · commit | Closes | Tests run locally |
|---|---|---|---|
| #59 | `claude/payment-env-guard` · `321ee46` | G-10 | backend 1546/1546 |
| #60 | `claude/payment-resilience` · `5d2ed6e`, `d349021` | G-11, G-30–G-33 | backend 1550/1550 on `5d2ed6e`; 66/66 across the changed and neighbouring files on `d349021` |
| #61 | `claude/failed-delivery-recovery` · `18b284e` | G-13, G-15 | backend 1549/1549, UI 243/243 |
| #62 | `claude/record-commercial-review` · `c8c5a0d` | G-12 | backend 1551/1551, UI 241/241 |
| #63 | `claude/rate-limit-client-address` · `2611027` | G-17 | backend 1553/1553. **Hop count must be checked on staging before production** |
| #64 | `claude/checkout-script-blocked` · `2f25228` | G-42 | UI 241/241 |
| workspace #24 | `claude/catalogue-mode-controls` · `6fa70aa` | G-21 (part) | unit 268/268, screen 35/35 |
| workspace #25 | `claude/pin-production-api-url` | G-06 (part) | unit 270/270 |

All pass typecheck and lint; #61 and #62 also pass the full lint run. None changes the schema. None has been run in a
browser or on staging. They touch different files and can merge in any order.

## 1a. Merged, 14 Nov 2026

With the owner's approval, #57, #58, #59, #60, #61 and #62 were merged into
`release/rc-2026-10-19` in that order. Release head: **`1f09491`**. CI on it is
green (run 43488480003). The six were first merged together in a throwaway
checkout: no conflicts, typecheck clean, and the resulting tree is identical to
the merged branch. No schema change. Nothing is deployed: staging still runs
`ea02aac` and production `51a2da8`.

Still in review: #63, #64, #65, workspace #24 and #25.

## 1b. Staging deployed, 14 Nov 2026 (01:04 IST)

With the owner's approval, `npm run deploy:staging` from a clean checkout of the
release head. Staging now serves **`build-2026-11-13-001`** (the build is named in
UTC) at 100%, and its uploaded source is byte-identical to `1f09491` (1,110 files;
the same four ignored paths excluded). Previous build and rollback target:
`build-2026-11-08-001` (`ea02aac`). No migration was needed or run. Production was
not touched: still `build-2026-11-07-001`, `51a2da8`. Evidence: `UAT_EVIDENCE.md`,
"After the 14 Nov staging deploy".

## 2. Merge order (each needs the owner's approval)

1. **#57** — one test file; removes an intermittent failure from every later run.
2. **#58** — Launch Control switches. CI green on `fe6a442`. Known limit: applying a batch does not re-measure product impact after the review screen.
3. **#59, #60, #61, #62** — today's fixes.
4. **#40, #41** — documentation; #41 records the build production actually serves (G-50).
5. Workspace **#22** (home shortcuts follow visible categories), then the phone fixes in section 4.

After 1–3: one staging deploy from the release head (`npm run deploy:staging`), then
the staging tests in `UAT_EVIDENCE.md`.

## 3. Next software work, in order

| # | Gap | Work | Acceptance | Depends on |
|---|---|---|---|---|
| 1 | G-17 | One helper that reads the client address from the platform-appended forwarding entry; use it in rate limiting and the session route | On staging, a request with a forged `x-forwarded-for` is limited under the real address | A live header check on staging first — the right entry depends on what App Hosting appends |
| 2 | G-21 | Phone app: hide cart, quick-add and reorder when the server says ordering is closed | In catalogue mode no control leads to a refusal | Workspace repository |
| 3 | G-20 | Phone app: account deletion row and endpoint; location declaration | Play data-safety requirements met | OD-14 |
| 4 | G-06 | Pin the API address in the `production` build profile; rebuild from reviewed `main` | The store build's API target is readable from the repository | Workspace #22 merged |
| 5 | G-14 | Operator new-order email on the existing outbox; set the email and error-reporting secrets | A staging order produces one customer and one operator email; an induced error reaches Sentry | OD-10, secrets |
| 6 | G-34, G-35 | Webhook amount mismatch answers 200 after alerting; explicit timeout on order placement | Existing tests updated deliberately, not weakened | — |
| 7 | G-36 | Forward migration enabling row-level security on the 18 remaining tables | Applied to staging first; production under approval with a backup | Approval |
| 8 | G-37–G-46 | Limits, argument validation, CSP, audit rows for import, confirmation and error wording | Per row | — |
| 9 | G-24 | Branch protection on `main` and the release branch | PR and `verify` required | Approval |

## 4. Not software

Every remaining P0 is an owner decision or an external account: `OWNER_DECISIONS.md`
OD-1 to OD-7. No amount of code closes them.

## 5. What was deliberately not built

No tiered operator roles (waits for OD-8), no partial refunds or returns restocking
(OD-6, OD-9), no tax invoice (OD-7), no SMS or push provider (OD-10), no change to
any tax rate, price, fee, pincode or policy text.
