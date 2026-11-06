import test from "node:test";
import assert from "node:assert/strict";
import { splitOrderPayments } from "@/lib/payment-rows";

const row = (id: string, status: string, minute: number) => ({ id, status, createdAt: new Date(Date.UTC(2026, 8, 28, 10, minute)) });

test("one payment row: it is the order's payment, nothing extra", () => {
  const only = row("a", "captured", 0);
  assert.deepEqual(splitOrderPayments([only]), { primary: only, secondCaptures: [] });
});

test("a second capture never displaces the payment that paid for the order, whatever the input order", () => {
  const first = row("a", "captured", 0);
  const second = row("b", "captured", 5);
  for (const input of [[second, first], [first, second]]) {
    const { primary, secondCaptures } = splitOrderPayments(input);
    assert.equal(primary?.id, "a");
    assert.deepEqual(secondCaptures.map((p) => p.id), ["b"]);
  }
});

test("only captured extra rows are listed as second captures", () => {
  const { secondCaptures } = splitOrderPayments([row("a", "captured", 0), row("b", "failed", 3), row("c", "captured", 4)]);
  assert.deepEqual(secondCaptures.map((p) => p.id), ["c"]);
});

test("no payments", () => {
  assert.deepEqual(splitOrderPayments([]), { primary: null, secondCaptures: [] });
});
