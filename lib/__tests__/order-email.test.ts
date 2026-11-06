import { test } from "node:test";
import assert from "node:assert/strict";
import { orderConfirmationHtml } from "../services/email";

/**
 * The confirmation email says what the web order pages say (closure-loop
 * truthfulness sweep): no single GST rate on a mixed-rate order, no minute ETA
 * that would cover a truck shipment too, and nothing a customer typed is
 * rendered as markup.
 */
const ORDER = {
  orderNo: "VE-TEST-1",
  paymentMethod: "razorpay",
  items: [{ title: "OPC 53 Cement <b>50 kg</b>", qty: 2, lineTotalPaise: 77000 }],
  subtotalPaise: 60156,
  taxPaise: 16844,
  deliveryFeePaise: 0,
  totalPaise: 77000,
  etaMinutes: 120,
  customerName: '<img src=x onerror="alert(1)">',
};

test("no fixed GST rate and no minute ETA", () => {
  const html = orderConfirmationHtml(ORDER);
  assert.doesNotMatch(html, /GST \(\d+%\)/);
  assert.doesNotMatch(html, /ETA|~\d+ min/);
  assert.match(html, /Subtotal \(before GST\)/);
});

test("customer and product text is escaped", () => {
  const html = orderConfirmationHtml(ORDER);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /OPC 53 Cement &lt;b&gt;50 kg&lt;\/b&gt;/);
});
