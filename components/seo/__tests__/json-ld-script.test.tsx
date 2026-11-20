import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { JsonLdScript } from "@/components/seo/json-ld-script";

/**
 * ISS-108: every JSON-LD block goes through JsonLdScript. Rendered to real HTML,
 * a hostile value must not close the script element, and the block must still
 * be valid JSON that reads back as the original data.
 */


const hostile = { "@context": "https://schema.org", "@type": "Product", name: 'Drill </script><script>alert(1)</script>', description: "a < b && c > d" };

test("a closing script tag inside a value does not end the element", () => {
  const html = renderToStaticMarkup(<JsonLdScript data={hostile} />);
  assert.equal(html.match(/<\/script>/g)?.length, 1, "only the element's own closing tag");
  assert.ok(html.endsWith("</script>"));
  assert.equal(html.includes("<script>alert"), false);
});

test("the rendered block parses back to exactly the original data", () => {
  const html = renderToStaticMarkup(<JsonLdScript data={hostile} />);
  const body = html.replace(/^<script type="application\/ld\+json">/, "").replace(/<\/script>$/, "");
  assert.deepEqual(JSON.parse(body), hostile);
});

test("renders as application/ld+json with no HTML-entity mangling", () => {
  const html = renderToStaticMarkup(<JsonLdScript data={{ "@type": "Thing", name: "\"quoted\" & ok" }} />);
  assert.ok(html.startsWith('<script type="application/ld+json">'));
  assert.equal(html.includes("&quot;"), false);
  assert.equal(html.includes("&amp;"), false);
});
