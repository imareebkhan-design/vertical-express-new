import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, cleanup } from "@testing-library/react";
import { ExpressRunBadge, OrderExpressSelection } from "../express-selection";

afterEach(cleanup);
const shipments = [{ sequence: 1, expressRun: true }, { sequence: 2, expressRun: false }];

test("saved express identifies only the selected shipment, with no payment or ETA claim", () => {
  const view = render(<OrderExpressSelection expressFeePaise={7700} shipments={shipments} />);
  assert.ok(view.getByText("Express selected at checkout"));
  assert.ok(view.getByText("Shipment 1 · Express delivery"));
  assert.ok(view.getByText("Shipment 2 · Standard delivery"));
  assert.doesNotMatch(view.container.textContent ?? "", /paid|₹|minute|today/i);
});

test("zero-fee express remains visible; legacy or standard orders do not acquire an express claim", () => {
  const view = render(<OrderExpressSelection expressFeePaise={0} shipments={shipments} />);
  assert.ok(view.getByText("Express selected at checkout"));
  view.rerender(<OrderExpressSelection expressFeePaise={null} shipments={shipments} />);
  assert.equal(view.container.textContent, "");
  view.rerender(<OrderExpressSelection expressFeePaise={undefined} shipments={[]} />);
  assert.equal(view.container.textContent, "");
});

test("dispatch badge depends on the persisted selected run", () => {
  const view = render(<ExpressRunBadge expressRun={false} />);
  assert.equal(view.container.textContent, "");
  view.rerender(<ExpressRunBadge expressRun />);
  assert.ok(view.getByText("Express selected"));
});
