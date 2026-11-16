import test from "node:test";
import assert from "node:assert/strict";
import { classifyCsrfProbe, isAllowedSmokeHost, validateJsonLd } from "../../scripts/staging-smoke-checks.mjs";

/** Decision logic behind scripts/staging-security-smoke.mjs (ISS-108 review). */

test("CSRF probe: only 403/415 pass; 401 is the known open ISS-109; anything else fails", () => {
  assert.equal(classifyCsrfProbe(403).outcome, "pass");
  assert.equal(classifyCsrfProbe(415).outcome, "pass");
  const open = classifyCsrfProbe(401);
  assert.equal(open.outcome, "open");
  assert.match(open.detail, /ISS-109/);
  for (const s of [200, 204, 302, 400, 404, 429, 500, 502]) {
    assert.equal(classifyCsrfProbe(s).outcome, "fail", `status ${s} must fail`);
  }
});

test("host allowlist admits staging and local hosts only", () => {
  for (const h of ["staging.verticalexpress.in", "ve-staging.web.app", "localhost", "127.0.0.1", "preview-123.example.com"]) {
    assert.equal(isAllowedSmokeHost(h), true, h);
  }
  for (const h of ["verticalexpress.in", "www.verticalexpress.in", "app.example.com", "notstaging.com"]) {
    assert.equal(isAllowedSmokeHost(h), false, h);
  }
});

const page = (...blocks: string[]) =>
  `<html><head>${blocks.map((b) => `<script type="application/ld+json">${b}</script>`).join("")}</head></html>`;
const site = JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "Organization", name: "VE" }, { "@type": "WebSite", name: "VE" }] });
const product = JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: "Cement 50 kg" });

test("a product page with only the site-level block fails the Product requirement", () => {
  const v = validateJsonLd(page(site), "Product");
  assert.equal(v.ok, false);
  assert.deepEqual(v.problems, ["no Product node"]);
});

test("a product page with a named Product block passes", () => {
  assert.equal(validateJsonLd(page(site, product), "Product").ok, true);
});

test("a Product inside @graph counts; one without a name does not", () => {
  const inGraph = JSON.stringify({ "@graph": [{ "@type": ["Product"], name: "Drill" }] });
  assert.equal(validateJsonLd(page(inGraph), "Product").ok, true);
  const unnamed = JSON.stringify({ "@type": "Product", name: "  " });
  assert.deepEqual(validateJsonLd(page(unnamed), "Product").problems, ["Product node has no name"]);
});

test("invalid JSON, a raw '<' and a page with no blocks all fail", () => {
  assert.match(validateJsonLd(page("{not json"), undefined).problems.join(), /not valid JSON/);
  assert.match(validateJsonLd(page('{"name":"a<b"}'), undefined).problems.join(), /raw '<'/);
  assert.deepEqual(validateJsonLd("<html></html>").problems, ["no structured data found"]);
});

test("escaped output from the real serializer passes", async () => {
  const { serializeJsonLdAsHtml } = await import("@/lib/json-ld");
  const html = page(serializeJsonLdAsHtml({ "@type": "Product", name: "Drill </script><b>x</b>" }));
  const v = validateJsonLd(html, "Product");
  assert.equal(v.ok, true, v.problems.join("; "));
});
