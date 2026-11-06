import test from "node:test";
import assert from "node:assert/strict";
import { specRows } from "@/lib/catalog/specs";

test("the stored shape — an array of label/value pairs — reads as rows", () => {
  assert.deepEqual(specRows([{ label: "Grade", value: "PPC" }, { label: "Weight", value: "50 kg" }]), [
    { label: "Grade", value: "PPC" },
    { label: "Weight", value: "50 kg" },
  ]);
});

test("an older plain object reads the same way", () => {
  assert.deepEqual(specRows({ Grade: "OPC 53", Bags: 1 }), [
    { label: "Grade", value: "OPC 53" },
    { label: "Bags", value: "1" },
  ]);
});

test("nothing ever reads as [object Object] or an index", () => {
  const rows = specRows([{ label: "Grade", value: { nested: true } }, "junk", null, { value: "no label" }, { label: " ", value: "x" }]);
  assert.deepEqual(rows, []);
  assert.deepEqual(specRows(null), []);
  assert.deepEqual(specRows("text"), []);
});
