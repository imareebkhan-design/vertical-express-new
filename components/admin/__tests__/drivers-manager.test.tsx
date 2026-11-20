import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { DriversManagerView, type RosterActions } from "@/components/admin/drivers-manager-view";
import type { RosterDetailed } from "@/lib/services/admin/roster-write";
import type { ActionResult } from "@/lib/validators";

afterEach(cleanup);

const ok = async (): Promise<ActionResult<null>> => ({ ok: true, data: null });
function actions(calls: Record<string, unknown[]> = {}): RosterActions {
  const rec = (k: string) => async (input: unknown) => { (calls[k] ??= []).push(input); return ok(); };
  return {
    createDriver: rec("createDriver"), updateDriver: rec("updateDriver"), setDriverActive: rec("setDriverActive"),
    releaseDriverLogin: rec("releaseDriverLogin"), createVehicle: rec("createVehicle"), setVehicleActive: rec("setVehicleActive"),
  };
}
const empty: RosterDetailed = { drivers: [], vehicles: [] };
const created = new Date("2026-10-14T05:00:00Z");
const roster: RosterDetailed = {
  drivers: [
    { id: "d1", name: "Imran", phone: "+919000000101", isActive: true, createdAt: created, appLinked: true, deliveredCount: 3,
      shipments: [{ id: "s1", status: "out_for_delivery", order: { orderNo: "VE-2026-AAA" } }] },
    { id: "d2", name: "Bilal", phone: "+919000000102", isActive: true, createdAt: created, appLinked: false, deliveredCount: 0, shipments: [] },
  ],
  vehicles: [{ id: "v1", registration: "JK01AB1234", kind: "bike", isActive: true, createdAt: created, activeShipments: 1 }],
};

test("empty roster explains the first step; adding a driver sends name + phone", async () => {
  const calls: Record<string, unknown[]> = {};
  render(<DriversManagerView roster={empty} history={{}} actions={actions(calls)} onDone={() => {}} />);
  assert.ok(screen.getByText("No drivers yet. Add the first one above."));
  const form = screen.getByRole("form", { name: "Add a driver" });
  fireEvent.change(within(form).getByLabelText("Driver name"), { target: { value: "Imran" } });
  fireEvent.change(within(form).getByLabelText("Mobile number"), { target: { value: "9000000101" } });
  fireEvent.submit(form);
  await waitFor(() => screen.getByRole("status"));
  assert.deepEqual(calls.createDriver, [{ name: "Imran", phone: "9000000101" }]);
});

test("each driver shows whether they have signed in to the app, and their work", () => {
  render(<DriversManagerView roster={roster} history={{}} actions={actions()} onDone={() => {}} />);
  const imran = screen.getByRole("listitem", { name: "Driver Imran" });
  assert.ok(within(imran).getByText("Signed in to app"));
  assert.ok(within(imran).getByRole("link", { name: "VE-2026-AAA" }));
  assert.match(imran.textContent ?? "", /3 delivered/);
  const bilal = screen.getByRole("listitem", { name: "Driver Bilal" });
  assert.ok(within(bilal).getByText("Not signed in yet"));
  assert.equal(within(bilal).queryByRole("button", { name: "Release app login" }), null, "nothing to release before first sign-in");
  assert.equal((within(imran).getByRole("button", { name: "Release app login" }) as HTMLButtonElement).disabled, true, "not while on the road");
});

test("editing a signed-in driver locks the phone field", () => {
  render(<DriversManagerView roster={roster} history={{}} actions={actions()} onDone={() => {}} />);
  const imran = screen.getByRole("listitem", { name: "Driver Imran" });
  fireEvent.click(within(imran).getByRole("button", { name: "Edit" }));
  const phone = within(imran).getByLabelText(/Mobile number \(locked/) as HTMLInputElement;
  assert.equal(phone.readOnly, true);
});

test("a refused action is shown as an alert", async () => {
  const a = actions();
  a.createVehicle = async () => ({ ok: false, error: { code: "CONFLICT", message: "That registration is already on the roster" } });
  render(<DriversManagerView roster={roster} history={{}} actions={a} onDone={() => {}} />);
  const form = screen.getByRole("form", { name: "Add a vehicle" });
  fireEvent.change(within(form).getByLabelText("Registration number"), { target: { value: "JK01AB1234" } });
  fireEvent.submit(form);
  await waitFor(() => screen.getByRole("alert"));
  assert.match(screen.getByRole("alert").textContent ?? "", /already on the roster/);
});
