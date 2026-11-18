import test from "node:test";
import assert from "node:assert/strict";
import { serializeJsonLdAsHtml } from "@/lib/json-ld";

/**
 * Structured data is written into a script tag with dangerouslySetInnerHTML.
 * A value that contains `</script>` must not be able to close that tag.
 */

test("a closing script tag in a value cannot end the element", () => {
  const out = serializeJsonLdAsHtml({ name: 'Drill</script><script>alert(1)</script>' });
  assert.equal(out.includes("</script"), false);
  assert.equal(out.includes("<"), false);
});

test("the escaped output parses back to the original data", () => {
  const data = { name: "A < B </script> <!-- x", items: ["<b>", 1, null], nested: { ok: true } };
  assert.deepEqual(JSON.parse(serializeJsonLdAsHtml(data)), data);
});

test("data without angle brackets is serialised exactly as JSON.stringify does", () => {
  const data = { "@context": "https://schema.org", "@type": "Product", name: "Cement 50 kg" };
  assert.equal(serializeJsonLdAsHtml(data), JSON.stringify(data));
});
