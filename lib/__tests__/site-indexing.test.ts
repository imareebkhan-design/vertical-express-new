import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { siteIsIndexable } from "@/lib/site-indexing";
import robots from "@/app/robots";
import config from "@/next.config";

const STAGING = "https://ve-staging--vertical-express.asia-southeast1.hosted.app";
const saved = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = saved;
});

async function robotsTag(): Promise<string | undefined> {
  const routes = await config(PHASE_PRODUCTION_BUILD).headers!();
  return routes.find((r) => r.source === "/(.*)")?.headers.find((h) => h.key === "X-Robots-Tag")?.value;
}

test("only the production host is indexable", () => {
  assert.equal(siteIsIndexable("https://www.verticalexpress.in"), true);
  assert.equal(siteIsIndexable("https://verticalexpress.in/"), true);
  assert.equal(siteIsIndexable(""), true, "empty = the app's production default");
  assert.equal(siteIsIndexable(STAGING), false);
  assert.equal(siteIsIndexable("http://localhost:3000"), false);
  assert.equal(siteIsIndexable("https://www.verticalexpress.in.evil.example"), false);
  assert.equal(siteIsIndexable("not a url"), false);
});

test("staging: robots.txt disallows everything and advertises no sitemap; every response carries noindex", async () => {
  process.env.NEXT_PUBLIC_SITE_URL = STAGING;
  const r = robots();
  assert.deepEqual(r.rules, { userAgent: "*", disallow: "/" });
  assert.equal(r.sitemap, undefined);
  assert.equal(await robotsTag(), "noindex, nofollow");
});

test("production: crawlable with the sitemap, no noindex header", async () => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.verticalexpress.in";
  const r = robots();
  assert.equal(r.sitemap, "https://www.verticalexpress.in/sitemap.xml");
  assert.equal(await robotsTag(), undefined);
});
