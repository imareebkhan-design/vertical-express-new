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
 * A button in the review dialog, once it can be clicked.
 *
 * The review opens from inside an async transition: React shows the dialog as
 * soon as the plan arrives, and `pending` — which disables Apply — only clears
 * when the transition itself settles a moment later (Cancel and Undo are
 * disabled the same way). A click in that gap lands
 * on a disabled button and does nothing, so the mocked `apply` was never
 * called and the wait below it ran out (1 of 267 locally; in CI the file hung
 * and the run was cancelled). An operator cannot click inside that gap; a test
 * can. So wait for what an operator would see: the button enabled.
 */
async function dialogButtonWhenReady(name: "Apply" | "Cancel" | "Undo"): Promise<HTMLButtonElement> {
  const dialog = RTL.screen.getByRole("dialog");
  const button = RTL.within(dialog).getByRole("button", { name }) as HTMLButtonElement;
  await RTL.waitFor(() => assert.equal(button.disabled, false), WAIT);
  return button;
}
const applyWhenReady = () => dialogButtonWhenReady("Apply");

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
  RTL.fireEvent.click(await dialogButtonWhenReady("Cancel"));
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
  RTL.fireEvent.click(await applyWhenReady());
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
  RTL.fireEvent.click(await applyWhenReady());
  await RTL.waitFor(() => assert.equal(calls.apply.length, 1), WAIT);
  assert.equal((calls.apply[0] as { confirmText: string }).confirmText, "hide 2");
});

test("a stale plan is reported in the dialog and nothing is refreshed", async () => {
  refreshed = 0;
  setup({ apply: async () => ({ ok: false, error: { code: "CONFLICT", message: "Something changed since you reviewed this. Review the changes again." } }) });
  RTL.fireEvent.click(RTL.screen.getByRole("switch", { name: "Show brand Acme" }));
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "Review changes" }));
  await RTL.screen.findByRole("dialog", undefined, WAIT);
  RTL.fireEvent.click(await applyWhenReady());
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
  RTL.fireEvent.click(await dialogButtonWhenReady("Undo"));
  await RTL.waitFor(() => assert.equal(calls.apply.length, 1), WAIT);
  assert.equal((calls.apply[0] as { undoOf: string }).undoOf, "11111111-1111-4111-8111-111111111111");
});

/* ------------------------------------------------------ review of #58 */

test("apply sends every reviewed row, unchanged ones too, so the server checks the whole batch", async () => {
  const calls = setup({
    plan: async () => ({ ok: true, data: { rows: [
      { kind: "category", slug: "lighting", name: "Lighting", before: true, to: false, change: "change" },
      { kind: "category", slug: "tiling", name: "Tiling", before: false, to: false, change: "unchanged" },
    ], impact: impact(), confirmText: null } }),
  });
  RTL.fireEvent.click(RTL.screen.getByRole("switch", { name: "Show Lighting" }));
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "Review changes" }));
  await RTL.screen.findByRole("dialog", undefined, WAIT);
  RTL.fireEvent.click(await applyWhenReady());
  await RTL.waitFor(() => assert.equal(calls.apply.length, 1), WAIT);
  assert.deepEqual((calls.apply[0] as { changeSet: unknown }).changeSet, {
    categories: [{ slug: "lighting", isActive: false, expected: true }, { slug: "tiling", isActive: false, expected: false }],
    brands: [],
  });
});

test("a review with a row that no longer exists cannot be applied", async () => {
  const calls = setup({
    plan: async () => ({ ok: true, data: { rows: [
      { kind: "category", slug: "lighting", name: "Lighting", before: true, to: false, change: "change" },
      { kind: "brand", slug: "gone", name: "gone", before: null, to: false, change: "missing" },
    ], impact: impact(), confirmText: null } }),
  });
  RTL.fireEvent.click(RTL.screen.getByRole("switch", { name: "Show Lighting" }));
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "Review changes" }));
  const dialog = await RTL.screen.findByRole("dialog", undefined, WAIT);
  assert.match(dialog.textContent ?? "", /no longer exists/);
  assert.equal((RTL.screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement).disabled, true);
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "Apply" }));
  assert.deepEqual(calls.apply, []);
});

test("while a review is loading, the bulk buttons are disabled with the switches", async () => {
  let release: () => void = () => {};
  setup({ plan: () => new Promise((resolve) => { release = () => resolve({ ok: false, error: { code: "VALIDATION", message: "x" } }); }) });
  RTL.fireEvent.click(RTL.screen.getByRole("switch", { name: "Show Lighting" }));
  RTL.fireEvent.click(RTL.screen.getByRole("button", { name: "Review changes" }));
  await RTL.waitFor(() => assert.equal((RTL.screen.getByRole("button", { name: "Hide all in Civil & Interiors" }) as HTMLButtonElement).disabled, true), WAIT);
  assert.equal((RTL.screen.getByRole("button", { name: "Show all in Civil & Interiors" }) as HTMLButtonElement).disabled, true);
  release();
  await RTL.screen.findByRole("alert", undefined, WAIT);
});

/* Focus is compared with ok(): printing a jsdom element in a failure message takes tens of seconds. */
test("the review is modal for the keyboard: focus moves in, the switches behind are inert, Escape closes and returns focus", async () => {
  setup();
  RTL.fireEvent.click(RTL.screen.getByRole("switch", { name: "Show Lighting" }));
  const opener = RTL.screen.getByRole("button", { name: "Review changes" });
  opener.focus();
  RTL.fireEvent.click(opener);
  const dialog = await RTL.screen.findByRole("dialog", undefined, WAIT);
  await RTL.waitFor(() => assert.ok(document.activeElement === RTL.within(dialog).getByRole("button", { name: "Cancel" }), "focus is on Cancel"), WAIT);
  const background = opener.closest("[inert]");
  assert.ok(background, "the switchboard behind the dialog is inert");
  // Tab from the last control wraps to the first, never leaving the dialog.
  const apply = RTL.within(dialog).getByRole("button", { name: "Apply" });
  apply.focus();
  RTL.fireEvent.keyDown(apply, { key: "Tab" });
  assert.ok(document.activeElement === RTL.within(dialog).getByRole("button", { name: "Cancel" }), "focus is on Cancel");
  RTL.fireEvent.keyDown(dialog, { key: "Escape" });
  assert.equal(RTL.screen.queryByRole("dialog"), null);
  await RTL.waitFor(() => assert.ok(document.activeElement === opener, "focus is back on Review changes"), WAIT);
});
