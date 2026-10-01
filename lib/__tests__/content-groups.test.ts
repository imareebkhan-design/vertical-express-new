import test from "node:test";
import assert from "node:assert/strict";
import { groupSectionRuns } from "@/lib/content-groups";
import { CONTENT } from "@/lib/content";

test("the FAQ's recurring groups get distinct run keys", () => {
  const runs = groupSectionRuns(CONTENT["faq"].sections);
  const keys = runs.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length, `duplicate keys: ${keys.join(", ")}`);
  assert.ok(runs.filter((r) => r.group === "Delivery").length >= 2, "the FAQ still has two Delivery runs");
});

test("runs keep author order and collapse only adjacent sections", () => {
  const runs = groupSectionRuns([
    { id: "a", group: "X" },
    { id: "b", group: "X" },
    { id: "c", group: "Y" },
    { id: "d", group: "X" },
    { id: "e" },
  ]);
  assert.deepEqual(
    runs.map((r) => [r.key, r.group, r.items.map((i) => i.id).join("")]),
    [["a", "X", "ab"], ["c", "Y", "c"], ["d", "X", "d"], ["e", undefined, "e"]]
  );
});
