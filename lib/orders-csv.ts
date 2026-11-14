import { formatIst } from "@/lib/ist";
import { fulfilmentState, paymentState, type ClassifyInput } from "@/lib/order-classify";

/**
 * Orders as CSV for operators. Pure.
 *
 * Status is exported as separate columns — order status, payment, fulfilment —
 * never one merged word. Customer contact details are deliberately left out:
 * name and delivery city/pincode identify the order; the mobile number and
 * street address stay in the console (open the order to see them).
 *
 * Every cell is quoted, and a value a spreadsheet would run as a formula
 * (= + - @, tab, CR) is prefixed with an apostrophe.
 */
export interface CsvOrder extends ClassifyInput {
  orderNo: string;
  placedAt: Date;
  totalPaise: number;
  address: unknown;
  items: { qty: number }[];
  warehouse: { name: string } | null;
  shipments: { status: string; driver?: { name: string } | null }[];
}

export const CSV_COLUMNS = [
  "order_no", "placed_at_ist", "placed_at_utc", "customer_name", "delivery_city", "pincode", "items", "total_inr",
  "order_status", "payment_status", "fulfilment_status", "payment_method", "warehouse", "drivers",
] as const;

export function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function ordersCsv(rows: CsvOrder[], cityOf: Map<string, string>): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const o of rows) {
    const a = (o.address ?? {}) as Record<string, unknown>;
    const pin = typeof a.pincode === "string" ? a.pincode : "";
    const drivers = [...new Set(o.shipments.filter((s) => s.status !== "cancelled" && s.driver).map((s) => s.driver!.name))];
    lines.push(
      [
        o.orderNo, formatIst(o.placedAt), o.placedAt.toISOString(), typeof a.name === "string" ? a.name : "",
        cityOf.get(pin) ?? (typeof a.city === "string" ? a.city : ""), pin, o.items.reduce((n, i) => n + i.qty, 0),
        (o.totalPaise / 100).toFixed(2), o.status, paymentState(o), fulfilmentState(o), o.paymentMethod,
        o.warehouse?.name ?? "", drivers.join("; "),
      ].map(csvCell).join(",")
    );
  }
  return lines.join("\r\n") + "\r\n";
}
