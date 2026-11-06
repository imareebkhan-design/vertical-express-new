import test, { afterEach, before, mock } from "node:test";
import assert from "node:assert/strict";
import type { UpdatePlan } from "@/lib/services/admin/catalogue-update";

/**
 * The "Prices & stock files" screen: a preview with conflicts cannot be
 * applied; a clean one applies with the previewed digest; a plan that changed
 * since the preview is shown again rather than written.
 */
const refreshed: number[] = [];
mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh: () => refreshed.push(1) }) } });

let RTL: typeof import("@testing-library/react");
let CatalogueUpdate: typeof import("../catalogue-update").CatalogueUpdate;
before(async () => {
  RTL = await import("@testing-library/react");
  ({ CatalogueUpdate } = await import("../catalogue-update"));
});
afterEach(() => RTL.cleanup());

const counts = (o: Partial<UpdatePlan["counts"]>) => ({ create: 0, update: 0, unchanged: 0, invalid: 0, conflict: 0, ...o });
const conflicted: UpdatePlan = {
  digest: "a".repeat(64), applicable: false, counts: counts({ create: 1, conflict: 1 }),
  rows: [
    { line: 2, action: "create", scope: "acc-cement", sku: "ACC-50", changes: [{ field: "mrpPaise", from: null, to: 49000 }, { field: "pricePaise", from: null, to: 49000 }] },
    { line: 3, action: "conflict", scope: "acc-cement", sku: "ACC-25", changes: [], message: "Changed since your export" },
  ],
};
const clean: UpdatePlan = { ...conflicted, digest: "b".repeat(64), applicable: true, counts: counts({ create: 1 }), rows: [conflicted.rows[0]] };

async function upload(text = "csv") {
  const input = RTL.screen.getByLabelText("Upload edited file") as HTMLInputElement;
  const file = new File([text], "variants.csv", { type: "text/csv" });
  await RTL.act(async () => { RTL.fireEvent.change(input, { target: { files: [file] } }); await new Promise((r) => setTimeout(r, 0)); });
}

test("a preview with a conflict lists every row and cannot be applied", async () => {
  let applied = 0;
  RTL.render(<CatalogueUpdate actions={{
    preview: async () => ({ ok: true, data: conflicted }),
    apply: async () => { applied++; return { ok: true, data: { ok: true, batchId: "x", created: 0, updated: 0, unchanged: 0 } }; },
    exportSheet: async () => ({ ok: true, data: { csv: "" } }),
  }} />);
  await upload();
  assert.ok(RTL.screen.getByText(/1 to add · 0 to change · 0 unchanged · 0 to fix · 1 conflicts/));
  assert.ok(RTL.screen.getByText("MRP — → ₹490; Price — → ₹490"));
  assert.ok(RTL.screen.getByText("Changed since your export"));
  const button = RTL.screen.getByRole("button", { name: /Nothing can be applied/ }) as HTMLButtonElement;
  assert.equal(button.disabled, true);
  assert.equal(applied, 0);
});

test("a clean preview applies with its digest; a changed plan is shown again, not written", async () => {
  const sent: string[] = [];
  let round = 0;
  RTL.render(<CatalogueUpdate actions={{
    preview: async () => ({ ok: true, data: clean }),
    apply: async ({ digest }) => {
      sent.push(digest);
      round++;
      return round === 1
        ? { ok: true, data: { ok: false, reason: "plan_changed", plan: conflicted } }
        : { ok: true, data: { ok: true, batchId: "12345678-batch", created: 1, updated: 0, unchanged: 0 } };
    },
    exportSheet: async () => ({ ok: true, data: { csv: "" } }),
  }} />);
  await upload();
  await RTL.act(async () => { RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "Apply 1 changes" })); });
  assert.deepEqual(sent, ["b".repeat(64)]);
  assert.ok(RTL.screen.getByText(/changed since your preview. Nothing was written/));
  assert.ok(RTL.screen.getByText("Changed since your export"), "the new preview replaces the old one");
  assert.equal(refreshed.length, 0);
});
