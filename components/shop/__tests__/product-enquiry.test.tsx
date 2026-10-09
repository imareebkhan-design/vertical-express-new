import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProductEnquiryForm } from "@/components/shop/product-enquiry-form";
import type { ActionResult } from "@/lib/validators";

afterEach(cleanup);

const PID = "11111111-1111-4111-8111-111111111111";

test("collapsed to one button, then a labelled form; submit sends the product id and fields", async () => {
  const calls: Record<string, string>[] = [];
  const submit = async (input: Record<string, string>): Promise<ActionResult<{ enquiryNo: string }>> => {
    calls.push(input);
    return { ok: true, data: { enquiryNo: "ENQ-20261009-ABCDEF12" } };
  };
  render(<ProductEnquiryForm productId={PID} productTitle="XTRA POWER Drill" submit={submit} />);
  fireEvent.click(screen.getByRole("button", { name: /Enquire about this product/ }));
  const form = screen.getByRole("form", { name: "Enquire about XTRA POWER Drill" });
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Asha" } });
  fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "9876543210" } });
  fireEvent.change(screen.getByLabelText("Quantity or pack (optional)"), { target: { value: "2 units" } });
  fireEvent.submit(form);
  await waitFor(() => screen.getByRole("status"));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].productId, PID);
  assert.equal(calls[0].name, "Asha");
  assert.equal(calls[0].phone, "9876543210");
  assert.equal(calls[0].quantity, "2 units");
  assert.equal(calls[0].website, "", "the honeypot is sent empty by a person");
  assert.match(screen.getByRole("status").textContent ?? "", /ENQ-20261009-ABCDEF12/);
  assert.doesNotMatch(screen.getByRole("status").textContent ?? "", /within|hours|minutes|call us/i, "no response-time promise");
});

test("a refusal is shown as an alert and the form stays", async () => {
  const submit = async (): Promise<ActionResult<{ enquiryNo: string }>> => ({
    ok: false,
    error: { code: "RATE_LIMITED", message: "Too many enquiries. Please try again later." },
  });
  render(<ProductEnquiryForm productId={PID} productTitle="Drill" submit={submit} />);
  fireEvent.click(screen.getByRole("button", { name: /Enquire about this product/ }));
  fireEvent.submit(screen.getByRole("form", { name: "Enquire about Drill" }));
  await waitFor(() => screen.getByRole("alert"));
  assert.match(screen.getByRole("alert").textContent ?? "", /Too many enquiries/);
  assert.ok(screen.getByRole("button", { name: "Send enquiry" }));
});
