import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render, screen } from "@testing-library/react";
import { Footer } from "@/components/sections/footer";

afterEach(cleanup);

/**
 * The footer "Join" form said "You're on the list" and stored nothing — no
 * mailing list exists. It must not come back without one behind it.
 */
test("the footer offers no email sign-up that goes nowhere", () => {
  render(<Footer />);
  assert.equal(document.querySelector('input[type="email"]'), null);
  assert.equal(screen.queryByRole("button", { name: /^(Join|Joined)$/ }), null);
  assert.doesNotMatch(document.body.textContent ?? "", /on the list/i);
});

test("the footer still carries its real contact line and links", () => {
  render(<Footer />);
  assert.ok(screen.getByRole("link", { name: /Privacy/ }));
  assert.match(document.body.textContent ?? "", /Srinagar, Jammu & Kashmir/);
});
