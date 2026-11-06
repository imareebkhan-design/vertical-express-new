import test from "node:test";
import assert from "node:assert/strict";
import { addDays, formatIst, formatIstDate, istDateKey, istDayStart, isDateKey } from "@/lib/ist";

test("exact placement time in IST, whatever the server clock's zone", () => {
  assert.equal(formatIst(new Date("2026-10-15T09:05:00Z")), "15 Oct 2026 · 2:35 PM IST");
  /* 00:30 IST on 16 Oct is still 15 Oct in UTC — the old UTC rendering showed the wrong day. */
  assert.equal(formatIst(new Date("2026-10-15T19:00:00Z")), "16 Oct 2026 · 12:30 AM IST");
  assert.equal(formatIstDate(new Date("2026-10-15T18:29:59Z")), "15 Oct 2026");
});

test("IST day boundaries are UTC+05:30", () => {
  assert.equal(istDayStart("2026-10-15").toISOString(), "2026-10-14T18:30:00.000Z");
  assert.equal(istDateKey(new Date("2026-10-14T18:29:59.999Z")), "2026-10-14");
  assert.equal(istDateKey(new Date("2026-10-14T18:30:00.000Z")), "2026-10-15");
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(isDateKey("2026-02-30"), false);
  assert.equal(isDateKey("2026-10-15"), true);
});
