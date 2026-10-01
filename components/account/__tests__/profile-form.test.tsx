import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileForm } from "@/components/account/profile-form";
import type { EditableProfile } from "@/actions/profile";
import type { ActionResult } from "@/lib/validators";

afterEach(cleanup);

const EMPTY: EditableProfile = { fullName: null, buyerType: null, companyName: null, gstin: null };
type Input = Partial<Record<"fullName" | "buyerType" | "companyName" | "gstin", string | null>>;

function recorder(answer: (input: Input) => ActionResult<EditableProfile> | Promise<ActionResult<EditableProfile>>) {
  const calls: Input[] = [];
  return { calls, save: async (input: Input) => { calls.push(input); return answer(input); } };
}

test("shows the saved profile, and sign-in identity as text, not inputs", () => {
  render(
    <ProfileForm
      initial={{ fullName: "Bilal Ahmad", buyerType: "contractor", companyName: "Ahmad Builders", gstin: "01ABCDE1234F1ZE" }}
      phone="+91 90000 00000"
      email={null}
      save={async () => ({ ok: true, data: EMPTY })}
    />
  );
  assert.equal((screen.getByLabelText("Full name") as HTMLInputElement).value, "Bilal Ahmad");
  assert.equal((screen.getByLabelText("Business name") as HTMLInputElement).value, "Ahmad Builders");
  assert.equal((screen.getByLabelText("GSTIN") as HTMLInputElement).value, "01ABCDE1234F1ZE");
  assert.equal((screen.getByLabelText("Contractor / Site supervisor") as HTMLInputElement).checked, true);
  assert.ok(screen.getByText("+91 90000 00000"));
  assert.equal(screen.queryByDisplayValue("+91 90000 00000"), null, "phone is not an editable field");
  assert.equal(screen.queryByText(/invoice/i), null, "no claim that the GSTIN reaches an invoice");
});

test("a refused GSTIN is shown against the GSTIN field, and nothing reads as saved", async () => {
  const user = userEvent.setup();
  const r = recorder(() => ({
    ok: false,
    error: { code: "VALIDATION", message: "That GSTIN doesn't look right — check the 15 characters", field: "gstin" },
  }));
  render(<ProfileForm initial={{ ...EMPTY, fullName: "Bilal" }} phone={null} email={null} save={r.save} />);

  await user.type(screen.getByLabelText("Business name"), "Ahmad Builders");
  await user.type(screen.getByLabelText("GSTIN"), "01abcde1234f1z9");
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  const gstin = screen.getByLabelText("GSTIN");
  await waitFor(() => assert.equal(gstin.getAttribute("aria-invalid"), "true"));
  const describedBy = gstin.getAttribute("aria-describedby");
  assert.ok(describedBy);
  assert.match(document.getElementById(describedBy)!.textContent ?? "", /GSTIN doesn't look right/);
  assert.equal(screen.getByLabelText("Business name").getAttribute("aria-invalid"), null);
  assert.equal(screen.queryByRole("status"), null);
  assert.deepEqual(r.calls, [{ fullName: "Bilal", companyName: "Ahmad Builders", gstin: "01ABCDE1234F1Z9" }]);
});

test("saving shows progress, then the server's values and a saved state", async () => {
  const user = userEvent.setup();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const saved: EditableProfile[] = [];
  const r = recorder(async (input) => {
    await gate;
    return { ok: true, data: { fullName: String(input.fullName), buyerType: "homeowner", companyName: null, gstin: null } };
  });
  render(<ProfileForm initial={EMPTY} phone={null} email={null} save={r.save} onSaved={(p) => saved.push(p)} />);

  await user.type(screen.getByLabelText("Full name"), "  Bilal Ahmad  ");
  await user.click(screen.getByLabelText("Homeowner renovating"));
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  const busy = await screen.findByRole("button", { name: /Saving/ });
  assert.equal((busy as HTMLButtonElement).disabled, true);
  release();

  await screen.findByRole("status");
  assert.equal(screen.getByRole("status").textContent, "Saved.");
  assert.equal((screen.getByLabelText("Full name") as HTMLInputElement).value, "Bilal Ahmad");
  assert.deepEqual(r.calls, [{ fullName: "Bilal Ahmad", buyerType: "homeowner", companyName: null, gstin: null }]);
  assert.equal(saved.length, 1);

  await user.type(screen.getByLabelText("Business name"), "X");
  assert.equal(screen.queryByRole("status"), null, "editing again clears the saved state");
});

test("emptying business fields clears them; a name never set is not sent", async () => {
  const user = userEvent.setup();
  const r = recorder(() => ({ ok: true, data: EMPTY }));
  render(<ProfileForm initial={{ ...EMPTY, companyName: "Old Firm", gstin: "01ABCDE1234F1ZE" }} phone={null} email={null} save={r.save} />);

  await user.clear(screen.getByLabelText("Business name"));
  await user.clear(screen.getByLabelText("GSTIN"));
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByRole("status");
  assert.deepEqual(r.calls, [{ companyName: null, gstin: null }]);
});

test("clearing an existing name is sent, so the server can refuse it", async () => {
  const user = userEvent.setup();
  const r = recorder(() => ({ ok: false, error: { code: "VALIDATION", message: "Enter your name", field: "fullName" } }));
  render(<ProfileForm initial={{ ...EMPTY, fullName: "Bilal" }} phone={null} email={null} save={r.save} />);

  await user.clear(screen.getByLabelText("Full name"));
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => assert.equal(screen.getByLabelText("Full name").getAttribute("aria-invalid"), "true"));
  assert.equal(r.calls[0].fullName, "");
});

test("a failed request says so and keeps what was typed", async () => {
  const user = userEvent.setup();
  render(
    <ProfileForm
      initial={EMPTY}
      phone={null}
      email={null}
      save={async () => {
        throw new Error("network");
      }}
    />
  );
  await user.type(screen.getByLabelText("Full name"), "Bilal");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  const alert = await screen.findByRole("alert");
  assert.match(alert.textContent ?? "", /couldn't save/);
  assert.equal((screen.getByLabelText("Full name") as HTMLInputElement).value, "Bilal");
  assert.equal((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled, false);
});
