import test from "node:test";
import assert from "node:assert/strict";
import { CANONICAL_HOST_SCRIPT } from "@/lib/canonical-host";

function run(href: string): string | null {
  const u = new URL(href);
  let replaced: string | null = null;
  const location = {
    hostname: u.hostname, protocol: u.protocol, port: u.port, pathname: u.pathname, search: u.search, hash: u.hash,
    replace: (to: string) => { replaced = to; },
  };
  new Function("window", CANONICAL_HOST_SCRIPT)({ location });
  return replaced;
}

test("trailing-dot host is redirected to the same URL without the dot (staging cart defect, 10 Oct)", () => {
  assert.equal(
    run("https://ve-staging--vertical-express.asia-southeast1.hosted.app./cart?x=1#top"),
    "https://ve-staging--vertical-express.asia-southeast1.hosted.app/cart?x=1#top"
  );
  assert.equal(run("http://localhost.:3000/checkout"), "http://localhost:3000/checkout");
});

test("canonical hosts are left alone", () => {
  assert.equal(run("https://ve-staging--vertical-express.asia-southeast1.hosted.app/cart"), null);
  assert.equal(run("https://www.verticalexpress.in/"), null);
  assert.equal(run("http://localhost:3000/"), null);
});
