import test from "node:test";
import assert from "node:assert/strict";
import { hasFilters, ordersHref, parseOrdersQuery, placedWindow, MAX_PAGE } from "@/lib/admin-orders-query";

const NOW = new Date("2026-10-15T09:05:00Z"); // 15 Oct 2026, 2:35 PM IST
const iso = (w: { gte?: Date; lt?: Date }) => [w.gte?.toISOString(), w.lt?.toISOString()];

test("defaults: all orders, newest first, page 1, 25 a page", () => {
  const q = parseOrdersQuery({});
  assert.equal(q.tab, "all");
  assert.equal(q.sort, "placed_desc");
  assert.equal(q.page, 1);
  assert.equal(q.per, 25);
  assert.equal(hasFilters(q), false);
  assert.equal(ordersHref(q), "/admin/orders");
});

test("unknown and unsafe values are dropped; page and size are bounded", () => {
  const q = parseOrdersQuery({
    tab: "drop table", sort: "evil", page: "999999", per: "10000",
    pay: "paid,bogus,paid", wh: "not-a-uuid,0b7a3a3e-1111-4222-8333-444455556666", q: "x".repeat(500),
  });
  assert.equal(q.tab, "all");
  assert.equal(q.sort, "placed_desc");
  assert.equal(q.page, MAX_PAGE);
  assert.equal(q.per, 25);
  assert.deepEqual(q.pay, ["paid"]);
  assert.deepEqual(q.wh, ["0b7a3a3e-1111-4222-8333-444455556666"]);
  assert.equal(q.q.length, 80);
});

test("presets resolve to IST calendar days, end exclusive", () => {
  assert.deepEqual(iso(placedWindow({ range: "today", from: null, to: null }, NOW)), ["2026-10-14T18:30:00.000Z", "2026-10-15T18:30:00.000Z"]);
  assert.deepEqual(iso(placedWindow({ range: "yesterday", from: null, to: null }, NOW)), ["2026-10-13T18:30:00.000Z", "2026-10-14T18:30:00.000Z"]);
  assert.deepEqual(iso(placedWindow({ range: "7d", from: null, to: null }, NOW)), ["2026-10-08T18:30:00.000Z", "2026-10-15T18:30:00.000Z"]);
  assert.deepEqual(iso(placedWindow({ range: "30d", from: null, to: null }, NOW)), ["2026-09-15T18:30:00.000Z", "2026-10-15T18:30:00.000Z"]);
  assert.deepEqual(iso(placedWindow({ range: "month", from: null, to: null }, NOW)), ["2026-09-30T18:30:00.000Z", "2026-10-15T18:30:00.000Z"]);
  /* 00:10 IST on 16 Oct: "today" has already moved on, though UTC still says 15 Oct. */
  assert.deepEqual(iso(placedWindow({ range: "today", from: null, to: null }, new Date("2026-10-15T18:40:00Z"))), ["2026-10-15T18:30:00.000Z", "2026-10-16T18:30:00.000Z"]);
});

test("custom range: To date included in full; swapped dates are put in order; invalid dates ignored", () => {
  const q = parseOrdersQuery({ range: "custom", from: "2026-10-15", to: "2026-10-10" });
  assert.deepEqual([q.from, q.to], ["2026-10-10", "2026-10-15"]);
  assert.deepEqual(iso(placedWindow(q)), ["2026-10-09T18:30:00.000Z", "2026-10-15T18:30:00.000Z"]);
  const open = parseOrdersQuery({ range: "custom", to: "2026-10-15" });
  assert.deepEqual(iso(placedWindow(open)), [undefined, "2026-10-15T18:30:00.000Z"]);
  assert.equal(parseOrdersQuery({ range: "custom", from: "2026-02-30" }).range, null, "no valid date = no range");
});

test("the URL round-trips every choice (filters survive pagination and back)", () => {
  const raw = {
    tab: "to_pack", q: "VE-2026", range: "custom", from: "2026-10-01", to: "2026-10-15",
    pay: "paid,cod", ful: "partial", st: "confirmed", method: "razorpay",
    city: "0b7a3a3e-1111-4222-8333-444455556666", sort: "total_desc", page: "3", per: "50",
  };
  const q = parseOrdersQuery(raw);
  const back = parseOrdersQuery(Object.fromEntries(new URL(`http://x${ordersHref(q)}`).searchParams));
  assert.deepEqual(back, q);
  assert.match(ordersHref(q, { page: 4 }), /page=4/);
  assert.doesNotMatch(ordersHref(q, { page: 1 }), /page=/);
});
