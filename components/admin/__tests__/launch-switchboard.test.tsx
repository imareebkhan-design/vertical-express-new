import test, { afterEach, before, mock } from "node:test";
import assert from "node:assert/strict";
import type { LaunchPlan } from "@/lib/launch-control";
import type { SwitchboardProps } from "../launch-switchboard";

let refreshed = 0;
mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh() { refreshed++; } }) } });

let RTL: typeof import("@testing-library/react");
let LaunchSwitchboard: typeof import("../launch-switchboard").LaunchSwitchboard;
let buildLaunchTree: typeof import("@/lib/launch-control").buildLaunchTree;

before(async () => {
  RTL = await import("@testing-library/react");
  ({ LaunchSwitchboard } = await import("../launch-switchboard"));
  ({ buildLaunchTree } = await import("@/lib/launch-control"));
});
afterEach(() => RTL.cleanup());

/* Each step crosses a React transition and a mocked server action. Under the
   full UI suite's parallel load that can exceed Testing Library's 1s default
   (seen once at 1,072 ms), so every wait gets the same, longer budget. What is
   asserted does not change. */
const WAIT = { timeout: 5000 };

/**
 * The switches never change the shop on a click: a change is reviewed with its
 * real impact, typed when it is a batch, applied with the states the operator
 * reviewed, and can be undone through the same review.
 */

const impact = (over: Partial<LaunchPlan["impact"]> = {}): LaunchPlan["impact"] => ({
  productsVisibleBefore: 10, productsVisibleAfter: 6, newlyHidden: 4, newlyShown: 0,
  categoriesReachableBefore: 3, categoriesReachableAfter: 1, departmentsEmptied: ["Electrical"], departmentsOpened: [], cartLinesAffected: 2, ...over,
});

function setup(overrides: Partial<SwitchboardProps> = {}) {
  const calls = { plan: [] as unknown[], apply: [] as unknown[], undo: [] as unknown[] };
  const departments = buildLaunchTree([
    { slug: "cement", name: "db", group: "civil_interiors", isActive: true, visible: 4, byStatus: { published: 4 }, hasTaxMapping: true },
    { slug: "tiling", name: "db", group: "civil_interiors", isActive: true, visible: 3, byStatus: { published: 3 }, hasTaxMapping: true },
    { slug: "lighting", name: "db", group: "electrical", isActive: true, visible: 3, byStatus: { published: 3 }, hasTaxMapping: true },
  ]);
  const props: SwitchboardProps = {
    departments,
    brands: [{ slug: "acme", name: "Acme", isActive: true, products: 5, visible: 5 }],
    batches: [],
    plan: async (input) => {
      calls.plan.push(input);
      const rows = [...(input.categories ?? []).map((c) => ({ kind: "category" as const, slug: c.slug, name: c.slug, before: !c.isActive, to: c.isActive, change: "change" as const })),
        ...(input.brands ?? []).map((b) => ({ kind: "brand" as const, slug: b.slug, name: b.slug, before: !b.isActive, to: b.isActive, change: "change" as const }))];
      return { ok: true, data: { rows, impact: impact(), confirmText: rows.length > 1 ? `HIDE ${rows.length}` : null } };
    },
    apply: async (input) => { calls.apply.push(input); return { ok: true, data: { batchId: "b1", changed: 1 } }; },
    planUndo: async (id) => { calls.undo.push(id); return { ok: true, data: { plan: { rows: [{ kind: "category", slug: "tiling", name: "Tiling", before: false, to: true, change: "change" }], impact: impact({ newlyHidden: 0, newlyShown: 3, departmentsEmptied: [] }), confirmText: null, undoOf: id }, conflicts: [] } }; },
    ...overrides,
  };
  RTL.render(<LaunchSwitchboard {...props} />);
  return calls;
}


test("a switch click changes nothing on the server; Cancel applies nothing", async () => {
  const calls = setup();
  RTL.fireEvent.click(RTL.screen.getByRole("switch", { name: "Show Lighting" }));
  assert.equal(RTL.screen.getByRole("switch", { name: "Show Lighting" }).getAttribute("aria-checked"), "false");
  assert.deepEqual(calls.plan, []);
  assert.deepEqual(calls.apply, []);
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "Review changes" }));
  await RTL.screen.findByRole("dialog", undefined, WAIT);
  assert.deepEqual(calls.plan, [{ categories: [{ slug: "lighting", isActive: false }], brands: [] }]);
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "Cancel" }));
  assert.equal(RTL.screen.queryByRole("dialog"), null);
  assert.deepEqual(calls.apply, []);
});

