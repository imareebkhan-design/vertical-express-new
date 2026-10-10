import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BulkApproval, type BulkRow } from "@/components/admin/bulk-approval";

afterEach(cleanup);

const row = (n: number, title: string, packSensitive = false): BulkRow => ({
  productId: `00000000-0000-4000-8000-00000000000${n}`, imageId: `00000000-0000-4000-8000-00000000010${n}`,
  sha256: String(n).repeat(64), updatedAt: "2026-10-10T00:00:00.000Z", title, brand: "XTRA POWER",
  url: `https://example.test/${n}.webp`, packSensitive,
});

test("nothing starts ticked; approval needs a tick, evidence, the confirmation and pack notes for kits", async () => {
  const sent: unknown[] = [];
  render(<BulkApproval rows={[row(1, "Caulking Gun 103"), row(2, "Router Bit Set 12 Pcs", true)]}
    submit={async (input) => { sent.push(input); return { ok: true, data: { approved: input.items.map((i) => i.productId), failed: [] } }; }} />);
  const button = () => screen.getByRole("button", { name: /^Approve \d+ product/ }) as HTMLButtonElement;
  assert.match(screen.getByText(/0 of 2 ticked/).textContent ?? "", /0 of 2/);
  assert.equal(button().disabled, true);

  fireEvent.click(screen.getByRole("checkbox", { name: "Approve Caulking Gun 103" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Approve Router Bit Set 12 Pcs" }));
  fireEvent.change(screen.getByLabelText(/Evidence/), { target: { value: "Checked against catalogue" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /I have looked at every ticked photo/ }));
  assert.equal(button().disabled, true, "the kit still needs its pack note");
  fireEvent.change(screen.getByLabelText("Pack or contents for Router Bit Set 12 Pcs"), { target: { value: "12 bits in case" } });
  assert.equal(button().disabled, false);

  fireEvent.click(button());
  await waitFor(() => screen.getByRole("status"));
  assert.match(screen.getByRole("status").textContent ?? "", /2 approved/);
  const payload = sent[0] as { items: { productId: string; packDecision: string | null }[]; evidence: string };
  assert.equal(payload.items.length, 2);
  assert.equal(payload.items.find((i) => i.productId.endsWith("2"))?.packDecision, "12 bits in case");
  assert.equal(payload.evidence, "Checked against catalogue");
});
