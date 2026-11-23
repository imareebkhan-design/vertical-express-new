# Account deletion — API contract (22 Nov 2026)

The website and the Expo app use one service, `lib/services/account-deletion.ts`. Identity always comes from the bearer token (app) or session cookie (web), never from the request body.

## `GET /api/v1/me/deletion`

Authenticated. Read-only.

```json
{ "ok": true, "data": {
  "state": "eligible" | "blocked",
  "blockers": [ { "code": "ORDER_IN_PROGRESS", "message": "…", "resolve": "…", "orderNo": "VE-…" } ],
  "explainer": { "deleted": ["…"], "kept": ["…"], "after": "…" }
} }
```

`blockers` is present only when `state` is `"blocked"`. Show `message` and then `resolve`. Link `orderNo` to the order, if one is given.

Blocker codes: `STAFF_ACCOUNT`, `DRIVER_ACCOUNT`, `ORDER_IN_PROGRESS`, `REFUND_IN_PROGRESS`, `RETURN_IN_PROGRESS`, `BOOKING_IN_PROGRESS`, `WALLET_BALANCE`.

Show `explainer` before confirmation. It is the same text as the website's, so the two cannot disagree.

## `POST /api/v1/me/deletion`

Body `{ "confirm": true }`. Rate-limited to 10 per minute per IP.

| Status | Body | Meaning | App should |
|---|---|---|---|
| 200 | `data.status = "deleted"` | Done, Firebase sign-in included | Sign out locally and leave the account area |
| 409 `CONFLICT` | `error.metadata.blockers` | Refused; nothing changed | Show the blockers (same shape as GET) |
| 503 `UNAVAILABLE` | `error.metadata.status = "pending"`, `error.message` | Details removed, sign-in not yet closed. **Not a success.** | Show the message and offer Try again; the server also retries |
| 400 `VALIDATION` | `error.field = "confirm"` | `confirm: true` missing | — |
| 401 `UNAUTHENTICATED` | | No token, or a revoked token for a live account | Sign in again |
| 404 `NOT_FOUND` | | No account for this sign-in | — |

Retrying after a 503 works even though the customer's token has been revoked. A revoked token is accepted only to finish a deletion that is already pending.

After deletion, every other authenticated endpoint answers 401 for the old token. Signing in again, even with the same phone number, creates a new empty account.

## Public page

`/delete-account` on the website. It shows what is deleted and kept to anyone. Signed-in customers see their blockers or the confirmation. Signed-out visitors get a sign-in link that returns them to the page. This is the URL for Google Play's account-deletion field: `https://www.verticalexpress.in/delete-account` once deployed to production.
