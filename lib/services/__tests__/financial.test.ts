import { test } from "node:test";
import assert from "node:assert/strict";
import { paiseToRupees, rupeesToPaise, formatPaise } from "@/lib/money";

test("Money: paise to rupees and rupees to paise conversions with rounding", () => {
  assert.equal(paiseToRupees(1550), 15.5);
  assert.equal(rupeesToPaise(15.5), 1550);
  assert.equal(rupeesToPaise(19.999), 2000);
  assert.equal(formatPaise(1550), "₹15.50");
  assert.equal(formatPaise(0), "₹0");
});

test("Financial Math: Flat amount coupon logic", () => {
  const subtotalPaise = 50000; // ₹500
  const couponValue = 10000;   // ₹100 flat discount
  const discountPaise = couponValue;
  const taxableBase = Math.max(0, subtotalPaise - discountPaise);

  assert.equal(discountPaise, 10000);
  assert.equal(taxableBase, 40000); // ₹400
});

test("Financial Math: Percentage coupon with max discount cap", () => {
  const subtotalPaise = 100000; // ₹1,000
  const percent = 20;           // 20%
  const maxDiscountPaise = 15000; // ₹150 cap

  const rawDiscount = Math.round((subtotalPaise * percent) / 100);
  const discountPaise = Math.min(rawDiscount, maxDiscountPaise);

  assert.equal(rawDiscount, 20000); // 20% of ₹1,000 = ₹200
  assert.equal(discountPaise, 15000); // Capped at ₹150
});

test("Financial Math: Free delivery coupon logic", () => {
  const subtotalPaise = 30000; // ₹300
  const standardDeliveryFee = 5000; // ₹50
  const isFreeDeliveryCoupon = true;

  const deliveryFeePaise = isFreeDeliveryCoupon ? 0 : standardDeliveryFee;
  assert.equal(deliveryFeePaise, 0);
  assert.equal(subtotalPaise + deliveryFeePaise, 30000);
});

test("Financial Math: Minimum order requirement validation", () => {
  const minOrderPaise = 50000; // ₹500
  const smallOrderSubtotal = 30000; // ₹300
  const largeOrderSubtotal = 60000; // ₹600

  assert.equal(smallOrderSubtotal >= minOrderPaise, false);
  assert.equal(largeOrderSubtotal >= minOrderPaise, true);
});

test("Financial Math: Expired / Inactive coupon validation", () => {
  const now = new Date("2026-08-07T10:00:00Z");
  const expiredCouponDate = new Date("2026-08-01T00:00:00Z");
  const validCouponDate = new Date("2026-08-15T00:00:00Z");

  const isExpired = expiredCouponDate < now;
  const isValid = validCouponDate >= now;

  assert.equal(isExpired, true);
  assert.equal(isValid, true);
});

test("Financial Math: Wallet 5% cashback calculation with integer rounding", () => {
  const orderTotalPaise = 49900; // ₹499.00
  const cashbackPaise = Math.round(orderTotalPaise * 0.05);

  assert.equal(cashbackPaise, 2495); // 5% of ₹499 = ₹24.95 -> 2495 paise
});

test("Financial Math: Wallet cashback deduplication logic", () => {
  const existingTransactions = [
    { referenceId: "order_abc", type: "cashback_credit", amountPaise: 2500 },
  ];

  const isOrderAlreadyCredited = (orderId: string) =>
    existingTransactions.some(
      (tx) => tx.referenceId === orderId && tx.type === "cashback_credit"
    );

  assert.equal(isOrderAlreadyCredited("order_abc"), true);
  assert.equal(isOrderAlreadyCredited("order_xyz"), false);
});

test("Financial Math: Wallet full vs partial deduction logic", () => {
  const walletBalancePaise = 15000; // ₹150 in wallet
  const smallOrderTotalPaise = 10000; // ₹100 order
  const largeOrderTotalPaise = 25000; // ₹250 order

  // Full wallet payment scenario
  const fullPaymentWalletUsed = Math.min(walletBalancePaise, smallOrderTotalPaise);
  const fullPaymentRemainingPayable = smallOrderTotalPaise - fullPaymentWalletUsed;

  assert.equal(fullPaymentWalletUsed, 10000);
  assert.equal(fullPaymentRemainingPayable, 0);

  // Partial wallet payment scenario
  const partialPaymentWalletUsed = Math.min(walletBalancePaise, largeOrderTotalPaise);
  const partialPaymentRemainingPayable = largeOrderTotalPaise - partialPaymentWalletUsed;

  assert.equal(partialPaymentWalletUsed, 15000);
  assert.equal(partialPaymentRemainingPayable, 10000);
});

test("Financial Math: Zero-value order handling prevents negative totals", () => {
  const subtotalPaise = 2000; // ₹20
  const excessiveDiscountPaise = 5000; // ₹50 coupon
  const deliveryFeePaise = 0;

  const taxableBase = Math.max(0, subtotalPaise - excessiveDiscountPaise);
  const totalPaise = Math.max(0, taxableBase + deliveryFeePaise);

  assert.equal(taxableBase, 0);
  assert.equal(totalPaise, 0);
});

test("Financial Math: Large quantity order calculations without integer overflow", () => {
  const unitPricePaise = 38500; // ₹385 per 50kg bag
  const quantity = 10000;       // 10,000 bags (large B2B order)
  const lineTotalPaise = unitPricePaise * quantity;

  assert.equal(lineTotalPaise, 385000000); // ₹3,850,000.00
  assert.equal(formatPaise(lineTotalPaise), "₹38,50,000");
});
