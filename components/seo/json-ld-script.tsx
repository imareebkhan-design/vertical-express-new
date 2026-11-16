import { serializeJsonLdAsHtml } from "@/lib/json-ld";

/**
 * The one place structured data is written into the page.
 *
 * `dangerouslySetInnerHTML` is required here, not a shortcut: React escapes text
 * children of a <script> as HTML entities, which turns every `"` into `&quot;`
 * and the block into invalid JSON. What makes it safe is the serializer, which
 * writes every `<` as a JSON unicode escape so no value can close the tag
 * (lib/json-ld.ts, tested in lib/__tests__/json-ld.test.ts). Keep every JSON-LD
 * block on this component so there is a single sink to review.
 */
export function JsonLdScript({ data }: { data: unknown }) {
  // nosemgrep -- the one reviewed JSON-LD sink: input is escaped by serializeJsonLdAsHtml (see above); proven by components/seo/__tests__/json-ld-script.test.tsx.
  return (
    <script
      type="application/ld+json"
      // nosemgrep -- same sink as above; the audit rule anchors on this attribute.
      dangerouslySetInnerHTML={{ __html: serializeJsonLdAsHtml(data) }}
    />
  );
}
