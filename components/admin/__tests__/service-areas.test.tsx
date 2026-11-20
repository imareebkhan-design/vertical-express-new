import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ServiceAreasView, type AreaCity, type ServiceAreaActions } from "@/components/admin/service-areas-view";

afterEach(cleanup);

function actions(calls: Record<string, unknown[]> = {}): ServiceAreaActions {
  const rec = (k: string, data: unknown = null) => async (...input: unknown[]) => {
    (calls[k] ??= []).push(input.length === 1 ? input[0] : input);
    return { ok: true as const, data } as never;
  };
  return {
    createCity: rec("createCity", { id: "new" }),
    setCityLive: rec("setCityLive"),
    includePincodes: rec("includePincodes", { created: 1, updated: 0, unchanged: 0 }),
    setPincodeIncluded: rec("setPincodeIncluded"),
    savePincode: rec("savePincode"),
    importCsv: rec("importCsv", { created: 0, updated: 0, unchanged: 0 }),
  };
}

const pin = (pincode: string, isActive = true) => ({
  pincode, area: null, warehouseId: "w1", warehouseName: "Srinagar Central",
  etaMinutes: 0, deliveryFeePaise: 0, codAllowed: false, isActive,
});
const cities: AreaCity[] = [
  { id: "sxr", name: "Srinagar", state: "Jammu & Kashmir", isLive: true, included: 1, excluded: 1, pincodes: [pin("190001"), pin("190002", false)] },
  { id: "del", name: "Delhi", state: "Delhi", isLive: false, included: 1, excluded: 0, pincodes: [pin("110054")] },
];
const W = [{ id: "w1", name: "Srinagar Central" }];

test("cities show Live/Off with counts; an off city says its pincodes are not sold", () => {
  render(<ServiceAreasView cities={cities} warehouses={W} codGloballyOff={false} actions={actions()} onDone={() => {}} />);
  assert.match(screen.getByRole("button", { name: "Open Srinagar" }).textContent ?? "", /1 included · 1 excluded/);
  fireEvent.click(screen.getByRole("button", { name: "Open Delhi" }));
  const area = screen.getByRole("region", { name: "Delhi service area" });
  assert.ok(within(area).getByText(/Off — no pincode here is sold to/));
  assert.ok(within(area).getByText("Included (city off)"));
  assert.ok(within(area).getByRole("button", { name: "Go live" }));
});

test("go live sends the city; exclude sends the pincode", async () => {
  const calls: Record<string, unknown[]> = {};
  render(<ServiceAreasView cities={cities} warehouses={W} codGloballyOff={false} actions={actions(calls)} onDone={() => {}} initialCityId="del" />);
  fireEvent.click(screen.getByRole("button", { name: "Go live" }));
  await waitFor(() => screen.getByRole("status"));
  assert.deepEqual(calls.setCityLive, [{ cityId: "del", isLive: true }]);
  const exclude = screen.getByRole("button", { name: "Exclude 110054" }) as HTMLButtonElement;
  await waitFor(() => assert.equal(exclude.disabled, false));
  fireEvent.click(exclude);
  await waitFor(() => assert.equal(calls.setPincodeIncluded?.length, 1));
  assert.deepEqual(calls.setPincodeIncluded, [{ pincode: "110054", isActive: false }]);
});

test("include sends the typed list and terms for the selected city", async () => {
  const calls: Record<string, unknown[]> = {};
  render(<ServiceAreasView cities={cities} warehouses={W} codGloballyOff={false} actions={actions(calls)} onDone={() => {}} initialCityId="del" />);
  fireEvent.change(screen.getByLabelText("Pincodes to include"), { target: { value: "110001-110003, 110054" } });
  fireEvent.change(screen.getByLabelText("Area name"), { target: { value: "Trial" } });
  fireEvent.click(screen.getByRole("button", { name: "Include" }));
  await waitFor(() => screen.getByRole("status"));
  assert.deepEqual(calls.includePincodes, [{
    cityId: "del", pincodes: "110001-110003, 110054", area: "Trial", warehouseId: "w1",
    etaMinutes: "", deliveryFee: "", codAllowed: false,
  }]);
});

test("adding a city sends name and state", async () => {
  const calls: Record<string, unknown[]> = {};
  render(<ServiceAreasView cities={cities} warehouses={W} codGloballyOff={false} actions={actions(calls)} onDone={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Add a city" }));
  fireEvent.change(screen.getByLabelText("City name"), { target: { value: "Mumbai" } });
  fireEvent.change(screen.getByLabelText("State"), { target: { value: "Maharashtra" } });
  fireEvent.click(screen.getByRole("button", { name: "Add city" }));
  await waitFor(() => screen.getByRole("status"));
  assert.deepEqual(calls.createCity, [{ name: "Mumbai", state: "Maharashtra" }]);
  assert.match(screen.getByRole("status").textContent ?? "", /Off until you go live/);
});
