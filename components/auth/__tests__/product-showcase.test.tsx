import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProductShowcase } from "../product-showcase";

afterEach(cleanup);

function setup(reduced = false) {
  const timers = new Map<number, () => void>();
  let id = 0;
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({
    matches: reduced, addEventListener() {}, removeEventListener() {},
  }) });
  const oldInterval = window.setInterval;
  const oldClear = window.clearInterval;
  window.setInterval = ((callback: () => void) => { timers.set(++id, callback); return id; }) as typeof window.setInterval;
  window.clearInterval = (key: string | number | NodeJS.Timeout | undefined) => { if (typeof key === "number") timers.delete(key); };
  const view = render(<ProductShowcase />);
  return { timers, view, restore() { view.unmount(); window.setInterval = oldInterval; window.clearInterval = oldClear; } };
}

test("automatically changes scenes and pause/resume controls stop and restart rotation", () => {
  const s = setup();
  try {
    assert.equal(s.timers.size, 1);
    act(() => [...s.timers.values()][0]());
    assert.equal(screen.getByRole("button", { name: "Finish" }).getAttribute("aria-pressed"), "true");
    fireEvent.focus(screen.getByRole("button", { name: "Pause slideshow" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause slideshow" }));
    assert.equal(s.timers.size, 0);
    fireEvent.click(screen.getByRole("button", { name: "Play slideshow" }));
    assert.equal(s.timers.size, 1);
  } finally { s.restore(); }
});

test("manual selection pauses rotation and only selected scene is exposed", () => {
  const s = setup();
  try {
    fireEvent.click(screen.getByRole("button", { name: "Equip" }));
    assert.equal(s.timers.size, 0);
    assert.equal(screen.getAllByRole("group").length, 1);
    assert.match(screen.getByRole("group").getAttribute("aria-label")!, /Equip/);
    fireEvent.click(screen.getByRole("button", { name: "Next scene" }));
    assert.match(screen.getByRole("group").getAttribute("aria-label")!, /Build/);
  } finally { s.restore(); }
});

test("reduced motion disables autoplay but retains manual controls", () => {
  const s = setup(true);
  try {
    assert.equal(s.timers.size, 0);
    assert.equal(screen.queryByRole("button", { name: "Pause slideshow" }), null);
    fireEvent.click(screen.getByRole("button", { name: "Next scene" }));
    assert.match(screen.getByRole("group").getAttribute("aria-label")!, /Finish/);
  } finally { s.restore(); }
});

test("hover and hidden tab pause timers, unmount cleans up", () => {
  const s = setup();
  try {
    const region = screen.getByRole("region");
    fireEvent.mouseEnter(region); assert.equal(s.timers.size, 0);
    fireEvent.mouseLeave(region); assert.equal(s.timers.size, 1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    fireEvent(document, new window.Event("visibilitychange")); assert.equal(s.timers.size, 0);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    fireEvent(document, new window.Event("visibilitychange")); assert.equal(s.timers.size, 1);
  } finally { s.restore(); }
  assert.equal(s.timers.size, 0);
});

test("official tool photos come from the image bucket when one is configured, never the public repo", async () => {
  const { toolImageSrc } = await import("../product-showcase");
  assert.equal(toolImageSrc("xp-ic-007-router-8-12mm", "https://storage.googleapis.com/b/"), "https://storage.googleapis.com/b/login/xp-ic-007-router-8-12mm.webp");
  assert.equal(toolImageSrc("xp-ic-007-router-8-12mm", undefined), "/login/xp-ic-007-router-8-12mm.webp");
});
