import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, ordersCsv, CSV_COLUMNS } from "@/lib/orders-csv";

const row = {
  orderNo: "VE-2026-AB12", placedAt: new Date("2026-10-15T09:05:00Z"), totalPaise: 123450, status: "out_for_delivery",
  paymentMethod: "razorpay", payments: [{ status: "captured" }],
  shipments: [{ status: "delivered", driver: { name: "Imran" } }, { status: "pending", driver: null }],
  address: { name: '=HYPERLINK("x")', phone: "+919800000000", line1: "secret street", pincode: "110054", city: "Delhi" },
  items: [{ qty: 2 }, { qty: 3 }], warehouse: { name: "Delhi QA — staging trial" },
};

test("one row per order with separate status columns, exact IST and UTC times", () => {
  const csv = ordersCsv([row], new Map([["110054", "Delhi"]]));
  const [head, line] = csv.trim().split("\r\n");
  assert.equal(head, CSV_COLUMNS.join(","));
  assert.equal(
    line,
    ['"VE-2026-AB12"', '"15 Oct 2026 · 2:35 PM IST"', '"2026-10-15T09:05:00.000Z"', `"'=HYPERLINK(""x"")"`, '"Delhi"', '"110054"', '"5"', '"1234.50"',
      '"out_for_delivery"', '"paid"', '"partial"', '"razorpay"', '"Delhi QA — staging trial"', '"Imran"'].join(",")
  );
});

test("no mobile number or street address leaves the console", () => {
  const csv = ordersCsv([row], new Map());
  assert.ok(!csv.includes("9800000000"));
  assert.ok(!csv.includes("secret street"));
});

test("formula-looking values are neutralised and quotes escaped", () => {
  assert.equal(csvCell("+1"), `"'+1"`);
  assert.equal(csvCell("-2"), `"'-2"`);
  assert.equal(csvCell("@sum"), `"'@sum"`);
  assert.equal(csvCell('a"b'), '"a""b"');
});
