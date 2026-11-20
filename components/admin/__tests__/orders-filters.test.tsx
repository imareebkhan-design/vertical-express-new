import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import { OrdersFilters } from "@/components/admin/orders/orders-filters";
import { parseOrdersQuery } from "@/lib/admin-orders-query";

afterEach(cleanup);
const options = { cities: [{ id: "0b7a3a3e-1111-4222-8333-444455556666", name: "Delhi" }], warehouses: [], drivers: [] };

function setup(raw: Record<string, string> = {}) {
  const went: string[] = [];
  render(<OrdersFilters query={parseOrdersQuery(raw)} options={options} navigate={(h) => went.push(h)} />);
  return went;
}

test("search keeps the current tab and resets to page 1", () => {
  const went = setup({ tab: "to_pack", page: "3" });
  fireEvent.change(screen.getByLabelText("Search orders"), { target: { value: "VE-2026-AB" } });
  fireEvent.submit(screen.getByRole("search"));
  assert.deepEqual(went, ["/admin/orders?tab=to_pack&q=VE-2026-AB"]);
});

test("date presets and sort write to the URL", () => {
  const went = setup();
  fireEvent.change(screen.getByLabelText("Date placed"), { target: { value: "today" } });
  fireEvent.change(screen.getByLabelText("Sort orders"), { target: { value: "total_desc" } });
  assert.deepEqual(went, ["/admin/orders?range=today", "/admin/orders?sort=total_desc"]);
});

test("custom range asks for From/To and applies both", () => {
  const went = setup();
  fireEvent.change(screen.getByLabelText("Date placed"), { target: { value: "custom" } });
  const form = screen.getByRole("form", { name: "Custom date range" });
  fireEvent.change(within(form).getByLabelText("From date"), { target: { value: "2026-10-01" } });
  fireEvent.change(within(form).getByLabelText("To date"), { target: { value: "2026-10-15" } });
  fireEvent.submit(form);
  assert.deepEqual(went, ["/admin/orders?range=custom&from=2026-10-01&to=2026-10-15"]);
});

test("advanced filters combine and clear", () => {
  const went = setup({ q: "x" });
  fireEvent.click(screen.getByRole("button", { name: "More filters" }));
  fireEvent.click(screen.getByLabelText("Paid"));
  fireEvent.click(screen.getByLabelText("Cash on delivery"));
  fireEvent.click(screen.getByLabelText("Delhi"));
  fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  assert.equal(went[0], "/admin/orders?q=x&pay=paid%2Ccod&city=0b7a3a3e-1111-4222-8333-444455556666");
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  assert.equal(went[1], "/admin/orders");
});
