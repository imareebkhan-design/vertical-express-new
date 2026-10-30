import test, { afterEach, before, mock } from "node:test";
import assert from "node:assert/strict";

/**
 * Issue #1 — the address forms must never decide a city or state on the
 * customer's behalf. They used to start from "Srinagar" / "Jammu & Kashmir":
 * the desktop form with the fields visible, the mobile checkout and account
 * sheets with no fields at all — so a Delhi site was saved as one in J&K.
 *
 * The forms are rendered for real; only the server action, the delivery
 * context and the map picker are stand-ins.
 */

const saved: Record<string, unknown>[] = [];
mock.module("@/actions/address", {
  namedExports: {
    saveAddress: async (input: Record<string, unknown>) => {
      saved.push(input);
      return { ok: true, data: { id: "addr-new", serviceable: true } };
    },
    removeAddress: async () => ({ ok: true, data: null }),
  },
});
mock.module("@/hooks/use-delivery-pincode", {
  namedExports: { useDeliveryPincode: () => ({ pincode: null, city: null, place: null, setPincode() {}, setPlace() {} }) },
});
/* The map picker stand-in confirms one place when pressed (the real picker is covered in components/location). */
const RAJBAGH = {
  label: "Rajbagh", formattedAddress: "12 Bund Road, Rajbagh, Srinagar 190008", pincode: "190008",
  city: "Srinagar", state: "Jammu and Kashmir", lat: 34.0681, lng: 74.8275, placeId: "ChIJ-raj",
};
mock.module("@/components/location/address-location", {
  namedExports: {
    AddressLocation: ({ onChange }: { onChange: (p: typeof RAJBAGH) => void }) => (
      <button type="button" onClick={() => onChange(RAJBAGH)}>confirm Rajbagh</button>
    ),
  },
});

/* Loaded after the mocks are registered (this package is compiled as CommonJS, so no top-level await). */
let RTL: typeof import("@testing-library/react");
let AddressForm: typeof import("../address-form").AddressForm;
before(async () => {
  RTL = await import("@testing-library/react");
  ({ AddressForm } = await import("../address-form"));
});

afterEach(() => { RTL.cleanup(); saved.length = 0; });

test("typed by hand, city and state start empty and are asked for", () => {
  RTL.render(<AddressForm onDone={() => {}} />);
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: /Enter the address without the map/ }));
  const city = RTL.screen.getByLabelText("City") as HTMLInputElement;
  const state = RTL.screen.getByLabelText("State") as HTMLInputElement;
  assert.equal(city.value, "");
  assert.equal(state.value, "");
  assert.equal(document.body.textContent?.includes("Jammu"), false);
  assert.equal(document.body.textContent?.includes("Srinagar"), false);
});

test("a typed Delhi address is saved as Delhi, without coordinates", async () => {
  RTL.render(<AddressForm onDone={() => {}} />);
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: /Enter the address without the map/ }));
  const type = (label: string, value: string) => RTL.fireEvent.change(RTL.screen.getByLabelText(label), { target: { value } });
  type("Full name", "Test Customer");
  type("Phone", "9000000001");
  type("House / flat / floor", "House 12");
  type("City", "New Delhi");
  type("State", "Delhi");
  type("Pincode", "110001");
  RTL.fireEvent.submit(RTL.screen.getByRole("button", { name: "Save address" }).closest("form")!);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].city, "New Delhi");
  assert.equal(saved[0].state, "Delhi");
  assert.equal(saved[0].latitude, null);
});

test("a confirmed pin pre-fills city and state, and the customer's correction is what is saved (issue #1)", async () => {
  RTL.render(<AddressForm onDone={() => {}} />);
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "confirm Rajbagh" }));
  const city = RTL.screen.getByLabelText("City") as HTMLInputElement;
  const state = RTL.screen.getByLabelText("State") as HTMLInputElement;
  assert.deepEqual([city.value, state.value], ["Srinagar", "Jammu and Kashmir"], "shown, pre-filled from the place");

  const type = (label: string, value: string) => RTL.fireEvent.change(RTL.screen.getByLabelText(label), { target: { value } });
  type("Full name", "Test Customer");
  type("Phone", "9000000001");
  type("House / flat / floor", "House 12");
  type("City", "Budgam");
  RTL.fireEvent.submit(RTL.screen.getByRole("button", { name: "Save address" }).closest("form")!);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].city, "Budgam", "the correction wins over Google's locality");
  assert.equal(saved[0].state, "Jammu and Kashmir");
  assert.deepEqual([saved[0].latitude, saved[0].pincode], [34.0681, "190008"], "the pin and its pincode are kept");
});
