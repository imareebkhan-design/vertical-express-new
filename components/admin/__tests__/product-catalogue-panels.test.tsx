import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  DetailsPanel,
  PhotosPanel,
  VariantsPanel,
  type AddVariant,
  type SaveDetails,
  type UploadPhoto,
} from "../product-catalogue-panels";

afterEach(cleanup);

/**
 * The panels must say what an edit costs before it is made, send exactly what
 * was typed, and never claim an uploaded photo is live.
 */

const ok = <T,>(data: T) => ({ ok: true as const, data });

test("editing the description alone warns of nothing; editing a specification warns before saving", async () => {
  const calls: Parameters<SaveDetails>[0][] = [];
  const save: SaveDetails = async (i) => (calls.push(i), ok({ identityReset: true, commercialReset: true }));
  render(<DetailsPanel productId="p1" description="Old" unitLabel="per bag" specs={[{ label: "Grade", value: "OPC 53" }]} save={save} />);
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "New copy" } });
  assert.equal(screen.queryByRole("alert"), null, "copy is not identity");
  fireEvent.change(screen.getByLabelText("Specification 1 value"), { target: { value: "OPC 43" } });
  assert.match(screen.getByRole("alert").textContent ?? "", /takes it out of the shop/);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save details" })));
  assert.deepEqual(calls, [{ productId: "p1", description: "New copy", unitLabel: "per bag", specs: [{ label: "Grade", value: "OPC 43" }] }]);
  assert.match(screen.getByRole("status").textContent ?? "", /left the shop/);
});

test("a refused save shows the server's message", async () => {
  const save: SaveDetails = async () => ({ ok: false, error: { code: "VALIDATION", message: "The unit needs 1–40 characters" } });
  render(<DetailsPanel productId="p1" description="" unitLabel="per bag" specs={[]} save={save} />);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save details" })));
  assert.equal(screen.getByRole("alert").textContent, "The unit needs 1–40 characters");
});

test("the default variant cannot be retired from the screen; a new variant sends rupees as typed", async () => {
  const added: Parameters<AddVariant>[0][] = [];
  const add: AddVariant = async (i) => (added.push(i), ok({ variantId: "v3" }));
  render(
    <VariantsPanel
      productId="p1"
      variants={[
        { id: "v1", name: "50 kg", sku: "C-50", price: "₹398", isActive: true, isDefault: true },
        { id: "v2", name: "25 kg", sku: "C-25", price: "₹210", isActive: false, isDefault: false },
      ]}
      warehouses={[{ id: "w1", name: "Rambagh" }]}
      add={add}
      setActive={async () => ok(null)}
      setDefault={async () => ok(null)}
    />
  );
  assert.equal(screen.queryAllByRole("button", { name: "Retire" }).length, 0, "only the default is active, and it cannot be retired");
  assert.equal(screen.getAllByRole("button", { name: "Restore" }).length, 1);
  assert.equal(screen.queryByRole("button", { name: "Make default" }), null, "a retired variant cannot lead");
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "10 kg" } });
  fireEvent.change(screen.getByLabelText("SKU"), { target: { value: "C-10" } });
  fireEvent.change(screen.getByLabelText("Selling price (₹, incl. GST)"), { target: { value: "98.50" } });
  fireEvent.change(screen.getByLabelText("Stock row in (optional)"), { target: { value: "w1" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add variant" })));
  assert.deepEqual(added, [{ productId: "p1", name: "10 kg", sku: "C-10", price: "98.50", mrp: "", warehouseId: "w1" }]);
  assert.match(screen.getByRole("status").textContent ?? "", /no stock until stock is counted in/);
});

test("an uploaded photo is reported as awaiting approval, and removal needs a second click", async () => {
  const sent: FormData[] = [];
  const upload: UploadPhoto = async (f) => (sent.push(f), { ok: true });
  const removed: string[] = [];
  render(
    <PhotosPanel
      slug="cement-50"
      photos={[{ id: "i1", url: "https://example.test/a.png", alt: "Bag", isPrimary: true, approved: true, licence: "manufacturer-official-dealer-use" }]}
      licences={["manufacturer-official-dealer-use", "homerun-library-owner-licensed"]}
      uploadEnabled
      setPrimary={async () => ok(null)}
      remove={async ({ imageId }) => (removed.push(imageId), ok({ wasPrimary: true }))}
      upload={upload}
    />
  );
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "bag.jpg", { type: "image/jpeg" });
  fireEvent.change(screen.getByLabelText("Photo (JPEG, PNG or WebP, up to 8 MB)"), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText("Describe the photo"), { target: { value: "Back of bag" } });
  fireEvent.change(screen.getByLabelText("Where it came from (https link)"), { target: { value: "https://maker.example/p" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Upload photo" })));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].get("slug"), "cement-50");
  assert.equal(sent[0].get("licence"), "manufacturer-official-dealer-use");
  assert.equal(sent[0].get("makePrimary"), "0");
  assert.match(screen.getByRole("status").textContent ?? "", /will not see it until it is approved/);

  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  assert.deepEqual(removed, [], "one click does not remove");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Confirm remove" })));
  assert.deepEqual(removed, ["i1"]);
});

test("with no image store configured, no upload form is offered", () => {
  render(<PhotosPanel slug="x" photos={[]} licences={["l"]} uploadEnabled={false} setPrimary={async () => ok(null)} remove={async () => ok({ wasPrimary: false })} />);
  assert.equal(screen.queryByRole("button", { name: "Upload photo" }), null);
  assert.ok(screen.getByText(/no image store configured/));
});