test("the review shows the real impact: products, categories, departments and shoppers' carts", async () => {
  setup();
  RTL.fireEvent.click(RTL.screen.getByRole("switch", { name: "Show Lighting" }));
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "Review changes" }));
  const dialog = await RTL.screen.findByRole("dialog", undefined, WAIT);
  const text = dialog.textContent ?? "";
  assert.match(text, /Hide lighting/);
  assert.match(text, /10 → 6 \(4 hidden\)/);
  assert.match(text, /Categories customers can reach: 3 → 1/);
  assert.match(text, /Departments that disappear: Electrical/);
  assert.match(text, /2 items already in shoppers' carts can no longer be bought/);
});

test("one switch applies with a click, sending the state the operator reviewed", async () => {
  const calls = setup();
  refreshed = 0;
  RTL.fireEvent.click(RTL.screen.getByRole("switch", { name: "Show Lighting" }));
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "Review changes" }));
  await RTL.screen.findByRole("dialog", undefined, WAIT);
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "Apply" }));
  await RTL.waitFor(() => assert.equal(calls.apply.length, 1), WAIT);
  assert.deepEqual(calls.apply[0], { changeSet: { categories: [{ slug: "lighting", isActive: false, expected: true }], brands: [] }, confirmText: null, undoOf: undefined });
  await RTL.screen.findByRole("status", undefined, WAIT);
  assert.equal(refreshed, 1);
});

test("a batch must be typed: Apply stays disabled until the exact text is entered", async () => {
  const calls = setup();
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "Hide all in Civil & Interiors" }));
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "Review changes" }));
  await RTL.screen.findByRole("dialog", undefined, WAIT);
  const applyButton = RTL.screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement;
  assert.equal(applyButton.disabled, true);
  RTL.fireEvent.change(RTL.screen.getByLabelText("Type HIDE 2 to apply"), { target: { value: "hide 1" } });
  assert.equal(applyButton.disabled, true);
  RTL.fireEvent.change(RTL.screen.getByLabelText("Type HIDE 2 to apply"), { target: { value: "hide 2" } });
  assert.equal(applyButton.disabled, false);
  RTL.fireEvent.click(applyButton);
  await RTL.waitFor(() => assert.equal(calls.apply.length, 1), WAIT);
  assert.equal((calls.apply[0] as { confirmText: string }).confirmText, "hide 2");
});

test("a stale plan is reported in the dialog and nothing is refreshed", async () => {
  refreshed = 0;
  setup({ apply: async () => ({ ok: false, error: { code: "CONFLICT", message: "Something changed since you reviewed this. Review the changes again." } }) });
  RTL.fireEvent.click(RTL.screen.getByRole("switch", { name: "Show brand Acme" }));
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "Review changes" }));
  await RTL.screen.findByRole("dialog", undefined, WAIT);
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "Apply" }));
  assert.match((await RTL.screen.findByRole("alert", undefined, WAIT)).textContent ?? "", /changed since you reviewed/);
  assert.ok(RTL.screen.getByRole("dialog"));
  assert.equal(refreshed, 0);
});

test("undo goes through the same review and applies with the batch it reverses", async () => {
  const calls = setup({ batches: [
    { batchId: "11111111-1111-4111-8111-111111111111", at: "2026-11-12T05:00:00Z", by: "owner@example.test", undoOf: null, undoneBy: null, categories: [{ slug: "tiling", from: true, to: false }], brands: [] },
    { batchId: "22222222-2222-4222-8222-222222222222", at: "2026-11-12T04:00:00Z", by: "owner@example.test", undoOf: null, undoneBy: "x", categories: [{ slug: "cement", from: true, to: false }], brands: [] },
  ] });
  assert.match(document.body.textContent ?? "", /Hid 1 category/);
  assert.equal(RTL.screen.getAllByRole("button", { name: "Undo" }).length, 1, "an undone batch offers no Undo");
  assert.ok(RTL.screen.getByText("Undone"));
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "Undo" }));
  const dialog = await RTL.screen.findByRole("dialog", undefined, WAIT);
  assert.match(dialog.textContent ?? "", /Undo this change\?/);
  assert.deepEqual(calls.undo, ["11111111-1111-4111-8111-111111111111"]);
  RTL.fireEvent.click(RTL.within(dialog).getByRole("button", { name: "Undo" }));
  await RTL.waitFor(() => assert.equal(calls.apply.length, 1), WAIT);
  assert.equal((calls.apply[0] as { undoOf: string }).undoOf, "11111111-1111-4111-8111-111111111111");
});
