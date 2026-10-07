import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HeroBanners } from "../hero-banners";
import { DealOfTheDay } from "../deal-of-the-day";

afterEach(cleanup);

/* jsdom has no PointerEvent, so a dispatched pointer event would lose clientX. */
const w = window as unknown as Record<string, unknown>;
if (!w.PointerEvent) w.PointerEvent = class extends window.MouseEvent {};

function setup(reduced = false) {
  const timers = new Map<number, () => void>();
  let id = 0;
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }),
  });
  const oldInterval = window.setInterval;
  const oldClear = window.clearInterval;
  window.setInterval = ((callback: () => void) => {
    timers.set(++id, callback);
    return id;
  }) as typeof window.setInterval;
  window.clearInterval = (key: string | number | NodeJS.Timeout | undefined) => {
    if (typeof key === "number") timers.delete(key);
  };
  const view = render(<HeroBanners />);
  return {
    timers,
    view,
    restore() {
      view.unmount();
      window.setInterval = oldInterval;
      window.clearInterval = oldClear;
    },
  };
}

const activeLabel = () => screen.getByRole("group").getAttribute("aria-label") ?? "";

test("the launch banner leads, and only the active slide is exposed", () => {
  const s = setup();
  try {
    assert.equal(screen.getAllByRole("group").length, 1);
    assert.match(activeLabel(), /^1 of 3: Vertical Express launch offer/);
    assert.ok(screen.getByRole("heading", { name: "Vertical Express is now launching in Srinagar" }));
  } finally {
    s.restore();
  }
});

test("rotates on its own, and pause/play stop and restart it", () => {
  const s = setup();
  try {
    assert.equal(s.timers.size, 1);
    act(() => [...s.timers.values()][0]());
    assert.match(activeLabel(), /^2 of 3/);
    fireEvent.click(screen.getByRole("button", { name: "Pause slideshow" }));
    assert.equal(s.timers.size, 0);
    fireEvent.click(screen.getByRole("button", { name: "Play slideshow" }));
    assert.equal(s.timers.size, 1);
  } finally {
    s.restore();
  }
});

test("choosing a slide, by dot, arrow, key or swipe, moves there and stops rotation", () => {
  const s = setup();
  try {
    fireEvent.click(screen.getByRole("button", { name: /Show slide 3/ }));
    assert.match(activeLabel(), /^3 of 3/);
    assert.equal(s.timers.size, 0);
    fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
    assert.match(activeLabel(), /^1 of 3/);
    fireEvent.keyDown(screen.getByRole("region"), { key: "ArrowLeft" });
    assert.match(activeLabel(), /^3 of 3/);

    const frame = screen.getByRole("group").parentElement!;
    fireEvent.pointerDown(frame, { clientX: 300 });
    fireEvent.pointerUp(frame, { clientX: 200 });
    assert.match(activeLabel(), /^1 of 3/);
    // A short drag is a tap, not a swipe.
    fireEvent.pointerDown(frame, { clientX: 300 });
    fireEvent.pointerUp(frame, { clientX: 290 });
    assert.match(activeLabel(), /^1 of 3/);
  } finally {
    s.restore();
  }
});

test("hover and a hidden tab pause rotation", () => {
  const s = setup();
  try {
    const region = screen.getByRole("region");
    fireEvent.mouseEnter(region);
    assert.equal(s.timers.size, 0);
    fireEvent.mouseLeave(region);
    assert.equal(s.timers.size, 1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    fireEvent(document, new window.Event("visibilitychange"));
    assert.equal(s.timers.size, 0);
  } finally {
    s.restore();
  }
});

test("reduced motion: no autoplay and no play control, manual controls still work", () => {
  const s = setup(true);
  try {
    assert.equal(s.timers.size, 0);
    assert.equal(screen.queryByRole("button", { name: /slideshow/ }), null);
    fireEvent.click(screen.getByRole("button", { name: "Next slide" }));
    assert.match(activeLabel(), /^2 of 3/);
  } finally {
    s.restore();
  }
});

test("with no approved deal, Deal of the Day says so and shows no price", () => {
  const { container } = render(<DealOfTheDay product={null} />);
  assert.ok(screen.getByRole("heading", { name: "Launch deal — coming soon" }));
  assert.doesNotMatch(container.textContent ?? "", /₹|%|MRP|Ends in/);
});
