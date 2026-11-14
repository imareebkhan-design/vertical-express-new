import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ApprovalForm } from "@/components/admin/approval-form";
import type { ApprovalInput } from "@/lib/services/admin/catalogue-approval";
import type { ActionResult } from "@/lib/validators";

afterEach(cleanup);
const base = { productId: "p1", imageId: "i1", sha256: "a".repeat(64), updatedAt: "2026-10-09T10:00:00.000Z" };

test("nothing is pre-selected and nothing is sent without both decisions", async () => {
  const calls: ApprovalInput[] = [];
  render(<ApprovalForm {...base} packSensitive={false} submit={async (i) => { calls.push(i); return { ok: true, data: { public: true } }; }} />);
  for (const r of screen.getAllByRole("radio")) assert.equal((r as HTMLInputElement).checked, false);
  fireEvent.submit(screen.getByRole("form", { name: "Approval decision" }));
  await waitFor(() => screen.getByRole("alert"));
  assert.equal(calls.length, 0);
  assert.equal(screen.queryByLabelText("Pack / accessories"), null, "no pack field for a plain title");
});

test("a decision carries what the screen showed (sha256, updatedAt) for conflict protection", async () => {
  const calls: ApprovalInput[] = [];
  const submit = async (i: ApprovalInput): Promise<ActionResult<{ public: boolean }>> => { calls.push(i); return { ok: true, data: { public: true } }; };
  render(<ApprovalForm {...base} packSensitive submit={submit} />);
  fireEvent.click(screen.getByLabelText("Exact model confirmed"));
  fireEvent.click(screen.getByLabelText("approved exact"));
  fireEvent.change(screen.getByLabelText("Pack / accessories"), { target: { value: "12 bits in case" } });
  fireEvent.change(screen.getByLabelText("Evidence"), { target: { value: "Checked manufacturer page" } });
  fireEvent.submit(screen.getByRole("form", { name: "Approval decision" }));
  await waitFor(() => screen.getByRole("status"));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].expectedImageSha256, base.sha256);
  assert.equal(calls[0].expectedProductUpdatedAt, base.updatedAt);
  assert.equal(calls[0].identity, "CONFIRMED");
  assert.equal(calls[0].packDecision, "12 bits in case");
  assert.equal("approvedBy" in calls[0], false, "the client never names an approver");
});
