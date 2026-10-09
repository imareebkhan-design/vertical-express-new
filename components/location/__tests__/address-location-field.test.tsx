import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AddressLocationField } from "../address-location-field";
import type { PinnedLocation } from "@/lib/location/address-pin";
import type { DeliveryCandidate } from "@/lib/location/delivery-candidate";

afterEach(cleanup);

const PICKED: DeliveryCandidate = {
  label: "Hyderpora",
  formattedAddress: "Peerbagh, Hyderpora, Srinagar 190014",
  pincode: "190014",
  locality: "Hyderpora",
  city: "Srinagar",
  state: "Jammu and Kashmir",
  lat: 34.0507,
  lng: 74.7862,
  placeId: "ChIJ-hyd",
  serviceable: true,
};

/* The real picker is covered in location-picker.test.tsx; here a stand-in confirms one place. */
const fakePicker = ({ onDone, onPick }: { onDone: () => void; onPick: (p: DeliveryCandidate) => void }) => (
  <button type="button" onClick={() => (onPick(PICKED), onDone())}>
    pick Hyderpora
  </button>
);

test("a new address opens on the picker; the confirmed place becomes the address's pin, with id and coordinates", () => {
  const changes: PinnedLocation[] = [];
  const { rerender } = render(<AddressLocationField value={null} onChange={(p) => changes.push(p)} picker={fakePicker} />);
  fireEvent.click(screen.getByRole("button", { name: "pick Hyderpora" }));
  assert.deepEqual([changes[0].placeId, changes[0].lat, changes[0].lng, changes[0].pincode], ["ChIJ-hyd", 34.0507, 74.7862, "190014"]);

  rerender(<AddressLocationField value={changes[0]} onChange={(p) => changes.push(p)} picker={fakePicker} />);
  assert.ok(screen.getByText("Peerbagh, Hyderpora, Srinagar 190014"));
  fireEvent.click(screen.getByRole("button", { name: "Change" }));
  assert.ok(screen.getByRole("button", { name: "pick Hyderpora" }), "Change reopens the picker");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  assert.ok(screen.getByText("Hyderpora"), "Cancel keeps the existing pin");
});
