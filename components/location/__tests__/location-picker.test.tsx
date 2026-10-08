import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LocationPickerView, type LocationPickerDeps } from "../location-picker-view";
import type { DeliveryCandidate } from "@/lib/location/delivery-candidate";
import { getBrowserPosition, messageFor, reasonForCode } from "@/lib/location/browser-position";
import { formattedFor, labelFor } from "@/lib/location/delivery-candidate";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const RAJBAGH: DeliveryCandidate = {
  label: "Rajbagh",
  formattedAddress: "12 Bund Road, Rajbagh, Srinagar 190008",
  pincode: "190008",
  locality: "Rajbagh",
  city: "Srinagar",
  state: "Jammu and Kashmir",
  lat: 34.0681,
  lng: 74.8275,
  placeId: null,
  serviceable: true,
};

function deps(over: Partial<LocationPickerDeps> = {}): LocationPickerDeps {
  return {
    locate: async () => ({ ok: true, data: RAJBAGH }),
    search: async () => ({ ok: true, data: { suggestions: [] } }),
    position: async () => ({ ok: true, lat: 34.0681, lng: 74.8275, accuracyM: 20 }),
    ...over,
  };
}

const flush = () => act(async () => {});

test("current location: permission granted → address shown for confirmation → saved only on 'Deliver here'", async () => {
  let done = 0;
  render(<LocationPickerView onDone={() => done++} {...deps()} />);
  fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
  await flush();
  assert.ok(screen.getByText("Rajbagh"));
  assert.ok(screen.getByText("We deliver here."));
  assert.equal(localStorage.getItem("ve_pincode"), null, "nothing saved before the customer confirms");

  fireEvent.click(screen.getByRole("button", { name: "Deliver here" }));
  assert.equal(done, 1);
  assert.equal(localStorage.getItem("ve_pincode"), "190008");
  const place = JSON.parse(localStorage.getItem("ve_delivery_place") ?? "{}");
  assert.deepEqual([place.source, place.label, place.lat, place.lng], ["gps", "Rajbagh", 34.0681, 74.8275]);
});

test("permission denied: a clear message, nothing saved, and search stays usable", async () => {
  let located = 0;
  render(
    <LocationPickerView
      onDone={() => {}}
      {...deps({ position: async () => ({ ok: false, reason: "denied" }), locate: async () => (located++, { ok: true, data: RAJBAGH }) })}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
  await flush();
  assert.match(screen.getByRole("alert").textContent ?? "", /Location access is off/);
  assert.equal(located, 0, "no billed lookup without a position");
  assert.equal(localStorage.getItem("ve_pincode"), null);
  const box = screen.getByLabelText("Or search for your address") as HTMLInputElement;
  assert.equal(box.disabled, false);
});

test("an unserviceable place cannot be saved", async () => {
  render(<LocationPickerView onDone={() => {}} {...deps({ locate: async () => ({ ok: true, data: { ...RAJBAGH, serviceable: false, pincode: "110001" } }) })} />);
  fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));
  await flush();
  assert.match(screen.getByRole("alert").textContent ?? "", /don.t deliver to 110001/);
  assert.equal(screen.queryByRole("button", { name: "Deliver here" }), null);
});

test("manual search: suggestion → resolve → confirm saves the searched place, replacing a GPS one", async () => {
  localStorage.setItem("ve_pincode", "190008");
  localStorage.setItem("ve_delivery_place", JSON.stringify({ source: "gps", label: "Rajbagh", formattedAddress: "x", lat: 1, lng: 1, placeId: null }));
  const calls: unknown[] = [];
  const search: LocationPickerDeps["search"] = async (input) => {
    calls.push(input);
    const i = input as { action: string };
    return i.action === "suggest"
      ? { ok: true, data: { suggestions: [{ id: "place-1", text: "Hyderpora, Srinagar" }] } }
      : { ok: true, data: { candidate: { ...RAJBAGH, label: "Hyderpora", pincode: "190014", placeId: "place-1", lat: 34.05, lng: 74.79 } } };
  };
  render(<LocationPickerView onDone={() => {}} {...deps({ search })} />);
  fireEvent.change(screen.getByLabelText("Or search for your address"), { target: { value: "Hyder" } });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 500));
  });
  fireEvent.click(screen.getByRole("button", { name: /Hyderpora, Srinagar/ }));
  await flush();
  fireEvent.click(screen.getByRole("button", { name: "Deliver here" }));
  const place = JSON.parse(localStorage.getItem("ve_delivery_place") ?? "{}");
  assert.deepEqual([place.source, place.label, place.placeId], ["search", "Hyderpora", "place-1"]);
  assert.equal(localStorage.getItem("ve_pincode"), "190014");
  assert.equal((calls[0] as { action: string }).action, "suggest");
});

test("browser outcomes map to their own messages; the API is not Google's", async () => {
  assert.equal(reasonForCode(1), "denied");
  assert.equal(reasonForCode(2), "unavailable");
  assert.equal(reasonForCode(3), "timeout");
  for (const r of ["denied", "unavailable", "timeout", "unsupported"] as const) assert.match(messageFor(r), /search|Search/);
  assert.deepEqual(await getBrowserPosition(undefined), { ok: false, reason: "unsupported" });
  const geo = {
    getCurrentPosition: (_ok: PositionCallback, err: PositionErrorCallback) => err({ code: 3 } as GeolocationPositionError),
  } as unknown as Geolocation;
  assert.deepEqual(await getBrowserPosition(geo), { ok: false, reason: "timeout" });
});

test("labels: locality first, then street, then city", () => {
  assert.equal(labelFor({ line1: "12 Bund Road", locality: "Rajbagh", city: "Srinagar", pincode: "190008" }), "Rajbagh");
  assert.equal(labelFor({ line1: "", locality: null, city: "Srinagar", pincode: "190008" }), "Srinagar");
  assert.equal(formattedFor({ line1: "Srinagar", locality: null, city: "Srinagar", pincode: "190001" }), "Srinagar 190001");
});
