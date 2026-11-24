import { expect, test } from "@playwright/test";

const navName = "Category and secondary navigation";

for (const path of ["/", "/services"]) {
  test(`scrolling leaves storefront content at a stable document position on ${path}`, async ({ page, isMobile }, testInfo) => {
    await page.goto(path);
    const nav = page.getByRole("navigation", { name: navName });
    if (isMobile) {
      await expect(page.getByRole("heading").first()).toBeVisible();
      await expect(nav).toBeHidden();
      return;
    }
    await expect(nav).toBeVisible();
    const main = page.locator("main#main-content");
    await expect(main).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));

    // Account for actual scroll on every frame. A collapsing header changes this
    // document coordinate even after subtracting the user's intended movement.
    const trace = await main.evaluate(async (content) => {
      const samples = [];
      for (const target of [0, 15, 17, 15, 17, 160, 0]) {
        window.scrollTo({ top: target, behavior: "instant" });
        const start = performance.now();
        do {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          samples.push({
            target,
            scroll: window.scrollY,
            contentTop: content.getBoundingClientRect().top + window.scrollY,
          });
        } while (performance.now() - start < 300);
      }
      return samples;
    });
    await testInfo.attach("navbar-scroll-trace", {
      body: JSON.stringify(trace),
      contentType: "application/json",
    });
    const positions = trace.map((sample) => sample.contentTop);
    expect(Math.max(...positions) - Math.min(...positions)).toBeLessThanOrEqual(1);
    expect(Math.max(...trace.map((sample) => sample.scroll))).toBeGreaterThan(50);
    expect(trace[trace.length - 1].scroll).toBe(0);
    await expect(nav.getByRole("link", { name: "All categories" })).toBeInViewport();
  });
}
