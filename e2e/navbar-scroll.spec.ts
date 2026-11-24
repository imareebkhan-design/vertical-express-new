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
    await page.evaluate(() => window.scrollTo({ top: 400, behavior: "instant" }));
    await expect.poll(() => page.locator("header:visible").first().evaluate((header) =>
      Math.abs(header.getBoundingClientRect().top)
    )).toBeLessThanOrEqual(1);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(nav.getByRole("link", { name: "All categories" })).toBeInViewport();
  });
}

test("the pointer can travel from a department into its dropdown", async ({ page, isMobile }) => {
  test.skip(isMobile, "Department hover menus are desktop controls.");
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: navName });
  await expect(nav).toBeVisible();
  const group = nav.locator("div.relative").filter({ has: page.locator("a") }).first();
  test.skip(await group.count() === 0, "The catalogue has no visible departments.");
  const trigger = group.getByRole("link").first();
  await trigger.hover();
  const item = group.getByRole("link").nth(1);
  await expect(item).toBeVisible();
  const triggerBox = await trigger.boundingBox();
  const itemBox = await item.boundingBox();
  if (!triggerBox || !itemBox) throw new Error("The open department menu has no visible bounds.");
  await page.mouse.move(triggerBox.x + 8, triggerBox.y + triggerBox.height / 2);
  await page.mouse.move(itemBox.x + 8, itemBox.y + itemBox.height / 2, { steps: 40 });
  await expect(item).toBeVisible();
  const href = await item.getAttribute("href");
  if (!href) throw new Error("The category link has no destination.");
  const destination = new URL(href, page.url()).href;
  await item.click();
  await expect(page).toHaveURL(destination);
});
